# Crystal Makeover Salon & Academy — PRD

## Original problem statement
Complete production-ready salon booking & management platform for "Crystal Makeover Salon & Academy": premium customer website, mobile OTP verification, appointment booking with 10% online advance + remaining at salon, SMS notifications (confirmation, 1-hour reminder, service-completion + review request), customer dashboard, admin panel (dashboard, bookings, services, customers, payments, settings), reviews, gallery, academy section. Home page CTA is Bridal-only booking (open to male & female); regular services booking is female-only.

## Architecture (as delivered on this platform)
- **Frontend**: React (CRA) + Tailwind + shadcn/ui + Framer Motion + Recharts, mobile-first, dark luxe theme (black + light pink) with Playfair Display + Manrope.
- **Backend**: FastAPI (Motor/MongoDB), JWT auth, single `server.py` with modules (auth, catalog, availability engine, bookings, payments, admin, reviews, sms), 30-second background reminder loop.
- **Persistence**: MongoDB (collections: profiles, service_categories, services, bookings, payments, payment_orders, reviews, sms_logs, business_settings, audit_logs, otp_codes).
- **Integrations (all currently mocked with real interface)**:
  - **OTP** — dev provider returns `dev_otp` in the response and logs to `sms_logs`.
  - **SMS** — provider-agnostic `SMSService` writes to `sms_logs`; ready for Twilio/DLT swap via env var.
  - **Razorpay** — order + verify simulated (signature not cryptographically checked); real HMAC verification stubbed.

## User personas
- **Guest browser** — explores services, categories, gallery.
- **Customer** — OTP-verifies, books, pays 10% advance, receives SMS, reviews.
- **Admin (crystalmakeoversalon@gmail.com / Admin@123)** — full salon console (dashboard, calendar of bookings, services, customers, settings, SMS logs, reviews).

## What's been implemented (2026-02)
- Premium home page (hero, categories, featured services, why-choose, salon interior, academy, reviews, contact).
- Services list w/ category filter, service detail w/ related.
- Multi-step booking wizard (service → date → slot → details → summary → mock payment → confirmation), animated, mobile-first.
- Backend availability engine (business hours + working days + holidays + existing bookings + buffer + past-slot cutoff + double-book prevention via `$expr` conflict check).
- Price snapshot at booking creation (immutable historical price).
- Server-side gender policy enforcement (`female_only` vs `all`).
- Mock Razorpay create-order + verify → transitions booking to CONFIRMED and fires BOOKING_CONFIRMATION SMS.
- 1-hour reminder background loop (idempotent via `reminder_sent` flag).
- Service-completion SMS + review request on admin marking COMPLETED.
- Customer dashboard (Upcoming / Completed / Cancelled tabs, cancel, review modal with star rating).
- Admin dashboard (KPI cards, 7-day revenue & bookings charts).
- Admin bookings (filter by status, click to open drawer, change status, collect remaining payment cash/UPI/card/other).
- Admin services (create / edit / soft-delete / feature toggle / gender policy).
- Admin customers (list with total bookings + spend).
- Admin reviews (approve/hide/feature/unfeature).
- Admin settings (salon info, opening/closing time, working days chip toggles, advance %, cancellation window, review URL, socials).
- Admin SMS logs viewer.
- Auth: OTP-based JWT for customers, email+bcrypt password for admin.
- Seed on startup: 7 categories, 10 services, business settings, admin.

## Non-goals / deferred (P1)
- Real Twilio/DLT SMS wiring — swap `SMSService.send` with provider SDK.
- Real Razorpay HMAC signature verification + webhook endpoint (`/api/payments/webhook`).
- Cloudflare R2 for image uploads (URL-driven for now).
- Rescheduling flow (backend + UI).
- Reviews with image upload.
- SEO metadata, structured data, sitemap.
- Admin calendar view (day/week/month grid) — currently list-based.
- Advanced holidays UI in Settings.
- Rate limiting on OTP request.
- Full audit-log viewer (already writes to `audit_logs`).

## P0/P1 backlog (prioritized)
1. Live Razorpay wiring + webhook (P0 once keys arrive).
2. Live Twilio/DLT SMS wiring (P0 once creds arrive).
3. Reschedule flow (P1).
4. Admin calendar month/week (P1).
5. Gallery uploader + R2 (P1).
6. SEO metadata (P2).
7. PWA install manifest (P2).

## Test credentials
- Admin — `crystalmakeoversalon@gmail.com` / `Admin@123` at `/admin/login`.
- Customer — any phone at `/login`; the OTP is displayed on screen in dev mode.
