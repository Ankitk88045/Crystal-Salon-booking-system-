# Crystal Makeover Salon & Academy — Deployment Guide

This document walks you through going from the current live preview to a
production-ready deployment of the Crystal Makeover platform.

The stack is:

- **Frontend** — React (Create React App), Tailwind, Framer Motion, Recharts
- **Backend** — FastAPI (Python 3.11) + Motor (async MongoDB driver)
- **Database** — MongoDB
- **Integrations (all pluggable)** — Twilio/DLT SMS, Razorpay, Cloudflare R2,
  Google Places (reviews), and any transactional email provider.

Everything shipped is provider-agnostic through service abstractions
(`SMSService`, `EmailService`, `EmailLog`, `sms_logs`) so activating a real
provider is a one-file swap.

---

## 1. What is included

- Customer website (Home, Services, Service Detail, Academy, Booking, Login,
  Dashboard, Profile, Booking Confirmation) with mobile bottom nav + floating
  WhatsApp/Support button.
- Multi-service cart-style booking with search + category filters, three
  payment modes (10% advance, full online, pay at centre — the last one is
  unlocked only after the first completed visit).
- Admin console at **`/admin`** — dashboard, bookings (view / status / collect
  remaining / reschedule), services, categories, courses, customers, reviews,
  support tickets, SMS logs, email logs, settings.
- Support tickets: floating WhatsApp button opens a form → creates a ticket →
  emails admin + emails the customer their ticket ID → admin can reply from
  the panel (email is fired back to the customer).
- Google Reviews via Places API (falls back to locally-approved reviews when
  no key is configured).
- SMS abstraction — dev logger by default; swap to Twilio or any DLT provider
  by editing `SMSService.send()` in `/app/backend/server.py`.
- Razorpay abstraction — the code creates orders + verifies signatures; the
  current build accepts any signature in dev mode. Turning on real Razorpay
  is 2 env vars + one HMAC line (see §5).

---

## 2. Environment variables

Create these in your deployment host.

### Backend (`/app/backend/.env`)

```
# ---- pre-set on this platform, DO NOT rename ----
MONGO_URL=mongodb://<host>:27017         # Mongo connection string
DB_NAME=crystal_prod                     # Any name; kept between deploys
CORS_ORIGINS=https://your-domain.com     # comma-separated allow-list

# ---- app ----
JWT_SECRET=<long-random-string>          # sign customer + admin JWTs
ADMIN_EMAIL=crystalmakeoversalon@gmail.com
ADMIN_PASSWORD=<change-me>               # used on first startup only

# ---- SMS (Twilio example) ----
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+1XXXXXXXXXX

# ---- Razorpay ----
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# ---- Email ----
EMAIL_PROVIDER=resend            # or smtp, sendgrid, etc.
RESEND_API_KEY=

# ---- Cloudflare R2 (for image uploads) ----
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=crystal-makeover
R2_PUBLIC_URL=https://cdn.your-domain.com
```

### Frontend (`/app/frontend/.env`)

```
REACT_APP_BACKEND_URL=https://api.your-domain.com
```

The frontend **only** knows about `REACT_APP_BACKEND_URL`. All API calls go to
`${REACT_APP_BACKEND_URL}/api/…`. No other secret ever ships to the browser.

---

## 3. First-time production checklist

1. **Change admin password** — First login uses the seeded credentials
   (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Immediately sign in and update it from
   the Admin → Settings page, or by running:
   ```bash
   python3 - <<'PY'
   import bcrypt, os, asyncio
   from motor.motor_asyncio import AsyncIOMotorClient
   async def m():
       c = AsyncIOMotorClient(os.environ["MONGO_URL"])
       db = c[os.environ["DB_NAME"]]
       new_hash = bcrypt.hashpw(b"YourNewStrongPassword", bcrypt.gensalt()).decode()
       await db.profiles.update_one({"role":"SUPER_ADMIN"}, {"$set":{"password_hash":new_hash}})
   asyncio.run(m())
   PY
   ```
2. **Add services & categories** — Go to Admin → Services and add your live
   menu. Nothing is pre-seeded.
3. **Add academy courses** — Admin → Academy tab (via API today; UI stub
   ready) or use `POST /api/admin/courses` for now.
4. **Edit every home page string** — Admin → Settings → "Home Page Content".
5. **Set promo popup** — Admin → Settings → "Promo Popup".
6. **Add Google Place ID + Places API Key** — Admin → Settings → "Google
   Reviews Integration". Reviews will start appearing on the home page.
7. **Business hours & advance %** — Admin → Settings → "Business Hours" &
   "Booking Policy".

---

## 4. Activating SMS (Twilio example)

Open `/app/backend/server.py`, find `class SMSService`, and replace the
provider block:

```python
class SMSService:
    provider = os.environ.get("SMS_PROVIDER", "dev")

    @classmethod
    async def send(cls, *, phone, message, msg_type, booking_id=None, customer_id=None):
        entry = { ... }  # unchanged
        try:
            if cls.provider == "twilio":
                from twilio.rest import Client
                client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
                msg = client.messages.create(
                    from_=os.environ["TWILIO_FROM"], to=phone, body=message,
                )
                entry["provider_message_id"] = msg.sid
            else:
                logger.info(f"[SMS:{cls.provider}] to={phone} :: {message}")
        except Exception as e:
            entry["status"] = "FAILED"; entry["error"] = str(e)
        await db.sms_logs.insert_one({**entry})
        entry.pop("_id", None)
        return entry
```

Install: `pip install twilio` (already in optional list). Restart backend.

---

## 5. Activating Razorpay (real signature verification)

Open `POST /api/payments/verify` and add signature verification. The order id
is already checked. Add HMAC:

```python
import hmac, hashlib
expected = hmac.new(
    os.environ["RAZORPAY_KEY_SECRET"].encode(),
    f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
    hashlib.sha256
).hexdigest()
if not hmac.compare_digest(expected, body.razorpay_signature):
    raise HTTPException(400, "Invalid Razorpay signature")
```

For real order creation replace the mock section in
`POST /api/payments/create-order` with:

```python
import razorpay
client = razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))
order = client.order.create({
    "amount": int(b["advance_amount"] * 100),
    "currency": "INR",
    "receipt": b["booking_number"],
    "notes": {"booking_id": b["id"]},
})
```

Frontend: install `razorpay` js library and open real checkout instead of the
mock verify. The current Booking wizard already sends the standard fields
(`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`).

Webhook endpoint stub `POST /api/payments/webhook` should be exposed publicly
and verified via `RAZORPAY_WEBHOOK_SECRET`.

---

## 6. Deployment topology

Recommended hosting:

| Layer | Service |
|-------|---------|
| Frontend | Vercel or Netlify (static build) |
| Backend  | Render / Railway / DigitalOcean App Platform |
| Database | MongoDB Atlas (Shared M0 is fine to start) |
| Storage  | Cloudflare R2 (S3-compatible) |
| Domain   | Cloudflare DNS |

### Frontend (Vercel)

1. Import the `/app/frontend` folder into Vercel.
2. Framework preset: **Create React App**.
3. Build command: `yarn build`  · Output: `build`.
4. Environment variable: `REACT_APP_BACKEND_URL=https://api.your-domain.com`.
5. Add your custom domain in Vercel → Domains.

### Backend (Render / Railway)

1. Point the service at `/app/backend/`.
2. Build command: `pip install -r requirements.txt`.
3. Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`.
4. Add every env var from §2.
5. Health check path: `/api/`.

### MongoDB

1. Create an Atlas cluster.
2. Create a database `crystal_prod`.
3. Add a user with read/write.
4. Whitelist the backend host IP (or 0.0.0.0/0 for a starter deploy).
5. Copy the connection string to `MONGO_URL`.

### Domain & HTTPS

- `your-domain.com` → Vercel (customer site)
- `api.your-domain.com` → Backend host (Render/Railway)

Both providers issue and renew SSL automatically.

---

## 7. Backups & operations

- **DB backup** — Atlas provides continuous backup on paid tiers; on the free
  tier, schedule a nightly `mongodump` cron.
- **Logs** — Backend prints to stdout; Render/Railway captures. Store SMS +
  email logs in Mongo (`sms_logs`, `email_logs`) — accessible from the admin
  console.
- **Rotate JWT_SECRET** every ~6 months. Doing so signs out every session.
- **Rate limiting** — Add a global rate-limit middleware (e.g.
  `slowapi`) to `/api/auth/request-otp` before public launch.

---

## 8. Post-launch punch-list (recommended)

- [ ] Wire Twilio (or an Indian DLT provider) for SMS.
- [ ] Wire real Razorpay + Webhook endpoint.
- [ ] Wire Resend/SendGrid for real transactional emails.
- [ ] Cloudflare R2 image uploads (service images, gallery, promo popup).
- [ ] Add Google Place ID + Places API key.
- [ ] Add rate-limiting on OTP + support ticket endpoints.
- [ ] Enable Mongo Atlas backup.
- [ ] Configure PWA manifest + install prompt.
- [ ] Add SEO meta tags per service page.
- [ ] Run a Lighthouse audit and fix any red-flagged items.

---

## 9. File map

```
/app/
├── backend/
│   ├── server.py            # single-file FastAPI app (routes, services, scheduler)
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── index.css        # design tokens (pink #BF7AAB, deep black)
│   │   ├── lib/api.js       # axios with JWT interceptor
│   │   ├── context/AuthContext.jsx
│   │   ├── components/
│   │   │   ├── CustomerLayout.jsx
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── LiquidBottomNav.jsx
│   │   │   ├── PromoModal.jsx
│   │   │   ├── ProfileCompletionModal.jsx
│   │   │   └── FloatingSupportButton.jsx
│   │   └── pages/
│   │       ├── Home.jsx  Services.jsx  ServiceDetail.jsx
│   │       ├── Booking.jsx  BookingConfirmation.jsx
│   │       ├── Academy.jsx  Login.jsx  Profile.jsx  Dashboard.jsx
│   │       └── admin/
│   │           ├── AdminDashboard.jsx  AdminBookings.jsx
│   │           ├── AdminServices.jsx   AdminCustomers.jsx
│   │           ├── AdminReviews.jsx    AdminSettings.jsx
│   │           ├── AdminSmsLogs.jsx    AdminSupport.jsx
│   │           └── AdminLogin.jsx
│   └── .env                 # REACT_APP_BACKEND_URL
└── DEPLOY.md                # you are here
```

---

## 10. Support

- Admin console — `/admin/login`
- API docs — `${REACT_APP_BACKEND_URL}/docs` (FastAPI auto-generated)
- Health check — `${REACT_APP_BACKEND_URL}/api/`
