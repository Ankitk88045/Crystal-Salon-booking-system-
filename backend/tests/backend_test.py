"""Backend E2E tests for Crystal Makeover Salon & Academy (iter 2).

Covers new multi-service booking mechanics, home->WhatsApp gating,
academy endpoints, and updated settings, in addition to the iter-1 suite.
"""
import os
import time
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/admin-login",
               json={"email": "crystalmakeoversalon@gmail.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["user"]["role"] == "SUPER_ADMIN"
    return d["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def customer(s):
    phone = f"+9198{int(time.time())%100000000:08d}"
    r = s.post(f"{API}/auth/request-otp", json={"phone": phone})
    assert r.status_code == 200
    otp = r.json()["data"]["dev_otp"]
    r = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": otp, "name": "Test User"})
    assert r.status_code == 200
    d = r.json()["data"]
    return {"phone": phone, "token": d["token"], "user": d["user"],
            "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="module")
def services(s):
    r = s.get(f"{API}/services")
    assert r.status_code == 200
    return r.json()["data"]


# ---------- settings ----------
def test_settings_updated_lucknow(s):
    r = s.get(f"{API}/settings")
    assert r.status_code == 200
    d = r.json()["data"]
    assert "Crystal" in d["salon_name"]
    assert d["logo_url"].startswith("https://i.ibb.co/")
    assert "Lucknow" in d["address"]
    hsa = d["home_service_area"] or ""
    assert "Lucknow" in hsa and "Uttar Pradesh" in hsa


# ---------- catalog ----------
def test_categories(s):
    r = s.get(f"{API}/categories")
    assert r.status_code == 200
    assert len(r.json()["data"]) >= 6


def test_services_present(services):
    assert len(services) >= 8
    assert all("gender_policy" in x for x in services)


# ---------- academy ----------
def test_courses_seeded(s):
    r = s.get(f"{API}/courses")
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 4
    required = {"id", "slug", "name", "duration", "price", "description", "features", "image_url"}
    for c in data:
        assert required.issubset(c.keys()), f"missing keys in course: {c}"


def test_academy_enquiry(s):
    r = s.post(f"{API}/academy/enquiry", json={
        "name": "TEST_Enquirer", "phone": "+919999000011", "email": "test@e.com",
        "course": "Certified Bridal Makeup Course", "message": "please contact me",
    })
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["id"] and d["status"] == "NEW"
    assert d["name"] == "TEST_Enquirer"


# ---------- auth ----------
def test_auth_me(s, customer):
    r = s.get(f"{API}/auth/me", headers=customer["headers"])
    assert r.status_code == 200


def test_admin_login_wrong_pw(s):
    r = s.post(f"{API}/auth/admin-login",
               json={"email": "crystalmakeoversalon@gmail.com", "password": "wrong"})
    assert r.status_code == 401


def test_admin_endpoint_forbidden_for_customer(s, customer):
    r = s.get(f"{API}/admin/dashboard", headers=customer["headers"])
    assert r.status_code == 403


# ---------- availability multi-service ----------
def test_availability_legacy_service_id(s, services):
    svc = services[0]
    d = (date.today() + timedelta(days=2)).isoformat()
    r = s.get(f"{API}/availability", params={"service_id": svc["id"], "date_str": d})
    assert r.status_code == 200
    assert len(r.json()["data"]["slots"]) > 0


def test_availability_multi_service(s, services):
    # Pick 2 services (both female_only so gender policy is uniform)
    picks = [x for x in services if x["gender_policy"] == "female_only"][:2]
    assert len(picks) == 2
    d = (date.today() + timedelta(days=2)).isoformat()
    ids = ",".join(p["id"] for p in picks)
    r = s.get(f"{API}/availability", params={"service_ids": ids, "date_str": d})
    assert r.status_code == 200
    data = r.json()["data"]
    expected = sum(p["duration_minutes"] + p.get("buffer_minutes", 0) for p in picks)
    assert data["total_duration"] == expected
    multi_slots = data["slots"]
    # single service comparison
    r2 = s.get(f"{API}/availability", params={"service_id": picks[0]["id"], "date_str": d})
    single_slots = r2.json()["data"]["slots"]
    # Multi should produce <= single (longer duration => fewer/equal available slots)
    multi_avail = sum(1 for sl in multi_slots if sl["available"])
    single_avail = sum(1 for sl in single_slots if sl["available"])
    assert multi_avail <= single_avail


# ---------- booking multi-service + home gating ----------
@pytest.fixture(scope="module")
def multi_booking(s, customer, services):
    picks = [x for x in services if x["gender_policy"] == "female_only"][:2]
    d = (date.today() + timedelta(days=3)).isoformat()
    ids_csv = ",".join(p["id"] for p in picks)
    slots = s.get(f"{API}/availability", params={"service_ids": ids_csv, "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    body = {"service_ids": [p["id"] for p in picks], "location": "salon",
            "appointment_date": d, "start_time": start,
            "customer_gender": "female", "customer_name": "Test User"}
    r = s.post(f"{API}/bookings", json=body, headers=customer["headers"])
    assert r.status_code == 200, r.text
    b = r.json()["data"]
    return {"booking": b, "services": picks, "date": d, "start": start}


def test_multi_service_booking_fields(multi_booking):
    b = multi_booking["booking"]
    picks = multi_booking["services"]
    assert isinstance(b["services_snapshot"], list)
    assert len(b["services_snapshot"]) == 2
    combined_name = " + ".join(p["name"] for p in picks)
    assert b["service_name_snapshot"] == combined_name
    assert b["total_amount"] == sum(p["price"] for p in picks)
    assert b["service_duration_snapshot"] == sum(p["duration_minutes"] + p.get("buffer_minutes", 0) for p in picks)
    assert b["advance_amount"] == round(b["total_amount"] * 0.10, 2)
    assert b["booking_status"] == "PENDING_PAYMENT"
    assert b["location"] == "salon"


def test_home_booking_rejected(s, customer, services):
    picks = [x for x in services if x["gender_policy"] == "female_only"][:1]
    d = (date.today() + timedelta(days=4)).isoformat()
    body = {"service_ids": [picks[0]["id"]], "location": "home",
            "appointment_date": d, "start_time": "11:00", "customer_gender": "female"}
    r = s.post(f"{API}/bookings", json=body, headers=customer["headers"])
    assert r.status_code == 400
    assert "WhatsApp" in r.text or "home" in r.text.lower()


def test_female_only_rejects_male(s, customer, services):
    female_only = next(x for x in services if x["gender_policy"] == "female_only")
    d = (date.today() + timedelta(days=4)).isoformat()
    slots = s.get(f"{API}/availability", params={"service_id": female_only["id"], "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    r = s.post(f"{API}/bookings", json={
        "service_ids": [female_only["id"]], "location": "salon",
        "appointment_date": d, "start_time": start, "customer_gender": "male",
    }, headers=customer["headers"])
    assert r.status_code == 400


def test_mixed_selection_requires_female(s, customer, services):
    bridal_all = next((x for x in services if x["gender_policy"] == "all"), None)
    female_only = next(x for x in services if x["gender_policy"] == "female_only")
    if not bridal_all:
        pytest.skip("no 'all' gender service seeded")
    d = (date.today() + timedelta(days=5)).isoformat()
    ids_csv = f"{bridal_all['id']},{female_only['id']}"
    slots = s.get(f"{API}/availability", params={"service_ids": ids_csv, "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    # male should be rejected because one is female_only
    r = s.post(f"{API}/bookings", json={
        "service_ids": [bridal_all["id"], female_only["id"]], "location": "salon",
        "appointment_date": d, "start_time": start, "customer_gender": "male",
    }, headers=customer["headers"])
    assert r.status_code == 400


# ---------- payment mock for multi-service ----------
def test_multi_booking_payment_flow(s, customer, multi_booking):
    b = multi_booking["booking"]
    r = s.post(f"{API}/payments/create-order", params={"booking_id": b["id"]}, headers=customer["headers"])
    assert r.status_code == 200
    order = r.json()["data"]
    assert order["amount"] == int(b["advance_amount"] * 100)
    r = s.post(f"{API}/payments/verify", json={
        "booking_id": b["id"],
        "razorpay_order_id": order["order_id"],
        "razorpay_payment_id": "pay_mock_" + b["id"][:8],
        "razorpay_signature": "sig_mock",
    }, headers=customer["headers"])
    assert r.status_code == 200
    verified = r.json()["data"]["booking"]
    assert verified["booking_status"] == "CONFIRMED"
    assert verified["payment_status"] == "ADVANCE_PAID"


# ---------- price snapshot immutability for multi-service ----------
def test_multi_price_snapshot_immutable(s, admin_h, customer, multi_booking):
    b_before = multi_booking["booking"]
    svc = multi_booking["services"][0]
    original_price = svc["price"]
    new_price = original_price + 777
    payload = {
        "name": svc["name"], "category_id": svc["category_id"],
        "description": svc.get("description", ""), "price": new_price,
        "offer_price": None, "duration_minutes": svc["duration_minutes"],
        "buffer_minutes": svc.get("buffer_minutes", 0), "image_url": svc.get("image_url"),
        "is_active": True, "is_featured": svc.get("is_featured", False),
        "display_order": svc.get("display_order", 0),
        "gender_policy": svc["gender_policy"], "terms": svc.get("terms"),
    }
    r = s.patch(f"{API}/admin/services/{svc['id']}", json=payload, headers=admin_h)
    assert r.status_code == 200
    # verify booking unchanged
    r = s.get(f"{API}/bookings/{b_before['id']}", headers=customer["headers"])
    got = r.json()["data"]
    assert got["total_amount"] == b_before["total_amount"]
    assert got["services_snapshot"][0]["price"] == b_before["services_snapshot"][0]["price"]
    # revert
    payload["price"] = original_price
    s.patch(f"{API}/admin/services/{svc['id']}", json=payload, headers=admin_h)


# ---------- admin surface ----------
def test_admin_dashboard(s, admin_h):
    r = s.get(f"{API}/admin/dashboard", headers=admin_h)
    assert r.status_code == 200
    d = r.json()["data"]
    for k in ("today_bookings", "upcoming_bookings", "total_customers", "average_rating", "trend"):
        assert k in d
    assert len(d["trend"]) == 7


def test_cross_customer_forbidden(s, services):
    phone = f"+9198{int(time.time())%100000000+1:08d}"
    otp = s.post(f"{API}/auth/request-otp", json={"phone": phone}).json()["data"]["dev_otp"]
    tok = s.post(f"{API}/auth/verify-otp", json={"phone": phone, "code": otp}).json()["data"]["token"]
    h2 = {"Authorization": f"Bearer {tok}"}

    phone1 = f"+9198{int(time.time())%100000000+2:08d}"
    otp1 = s.post(f"{API}/auth/request-otp", json={"phone": phone1}).json()["data"]["dev_otp"]
    tok1 = s.post(f"{API}/auth/verify-otp", json={"phone": phone1, "code": otp1}).json()["data"]["token"]
    h1 = {"Authorization": f"Bearer {tok1}"}

    svc = next(x for x in services if x["gender_policy"] == "female_only")
    d = (date.today() + timedelta(days=6)).isoformat()
    slots = s.get(f"{API}/availability", params={"service_id": svc["id"], "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    r = s.post(f"{API}/bookings", json={
        "service_ids": [svc["id"]], "location": "salon", "appointment_date": d,
        "start_time": start, "customer_gender": "female"}, headers=h1)
    bid = r.json()["data"]["id"]
    r = s.get(f"{API}/bookings/{bid}", headers=h2)
    assert r.status_code == 403
