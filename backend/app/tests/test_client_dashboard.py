"""Tests for the client dashboard API endpoints.

Covers:
- Ownership validation (customers see only their own data)
- Dashboard aggregations (summary KPIs)
- Active connection counts
- Outstanding amount calculations
- Expiring subscription logic
- Recent invoice queries
- Recent payment queries
- Notification queries
- Unauthorized access attempts
"""

from __future__ import annotations

import uuid as uuid_mod
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.customer import Customer, CustomerStatus, CustomerType
from app.models.invoice import Invoice, InvoiceStatus
from app.models.notification import NotificationLog
from app.models.payment import Payment, PaymentMethod
from app.models.plan import BillingCycle, DataPolicy, Plan, PlanPricing
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.tests.conftest import http_client

PREFIX = settings.API_V1_PREFIX
client = http_client


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_client_user(db: Session) -> User:
    u = User(
        email=f"_tdash_{uuid_mod.uuid4().hex[:8]}@truedata.test",
        password_hash=hash_password("Test@12345"),
        role=UserRole.CLIENT,
        is_active=True,
        must_change_password=False,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_customer(db: Session, user: User, *, mobile: str | None = None) -> Customer:
    c = Customer(
        user_id=user.id,
        customer_code=f"TST-{uuid_mod.uuid4().hex[:6].upper()}",
        customer_type=CustomerType.INDIVIDUAL,
        full_name="Dashboard Test Customer",
        mobile_number=mobile or f"9{uuid_mod.uuid4().int % 1_000_000_000:09d}",
        email=user.email,
        installation_address="123 Test Street",
        pincode="400001",
        city="Mumbai",
        state="Maharashtra",
        status=CustomerStatus.ACTIVE,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_plan(db: Session) -> tuple[Plan, PlanPricing]:
    plan = Plan(
        plan_code=f"TDB-DASH-{uuid_mod.uuid4().hex[:4].upper()}",
        name=f"Dash Plan {uuid_mod.uuid4().hex[:6]}",
        speed_mbps=100,
        data_policy=DataPolicy.UNLIMITED,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    pricing = PlanPricing(
        plan_id=plan.id,
        billing_cycle=BillingCycle.MONTHLY,
        base_price="799.00",
        gst_percentage="18.00",
        total_price="942.82",
        is_active=True,
    )
    db.add(pricing)
    db.commit()
    db.refresh(plan)
    db.refresh(pricing)
    return plan, pricing


def _make_subscription(
    db: Session,
    customer: Customer,
    plan: Plan,
    pricing: PlanPricing,
    *,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    expiry_days: int = 30,
    connection_name: str = "TEST-CONN",
) -> Subscription:
    today = date.today()
    s = Subscription(
        customer_id=customer.id,
        plan_id=plan.id,
        plan_pricing_id=pricing.id,
        subscription_code=f"TDB-SUB-{uuid_mod.uuid4().int % 99999:05d}",
        plan_name_snapshot=plan.name,
        plan_code_snapshot=plan.plan_code,
        speed_mbps_snapshot=plan.speed_mbps,
        billing_cycle_snapshot="MONTHLY",
        base_price_snapshot=Decimal("799.00"),
        gst_percentage_snapshot=Decimal("18.00"),
        total_price_snapshot=Decimal("942.82"),
        start_date=today,
        renewal_date=today + timedelta(days=expiry_days),
        expiry_date=today + timedelta(days=expiry_days),
        status=status,
        connection_name=connection_name,
        installation_address="123 Test Street",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _make_invoice(
    db: Session,
    subscription: Subscription,
    *,
    customer: Customer | None = None,
    status: InvoiceStatus = InvoiceStatus.UNPAID,
    total: str = "942.82",
    paid: str = "0.00",
    balance: str = "942.82",
    due_days: int = 15,
) -> Invoice:
    today = date.today()
    inv = Invoice(
        invoice_number=f"INV-{uuid_mod.uuid4().hex[:8].upper()}",
        invoice_type="SINGLE",
        subscription_id=subscription.id,
        customer_id=customer.id if customer else None,
        invoice_date=today,
        due_date=today + timedelta(days=due_days),
        billing_period_start=today,
        billing_period_end=today + timedelta(days=30),
        company_name_snapshot="True Data Broadband",
        customer_code_snapshot=subscription.customer.customer_code if hasattr(subscription, "customer") else "TST-000",
        customer_name_snapshot="Test Customer",
        connection_name_snapshot=subscription.connection_name or "TEST-CONN",
        plan_code_snapshot=subscription.plan_code_snapshot,
        plan_name_snapshot=subscription.plan_name_snapshot,
        speed_mbps_snapshot=subscription.speed_mbps_snapshot,
        data_policy_snapshot="UNLIMITED",
        billing_cycle_snapshot=subscription.billing_cycle_snapshot,
        base_amount=Decimal(total) / Decimal("1.18"),
        gst_percentage=Decimal("18.00"),
        gst_amount=Decimal(total) - Decimal(total) / Decimal("1.18"),
        total_amount=Decimal(total),
        paid_amount=Decimal(paid),
        balance_amount=Decimal(balance),
        status=status,
        version_number=1,
        is_locked=True,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


def _make_payment(
    db: Session,
    invoice: Invoice,
    *,
    amount: str = "942.82",
    days_ago: int = 5,
) -> Payment:
    p = Payment(
        payment_number=f"PAY-{uuid_mod.uuid4().hex[:8].upper()}",
        invoice_id=invoice.id,
        amount=Decimal(amount),
        payment_date=date.today() - timedelta(days=days_ago),
        payment_method=PaymentMethod.UPI,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_notification(
    db: Session,
    *,
    subscription: Subscription | None = None,
    customer: Customer | None = None,
    template_key: str = "INVOICE_GENERATED",
    channel: str = "EMAIL",
    status: str = "SENT",
) -> NotificationLog:
    n = NotificationLog(
        template_key=template_key,
        channel=channel,
        recipient_email=customer.email if customer else None,
        recipient_mobile=customer.mobile_number if customer else None,
        subscription_id=subscription.id if subscription else None,
        entity_type="CUSTOMER" if customer and not subscription else None,
        entity_id=str(customer.id) if customer and not subscription else None,
        status=status,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def _login(user: User) -> str:
    r = http_client.post(
        f"{PREFIX}/auth/login",
        json={"email": user.email, "password": "Test@12345"},
    )
    assert r.status_code == 200, f"Login failed: {r.json()}"
    return r.json()["access_token"]


def _cleanup(db: Session, *objs) -> None:
    """Delete objects in the order given — callers must pass in dependency order
    (children before parents, e.g. payments → invoices → subscriptions → pricing → plan)."""
    from sqlalchemy import text
    try:
        db.rollback()
    except Exception:
        pass
    for obj in objs:
        try:
            db.execute(
                text(f"DELETE FROM {obj.__tablename__} WHERE id = :id"),
                {"id": obj.id},
            )
            db.commit()
        except Exception:
            db.rollback()


# ---------------------------------------------------------------------------
# Unauthorized access — no customer linked to user
# ---------------------------------------------------------------------------


def test_dashboard_requires_customer_record(db: Session):
    """A CLIENT user with no linked customer gets 403 from all endpoints."""
    user = _make_client_user(db)
    token = _login(user)

    for path in [
        "/client/dashboard/summary",
        "/client/dashboard/connections",
        "/client/dashboard/invoices",
        "/client/dashboard/payments",
        "/client/dashboard/notifications",
    ]:
        r = http_client.get(f"{PREFIX}{path}", headers=_bearer(token))
        assert r.status_code == 403, f"{path} should be 403 without customer"

    db.delete(user)
    db.commit()


def test_dashboard_requires_client_role(admin_token: str):
    """SUPERADMIN token should NOT access client dashboard (403/401)."""
    for path in [
        "/client/dashboard/summary",
        "/client/dashboard/connections",
    ]:
        r = http_client.get(f"{PREFIX}{path}", headers=_bearer(admin_token))
        assert r.status_code in (403, 401), f"{path} should be forbidden for admin"


def test_dashboard_requires_auth():
    """Unauthenticated requests are rejected."""
    r = http_client.get(f"{PREFIX}/client/dashboard/summary")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Summary — active connection counts
# ---------------------------------------------------------------------------


def test_summary_active_connection_count(db: Session):
    """active_connections counts only ACTIVE subscriptions for this customer."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    # 2 ACTIVE + 1 EXPIRED
    s1 = _make_subscription(db, customer, plan, pricing, connection_name="CONN-A")
    s2 = _make_subscription(db, customer, plan, pricing, connection_name="CONN-B")
    s3 = _make_subscription(
        db, customer, plan, pricing,
        status=SubscriptionStatus.EXPIRED,
        connection_name="CONN-C",
    )

    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token))
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["active_connections"] == 2

    _cleanup(db, s3, s2, s1, customer, user, pricing, plan)


def test_summary_expiring_soon_count(db: Session):
    """expiring_soon counts ACTIVE subscriptions with expiry within 30 days."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    # Expires in 15 days (within 30) — should count
    s1 = _make_subscription(db, customer, plan, pricing, expiry_days=15, connection_name="NEAR")
    # Expires in 45 days (outside 30) — should not count
    s2 = _make_subscription(db, customer, plan, pricing, expiry_days=45, connection_name="FAR")

    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token))
    assert r.status_code == 200
    assert r.json()["expiring_soon"] == 1

    _cleanup(db, s2, s1, customer, user, pricing, plan)


# ---------------------------------------------------------------------------
# Summary — outstanding amount
# ---------------------------------------------------------------------------


def test_summary_outstanding_amount(db: Session):
    """outstanding_amount sums balance_amount for UNPAID/PARTIALLY_PAID/OVERDUE invoices."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)

    # UNPAID — ₹942.82 outstanding
    inv1 = _make_invoice(db, sub, status=InvoiceStatus.UNPAID, balance="942.82")
    # OVERDUE — ₹500.00 outstanding
    inv2 = _make_invoice(db, sub, status=InvoiceStatus.OVERDUE, balance="500.00")
    # PAID — should NOT be included
    inv3 = _make_invoice(db, sub, status=InvoiceStatus.PAID, balance="0.00")

    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token))
    assert r.status_code == 200
    outstanding = float(r.json()["outstanding_amount"])
    assert abs(outstanding - 1442.82) < 0.01

    _cleanup(db, inv3, inv2, inv1, sub, customer, user, pricing, plan)


def test_summary_outstanding_zero_when_all_paid(db: Session):
    """outstanding_amount is 0 when all invoices are paid."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.PAID, balance="0.00")

    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token))
    assert r.status_code == 200
    assert float(r.json()["outstanding_amount"]) == 0.0

    _cleanup(db, inv, sub, customer, user, pricing, plan)


# ---------------------------------------------------------------------------
# Summary — last payment
# ---------------------------------------------------------------------------


def test_summary_last_payment(db: Session):
    """last_payment_amount and last_payment_date reflect the most recent payment."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.PAID, balance="0.00")
    # Older payment
    _make_payment(db, inv, amount="500.00", days_ago=10)
    # Newer payment
    latest = _make_payment(db, inv, amount="442.82", days_ago=2)

    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token))
    assert r.status_code == 200
    body = r.json()
    assert body["last_payment_date"] == latest.payment_date.isoformat()
    assert abs(float(body["last_payment_amount"]) - 442.82) < 0.01

    _cleanup(db, latest, inv, sub, customer, user, pricing, plan)


def test_summary_no_payments(db: Session):
    """last_payment fields are null when no payments exist."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    token = _login(user)

    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token))
    assert r.status_code == 200
    body = r.json()
    assert body["last_payment_amount"] is None
    assert body["last_payment_date"] is None

    _cleanup(db, customer, user)


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------


def test_connections_returns_active_only(db: Session):
    """connections endpoint returns only ACTIVE subscriptions."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    active = _make_subscription(db, customer, plan, pricing, connection_name="ACTIVE-CONN")
    expired = _make_subscription(
        db, customer, plan, pricing,
        status=SubscriptionStatus.EXPIRED,
        connection_name="EXPIRED-CONN",
    )

    r = http_client.get(f"{PREFIX}/client/dashboard/connections", headers=_bearer(token))
    assert r.status_code == 200
    data = r.json()
    names = [c["connection_name"] for c in data]
    assert "ACTIVE-CONN" in names
    assert "EXPIRED-CONN" not in names

    _cleanup(db, expired, active, customer, user, pricing, plan)


def test_connections_sorted_by_expiry_asc(db: Session):
    """connections are sorted by expiry_date ASC (soonest first)."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    s_near = _make_subscription(db, customer, plan, pricing, expiry_days=10, connection_name="NEAR")
    s_far = _make_subscription(db, customer, plan, pricing, expiry_days=60, connection_name="FAR")

    r = http_client.get(f"{PREFIX}/client/dashboard/connections", headers=_bearer(token))
    assert r.status_code == 200
    data = r.json()
    names = [c["connection_name"] for c in data]
    assert names.index("NEAR") < names.index("FAR")

    _cleanup(db, s_far, s_near, customer, user, pricing, plan)


def test_connections_days_remaining_calculated(db: Session):
    """days_remaining is correctly calculated from today."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing, expiry_days=20, connection_name="DAYS-CONN")

    r = http_client.get(f"{PREFIX}/client/dashboard/connections", headers=_bearer(token))
    assert r.status_code == 200
    conn = next(c for c in r.json() if c["connection_name"] == "DAYS-CONN")
    assert 18 <= conn["days_remaining"] <= 20  # allow ±1 for timing

    _cleanup(db, sub, customer, user, pricing, plan)


def test_connections_empty_state(db: Session):
    """connections returns empty list when customer has no active subscriptions."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    token = _login(user)

    r = http_client.get(f"{PREFIX}/client/dashboard/connections", headers=_bearer(token))
    assert r.status_code == 200
    assert r.json() == []

    _cleanup(db, customer, user)


# ---------------------------------------------------------------------------
# Invoices — recent
# ---------------------------------------------------------------------------


def test_invoices_recent_excludes_draft_and_cancelled(db: Session):
    """recent invoices exclude DRAFT and CANCELLED status."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    inv_unpaid = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)
    inv_draft = _make_invoice(db, sub, status=InvoiceStatus.DRAFT)
    inv_cancelled = _make_invoice(db, sub, status=InvoiceStatus.CANCELLED)

    r = http_client.get(f"{PREFIX}/client/dashboard/invoices", headers=_bearer(token))
    assert r.status_code == 200
    statuses = [i["status"] for i in r.json()["recent"]]
    assert "UNPAID" in statuses
    assert "DRAFT" not in statuses
    assert "CANCELLED" not in statuses

    _cleanup(db, inv_cancelled, inv_draft, inv_unpaid, sub, customer, user, pricing, plan)


def test_invoices_recent_limit_10(db: Session):
    """recent invoices are capped at 10 records."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    invs = [_make_invoice(db, sub, status=InvoiceStatus.UNPAID) for _ in range(12)]

    r = http_client.get(f"{PREFIX}/client/dashboard/invoices", headers=_bearer(token))
    assert r.status_code == 200
    assert len(r.json()["recent"]) <= 10

    for inv in invs:
        _cleanup(db, inv)
    _cleanup(db, sub, customer, user, pricing, plan)


# ---------------------------------------------------------------------------
# Invoices — outstanding
# ---------------------------------------------------------------------------


def test_invoices_outstanding_only_balance_gt_zero(db: Session):
    """outstanding invoices only include those with balance_amount > 0."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    inv_outstanding = _make_invoice(
        db, sub, status=InvoiceStatus.UNPAID, balance="942.82"
    )
    inv_paid = _make_invoice(
        db, sub, status=InvoiceStatus.PAID, balance="0.00"
    )

    r = http_client.get(f"{PREFIX}/client/dashboard/invoices", headers=_bearer(token))
    assert r.status_code == 200
    outstanding_ids = [i["id"] for i in r.json()["outstanding"]]
    assert str(inv_outstanding.id) in outstanding_ids
    assert str(inv_paid.id) not in outstanding_ids

    _cleanup(db, inv_paid, inv_outstanding, sub, customer, user, pricing, plan)


def test_invoices_outstanding_sorted_by_due_date_asc(db: Session):
    """outstanding invoices are sorted by due_date ASC (oldest first)."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    # Due sooner (5 days)
    inv_soon = _make_invoice(db, sub, status=InvoiceStatus.UNPAID, due_days=5)
    # Due later (30 days)
    inv_later = _make_invoice(db, sub, status=InvoiceStatus.UNPAID, due_days=30)

    r = http_client.get(f"{PREFIX}/client/dashboard/invoices", headers=_bearer(token))
    assert r.status_code == 200
    outstanding = r.json()["outstanding"]
    ids = [i["id"] for i in outstanding]
    assert ids.index(str(inv_soon.id)) < ids.index(str(inv_later.id))

    _cleanup(db, inv_later, inv_soon, sub, customer, user, pricing, plan)


def test_invoices_outstanding_days_overdue(db: Session):
    """days_overdue is calculated correctly for overdue invoices."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    # Due in the future — days_overdue should be 0
    inv_future = _make_invoice(db, sub, status=InvoiceStatus.UNPAID, due_days=10)

    r = http_client.get(f"{PREFIX}/client/dashboard/invoices", headers=_bearer(token))
    assert r.status_code == 200
    outstanding = r.json()["outstanding"]
    future_item = next((i for i in outstanding if i["id"] == str(inv_future.id)), None)
    assert future_item is not None
    assert future_item["days_overdue"] == 0

    _cleanup(db, inv_future, sub, customer, user, pricing, plan)


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------


def test_payments_returns_own_payments_only(db: Session):
    """Payments endpoint only returns payments on the customer's own invoices."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)
    plan, pricing = _make_plan(db)
    token_a = _login(user_a)

    sub_a = _make_subscription(db, customer_a, plan, pricing, connection_name="CONN-A")
    sub_b = _make_subscription(db, customer_b, plan, pricing, connection_name="CONN-B")
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.PAID, balance="0.00")
    inv_b = _make_invoice(db, sub_b, status=InvoiceStatus.PAID, balance="0.00")
    pay_a = _make_payment(db, inv_a, amount="942.82")
    pay_b = _make_payment(db, inv_b, amount="942.82")

    r = http_client.get(f"{PREFIX}/client/dashboard/payments", headers=_bearer(token_a))
    assert r.status_code == 200
    payment_ids = [p["id"] for p in r.json()]
    assert str(pay_a.id) in payment_ids
    assert str(pay_b.id) not in payment_ids

    _cleanup(db, pay_b, pay_a, inv_b, inv_a, sub_b, sub_a, customer_b, user_b, customer_a, user_a, pricing, plan)


def test_payments_limit_10(db: Session):
    """Payments are capped at 10 records."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.PARTIALLY_PAID, balance="500.00")
    pays = [_make_payment(db, inv, amount="40.00", days_ago=i) for i in range(12)]

    r = http_client.get(f"{PREFIX}/client/dashboard/payments", headers=_bearer(token))
    assert r.status_code == 200
    assert len(r.json()) <= 10

    for p in pays:
        _cleanup(db, p)
    _cleanup(db, inv, sub, customer, user, pricing, plan)


def test_payments_sorted_by_date_desc(db: Session):
    """Payments are sorted most-recent first."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.PAID, balance="0.00")
    p_old = _make_payment(db, inv, amount="500.00", days_ago=10)
    p_new = _make_payment(db, inv, amount="442.82", days_ago=1)

    r = http_client.get(f"{PREFIX}/client/dashboard/payments", headers=_bearer(token))
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert ids.index(str(p_new.id)) < ids.index(str(p_old.id))

    _cleanup(db, p_new, p_old, inv, sub, customer, user, pricing, plan)


def test_payments_include_invoice_details(db: Session):
    """Payment records include invoice_number and connection_name."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing, connection_name="MY-CONN")
    inv = _make_invoice(db, sub, status=InvoiceStatus.PAID, balance="0.00")
    pay = _make_payment(db, inv)

    r = http_client.get(f"{PREFIX}/client/dashboard/payments", headers=_bearer(token))
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    p = next(p for p in data if p["id"] == str(pay.id))
    assert p["invoice_number"] == inv.invoice_number
    assert p["connection_name"] == "MY-CONN"
    assert p["payment_method"] == "UPI"

    _cleanup(db, pay, inv, sub, customer, user, pricing, plan)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


def test_notifications_returns_own_only(db: Session):
    """Notifications linked to another customer's subscription are not returned."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)
    plan, pricing = _make_plan(db)
    token_a = _login(user_a)

    sub_a = _make_subscription(db, customer_a, plan, pricing)
    sub_b = _make_subscription(db, customer_b, plan, pricing)

    notif_a = _make_notification(db, subscription=sub_a, customer=customer_a)
    notif_b = _make_notification(db, subscription=sub_b, customer=customer_b)

    r = http_client.get(f"{PREFIX}/client/dashboard/notifications", headers=_bearer(token_a))
    assert r.status_code == 200
    ids = [n["id"] for n in r.json()]
    assert str(notif_a.id) in ids
    assert str(notif_b.id) not in ids

    _cleanup(db, notif_b, notif_a, sub_b, sub_a, customer_b, user_b, customer_a, user_a, pricing, plan)


def test_notifications_limit_10(db: Session):
    """Notifications are capped at 10 records."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    token = _login(user)

    sub = _make_subscription(db, customer, plan, pricing)
    notifs = [
        _make_notification(db, subscription=sub, customer=customer)
        for _ in range(12)
    ]

    r = http_client.get(f"{PREFIX}/client/dashboard/notifications", headers=_bearer(token))
    assert r.status_code == 200
    assert len(r.json()) <= 10

    for n in notifs:
        _cleanup(db, n)
    _cleanup(db, sub, customer, user, pricing, plan)


def test_notifications_empty_state(db: Session):
    """Notifications returns empty list when no notifications exist."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    token = _login(user)

    r = http_client.get(f"{PREFIX}/client/dashboard/notifications", headers=_bearer(token))
    assert r.status_code == 200
    assert r.json() == []

    _cleanup(db, customer, user)


# ---------------------------------------------------------------------------
# Ownership isolation — cross-customer data never leaks
# ---------------------------------------------------------------------------


def test_summary_isolation(db: Session):
    """Customer A's summary does not include Customer B's data."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)
    plan, pricing = _make_plan(db)

    token_a = _login(user_a)

    # Give B some subscriptions and invoices
    sub_b = _make_subscription(db, customer_b, plan, pricing)
    inv_b = _make_invoice(db, sub_b, status=InvoiceStatus.UNPAID, balance="942.82")

    # Customer A has nothing
    r = http_client.get(f"{PREFIX}/client/dashboard/summary", headers=_bearer(token_a))
    assert r.status_code == 200
    body = r.json()
    assert body["active_connections"] == 0
    assert float(body["outstanding_amount"]) == 0.0

    _cleanup(db, inv_b, sub_b, customer_b, user_b, customer_a, user_a, pricing, plan)
