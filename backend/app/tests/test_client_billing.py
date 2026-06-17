"""Tests for /api/v1/client billing endpoints.

Helpers mirror test_client_dashboard.py conventions exactly:
  * _make_* for object creation
  * cleanup via raw SQL in FK dependency order
  * _login() for JWT token acquisition
"""
from __future__ import annotations

import uuid as uuid_mod
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.customer import Customer, CustomerStatus, CustomerType
from app.models.invoice import Invoice, InvoiceStatus
from app.models.notification import (
    NotificationChannel,
    NotificationLog,
    NotificationStatus,
    TemplateKey,
)
from app.models.payment import Payment, PaymentMethod
from app.models.plan import BillingCycle, DataPolicy, Plan, PlanPricing
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole

PREFIX = "/api/v1"
http_client = TestClient(app)


# ---------------------------------------------------------------------------
# DB fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_client_user(db: Session) -> User:
    u = User(
        email=f"_tbill_{uuid_mod.uuid4().hex[:8]}@truedata.test",
        password_hash=hash_password("Test@12345"),
        role=UserRole.CLIENT,
        is_active=True,
        must_change_password=False,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_customer(db: Session, user: User) -> Customer:
    c = Customer(
        user_id=user.id,
        customer_code=f"TST-B{uuid_mod.uuid4().hex[:6].upper()}",
        customer_type=CustomerType.INDIVIDUAL,
        full_name="Billing Test Customer",
        mobile_number=f"9{uuid_mod.uuid4().int % 1_000_000_000:09d}",
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
        plan_code=f"TDB-BIL-{uuid_mod.uuid4().hex[:4].upper()}",
        name=f"Billing Plan {uuid_mod.uuid4().hex[:6]}",
        speed_mbps=100,
        data_policy=DataPolicy.UNLIMITED,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    pricing = PlanPricing(
        plan_id=plan.id,
        billing_cycle=BillingCycle.MONTHLY,
        base_price="500.00",
        gst_percentage="18.00",
        total_price="590.00",
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
    connection_name: str = "TEST-CONN",
) -> Subscription:
    today = date.today()
    s = Subscription(
        customer_id=customer.id,
        plan_id=plan.id,
        plan_pricing_id=pricing.id,
        subscription_code=f"BIL-{uuid_mod.uuid4().hex[:8].upper()}",
        plan_name_snapshot=plan.name,
        plan_code_snapshot=plan.plan_code,
        speed_mbps_snapshot=plan.speed_mbps,
        billing_cycle_snapshot="MONTHLY",
        base_price_snapshot=Decimal("500.00"),
        gst_percentage_snapshot=Decimal("18.00"),
        total_price_snapshot=Decimal("590.00"),
        start_date=today,
        renewal_date=today + timedelta(days=30),
        expiry_date=today + timedelta(days=30),
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
    status: InvoiceStatus = InvoiceStatus.UNPAID,
    total: str = "590.00",
    paid: str = "0.00",
    balance: str | None = None,
    due_days: int = 30,
    due_date: date | None = None,
) -> Invoice:
    today = date.today()
    total_d = Decimal(total)
    paid_d = Decimal(paid)
    balance_d = Decimal(balance) if balance else total_d - paid_d
    inv = Invoice(
        invoice_number=f"INV-BIL-{uuid_mod.uuid4().hex[:8].upper()}",
        invoice_type="SINGLE",
        subscription_id=subscription.id,
        invoice_date=today,
        due_date=due_date or (today + timedelta(days=due_days)),
        billing_period_start=today - timedelta(days=30),
        billing_period_end=today,
        company_name_snapshot="True Data Broadband Pvt. Ltd.",
        customer_code_snapshot="TST-000",
        customer_name_snapshot="Billing Test Customer",
        connection_name_snapshot=subscription.connection_name or "TEST-CONN",
        plan_code_snapshot=subscription.plan_code_snapshot,
        plan_name_snapshot=subscription.plan_name_snapshot,
        speed_mbps_snapshot=subscription.speed_mbps_snapshot,
        data_policy_snapshot="UNLIMITED",
        billing_cycle_snapshot=subscription.billing_cycle_snapshot,
        base_amount=total_d / Decimal("1.18"),
        gst_percentage=Decimal("18.00"),
        gst_amount=total_d - total_d / Decimal("1.18"),
        total_amount=total_d,
        paid_amount=paid_d,
        balance_amount=balance_d,
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
    amount: str = "590.00",
    payment_date: date | None = None,
    method: PaymentMethod = PaymentMethod.CASH,
) -> Payment:
    p = Payment(
        payment_number=f"RCP-BIL-{uuid_mod.uuid4().hex[:8].upper()}",
        invoice_id=invoice.id,
        amount=Decimal(amount),
        payment_date=payment_date or date.today(),
        payment_method=method,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_notif_log(
    db: Session,
    *,
    entity_id: str,
    entity_type: str = "INVOICE",
    created_at: datetime | None = None,
) -> NotificationLog:
    n = NotificationLog(
        template_key=TemplateKey.INVOICE_GENERATED,
        channel=NotificationChannel.EMAIL,
        recipient_email="test@example.com",
        status=NotificationStatus.SENT,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(n)
    db.flush()
    if created_at is not None:
        db.execute(
            text("UPDATE notification_logs SET created_at = :ts WHERE id = :id"),
            {"ts": created_at, "id": n.id},
        )
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
    """Hard-delete objects in FK-safe (caller-supplied) order."""
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
# Unauthorized access
# ---------------------------------------------------------------------------


def test_billing_unauthorized_no_customer(db: Session):
    """USER with no customer record gets 403 on all billing endpoints."""
    user = _make_client_user(db)
    token = _login(user)
    headers = _bearer(token)

    for path in ["/client/billing/summary", "/client/invoices", "/client/payments"]:
        r = http_client.get(f"{PREFIX}{path}", headers=headers)
        assert r.status_code == 403, f"Expected 403 for {path}, got {r.status_code}"

    _cleanup(db, user)


# ---------------------------------------------------------------------------
# Billing summary
# ---------------------------------------------------------------------------


def test_billing_summary_totals(db: Session):
    """Summary aggregates correctly across multiple invoices and statuses."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    inv_paid = _make_invoice(db, sub, status=InvoiceStatus.PAID, total="590.00", paid="590.00")
    inv_unpaid = _make_invoice(db, sub, status=InvoiceStatus.UNPAID, total="590.00", paid="0.00")
    inv_overdue = _make_invoice(
        db, sub, status=InvoiceStatus.OVERDUE,
        total="590.00", paid="0.00",
        due_date=date.today() - timedelta(days=10),
    )
    pay = _make_payment(db, inv_paid, amount="590.00")

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/billing/summary", headers=_bearer(token))
    assert r.status_code == 200
    body = r.json()

    assert float(body["total_invoiced"]) == pytest.approx(1770.00, abs=0.01)
    assert float(body["total_paid"]) == pytest.approx(590.00, abs=0.01)
    assert float(body["outstanding_amount"]) == pytest.approx(1180.00, abs=0.01)
    assert float(body["overdue_amount"]) == pytest.approx(590.00, abs=0.01)
    assert body["last_payment_amount"] is not None

    _cleanup(db, pay, inv_paid, inv_unpaid, inv_overdue, sub, customer, user, pricing, plan)


def test_billing_summary_isolation(db: Session):
    """Summary never includes another customer's invoices."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.UNPAID, total="590.00")

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)

    token_b = _login(user_b)
    r = http_client.get(f"{PREFIX}/client/billing/summary", headers=_bearer(token_b))
    assert r.status_code == 200
    body = r.json()
    assert float(body["total_invoiced"]) == 0
    assert float(body["outstanding_amount"]) == 0

    _cleanup(db, inv_a, sub_a, customer_b, user_b, customer_a, user_a, pricing_a, plan_a)


# ---------------------------------------------------------------------------
# Invoice list
# ---------------------------------------------------------------------------


def test_invoices_list_ownership(db: Session):
    """Client sees only their own invoices, not others'."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.UNPAID)

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)
    plan_b, pricing_b = _make_plan(db)
    sub_b = _make_subscription(db, customer_b, plan_b, pricing_b)
    inv_b = _make_invoice(db, sub_b, status=InvoiceStatus.UNPAID)

    token_a = _login(user_a)
    r = http_client.get(f"{PREFIX}/client/invoices", headers=_bearer(token_a))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert str(inv_a.id) in ids
    assert str(inv_b.id) not in ids

    _cleanup(
        db,
        inv_b, sub_b, customer_b, user_b, pricing_b, plan_b,
        inv_a, sub_a, customer_a, user_a, pricing_a, plan_a,
    )


def test_invoices_list_excludes_draft(db: Session):
    """DRAFT invoices are never visible to clients."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    inv_draft = _make_invoice(db, sub, status=InvoiceStatus.DRAFT)
    inv_unpaid = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/invoices", headers=_bearer(token))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert str(inv_draft.id) not in ids
    assert str(inv_unpaid.id) in ids

    _cleanup(db, inv_draft, inv_unpaid, sub, customer, user, pricing, plan)


def test_invoices_list_status_filter(db: Session):
    """status= query param filters invoices by status."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    inv_paid = _make_invoice(db, sub, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
    inv_unpaid = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/invoices?status=PAID", headers=_bearer(token))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert str(inv_paid.id) in ids
    assert str(inv_unpaid.id) not in ids

    _cleanup(db, inv_paid, inv_unpaid, sub, customer, user, pricing, plan)


def test_invoices_list_search_invoice_number(db: Session):
    """search= matches invoice_number prefix."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)

    token = _login(user)
    r = http_client.get(
        f"{PREFIX}/client/invoices?search={inv.invoice_number}",
        headers=_bearer(token),
    )
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert str(inv.id) in ids

    _cleanup(db, inv, sub, customer, user, pricing, plan)


def test_invoices_list_overdue_quick_filter(db: Session):
    """overdue=true returns only OVERDUE invoices."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    inv_overdue = _make_invoice(
        db, sub, status=InvoiceStatus.OVERDUE,
        due_date=date.today() - timedelta(days=5),
    )
    inv_unpaid = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/invoices?overdue=true", headers=_bearer(token))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert str(inv_overdue.id) in ids
    assert str(inv_unpaid.id) not in ids

    _cleanup(db, inv_overdue, inv_unpaid, sub, customer, user, pricing, plan)


def test_invoices_list_pagination(db: Session):
    """page/page_size pagination works correctly."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    invs = [_make_invoice(db, sub, status=InvoiceStatus.UNPAID) for _ in range(5)]

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/invoices?page=1&page_size=3", headers=_bearer(token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 5
    assert len(body["items"]) == 3
    assert body["pages"] >= 2

    _cleanup(db, *invs, sub, customer, user, pricing, plan)


# ---------------------------------------------------------------------------
# Invoice detail
# ---------------------------------------------------------------------------


def test_invoice_detail_returns_correct_data(db: Session):
    """Invoice detail includes financial summary and payment list."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    inv = _make_invoice(
        db, sub, status=InvoiceStatus.PARTIALLY_PAID,
        total="590.00", paid="200.00", balance="390.00",
    )
    pay = _make_payment(db, inv, amount="200.00")

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/invoices/{inv.id}", headers=_bearer(token))
    assert r.status_code == 200
    body = r.json()

    assert body["invoice_number"] == inv.invoice_number
    assert float(body["total_amount"]) == pytest.approx(590.00, abs=0.01)
    assert float(body["paid_amount"]) == pytest.approx(200.00, abs=0.01)
    assert float(body["balance_amount"]) == pytest.approx(390.00, abs=0.01)
    assert len(body["payments"]) == 1
    assert body["payments"][0]["payment_number"] == pay.payment_number

    _cleanup(db, pay, inv, sub, customer, user, pricing, plan)


def test_invoice_detail_ownership(db: Session):
    """Client gets 404 for another customer's invoice (prevents enumeration)."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.UNPAID)

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)

    token_b = _login(user_b)
    r = http_client.get(f"{PREFIX}/client/invoices/{inv_a.id}", headers=_bearer(token_b))
    assert r.status_code == 404

    _cleanup(db, inv_a, sub_a, customer_b, user_b, customer_a, user_a, pricing_a, plan_a)


# ---------------------------------------------------------------------------
# Invoice PDF
# ---------------------------------------------------------------------------


def test_invoice_pdf_no_path_returns_404(db: Session):
    """Returns 404 when invoice has no PDF file stored."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/invoices/{inv.id}/pdf", headers=_bearer(token))
    assert r.status_code == 404

    _cleanup(db, inv, sub, customer, user, pricing, plan)


def test_invoice_pdf_ownership(db: Session):
    """Returns 404 for another customer's invoice PDF."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.UNPAID)

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)

    token_b = _login(user_b)
    r = http_client.get(f"{PREFIX}/client/invoices/{inv_a.id}/pdf", headers=_bearer(token_b))
    assert r.status_code == 404

    _cleanup(db, inv_a, sub_a, customer_b, user_b, customer_a, user_a, pricing_a, plan_a)


# ---------------------------------------------------------------------------
# Invoice email
# ---------------------------------------------------------------------------


def test_invoice_email_duplicate_prevention(db: Session):
    """Returns 429 when an email was sent for this invoice within last 5 minutes."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)
    inv = _make_invoice(db, sub, status=InvoiceStatus.UNPAID)

    log = _make_notif_log(
        db,
        entity_id=str(inv.id),
        created_at=datetime.utcnow() - timedelta(minutes=2),
    )

    token = _login(user)
    r = http_client.post(f"{PREFIX}/client/invoices/{inv.id}/email", headers=_bearer(token))
    assert r.status_code == 429

    _cleanup(db, log, inv, sub, customer, user, pricing, plan)


def test_invoice_email_ownership(db: Session):
    """Returns 404 when trying to email another customer's invoice."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.UNPAID)

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)

    token_b = _login(user_b)
    r = http_client.post(f"{PREFIX}/client/invoices/{inv_a.id}/email", headers=_bearer(token_b))
    assert r.status_code == 404

    _cleanup(db, inv_a, sub_a, customer_b, user_b, customer_a, user_a, pricing_a, plan_a)


# ---------------------------------------------------------------------------
# Payment list
# ---------------------------------------------------------------------------


def test_payments_list_ownership(db: Session):
    """Client sees only their own payments."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
    pay_a = _make_payment(db, inv_a, amount="590.00")

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)
    plan_b, pricing_b = _make_plan(db)
    sub_b = _make_subscription(db, customer_b, plan_b, pricing_b)
    inv_b = _make_invoice(db, sub_b, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
    pay_b = _make_payment(db, inv_b, amount="590.00")

    token_a = _login(user_a)
    r = http_client.get(f"{PREFIX}/client/payments", headers=_bearer(token_a))
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert str(pay_a.id) in ids
    assert str(pay_b.id) not in ids

    _cleanup(
        db,
        pay_b, inv_b, sub_b, customer_b, user_b, pricing_b, plan_b,
        pay_a, inv_a, sub_a, customer_a, user_a, pricing_a, plan_a,
    )


def test_payments_list_date_filter(db: Session):
    """payment_date_start filter excludes older payments."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    inv_old = _make_invoice(db, sub, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
    pay_old = _make_payment(
        db, inv_old, amount="590.00",
        payment_date=date.today() - timedelta(days=60),
    )
    inv_new = _make_invoice(db, sub, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
    pay_new = _make_payment(
        db, inv_new, amount="590.00",
        payment_date=date.today() - timedelta(days=5),
    )

    token = _login(user)
    start = (date.today() - timedelta(days=10)).isoformat()
    r = http_client.get(
        f"{PREFIX}/client/payments?payment_date_start={start}",
        headers=_bearer(token),
    )
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert str(pay_new.id) in ids
    assert str(pay_old.id) not in ids

    _cleanup(db, pay_new, pay_old, inv_new, inv_old, sub, customer, user, pricing, plan)


def test_payments_list_pagination(db: Session):
    """page/page_size pagination is applied to payments."""
    user = _make_client_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)
    sub = _make_subscription(db, customer, plan, pricing)

    invs_pays = []
    for _ in range(4):
        inv = _make_invoice(db, sub, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
        pay = _make_payment(db, inv, amount="590.00")
        invs_pays.append((inv, pay))

    token = _login(user)
    r = http_client.get(f"{PREFIX}/client/payments?page=1&page_size=2", headers=_bearer(token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 4
    assert len(body["items"]) == 2

    pays = [ip[1] for ip in invs_pays]
    invs = [ip[0] for ip in invs_pays]
    _cleanup(db, *pays, *invs, sub, customer, user, pricing, plan)


def test_payments_detail_ownership(db: Session):
    """Returns 404 for another customer's payment (prevents enumeration)."""
    user_a = _make_client_user(db)
    customer_a = _make_customer(db, user_a)
    plan_a, pricing_a = _make_plan(db)
    sub_a = _make_subscription(db, customer_a, plan_a, pricing_a)
    inv_a = _make_invoice(db, sub_a, status=InvoiceStatus.PAID, total="590.00", paid="590.00", balance="0.00")
    pay_a = _make_payment(db, inv_a, amount="590.00")

    user_b = _make_client_user(db)
    customer_b = _make_customer(db, user_b)

    token_b = _login(user_b)
    r = http_client.get(f"{PREFIX}/client/payments/{pay_a.id}", headers=_bearer(token_b))
    assert r.status_code == 404

    _cleanup(
        db,
        pay_a, inv_a, sub_a,
        customer_b, user_b,
        customer_a, user_a,
        pricing_a, plan_a,
    )
