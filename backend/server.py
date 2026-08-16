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
    avatar_url: Optional[str] = None


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
    service_id: str
    appointment_date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    customer_notes: Optional[str] = None
    customer_gender: Optional[str] = None  # female | male
    customer_name: Optional[str] = None


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
    salon_name: Optional[str] = None
    logo_url: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    maps_url: Optional[str] = None
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    working_days: Optional[List[int]] = None  # 0..6, Mon=0
    holidays: Optional[List[str]] = None
    advance_percentage: Optional[float] = None
    reminder_minutes_before: Optional[int] = None
    cancellation_hours: Optional[int] = None
    review_url: Optional[str] = None
    social_instagram: Optional[str] = None
    social_facebook: Optional[str] = None


# ----------------------------- seed ---------------------------------------
DEFAULT_SETTINGS = {
    "id": "singleton",
    "salon_name": "Crystal Makeover Salon & Academy",
    "logo_url": None,
    "phone": "+91 98765 43210",
    "whatsapp": "+91 98765 43210",
    "address": "Studio 12, Beauty Avenue, Mumbai",
    "maps_url": "https://maps.google.com",
    "opening_time": "10:00",
    "closing_time": "20:00",
    "working_days": [0, 1, 2, 3, 4, 5, 6],
    "holidays": [],
    "advance_percentage": 10.0,
    "reminder_minutes_before": 60,
    "cancellation_hours": 4,
    "review_url": "",
    "social_instagram": "https://instagram.com",
    "social_facebook": "https://facebook.com",
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


async def seed_if_empty() -> None:
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
    if await db.service_categories.count_documents({}) == 0:
        cat_id_by_name: Dict[str, str] = {}
        for idx, c in enumerate(SEED_CATEGORIES):
            cid = new_id()
            cat_id_by_name[c["name"]] = cid
            await db.service_categories.insert_one({
                "id": cid,
                "name": c["name"],
                "slug": slugify(c["name"]),
                "description": f"Premium {c['name'].lower()} services at Crystal Makeover.",
                "image_url": c["image_url"],
                "display_order": idx,
                "is_active": True,
                "created_at": iso(now_utc()),
            })
        for idx, (name, cat, price, dur, img, feat, gender, desc) in enumerate(SEED_SERVICES):
            await db.services.insert_one({
                "id": new_id(),
                "name": name,
                "slug": slugify(name),
                "category_id": cat_id_by_name[cat],
                "category_name": cat,
                "description": desc,
                "price": float(price),
                "offer_price": None,
                "duration_minutes": dur,
                "buffer_minutes": 15,
                "image_url": img,
                "is_active": True,
                "is_featured": feat,
                "display_order": idx,
                "gender_policy": gender,
                "terms": "Cancellation allowed up to 4 hours before appointment.",
                "created_at": iso(now_utc()),
                "updated_at": iso(now_utc()),
            })
        logger.info("Seeded categories & services")


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
async def compute_slots(service: Dict[str, Any], target_date: date) -> List[Dict[str, Any]]:
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
    dur = int(service["duration_minutes"]) + int(service.get("buffer_minutes", 0))
    step = 30

    # existing non-cancelled bookings
    existing = await db.bookings.find({
        "appointment_date": target_date.isoformat(),
        "booking_status": {"$in": ["CONFIRMED", "PENDING_PAYMENT", "CUSTOMER_ARRIVED", "IN_SERVICE", "RESCHEDULED"]},
    }, {"_id": 0}).to_list(500)

    def overlaps(a1: datetime, a2: datetime, b1: datetime, b2: datetime) -> bool:
        return a1 < b2 and b1 < a2

    slots: List[Dict[str, Any]] = []
    cur = open_dt
    now = now_utc().replace(tzinfo=None)
    while cur + timedelta(minutes=dur) <= close_dt:
        end = cur + timedelta(minutes=dur)
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
async def availability(service_id: str, date_str: str):
    s = await db.services.find_one({"id": service_id, "is_active": True}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Service not found")
    d = date.fromisoformat(date_str)
    slots = await compute_slots(s, d)
    return {"success": True, "data": {"date": date_str, "slots": slots, "service": s}}


# ---- bookings ----
async def _create_booking_doc(user: Dict[str, Any], body: BookingCreate) -> Dict[str, Any]:
    svc = await db.services.find_one({"id": body.service_id, "is_active": True}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Service not found")
    # Gender policy enforcement
    gender = (body.customer_gender or "female").lower()
    if svc.get("gender_policy") == "female_only" and gender != "female":
        raise HTTPException(400, "This service is available only for female customers.")
    settings = await db.business_settings.find_one({"id": "singleton"}, {"_id": 0}) or DEFAULT_SETTINGS
    d = date.fromisoformat(body.appointment_date)
    start_h, start_m = map(int, body.start_time.split(":"))
    start_dt = datetime.combine(d, time(start_h, start_m))
    total_min = int(svc["duration_minutes"]) + int(svc.get("buffer_minutes", 0))
    end_dt = start_dt + timedelta(minutes=total_min)

    # slot validation
    slots = await compute_slots(svc, d)
    match = next((s for s in slots if s["start_time"] == body.start_time), None)
    if not match or not match["available"]:
        raise HTTPException(409, "Selected slot is no longer available")

    price = float(svc.get("offer_price") or svc["price"])
    advance_pct = float(settings.get("advance_percentage", 10.0))
    advance = round(price * advance_pct / 100.0, 2)
    remaining = round(price - advance, 2)

    booking = {
        "id": new_id(),
        "booking_number": gen_booking_number(),
        "customer_id": user["id"],
        "customer_name": body.customer_name or user.get("name"),
        "customer_phone": user.get("phone"),
        "customer_gender": gender,
        "service_id": svc["id"],
        "service_name_snapshot": svc["name"],
        "service_price_snapshot": price,
        "service_duration_snapshot": svc["duration_minutes"],
        "category_name": svc.get("category_name"),
        "image_url": svc.get("image_url"),
        "appointment_date": body.appointment_date,
        "start_time": body.start_time,
        "end_time": end_dt.strftime("%H:%M"),
        "total_amount": price,
        "advance_percentage": advance_pct,
        "advance_amount": advance,
        "remaining_amount": remaining,
        "payment_status": "PENDING",
        "booking_status": "PENDING_PAYMENT",
        "customer_notes": body.customer_notes,
        "admin_notes": None,
        "reminder_sent": False,
        "completed_at": None,
        "cancelled_at": None,
        "cancel_reason": None,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    # Final race-condition check: re-fetch conflicts
    conflicts = await db.bookings.count_documents({
        "appointment_date": booking["appointment_date"],
        "booking_status": {"$in": ["CONFIRMED", "PENDING_PAYMENT", "CUSTOMER_ARRIVED", "IN_SERVICE"]},
        "$expr": {"$and": [
            {"$lt": ["$start_time", booking["end_time"]]},
            {"$gt": ["$end_time", booking["start_time"]]},
        ]},
    })
    if conflicts:
        raise HTTPException(409, "Slot just got booked. Please pick another time.")
    await db.bookings.insert_one(booking.copy())
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
    return {"success": True, "data": {"booking": b, "payment_id": payment["id"]}}


# ---- reviews ----
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
