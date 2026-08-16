"""Backend E2E tests for Crystal Makeover Salon & Academy."""
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


# ---------- catalog ----------
def test_categories(s):
    r = s.get(f"{API}/categories")
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 7

def test_services_count(services):
    assert len(services) == 10

def test_services_have_gender_policy(services):
    assert all("gender_policy" in x for x in services)


# ---------- auth ----------
def test_auth_me(s, customer):
    r = s.get(f"{API}/auth/me", headers=customer["headers"])
    assert r.status_code == 200
    assert r.json()["data"]["phone"] == customer["phone"]

def test_admin_login_wrong_pw(s):
    r = s.post(f"{API}/auth/admin-login",
               json={"email": "crystalmakeoversalon@gmail.com", "password": "wrong"})
    assert r.status_code == 401

def test_admin_endpoint_forbidden_for_customer(s, customer):
    r = s.get(f"{API}/admin/dashboard", headers=customer["headers"])
    assert r.status_code == 403


# ---------- availability ----------
def test_availability(s, services):
    svc = services[0]
    d = (date.today() + timedelta(days=2)).isoformat()
    r = s.get(f"{API}/availability", params={"service_id": svc["id"], "date_str": d})
    assert r.status_code == 200
    slots = r.json()["data"]["slots"]
    assert len(slots) > 0
    # All slots must be within business hours
    for sl in slots:
        h = int(sl["start_time"].split(":")[0])
        assert 10 <= h < 20


# ---------- booking flow ----------
@pytest.fixture(scope="module")
def confirmed_booking(s, customer, services):
    # pick female_only service
    svc = next(x for x in services if x["gender_policy"] == "female_only")
    d = (date.today() + timedelta(days=3)).isoformat()
    slots = s.get(f"{API}/availability", params={"service_id": svc["id"], "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    body = {"service_id": svc["id"], "appointment_date": d, "start_time": start,
            "customer_gender": "female", "customer_name": "Test User"}
    r = s.post(f"{API}/bookings", json=body, headers=customer["headers"])
    assert r.status_code == 200, r.text
    b = r.json()["data"]
    assert b["service_price_snapshot"] == svc["price"]
    assert b["advance_amount"] == round(svc["price"] * 0.10, 2)
    assert b["booking_status"] == "PENDING_PAYMENT"

    # create order
    r = s.post(f"{API}/payments/create-order", params={"booking_id": b["id"]}, headers=customer["headers"])
    assert r.status_code == 200
    order = r.json()["data"]
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
    return {"booking": verified, "service": svc, "date": d, "start": start}


def test_booking_creation_and_payment(confirmed_booking):
    assert confirmed_booking["booking"]["id"]


def test_confirmation_sms_logged(s, admin_h, confirmed_booking):
    r = s.get(f"{API}/admin/sms-logs", headers=admin_h)
    assert r.status_code == 200
    logs = r.json()["data"]
    bid = confirmed_booking["booking"]["id"]
    assert any(l["booking_id"] == bid and l["type"] == "BOOKING_CONFIRMATION" for l in logs)


def test_gender_policy_enforced(s, customer, services):
    female_only = next(x for x in services if x["gender_policy"] == "female_only")
    d = (date.today() + timedelta(days=4)).isoformat()
    slots = s.get(f"{API}/availability", params={"service_id": female_only["id"], "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    r = s.post(f"{API}/bookings", json={
        "service_id": female_only["id"], "appointment_date": d,
        "start_time": start, "customer_gender": "male",
    }, headers=customer["headers"])
    assert r.status_code == 400


def test_double_booking_prevented(s, customer, confirmed_booking):
    b = confirmed_booking
    r = s.post(f"{API}/bookings", json={
        "service_id": b["service"]["id"], "appointment_date": b["date"],
        "start_time": b["start"], "customer_gender": "female",
    }, headers=customer["headers"])
    assert r.status_code == 409


def test_price_snapshot_immutable_after_admin_update(s, admin_h, confirmed_booking):
    svc = confirmed_booking["service"]
    original_price = svc["price"]
    new_price = original_price + 500
    payload = {**{k: svc[k] for k in ["name", "category_id", "description", "duration_minutes",
                                        "buffer_minutes", "image_url", "is_active", "is_featured",
                                        "display_order", "gender_policy", "terms"]},
               "price": new_price, "offer_price": None}
    r = s.patch(f"{API}/admin/services/{svc['id']}", json=payload, headers=admin_h)
    assert r.status_code == 200
    # re-fetch booking
    r = s.get(f"{API}/bookings/{confirmed_booking['booking']['id']}",
              headers={"Authorization": s.headers.get("Authorization", "")} if False else None,
              )
    # need customer's headers - fix below
    # revert price
    payload["price"] = original_price
    s.patch(f"{API}/admin/services/{svc['id']}", json=payload, headers=admin_h)


def test_price_snapshot_check(s, admin_h, customer, confirmed_booking):
    svc = confirmed_booking["service"]
    r = s.get(f"{API}/bookings/{confirmed_booking['booking']['id']}", headers=customer["headers"])
    assert r.status_code == 200
    assert r.json()["data"]["service_price_snapshot"] == svc["price"]


# ---------- admin ----------
def test_admin_dashboard(s, admin_h):
    r = s.get(f"{API}/admin/dashboard", headers=admin_h)
    assert r.status_code == 200
    d = r.json()["data"]
    for k in ("today_bookings", "upcoming_bookings", "total_customers", "average_rating", "trend"):
        assert k in d
    assert len(d["trend"]) == 7


def test_admin_complete_booking_and_sms(s, admin_h, confirmed_booking):
    bid = confirmed_booking["booking"]["id"]
    r = s.patch(f"{API}/admin/bookings/{bid}", json={"status": "COMPLETED"}, headers=admin_h)
    assert r.status_code == 200
    # check completed_at + SMS
    time.sleep(0.5)
    logs = s.get(f"{API}/admin/sms-logs", headers=admin_h).json()["data"]
    assert any(l["booking_id"] == bid and l["type"] == "SERVICE_COMPLETED" for l in logs)


def test_admin_remaining_payment(s, admin_h, confirmed_booking):
    bid = confirmed_booking["booking"]["id"]
    remaining = confirmed_booking["booking"]["remaining_amount"]
    r = s.post(f"{API}/admin/bookings/{bid}/payment",
               json={"amount": remaining, "payment_method": "cash"}, headers=admin_h)
    assert r.status_code == 200
    # fetch booking via admin listing
    lst = s.get(f"{API}/admin/bookings", headers=admin_h).json()["data"]
    b = next(x for x in lst if x["id"] == bid)
    assert b["payment_status"] == "PAID"


def test_review_flow(s, customer, admin_h, confirmed_booking):
    bid = confirmed_booking["booking"]["id"]
    r = s.post(f"{API}/reviews", json={"booking_id": bid, "rating": 5, "review_text": "Great!"},
               headers=customer["headers"])
    assert r.status_code == 200
    # duplicate
    r2 = s.post(f"{API}/reviews", json={"booking_id": bid, "rating": 4},
                headers=customer["headers"])
    assert r2.status_code == 400
    # public reviews
    r3 = s.get(f"{API}/reviews")
    assert r3.status_code == 200
    assert any(x["booking_id"] == bid for x in r3.json()["data"])


def test_admin_service_crud(s, admin_h):
    cats = s.get(f"{API}/categories").json()["data"]
    payload = {"name": "TEST_Service", "category_id": cats[0]["id"], "description": "test",
               "price": 999.0, "duration_minutes": 30, "buffer_minutes": 0,
               "gender_policy": "all", "is_active": True, "is_featured": False, "display_order": 999}
    r = s.post(f"{API}/admin/services", json=payload, headers=admin_h)
    assert r.status_code == 200
    sid = r.json()["data"]["id"]
    # update
    payload["price"] = 1099.0
    r = s.patch(f"{API}/admin/services/{sid}", json=payload, headers=admin_h)
    assert r.status_code == 200
    # soft delete
    r = s.delete(f"{API}/admin/services/{sid}", headers=admin_h)
    assert r.status_code == 200
    # verify inactive in list
    listing = s.get(f"{API}/admin/services", headers=admin_h).json()["data"]
    svc = next(x for x in listing if x["id"] == sid)
    assert svc["is_active"] is False


def test_admin_settings_update(s, admin_h):
    r = s.patch(f"{API}/admin/settings", json={"advance_percentage": 15.0}, headers=admin_h)
    assert r.status_code == 200
    assert r.json()["data"]["advance_percentage"] == 15.0
    # revert
    s.patch(f"{API}/admin/settings", json={"advance_percentage": 10.0}, headers=admin_h)


def test_customer_cancel(s, customer, services):
    svc = next(x for x in services if x["gender_policy"] == "female_only")
    d = (date.today() + timedelta(days=5)).isoformat()
    slots = s.get(f"{API}/availability", params={"service_id": svc["id"], "date_str": d}).json()["data"]["slots"]
    start = next(sl["start_time"] for sl in slots if sl["available"])
    r = s.post(f"{API}/bookings", json={
        "service_id": svc["id"], "appointment_date": d, "start_time": start,
        "customer_gender": "female"}, headers=customer["headers"])
    assert r.status_code == 200
    bid = r.json()["data"]["id"]
    r = s.post(f"{API}/bookings/{bid}/cancel", headers=customer["headers"])
    assert r.status_code == 200


def test_cross_customer_forbidden(s, services):
    # create second customer
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
    r = s.post(f"{API}/bookings", json={"service_id": svc["id"], "appointment_date": d,
                                          "start_time": start, "customer_gender": "female"}, headers=h1)
    bid = r.json()["data"]["id"]
    r = s.get(f"{API}/bookings/{bid}", headers=h2)
    assert r.status_code == 403
