"""Invoice and Payment module tests."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.customer import Customer, CustomerStatus, CustomerType
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment, PaymentMethod
from app.models.plan import BillingCycle, DataPolicy, Plan, PlanPricing
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.tests.conftest import http_client

PREFIX_INV = "/api/v1/invoices"
PREFIX_PAY = "/api/v1/payments"
client = http_client


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="module")
def test_subscription(db: Session) -> Subscription:
    """Create a minimal customer + plan + pricing + subscription for tests."""
    # User
    user = User(
        email=f"inv_test_{uuid.uuid4().hex[:6]}@test.local",
        password_hash=hash_password("Test@12345"),
        role=UserRole.CLIENT,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.flush()

    # Customer
    cust = Customer(
        user_id=user.id,
        customer_code=f"TDB-CUST-T{uuid.uuid4().hex[:4].upper()}",
        customer_type=CustomerType.INDIVIDUAL,
        full_name="Test Invoice Customer",
        mobile_number=f"9{uuid.uuid4().int % 10**9:09d}",
        email=user.email,
        installation_address="123 Test Street",
        pincode="400001",
        city="Mumbai",
        state="Maharashtra",
        status=CustomerStatus.ACTIVE,
    )
    db.add(cust)
    db.flush()

    # Plan
    plan = Plan(
        plan_code=f"TDB-TST-{uuid.uuid4().hex[:4].upper()}",
        name="Test 50Mbps Plan",
        speed_mbps=50,
        data_policy=DataPolicy.UNLIMITED,
        is_active=True,
    )
    db.add(plan)
    db.flush()

    # Pricing
    pricing = PlanPricing(
        plan_id=plan.id,
        billing_cycle=BillingCycle.MONTHLY,
        base_price=Decimal("500.00"),
        gst_percentage=Decimal("18.00"),
        total_price=Decimal("590.00"),
        is_active=True,
    )
    db.add(pricing)
    db.flush()

    # Subscription
    today = date.today()
    sub = Subscription(
        subscription_code=f"TDB-SUB-T{uuid.uuid4().hex[:4].upper()}",
        customer_id=cust.id,
        plan_id=plan.id,
        plan_pricing_id=pricing.id,
        plan_name_snapshot=plan.name,
        plan_code_snapshot=plan.plan_code,
        speed_mbps_snapshot=plan.speed_mbps,
        billing_cycle_snapshot=pricing.billing_cycle.value,
        base_price_snapshot=pricing.base_price,
        gst_percentage_snapshot=pricing.gst_percentage,
        total_price_snapshot=pricing.total_price,
        start_date=today,
        renewal_date=today + timedelta(days=30),
        expiry_date=today + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@pytest.fixture(scope="module")
def created_invoice_id(admin_token: str, test_subscription: Subscription) -> str:
    """Create one invoice and return its ID."""
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    return r.json()["id"]


# ── Invoice generation ────────────────────────────────────────────────────────

def test_invoice_creation(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["invoice_number"].startswith("TDB-INV-")
    assert body["status"] == "UNPAID"
    assert body["is_locked"] is False
    assert float(body["total_amount"]) == 590.0
    assert float(body["balance_amount"]) == 590.0
    assert float(body["paid_amount"]) == 0.0


def test_invoice_number_format(admin_token: str, created_invoice_id: str):
    r = client.get(f"{PREFIX_INV}/{created_invoice_id}", headers=_bearer(admin_token))
    assert r.status_code == 200
    num = r.json()["invoice_number"]
    parts = num.split("-")
    assert len(parts) == 4  # TDB-INV-YYYYMM-00001
    assert len(parts[2]) == 6  # YYYYMM
    assert parts[3].isdigit()  # sequential number


def test_invoice_snapshots(admin_token: str, created_invoice_id: str, test_subscription: Subscription):
    r = client.get(f"{PREFIX_INV}/{created_invoice_id}", headers=_bearer(admin_token))
    body = r.json()
    assert body["customer_code_snapshot"] == test_subscription.customer.customer_code
    assert body["customer_name_snapshot"] == "Test Invoice Customer"
    assert body["plan_name_snapshot"] == "Test 50Mbps Plan"
    assert body["connection_name_snapshot"] == test_subscription.subscription_code
    assert float(body["gst_percentage"]) == 18.0
    assert float(body["base_amount"]) == 500.0
    assert float(body["gst_amount"]) == 90.0


def test_due_date_auto_calculated(admin_token: str, created_invoice_id: str):
    r = client.get(f"{PREFIX_INV}/{created_invoice_id}", headers=_bearer(admin_token))
    body = r.json()
    inv_date = date.fromisoformat(body["invoice_date"])
    due_date = date.fromisoformat(body["due_date"])
    assert due_date >= inv_date  # due after invoice date


def test_invoice_requires_auth():
    r = client.get(PREFIX_INV)
    assert r.status_code == 401


# ── Invoice list + search + filter ────────────────────────────────────────────

def test_invoice_list(admin_token: str):
    r = client.get(PREFIX_INV, headers=_bearer(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] >= 1


def test_invoice_list_status_filter(admin_token: str):
    r = client.get(f"{PREFIX_INV}?status=UNPAID", headers=_bearer(admin_token))
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["status"] == "UNPAID"


def test_invoice_search(admin_token: str):
    r = client.get(f"{PREFIX_INV}?search=TDB-INV", headers=_bearer(admin_token))
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── Editing unpaid invoices ───────────────────────────────────────────────────

def test_edit_unpaid_invoice(admin_token: str, created_invoice_id: str):
    new_end = str(date.today() + timedelta(days=5))
    r = client.patch(
        f"{PREFIX_INV}/{created_invoice_id}",
        json={"billing_period_end": new_end, "change_reason": "Correcting billing period"},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200, r.json()
    assert r.json()["edited_count"] >= 1


def test_edit_requires_change_reason(admin_token: str, created_invoice_id: str):
    r = client.patch(
        f"{PREFIX_INV}/{created_invoice_id}",
        json={"remarks": "test", "change_reason": ""},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 422


# ── Invoice history ───────────────────────────────────────────────────────────

def test_invoice_change_history(admin_token: str, created_invoice_id: str):
    r = client.get(f"{PREFIX_INV}/{created_invoice_id}/history", headers=_bearer(admin_token))
    assert r.status_code == 200
    logs = r.json()
    assert len(logs) >= 1
    types = {log["change_type"] for log in logs}
    assert "CREATED" in types


# ── PDF generation ────────────────────────────────────────────────────────────

def test_pdf_download(admin_token: str, created_invoice_id: str):
    r = client.get(f"{PREFIX_INV}/{created_invoice_id}/pdf", headers=_bearer(admin_token))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert len(r.content) > 100  # non-trivial PDF


# ── Payment recording ─────────────────────────────────────────────────────────

def test_partial_payment(admin_token: str, test_subscription: Subscription, db: Session):
    # Create fresh invoice
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201
    inv_id = r.json()["id"]

    # Partial payment
    r = client.post(
        PREFIX_PAY,
        json={
            "invoice_id": inv_id,
            "amount": "100.00",
            "payment_date": str(today),
            "payment_method": "CASH",
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    pay_body = r.json()
    assert pay_body["payment_number"].startswith("TDB-PAY-")

    # Check invoice locked + status
    r2 = client.get(f"{PREFIX_INV}/{inv_id}", headers=_bearer(admin_token))
    body = r2.json()
    assert body["is_locked"] is True
    assert body["status"] == "PARTIALLY_PAID"
    assert float(body["paid_amount"]) == 100.0
    assert float(body["balance_amount"]) == 490.0


def test_locking_after_payment(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]

    # Record payment
    client.post(
        PREFIX_PAY,
        json={"invoice_id": inv_id, "amount": "50.00", "payment_date": str(today), "payment_method": "UPI"},
        headers=_bearer(admin_token),
    )

    # Try to edit — should return 409
    r2 = client.patch(
        f"{PREFIX_INV}/{inv_id}",
        json={"remarks": "try to edit", "change_reason": "test"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 409


def test_full_payment_marks_paid(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]
    total = float(r.json()["total_amount"])

    r2 = client.post(
        PREFIX_PAY,
        json={"invoice_id": inv_id, "amount": str(total), "payment_date": str(today), "payment_method": "BANK_TRANSFER"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 201

    r3 = client.get(f"{PREFIX_INV}/{inv_id}", headers=_bearer(admin_token))
    assert r3.json()["status"] == "PAID"
    assert float(r3.json()["balance_amount"]) == 0.0


def test_overpayment_rejected(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]

    r2 = client.post(
        PREFIX_PAY,
        json={"invoice_id": inv_id, "amount": "99999.00", "payment_date": str(today), "payment_method": "CASH"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 400


def test_cancelled_invoice_rejects_payment(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]

    # Cancel it
    client.patch(
        f"{PREFIX_INV}/{inv_id}/status",
        json={"status": "CANCELLED", "change_reason": "Test cancel"},
        headers=_bearer(admin_token),
    )

    # Try payment
    r2 = client.post(
        PREFIX_PAY,
        json={"invoice_id": inv_id, "amount": "100.00", "payment_date": str(today), "payment_method": "CASH"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 400


# ── Balance calculations ──────────────────────────────────────────────────────

def test_balance_calculation(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]
    total = float(r.json()["total_amount"])

    # Pay 200
    client.post(
        PREFIX_PAY,
        json={"invoice_id": inv_id, "amount": "200.00", "payment_date": str(today), "payment_method": "CASH"},
        headers=_bearer(admin_token),
    )

    r2 = client.get(f"{PREFIX_INV}/{inv_id}", headers=_bearer(admin_token))
    body = r2.json()
    assert abs(float(body["paid_amount"]) - 200.0) < 0.01
    assert abs(float(body["balance_amount"]) - (total - 200.0)) < 0.01


# ── Status transitions ────────────────────────────────────────────────────────

def test_status_cancel(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]

    r2 = client.patch(
        f"{PREFIX_INV}/{inv_id}/status",
        json={"status": "CANCELLED", "change_reason": "Wrong subscription"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "CANCELLED"


# ── Payment list ──────────────────────────────────────────────────────────────

def test_payment_list(admin_token: str):
    r = client.get(PREFIX_PAY, headers=_bearer(admin_token))
    assert r.status_code == 200
    assert "items" in r.json()


def test_payment_list_by_invoice(admin_token: str, test_subscription: Subscription):
    today = date.today()
    r = client.post(
        PREFIX_INV,
        json={
            "subscription_id": str(test_subscription.id),
            "billing_period_start": str(today.replace(day=1)),
            "billing_period_end": str(today),
            "invoice_date": str(today),
        },
        headers=_bearer(admin_token),
    )
    inv_id = r.json()["id"]

    r2 = client.get(f"{PREFIX_PAY}?invoice_id={inv_id}", headers=_bearer(admin_token))
    assert r2.status_code == 200
