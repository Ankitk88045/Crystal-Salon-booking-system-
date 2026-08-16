"""Crystal Makeover Salon & Academy — Backend API.

FastAPI + Motor (MongoDB). Auth: JWT. Phone OTP is issued in dev-mode and
returned in the response (also logged) — a real Twilio/DLT provider can be
swapped in via the `SMSService` abstraction.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import string
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("crystal")

JWT_SECRET = os.environ.get("JWT_SECRET", "crystal-makeover-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 30

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Crystal Makeover API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# ----------------------------- helpers -----------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def make_token(payload: Dict[str, Any]) -> str:
    payload = {**payload, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def slugify(s: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in s).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out or new_id()[:8]


def gen_booking_number() -> str:
    return "CM" + "".join(random.choices(string.digits, k=8))


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> Dict[str, Any]:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.profiles.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(403, "Admin only")
    return user


# ----------------------------- Email service (mocked) --------------------
class EmailService:
    provider = os.environ.get("EMAIL_PROVIDER", "dev")

    @classmethod
    async def send(cls, *, to: str, subject: str, body: str, kind: str,
                   booking_id: Optional[str] = None, customer_id: Optional[str] = None) -> Dict[str, Any]:
        entry = {
            "id": new_id(),
            "to": to, "subject": subject, "body": body, "kind": kind,
            "booking_id": booking_id, "customer_id": customer_id,
            "provider": cls.provider, "status": "SENT" if to else "SKIPPED",
            "error": None if to else "no_email_on_profile",
            "sent_at": iso(now_utc()), "created_at": iso(now_utc()),
        }
        logger.info(f"[EMAIL:{cls.provider}] to={to} kind={kind} :: {subject}")
        await db.email_logs.insert_one({**entry})
        entry.pop("_id", None)
        return entry


# ----------------------------- SMS service --------------------------------
class SMSService:
    """Provider-agnostic SMS sender. Currently logs + persists to sms_logs."""

    provider = os.environ.get("SMS_PROVIDER", "dev")

    @classmethod
    async def send(cls, *, phone: str, message: str, msg_type: str,
                   booking_id: Optional[str] = None, customer_id: Optional[str] = None) -> Dict[str, Any]:
        entry = {
            "id": new_id(),
            "booking_id": booking_id,
            "customer_id": customer_id,
            "phone": phone,
            "message": message,
            "type": msg_type,
            "provider": cls.provider,
            "provider_message_id": None,
            "status": "SENT",
            "error": None,
            "retry_count": 0,
            "sent_at": iso(now_utc()),
            "created_at": iso(now_utc()),
        }
        try:
            # dev provider: just log. Real provider would call Twilio here.
            logger.info(f"[SMS:{cls.provider}] to={phone} type={msg_type} :: {message}")
            entry["provider_message_id"] = f"dev-{new_id()[:8]}"
        except Exception as e:  # pragma: no cover - real provider errors
            entry["status"] = "FAILED"
            entry["error"] = str(e)
        await db.sms_logs.insert_one({**entry})
        entry.pop("_id", None)
        return entry


# ----------------------------- Pydantic models ----------------------------
class OTPRequest(BaseModel):
    phone: str


class OTPVerify(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None


class AdminLogin(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    avatar_url: Optional[str] = None
    profile_completed: Optional[bool] = None


class CategoryIn(BaseModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    display_order: int = 0
    is_active: bool = True


class ServiceIn(BaseModel):
    name: str
    category_id: str
    description: str = ""
    price: float
    offer_price: Optional[float] = None
    duration_minutes: int = 60
    buffer_minutes: int = 0
    image_url: Optional[str] = None
    is_active: bool = True
    is_featured: bool = False
    display_order: int = 0
    gender_policy: str = "female_only"  # female_only | all
    terms: Optional[str] = None


class BookingCreate(BaseModel):
    service_ids: List[str]
    location: str = "salon"
    appointment_date: str
    start_time: str
    customer_notes: Optional[str] = None
    customer_gender: Optional[str] = None
    customer_name: Optional[str] = None
    payment_option: str = "advance_online"  # advance_online | full_online | pay_at_centre


class PaymentVerify(BaseModel):
    booking_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RemainingPaymentIn(BaseModel):
    amount: float
    payment_method: str  # cash|upi|card|other
    reference_number: Optional[str] = None


class BookingStatusUpdate(BaseModel):
    status: str
    admin_notes: Optional[str] = None
    cancel_reason: Optional[str] = None


class ReviewIn(BaseModel):
    booking_id: str
    rating: int = Field(ge=1, le=5)
    review_text: Optional[str] = None
    image_url: Optional[str] = None


class SettingsIn(BaseModel):
    # All fields optional so admin can PATCH selectively
    model_config = ConfigDict(extra="allow")
    salon_name: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    home_service_area: Optional[str] = None
    maps_url: Optional[str] = None
    google_review_url: Optional[str] = None
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    working_days: Optional[List[int]] = None
    holidays: Optional[List[str]] = None
    advance_percentage: Optional[float] = None
    reminder_minutes_before: Optional[int] = None
    cancellation_hours: Optional[int] = None
    review_url: Optional[str] = None
    social_instagram: Optional[str] = None
    social_facebook: Optional[str] = None
    # Google reviews
    google_place_id: Optional[str] = None
    google_places_api_key: Optional[str] = None
    # promo popup
    promo_enabled: Optional[bool] = None
    promo_title: Optional[str] = None
    promo_subtitle: Optional[str] = None
    promo_code: Optional[str] = None
    promo_image_url: Optional[str] = None
    promo_cta_label: Optional[str] = None
    promo_cta_url: Optional[str] = None
    # home content
    home_hero_title: Optional[str] = None
    home_hero_subtitle: Optional[str] = None
    home_hero_chip: Optional[str] = None
    home_why_title: Optional[str] = None
    home_why_subtitle: Optional[str] = None
    home_stats: Optional[List[Dict[str, Any]]] = None


# ----------------------------- seed ---------------------------------------
DEFAULT_SETTINGS = {
    "id": "singleton",
    "salon_name": "Crystal Makeover Salon & Academy",
    "tagline": "Premium Beauty Services At Home",
    "logo_url": "https://i.ibb.co/TMZk10py/IMG-20260721-171158.png",
    "phone": "+91 90440 78754",
    "whatsapp": "+91 90440 78754",
    "email": "hello@crystalmakeover.com",
    "address": "Crystal Makeover Salon And Academy, C-1/129, Vishwash Khand, Gomti Nagar, Lucknow, Uttar Pradesh, 226010",
    "home_service_area": "Doorstep service available across Lucknow, Uttar Pradesh only",
    "maps_url": "https://www.google.com/maps/dir/?api=1&destination=Crystal%20Makeover%20Salon%20And%20Academy%2C%20C-1%2F129%2C%20Vishwash%20Khand%2C%20Gomti%20Nagar%2C%20Lucknow%2C%20Uttar%20Pradesh%2C%20226010",
    "google_review_url": "https://g.page/r/crystal-makeover/review",
    "opening_time": "09:00",
    "closing_time": "21:00",
    "working_days": [0, 1, 2, 3, 4, 5, 6],
    "holidays": [],
    "advance_percentage": 10.0,
    "reminder_minutes_before": 60,
    "cancellation_hours": 4,
    "review_url": "https://maps.google.com",
    "social_instagram": "https://instagram.com/crystalmakeover",
    "social_facebook": "https://facebook.com/crystalmakeover",
    # ---- promo popup (admin-controlled) ----
    "promo_enabled": True,
    "promo_title": "Get 20% off your first booking",
    "promo_subtitle": "Use code CRYSTAL20 at checkout. Limited time offer for new guests.",
    "promo_code": "CRYSTAL20",
    "promo_image_url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=900&q=80",
    "promo_cta_label": "Book Now",
    "promo_cta_url": "/services",
    # ---- home content (admin-editable text) ----
    "home_hero_title": "Premium Beauty At Your Doorstep.",
    "home_hero_subtitle": "Your ultimate A–Z beauty parlour experience at home. From everyday grooming to premium Bridal Makeup, Hair Care, and advanced Korean Skincare treatments. Safe, hygienic and affordable.",
    "home_hero_chip": "#1 Beauty & Academy Services",
    "home_why_title": "Why Choose Crystal Makeover?",
    "home_why_subtitle": "Redefining home salon services with uncompromising hygiene standards, certified beauticians and guaranteed 100% genuine sealed single-use product kits.",
    "home_stats": [
        {"value": "15,000+", "label": "Happy Clients"},
        {"value": "4.9", "label": "Average Rating", "star": True},
        {"value": "100%", "label": "Sealed Cosmetics"},
        {"value": "50+", "label": "Certified Stylists"},
    ],
    "updated_at": iso(now_utc()),
}

SEED_CATEGORIES = [
    {"name": "Bridal", "image_url": "https://images.unsplash.com/photo-1610047614301-13c63f00c032?w=800&q=80"},
    {"name": "Hair", "image_url": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80"},
    {"name": "Skin", "image_url": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80"},
    {"name": "Makeup", "image_url": "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=80"},
    {"name": "Nails", "image_url": "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80"},
    {"name": "Spa", "image_url": "https://images.pexels.com/photos/6187418/pexels-photo-6187418.jpeg?w=800"},
    {"name": "Academy", "image_url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&q=80"},
]

SEED_SERVICES = [
    # (name, category, price, duration, image, featured, gender_policy, description)
    ("Signature Bridal Makeup", "Bridal", 15000, 180,
     "https://images.unsplash.com/photo-1684868265714-fd2300637c23?w=1200&q=80", True, "all",
     "Complete bridal transformation with HD makeup, hairstyling and draping."),
    ("Engagement Look", "Bridal", 8000, 120,
     "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80", True, "all",
     "Elegant engagement makeup crafted for your special day."),
    ("Hair Spa & Deep Conditioning", "Hair", 1800, 75,
     "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80", True, "female_only",
     "Nourishing spa ritual to restore softness and shine."),
    ("Keratin Smoothening", "Hair", 6500, 180,
     "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&q=80", False, "female_only",
     "Salon-grade keratin treatment for frizz-free strands."),
    ("Glow Facial", "Skin", 2500, 75,
     "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=80", True, "female_only",
     "Radiance-boosting facial with brightening actives."),
    ("HydraFacial", "Skin", 4200, 90,
     "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=1200&q=80", False, "female_only",
     "Multi-step medical-grade hydration facial."),
    ("Party Makeup", "Makeup", 3500, 90,
     "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=1200&q=80", True, "female_only",
     "Camera-ready party glam by our senior artists."),
    ("Gel Manicure", "Nails", 1500, 60,
     "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=1200&q=80", False, "female_only",
     "Long-lasting gel finish with cuticle care."),
    ("Aroma Body Massage", "Spa", 2800, 60,
     "https://images.pexels.com/photos/6187418/pexels-photo-6187418.jpeg?w=1200", False, "female_only",
     "Full-body aromatherapy massage in a serene setting."),
    ("Makeup Artistry Course", "Academy", 45000, 60,
     "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&q=80", True, "all",
     "6-week professional makeup artistry course with certification."),
]

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "crystalmakeoversalon@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@123")


SEED_COURSES = [
    {
        "name": "Certified Bridal Makeup Course",
        "duration": "8 weeks",
        "price": 65000,
        "image_url": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&q=80",
        "description": "Master traditional & HD bridal looks, draping and hair with hands-on studio time.",
        "features": ["8-week hands-on studio", "HD & Airbrush modules", "Portfolio shoot", "Certification"],
    },
    {
        "name": "Advanced Hair Styling Course",
        "duration": "6 weeks",
        "price": 42000,
        "image_url": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80",
        "description": "Cuts, colour, chemical services and blow-dry mastery for the modern stylist.",
        "features": ["Cutting & colour", "Chemical services", "Blow-dry & styling", "Client handling"],
    },
    {
        "name": "Korean Skincare & Facial Therapy",
        "duration": "4 weeks",
        "price": 28000,
        "image_url": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&q=80",
        "description": "Advanced Korean skincare protocols, glass-skin facials and diagnostic techniques.",
        "features": ["Skin diagnostics", "K-beauty facials", "Product knowledge", "Aftercare guidance"],
    },
    {
        "name": "Nail Art & Extensions Diploma",
        "duration": "3 weeks",
        "price": 22000,
        "image_url": "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=1200&q=80",
        "description": "Everything from gel manicures to gel-x extensions and premium art techniques.",
        "features": ["Gel & acrylic", "Extensions", "Nail art", "Sanitation protocol"],
    },
]


async def seed_courses_if_empty() -> None:
    """No demo courses — admin adds them from the panel."""
    return


async def seed_if_empty() -> None:
    """Seed only admin + business settings. No demo services/categories/courses."""
    if not await db.business_settings.find_one({"id": "singleton"}):
        await db.business_settings.insert_one(DEFAULT_SETTINGS.copy())
    if not await db.profiles.find_one({"email": ADMIN_EMAIL}):
        pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        await db.profiles.insert_one({
            "id": new_id(),
            "name": "Crystal Admin",
            "phone": "+919999999999",
            "email": ADMIN_EMAIL,
            "password_hash": pw_hash,
            "role": "SUPER_ADMIN",
            "avatar_url": None,
            "phone_verified": True,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        })
        logger.info(f"Seeded admin {ADMIN_EMAIL}")


# ----------------------------- OTP store ----------------------------------
async def issue_otp(phone: str) -> str:
    code = "".join(random.choices(string.digits, k=6))
    await db.otp_codes.update_one(
        {"phone": phone},
        {"$set": {
            "phone": phone,
            "code": code,
            "attempts": 0,
            "expires_at": iso(now_utc() + timedelta(minutes=10)),
            "created_at": iso(now_utc()),
        }},
        upsert=True,
    )
    await SMSService.send(phone=phone, msg_type="OTP",
                          message=f"Your Crystal Makeover verification code is {code}. Valid for 10 minutes.")
    return code


async def verify_otp(phone: str, code: str) -> bool:
    rec = await db.otp_codes.find_one({"phone": phone})
    if not rec:
        return False
    if rec.get("attempts", 0) >= 5:
        return False
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        return False
    if rec["code"] != code:
        await db.otp_codes.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
        return False
    await db.otp_codes.delete_one({"phone": phone})
    return True


# ----------------------------- availability -------------------------------
async def compute_slots_for_duration(target_date: date, total_duration: int) -> List[Dict[str, Any]]:
    settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    weekday = target_date.weekday()
    if weekday not in settings.get("working_days", [0, 1, 2, 3, 4, 5, 6]):
        return []
    if target_date.isoformat() in settings.get("holidays", []):
        return []
    open_h, open_m = map(int, settings["opening_time"].split(":"))
    close_h, close_m = map(int, settings["closing_time"].split(":"))
    open_dt = datetime.combine(target_date, time(open_h, open_m))
    close_dt = datetime.combine(target_date, time(close_h, close_m))
    step = 30

    existing = await db.bookings.find({
        "appointment_date": target_date.isoformat(),
        "location": {"$ne": "home"},
        "booking_status": {"$in": ["CONFIRMED", "PENDING_PAYMENT", "CUSTOMER_ARRIVED", "IN_SERVICE", "RESCHEDULED"]},
    }, {"_id": 0}).to_list(500)

    def overlaps(a1: datetime, a2: datetime, b1: datetime, b2: datetime) -> bool:
        return a1 < b2 and b1 < a2

    slots: List[Dict[str, Any]] = []
    cur = open_dt
    now = now_utc().replace(tzinfo=None)
    while cur + timedelta(minutes=total_duration) <= close_dt:
        end = cur + timedelta(minutes=total_duration)
        conflict = False
        for b in existing:
            bs = datetime.fromisoformat(f"{b['appointment_date']}T{b['start_time']}")
            be = datetime.fromisoformat(f"{b['appointment_date']}T{b['end_time']}")
            if overlaps(cur, end, bs, be):
                conflict = True
                break
        past = target_date == now.date() and cur <= now + timedelta(minutes=15)
        slots.append({
            "start_time": cur.strftime("%H:%M"),
            "end_time": end.strftime("%H:%M"),
            "available": not conflict and not past,
        })
        cur += timedelta(minutes=step)
    return slots


async def compute_slots(service: Dict[str, Any], target_date: date) -> List[Dict[str, Any]]:
    dur = int(service["duration_minutes"]) + int(service.get("buffer_minutes", 0))
    return await compute_slots_for_duration(target_date, dur)


# ----------------------------- routes -------------------------------------
@api.get("/")
async def root():
    return {"success": True, "data": {"service": "Crystal Makeover API", "time": iso(now_utc())}}


@api.get("/settings")
async def public_settings():
    s = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    return {"success": True, "data": s}


# ---- auth ----
@api.post("/auth/request-otp")
async def auth_request_otp(body: OTPRequest):
    phone = body.phone.strip()
    if len(phone) < 8:
        raise HTTPException(400, "Invalid phone")
    code = await issue_otp(phone)
    return {"success": True, "data": {"phone": phone, "dev_otp": code, "message": "OTP sent (dev mode)"}}


@api.post("/auth/verify-otp")
async def auth_verify_otp(body: OTPVerify):
    if not await verify_otp(body.phone.strip(), body.code.strip()):
        raise HTTPException(400, "Invalid or expired OTP")
    user = await db.profiles.find_one({"phone": body.phone}, {"_id": 0})
    if not user:
        user = {
            "id": new_id(),
            "name": body.name or "Guest",
            "phone": body.phone,
            "email": None,
            "avatar_url": None,
            "role": "CUSTOMER",
            "phone_verified": True,
            "created_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }
        await db.profiles.insert_one(user.copy())
    elif body.name and user.get("name") in (None, "Guest"):
        await db.profiles.update_one({"id": user["id"]}, {"$set": {"name": body.name}})
        user["name"] = body.name
    user.pop("password_hash", None)
    token = make_token({"sub": user["id"], "role": user["role"]})
    return {"success": True, "data": {"token": token, "user": user}}


@api.post("/auth/admin-login")
async def admin_login(body: AdminLogin):
    user = await db.profiles.find_one({"email": body.email.lower().strip()})
    if not user or "password_hash" not in user:
        raise HTTPException(401, "Invalid credentials")
    if user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(403, "Not an admin account")
    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Invalid credentials")
    user.pop("_id", None); user.pop("password_hash", None)
    token = make_token({"sub": user["id"], "role": user["role"]})
    return {"success": True, "data": {"token": token, "user": user}}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    user.pop("password_hash", None)
    completed = await db.bookings.count_documents({"customer_id": user["id"], "booking_status": "COMPLETED"})
    user["completed_bookings_count"] = completed
    user["can_pay_at_centre"] = completed >= 1
    return {"success": True, "data": user}


@api.patch("/auth/profile")
async def update_profile(body: ProfileUpdate, user=Depends(get_current_user)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    patch["updated_at"] = iso(now_utc())
    await db.profiles.update_one({"id": user["id"]}, {"$set": patch})
    updated = await db.profiles.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {"success": True, "data": updated}


# ---- catalog ----
@api.get("/categories")
async def list_categories():
    items = await db.service_categories.find({"is_active": True}, {"_id": 0}).sort("display_order", 1).to_list(200)
    return {"success": True, "data": items}


@api.get("/services")
async def list_services(category_id: Optional[str] = None, featured: Optional[bool] = None):
    q: Dict[str, Any] = {"is_active": True}
    if category_id:
        q["category_id"] = category_id
    if featured is not None:
        q["is_featured"] = featured
    items = await db.services.find(q, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"success": True, "data": items}


@api.get("/services/{slug}")
async def get_service(slug: str):
    s = await db.services.find_one({"slug": slug, "is_active": True}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Service not found")
    related = await db.services.find(
        {"category_id": s["category_id"], "id": {"$ne": s["id"]}, "is_active": True},
        {"_id": 0}
    ).limit(4).to_list(4)
    return {"success": True, "data": {"service": s, "related": related}}


@api.get("/availability")
async def availability(date_str: str, service_id: Optional[str] = None, service_ids: Optional[str] = None):
    """`service_ids` = comma separated (multi-service). `service_id` kept for compat."""
    d = date.fromisoformat(date_str)
    ids: List[str] = []
    if service_ids:
        ids = [s for s in service_ids.split(",") if s]
    elif service_id:
        ids = [service_id]
    if not ids:
        raise HTTPException(400, "service_id or service_ids required")
    services = await db.services.find({"id": {"$in": ids}, "is_active": True}, {"_id": 0}).to_list(50)
    if len(services) != len(ids):
        raise HTTPException(404, "One or more services not found")
    total_duration = sum(int(s["duration_minutes"]) + int(s.get("buffer_minutes", 0)) for s in services)
    slots = await compute_slots_for_duration(d, total_duration)
    return {"success": True, "data": {"date": date_str, "slots": slots, "services": services, "total_duration": total_duration}}


# ---- bookings ----
async def _create_booking_doc(user: Dict[str, Any], body: BookingCreate) -> Dict[str, Any]:
    if body.location == "home":
        raise HTTPException(400, "Home service bookings should be requested via WhatsApp")
    if not body.service_ids:
        raise HTTPException(400, "At least one service is required")
    # Payment eligibility check first (before spending time on slot lookups)
    if body.payment_option == "pay_at_centre":
        completed_count = await db.bookings.count_documents({
            "customer_id": user["id"], "booking_status": "COMPLETED",
        })
        if completed_count < 1:
            raise HTTPException(400, "Pay-at-centre is available only after your first completed booking. Please choose an online option.")
    services = await db.services.find({"id": {"$in": body.service_ids}, "is_active": True}, {"_id": 0}).to_list(50)
    if len(services) != len(body.service_ids):
        raise HTTPException(404, "One or more services not found")
    # Gender policy: any female_only service requires female customer
    gender = (body.customer_gender or "female").lower()
    has_female_only = any(s.get("gender_policy") == "female_only" for s in services)
    if has_female_only and gender != "female":
        raise HTTPException(400, "One or more selected services are available only for female customers.")

    settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    d = date.fromisoformat(body.appointment_date)
    start_h, start_m = map(int, body.start_time.split(":"))
    start_dt = datetime.combine(d, time(start_h, start_m))
    total_duration = sum(int(s["duration_minutes"]) + int(s.get("buffer_minutes", 0)) for s in services)
    end_dt = start_dt + timedelta(minutes=total_duration)

    # slot validation against combined duration
    slots = await compute_slots_for_duration(d, total_duration)
    match = next((sl for sl in slots if sl["start_time"] == body.start_time), None)
    if not match or not match["available"]:
        raise HTTPException(409, "Selected slot is no longer available")

    # Preserve service order as requested (services list may not match input order)
    services_by_id = {s["id"]: s for s in services}
    ordered = [services_by_id[i] for i in body.service_ids if i in services_by_id]
    services_snapshot = [{
        "id": s["id"], "name": s["name"], "price": float(s.get("offer_price") or s["price"]),
        "duration_minutes": int(s["duration_minutes"]), "image_url": s.get("image_url"),
        "category_name": s.get("category_name"),
    } for s in ordered]

    total_price = sum(item["price"] for item in services_snapshot)
    advance_pct = float(settings.get("advance_percentage", 10.0))

    # Payment eligibility validated up front. Compute amounts based on option.
    if body.payment_option == "pay_at_centre":
        advance = 0.0
        remaining = total_price
    elif body.payment_option == "full_online":
        advance = total_price
        remaining = 0.0
    else:  # advance_online
        advance = round(total_price * advance_pct / 100.0, 2)
        remaining = round(total_price - advance, 2)
    combined_name = " + ".join(item["name"] for item in services_snapshot)

    booking = {
        "id": new_id(),
        "booking_number": gen_booking_number(),
        "customer_id": user["id"],
        "customer_name": body.customer_name or user.get("name"),
        "customer_phone": user.get("phone"),
        "customer_gender": gender,
        "location": "salon",
        "service_id": services_snapshot[0]["id"],  # primary (compat)
        "service_ids": [item["id"] for item in services_snapshot],
        "services_snapshot": services_snapshot,
        "service_name_snapshot": combined_name,
        "service_price_snapshot": total_price,
        "service_duration_snapshot": total_duration,
        "category_name": services_snapshot[0]["category_name"],
        "image_url": services_snapshot[0]["image_url"],
        "appointment_date": body.appointment_date,
        "start_time": body.start_time,
        "end_time": end_dt.strftime("%H:%M"),
        "total_amount": total_price,
        "advance_percentage": advance_pct,
        "advance_amount": advance,
        "remaining_amount": remaining,
        "payment_status": "PENDING",
        "payment_option": body.payment_option,
        "booking_status": "PENDING_PAYMENT" if body.payment_option != "pay_at_centre" else "CONFIRMED",
        "customer_notes": body.customer_notes,
        "admin_notes": None,
        "reminder_sent": False,
        "completed_at": None,
        "cancelled_at": None,
        "cancel_reason": None,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    conflicts = await db.bookings.count_documents({
        "appointment_date": booking["appointment_date"],
        "location": {"$ne": "home"},
        "booking_status": {"$in": ["CONFIRMED", "PENDING_PAYMENT", "CUSTOMER_ARRIVED", "IN_SERVICE"]},
        "$expr": {"$and": [
            {"$lt": ["$start_time", booking["end_time"]]},
            {"$gt": ["$end_time", booking["start_time"]]},
        ]},
    })
    if conflicts:
        raise HTTPException(409, "Slot just got booked. Please pick another time.")
    await db.bookings.insert_one(booking.copy())
    # Notify admin about the new booking
    try:
        _settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
        admin_email = _settings.get("email") or ADMIN_EMAIL
        items_html = "".join([f"<li>{s['name']} — ₹{int(s['price'])} · {s['duration_minutes']} min</li>" for s in booking["services_snapshot"]])
        body_html = (
            f"<h3>New booking · {booking['booking_number']}</h3>"
            f"<p><b>Status:</b> {booking['booking_status']} · <b>Payment:</b> {booking['payment_option']}</p>"
            f"<p><b>Customer:</b> {booking['customer_name']} ({booking['customer_phone']})</p>"
            f"<p><b>Date/Time:</b> {booking['appointment_date']} · {booking['start_time']} – {booking['end_time']}</p>"
            f"<p><b>Services:</b><ul>{items_html}</ul></p>"
            f"<p><b>Total:</b> ₹{int(booking['total_amount'])} · <b>Advance:</b> ₹{int(booking['advance_amount'])} · <b>Balance:</b> ₹{int(booking['remaining_amount'])}</p>"
            f"<p><b>Notes:</b> {booking.get('customer_notes') or '-'}</p>"
        )
        await EmailService.send(to=admin_email, subject=f"New booking · {booking['booking_number']} · {booking['appointment_date']} {booking['start_time']}",
                                body=body_html, kind="ADMIN_NEW_BOOKING",
                                booking_id=booking["id"], customer_id=user["id"])
    except Exception as e:  # pragma: no cover
        logger.warning(f"admin email failed: {e}")
    return booking


@api.post("/bookings")
async def create_booking(body: BookingCreate, user=Depends(get_current_user)):
    if user.get("role") not in ("CUSTOMER", "ADMIN", "SUPER_ADMIN"):
        raise HTTPException(403, "Forbidden")
    booking = await _create_booking_doc(user, body)
    booking.pop("_id", None)
    return {"success": True, "data": booking}


@api.get("/bookings")
async def my_bookings(user=Depends(get_current_user)):
    items = await db.bookings.find({"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"success": True, "data": items}


@api.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, user=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Not found")
    if b["customer_id"] != user["id"] and user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(403, "Forbidden")
    return {"success": True, "data": b}


@api.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, user=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Not found")
    if b["customer_id"] != user["id"] and user.get("role") not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(403, "Forbidden")
    if b["booking_status"] in ("COMPLETED", "CANCELLED"):
        raise HTTPException(400, "Cannot cancel")
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "booking_status": "CANCELLED",
        "cancelled_at": iso(now_utc()),
        "cancel_reason": "Customer cancelled",
        "updated_at": iso(now_utc()),
    }})
    return {"success": True, "data": {"id": booking_id, "status": "CANCELLED"}}


# ---- payments (mock Razorpay) ----
@api.post("/payments/create-order")
async def create_order(booking_id: str, user=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or b["customer_id"] != user["id"]:
        raise HTTPException(404, "Booking not found")
    order = {
        "id": new_id(),
        "razorpay_order_id": f"order_mock_{new_id()[:12]}",
        "booking_id": booking_id,
        "customer_id": user["id"],
        "amount": b["advance_amount"],
        "currency": "INR",
        "status": "created",
        "created_at": iso(now_utc()),
    }
    await db.payment_orders.insert_one(order.copy())
    return {"success": True, "data": {
        "order_id": order["razorpay_order_id"],
        "amount": int(order["amount"] * 100),
        "currency": "INR",
        "key_id": os.environ.get("RAZORPAY_KEY_ID", "rzp_test_mock"),
        "booking": b,
    }}


@api.post("/payments/verify")
async def verify_payment(body: PaymentVerify, user=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": body.booking_id})
    if not b or b["customer_id"] != user["id"]:
        raise HTTPException(404, "Booking not found")
    # In production: verify signature with RAZORPAY_KEY_SECRET (HMAC SHA256).
    # Here we accept any signature but require order id to exist.
    order = await db.payment_orders.find_one({"razorpay_order_id": body.razorpay_order_id})
    if not order:
        raise HTTPException(400, "Invalid order")
    if b["booking_status"] == "CONFIRMED":
        return {"success": True, "data": {"already_confirmed": True, "booking_id": b["id"]}}
    payment = {
        "id": new_id(),
        "booking_id": b["id"],
        "customer_id": user["id"],
        "payment_type": "ADVANCE",
        "amount": b["advance_amount"],
        "payment_method": "razorpay",
        "status": "SUCCESS",
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "razorpay_signature": body.razorpay_signature,
        "paid_at": iso(now_utc()),
        "created_at": iso(now_utc()),
    }
    await db.payments.insert_one(payment.copy())
    await db.bookings.update_one({"id": b["id"]}, {"$set": {
        "payment_status": "ADVANCE_PAID",
        "booking_status": "CONFIRMED",
        "updated_at": iso(now_utc()),
    }})
    b = await db.bookings.find_one({"id": b["id"]}, {"_id": 0})
    settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    msg = (f"Hi {b['customer_name']}, your appointment for {b['service_name_snapshot']} on "
           f"{b['appointment_date']} at {b['start_time']} is confirmed. Advance ₹{b['advance_amount']:.0f} paid. "
           f"Balance ₹{b['remaining_amount']:.0f} at salon. — {settings['salon_name']}")
    await SMSService.send(phone=b["customer_phone"], message=msg, msg_type="BOOKING_CONFIRMATION",
                          booking_id=b["id"], customer_id=user["id"])
    # Notify admin the payment was received
    try:
        _settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
        await EmailService.send(
            to=_settings.get("email") or ADMIN_EMAIL,
            subject=f"Payment received · {b['booking_number']} · ₹{int(b['advance_amount'])}",
            body=(
                f"<h3>Advance payment received</h3>"
                f"<p>{b['customer_name']} ({b['customer_phone']}) paid ₹{int(b['advance_amount'])} "
                f"for {b['service_name_snapshot']} on {b['appointment_date']} at {b['start_time']}.</p>"
                f"<p>Balance ₹{int(b['remaining_amount'])} due at salon.</p>"
            ),
            kind="ADMIN_PAYMENT_RECEIVED", booking_id=b["id"], customer_id=user["id"],
        )
    except Exception as e:  # pragma: no cover
        logger.warning(f"admin email failed: {e}")
    return {"success": True, "data": {"booking": b, "payment_id": payment["id"]}}


# ---- reviews ----
@api.get("/google-reviews")
async def google_reviews():
    """Returns Google reviews (via Places Details API) when configured.

    Falls back to locally-approved reviews if no API key/place id is set.
    Cached for 12 hours to avoid excess API calls.
    """
    s = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    place_id = (s.get("google_place_id") or "").strip()
    key = (s.get("google_places_api_key") or "").strip()
    if not place_id or not key:
        items = await db.reviews.find({"status": "APPROVED"}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
        return {"success": True, "data": {"source": "local", "rating": None, "total": len(items), "reviews": items}}
    cache = await db.google_reviews_cache.find_one({"place_id": place_id})
    if cache:
        cached_at = datetime.fromisoformat(cache["cached_at"])
        if (now_utc().replace(tzinfo=None) - cached_at.replace(tzinfo=None)).total_seconds() < 12 * 3600:
            return {"success": True, "data": cache["data"]}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params={"place_id": place_id, "fields": "reviews,rating,user_ratings_total", "key": key},
            )
        payload = r.json()
        result = payload.get("result", {}) if isinstance(payload, dict) else {}
        reviews = [
            {
                "customer_name": x.get("author_name"),
                "rating": x.get("rating"),
                "review_text": x.get("text"),
                "profile_photo_url": x.get("profile_photo_url"),
                "relative_time": x.get("relative_time_description"),
                "created_at": iso(now_utc()),
            }
            for x in result.get("reviews", [])
        ]
        data = {
            "source": "google",
            "rating": result.get("rating"),
            "total": result.get("user_ratings_total"),
            "reviews": reviews,
        }
        await db.google_reviews_cache.update_one(
            {"place_id": place_id},
            {"$set": {"place_id": place_id, "data": data, "cached_at": iso(now_utc())}},
            upsert=True,
        )
        return {"success": True, "data": data}
    except Exception as e:  # pragma: no cover
        logger.warning(f"Google reviews fetch failed: {e}")
        items = await db.reviews.find({"status": "APPROVED"}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
        return {"success": True, "data": {"source": "local", "rating": None, "total": len(items), "reviews": items, "error": str(e)}}


@api.post("/reviews")
async def create_review(body: ReviewIn, user=Depends(get_current_user)):
    b = await db.bookings.find_one({"id": body.booking_id, "customer_id": user["id"]})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["booking_status"] != "COMPLETED":
        raise HTTPException(400, "Reviews only allowed after service completion")
    if await db.reviews.find_one({"booking_id": body.booking_id}):
        raise HTTPException(400, "Review already submitted")
    review = {
        "id": new_id(),
        "customer_id": user["id"],
        "customer_name": user.get("name"),
        "booking_id": b["id"],
        "service_id": b["service_id"],
        "service_name": b["service_name_snapshot"],
        "rating": body.rating,
        "review_text": body.review_text,
        "image_url": body.image_url,
        "status": "APPROVED",
        "is_featured": False,
        "created_at": iso(now_utc()),
    }
    await db.reviews.insert_one(review.copy())
    review.pop("_id", None)
    return {"success": True, "data": review}


@api.get("/reviews")
async def list_reviews():
    items = await db.reviews.find({"status": "APPROVED"}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {"success": True, "data": items}


@api.get("/courses")
async def list_courses():
    items = await db.courses.find({"is_active": True}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return {"success": True, "data": items}


@api.post("/academy/enquiry")
async def academy_enquiry(body: Dict[str, Any]):
    entry = {
        "id": new_id(),
        "name": body.get("name"),
        "phone": body.get("phone"),
        "email": body.get("email"),
        "course": body.get("course"),
        "message": body.get("message"),
        "status": "NEW",
        "created_at": iso(now_utc()),
    }
    await db.academy_enquiries.insert_one(entry.copy())
    entry.pop("_id", None)
    return {"success": True, "data": entry}


# ---- support tickets ----
def _gen_ticket_number() -> str:
    return "CT" + "".join(random.choices(string.digits, k=7))


class SupportTicketIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    subject: Optional[str] = None
    message: str


@api.post("/support/tickets")
async def create_ticket(body: SupportTicketIn):
    ticket = {
        "id": new_id(),
        "ticket_number": _gen_ticket_number(),
        "name": body.name,
        "phone": body.phone,
        "email": body.email,
        "subject": body.subject or "Support enquiry",
        "message": body.message,
        "status": "OPEN",
        "admin_reply": None,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.support_tickets.insert_one(ticket.copy())
    settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    admin_email = settings.get("email") or ADMIN_EMAIL
    # notify admin
    admin_body = (
        f"<h3>New support ticket · {ticket['ticket_number']}</h3>"
        f"<p><b>From:</b> {ticket['name']} · {ticket['phone']}{' · '+ticket['email'] if ticket['email'] else ''}</p>"
        f"<p><b>Subject:</b> {ticket['subject']}</p>"
        f"<blockquote>{ticket['message']}</blockquote>"
        f"<p>Manage this ticket from Admin → Support.</p>"
    )
    await EmailService.send(to=admin_email, subject=f"[{ticket['ticket_number']}] {ticket['subject']}",
                            body=admin_body, kind="ADMIN_SUPPORT_TICKET")
    # ack the user by email (best effort)
    if ticket["email"]:
        user_body = (
            f"<h3>Thanks, {ticket['name']}!</h3>"
            f"<p>We&rsquo;ve received your query. Your ticket ID is <b>{ticket['ticket_number']}</b>.</p>"
            f"<p>Our team will get back to you shortly. You can also chat with us on WhatsApp: {settings.get('whatsapp')}.</p>"
            f"<p>— {settings.get('salon_name')}</p>"
        )
        await EmailService.send(to=ticket["email"], subject=f"We got your message · Ticket {ticket['ticket_number']}",
                                body=user_body, kind="SUPPORT_ACK")
    # SMS ack always
    await SMSService.send(phone=ticket["phone"], msg_type="SUPPORT_ACK",
                          message=f"Hi {ticket['name']}, we received your query. Ticket {ticket['ticket_number']}. — {settings.get('salon_name')}")
    ticket.pop("_id", None)
    return {"success": True, "data": ticket}


@api.get("/admin/support")
async def admin_support_list(user=Depends(require_admin)):
    items = await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"success": True, "data": items}


class SupportUpdateIn(BaseModel):
    status: Optional[str] = None  # OPEN | IN_PROGRESS | RESOLVED | CLOSED
    admin_reply: Optional[str] = None


@api.patch("/admin/support/{tid}")
async def admin_support_update(tid: str, body: SupportUpdateIn, user=Depends(require_admin)):
    t = await db.support_tickets.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Ticket not found")
    patch: Dict[str, Any] = {"updated_at": iso(now_utc())}
    if body.status:
        patch["status"] = body.status
    if body.admin_reply:
        patch["admin_reply"] = body.admin_reply
    await db.support_tickets.update_one({"id": tid}, {"$set": patch})
    # Email the customer if a reply was sent
    if body.admin_reply and t.get("email"):
        settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
        await EmailService.send(
            to=t["email"],
            subject=f"Reply · Ticket {t['ticket_number']} · {settings.get('salon_name')}",
            body=f"<h3>Re: {t.get('subject')}</h3><p>{body.admin_reply}</p><p>— {settings.get('salon_name')} Support</p>",
            kind="SUPPORT_REPLY",
        )
    return {"success": True, "data": {"id": tid, **patch}}


# ============================ ADMIN ROUTES ================================
@api.get("/admin/dashboard")
async def admin_dashboard(user=Depends(require_admin)):
    today = now_utc().date().isoformat()
    today_bookings = await db.bookings.count_documents({"appointment_date": today})
    upcoming = await db.bookings.count_documents({
        "appointment_date": {"$gte": today},
        "booking_status": {"$in": ["CONFIRMED", "CUSTOMER_ARRIVED", "IN_SERVICE"]},
    })
    completed = await db.bookings.count_documents({"booking_status": "COMPLETED"})
    cancelled = await db.bookings.count_documents({"booking_status": "CANCELLED"})
    customers = await db.profiles.count_documents({"role": "CUSTOMER"})
    services_count = await db.services.count_documents({"is_active": True})

    # today revenue = advance paid today + remaining collected today
    payments_today = await db.payments.find({
        "paid_at": {"$gte": today + "T00:00:00", "$lt": today + "T23:59:59"},
    }, {"_id": 0}).to_list(1000)
    today_revenue = sum(p["amount"] for p in payments_today)
    advance_collected = sum(p["amount"] for p in payments_today if p["payment_type"] == "ADVANCE")
    pending_salon = await db.bookings.aggregate([
        {"$match": {"booking_status": "COMPLETED", "payment_status": {"$ne": "PAID"}}},
        {"$group": {"_id": None, "total": {"$sum": "$remaining_amount"}}},
    ]).to_list(1)
    pending_salon_amt = pending_salon[0]["total"] if pending_salon else 0

    reviews = await db.reviews.find({"status": "APPROVED"}, {"_id": 0}).to_list(1000)
    avg_rating = round(sum(r["rating"] for r in reviews) / len(reviews), 1) if reviews else 0

    # last 7 days revenue trend
    trend = []
    for i in range(6, -1, -1):
        d = (now_utc().date() - timedelta(days=i)).isoformat()
        pays = await db.payments.find({
            "paid_at": {"$gte": d + "T00:00:00", "$lt": d + "T23:59:59"},
        }, {"_id": 0}).to_list(1000)
        trend.append({"date": d, "revenue": sum(p["amount"] for p in pays), "bookings": await db.bookings.count_documents({"appointment_date": d})})

    return {"success": True, "data": {
        "today_bookings": today_bookings,
        "upcoming_bookings": upcoming,
        "completed_bookings": completed,
        "cancelled_bookings": cancelled,
        "total_customers": customers,
        "total_services": services_count,
        "today_revenue": today_revenue,
        "advance_collected": advance_collected,
        "pending_salon_payments": pending_salon_amt,
        "average_rating": avg_rating,
        "trend": trend,
    }}


@api.get("/admin/bookings")
async def admin_bookings(status_filter: Optional[str] = None, date_filter: Optional[str] = None, user=Depends(require_admin)):
    q: Dict[str, Any] = {}
    if status_filter:
        q["booking_status"] = status_filter
    if date_filter:
        q["appointment_date"] = date_filter
    items = await db.bookings.find(q, {"_id": 0}).sort("appointment_date", -1).to_list(500)
    return {"success": True, "data": items}


@api.patch("/admin/bookings/{booking_id}")
async def admin_update_booking(booking_id: str, body: BookingStatusUpdate, user=Depends(require_admin)):
    b = await db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Not found")
    allowed = {"CONFIRMED", "CANCELLED", "RESCHEDULED", "CUSTOMER_ARRIVED", "IN_SERVICE", "COMPLETED", "NO_SHOW"}
    if body.status not in allowed:
        raise HTTPException(400, "Invalid status")
    patch: Dict[str, Any] = {"booking_status": body.status, "updated_at": iso(now_utc())}
    if body.admin_notes is not None:
        patch["admin_notes"] = body.admin_notes
    if body.status == "COMPLETED":
        patch["completed_at"] = iso(now_utc())
    if body.status == "CANCELLED":
        patch["cancelled_at"] = iso(now_utc())
        patch["cancel_reason"] = body.cancel_reason or "Cancelled by admin"
    await db.bookings.update_one({"id": booking_id}, {"$set": patch})
    await db.audit_logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "action": "update_booking_status",
        "entity": "booking", "entity_id": booking_id, "new_data": patch, "at": iso(now_utc()),
    })
    if body.status == "COMPLETED":
        settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
        msg = (f"Thank you for choosing {settings['salon_name']}! We'd love your feedback. "
               f"Please leave a review: {settings.get('review_url') or 'reply here'} — Team Crystal.")
        await SMSService.send(phone=b["customer_phone"], message=msg, msg_type="SERVICE_COMPLETED",
                              booking_id=b["id"], customer_id=b["customer_id"])
    return {"success": True, "data": {"id": booking_id, "status": body.status}}


@api.post("/admin/bookings/{booking_id}/payment")
async def admin_record_payment(booking_id: str, body: RemainingPaymentIn, user=Depends(require_admin)):
    b = await db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Not found")
    pay = {
        "id": new_id(),
        "booking_id": booking_id,
        "customer_id": b["customer_id"],
        "payment_type": "REMAINING",
        "amount": body.amount,
        "payment_method": body.payment_method,
        "status": "SUCCESS",
        "reference_number": body.reference_number,
        "collected_by": user["id"],
        "paid_at": iso(now_utc()),
        "created_at": iso(now_utc()),
    }
    await db.payments.insert_one(pay.copy())
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "payment_status": "PAID", "updated_at": iso(now_utc()),
    }})
    await db.audit_logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "action": "collect_remaining_payment",
        "entity": "booking", "entity_id": booking_id, "new_data": {"amount": body.amount, "method": body.payment_method}, "at": iso(now_utc()),
    })
    return {"success": True, "data": pay}


class RescheduleIn(BaseModel):
    appointment_date: str
    start_time: str


@api.post("/admin/bookings/{booking_id}/reschedule")
async def admin_reschedule(booking_id: str, body: RescheduleIn, user=Depends(require_admin)):
    b = await db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Not found")
    d = date.fromisoformat(body.appointment_date)
    sh, sm = map(int, body.start_time.split(":"))
    start_dt = datetime.combine(d, time(sh, sm))
    total_dur = int(b.get("service_duration_snapshot") or 0)
    if not total_dur:
        total_dur = sum(int(s.get("duration_minutes", 0)) for s in b.get("services_snapshot", [])) or 60
    end_dt = start_dt + timedelta(minutes=total_dur)
    conflicts = await db.bookings.count_documents({
        "id": {"$ne": booking_id},
        "appointment_date": body.appointment_date,
        "location": {"$ne": "home"},
        "booking_status": {"$in": ["CONFIRMED", "PENDING_PAYMENT", "CUSTOMER_ARRIVED", "IN_SERVICE"]},
        "$expr": {"$and": [
            {"$lt": ["$start_time", end_dt.strftime("%H:%M")]},
            {"$gt": ["$end_time", body.start_time]},
        ]},
    })
    if conflicts:
        raise HTTPException(409, "Chosen slot is not available")
    old = {"date": b["appointment_date"], "start": b["start_time"], "end": b.get("end_time")}
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "appointment_date": body.appointment_date,
        "start_time": body.start_time,
        "end_time": end_dt.strftime("%H:%M"),
        "booking_status": "RESCHEDULED",
        "reminder_sent": False,
        "updated_at": iso(now_utc()),
    }})
    await db.audit_logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "action": "reschedule_booking",
        "entity": "booking", "entity_id": booking_id, "previous_data": old,
        "new_data": {"date": body.appointment_date, "start": body.start_time}, "at": iso(now_utc()),
    })
    # notify customer + admin
    settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    await SMSService.send(phone=b["customer_phone"], msg_type="BOOKING_RESCHEDULED",
                          message=f"Hi {b['customer_name']}, your appointment has been rescheduled to {body.appointment_date} at {body.start_time}. — {settings['salon_name']}",
                          booking_id=booking_id, customer_id=b["customer_id"])
    return {"success": True, "data": {"id": booking_id}}


@api.get("/admin/customers")
async def admin_customers(user=Depends(require_admin)):
    customers = await db.profiles.find({"role": "CUSTOMER"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for c in customers:
        c["total_bookings"] = await db.bookings.count_documents({"customer_id": c["id"]})
        c["completed_bookings"] = await db.bookings.count_documents({"customer_id": c["id"], "booking_status": "COMPLETED"})
        spent = await db.payments.aggregate([
            {"$match": {"customer_id": c["id"], "status": "SUCCESS"}},
            {"$group": {"_id": None, "t": {"$sum": "$amount"}}},
        ]).to_list(1)
        c["total_spent"] = spent[0]["t"] if spent else 0
    return {"success": True, "data": customers}


@api.get("/admin/services")
async def admin_services(user=Depends(require_admin)):
    items = await db.services.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"success": True, "data": items}


@api.post("/admin/services")
async def admin_create_service(body: ServiceIn, user=Depends(require_admin)):
    cat = await db.service_categories.find_one({"id": body.category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(400, "Invalid category")
    svc = {
        "id": new_id(),
        "name": body.name,
        "slug": slugify(body.name),
        "category_id": body.category_id,
        "category_name": cat["name"],
        "description": body.description,
        "price": body.price,
        "offer_price": body.offer_price,
        "duration_minutes": body.duration_minutes,
        "buffer_minutes": body.buffer_minutes,
        "image_url": body.image_url,
        "is_active": body.is_active,
        "is_featured": body.is_featured,
        "display_order": body.display_order,
        "gender_policy": body.gender_policy,
        "terms": body.terms,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.services.insert_one(svc.copy())
    await db.audit_logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "action": "create_service",
        "entity": "service", "entity_id": svc["id"], "new_data": {"name": svc["name"], "price": svc["price"]}, "at": iso(now_utc()),
    })
    svc.pop("_id", None)
    return {"success": True, "data": svc}


@api.patch("/admin/services/{sid}")
async def admin_update_service(sid: str, body: ServiceIn, user=Depends(require_admin)):
    existing = await db.services.find_one({"id": sid})
    if not existing:
        raise HTTPException(404, "Not found")
    cat = await db.service_categories.find_one({"id": body.category_id}, {"_id": 0})
    patch = body.model_dump()
    patch["category_name"] = cat["name"] if cat else existing.get("category_name")
    patch["slug"] = slugify(body.name)
    patch["updated_at"] = iso(now_utc())
    await db.services.update_one({"id": sid}, {"$set": patch})
    await db.audit_logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "action": "update_service",
        "entity": "service", "entity_id": sid, "previous_data": {"price": existing.get("price")},
        "new_data": {"price": body.price}, "at": iso(now_utc()),
    })
    return {"success": True, "data": {"id": sid}}


@api.delete("/admin/services/{sid}")
async def admin_delete_service(sid: str, user=Depends(require_admin)):
    await db.services.update_one({"id": sid}, {"$set": {"is_active": False, "updated_at": iso(now_utc())}})
    return {"success": True, "data": {"id": sid}}


@api.get("/admin/categories")
async def admin_categories(user=Depends(require_admin)):
    items = await db.service_categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(200)
    return {"success": True, "data": items}


@api.post("/admin/categories")
async def admin_create_category(body: CategoryIn, user=Depends(require_admin)):
    cat = {
        "id": new_id(),
        "name": body.name,
        "slug": slugify(body.name),
        "description": body.description,
        "image_url": body.image_url,
        "display_order": body.display_order,
        "is_active": body.is_active,
        "created_at": iso(now_utc()),
    }
    await db.service_categories.insert_one(cat.copy())
    cat.pop("_id", None)
    return {"success": True, "data": cat}


@api.patch("/admin/categories/{cid}")
async def admin_update_category(cid: str, body: CategoryIn, user=Depends(require_admin)):
    patch = body.model_dump()
    patch["slug"] = slugify(body.name)
    await db.service_categories.update_one({"id": cid}, {"$set": patch})
    return {"success": True, "data": {"id": cid}}


@api.delete("/admin/categories/{cid}")
async def admin_delete_category(cid: str, user=Depends(require_admin)):
    await db.service_categories.update_one({"id": cid}, {"$set": {"is_active": False}})
    return {"success": True, "data": {"id": cid}}


@api.get("/admin/courses")
async def admin_courses(user=Depends(require_admin)):
    items = await db.courses.find({}, {"_id": 0}).sort("display_order", 1).to_list(200)
    return {"success": True, "data": items}


@api.post("/admin/courses")
async def admin_create_course(body: Dict[str, Any], user=Depends(require_admin)):
    doc = {
        "id": new_id(),
        "slug": slugify(body.get("name", "course")),
        "name": body.get("name"),
        "duration": body.get("duration"),
        "price": float(body.get("price", 0)),
        "image_url": body.get("image_url"),
        "description": body.get("description", ""),
        "features": body.get("features", []),
        "display_order": int(body.get("display_order", 0)),
        "is_active": bool(body.get("is_active", True)),
        "created_at": iso(now_utc()),
    }
    await db.courses.insert_one(doc.copy())
    doc.pop("_id", None)
    return {"success": True, "data": doc}


@api.patch("/admin/courses/{cid}")
async def admin_update_course(cid: str, body: Dict[str, Any], user=Depends(require_admin)):
    patch = {k: v for k, v in body.items() if k in (
        "name", "duration", "price", "image_url", "description", "features", "display_order", "is_active"
    )}
    if "name" in patch:
        patch["slug"] = slugify(patch["name"])
    await db.courses.update_one({"id": cid}, {"$set": patch})
    return {"success": True, "data": {"id": cid}}


@api.delete("/admin/courses/{cid}")
async def admin_delete_course(cid: str, user=Depends(require_admin)):
    await db.courses.update_one({"id": cid}, {"$set": {"is_active": False}})
    return {"success": True, "data": {"id": cid}}


@api.get("/admin/email-logs")
async def admin_email_logs(user=Depends(require_admin)):
    items = await db.email_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"success": True, "data": items}


@api.get("/admin/reviews")
async def admin_reviews(user=Depends(require_admin)):
    items = await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"success": True, "data": items}


@api.patch("/admin/reviews/{rid}")
async def admin_update_review(rid: str, body: Dict[str, Any], user=Depends(require_admin)):
    patch = {k: v for k, v in body.items() if k in ("status", "is_featured")}
    await db.reviews.update_one({"id": rid}, {"$set": patch})
    return {"success": True, "data": {"id": rid}}


@api.get("/admin/settings")
async def admin_get_settings(user=Depends(require_admin)):
    s = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    return {"success": True, "data": s}


@api.patch("/admin/settings")
async def admin_update_settings(body: SettingsIn, user=Depends(require_admin)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    patch["updated_at"] = iso(now_utc())
    await db.business_settings.update_one({"id": "singleton"}, {"$set": patch}, upsert=True)
    s = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0})
    await db.audit_logs.insert_one({
        "id": new_id(), "admin_id": user["id"], "action": "update_settings",
        "entity": "settings", "entity_id": "singleton", "new_data": patch, "at": iso(now_utc()),
    })
    return {"success": True, "data": s}


@api.get("/admin/sms-logs")
async def admin_sms_logs(user=Depends(require_admin)):
    items = await db.sms_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"success": True, "data": items}


# ----------------------------- reminder loop ------------------------------
async def reminder_loop() -> None:
    while True:
        try:
            settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
            window_min = int(settings.get("reminder_minutes_before", 60))
            now = now_utc().replace(tzinfo=None)
            target = now + timedelta(minutes=window_min)
            # find confirmed bookings starting within [target-1min, target+1min]
            bookings = await db.bookings.find({
                "booking_status": "CONFIRMED",
                "reminder_sent": False,
                "appointment_date": target.date().isoformat(),
            }, {"_id": 0}).to_list(500)
            for b in bookings:
                sh, sm = map(int, b["start_time"].split(":"))
                start_dt = datetime.combine(target.date(), time(sh, sm))
                if abs((start_dt - target).total_seconds()) <= 60:
                    msg = (f"Reminder: Hi {b['customer_name']}, your {b['service_name_snapshot']} appointment "
                           f"is at {b['start_time']} today at {settings['salon_name']}. See you soon!")
                    await SMSService.send(phone=b["customer_phone"], message=msg, msg_type="APPOINTMENT_REMINDER",
                                          booking_id=b["id"], customer_id=b["customer_id"])
                    await db.bookings.update_one({"id": b["id"]}, {"$set": {"reminder_sent": True}})
        except Exception as e:  # pragma: no cover
            logger.exception("reminder loop error: %s", e)
        await asyncio.sleep(60)


@app.on_event("startup")
async def on_startup():
    await seed_if_empty()
    await seed_courses_if_empty()
    await db.bookings.create_index([("appointment_date", 1), ("start_time", 1)])
    await db.bookings.create_index("customer_id")
    await db.services.create_index("slug", unique=False)
    asyncio.create_task(reminder_loop())


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
