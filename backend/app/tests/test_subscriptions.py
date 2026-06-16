"""Subscription management tests."""

import uuid as uuid_mod
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.customer import Customer, CustomerStatus, CustomerType
from app.models.plan import BillingCycle, DataPolicy, Plan, PlanPricing
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.tests.conftest import http_client

PREFIX = settings.API_V1_PREFIX
client = http_client


# ---------------------------------------------------------------------------
# Fixtures / helpers
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


def _make_user(db: Session, *, role: UserRole = UserRole.CLIENT) -> User:
    u = User(
        email=f"_test_{uuid_mod.uuid4().hex[:8]}@truedata.test",
        password_hash=hash_password("Test@12345"),
        role=role,
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
        customer_code=f"TST-{uuid_mod.uuid4().hex[:6].upper()}",
        customer_type=CustomerType.INDIVIDUAL,
        full_name="Test Customer",
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
        plan_code=f"TDB-PLAN-T{uuid_mod.uuid4().hex[:4].upper()}",
        name=f"Test Plan {uuid_mod.uuid4().hex[:6]}",
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


def _cleanup(db: Session, *objs) -> None:
    for obj in objs:
        if obj is not None:
            db.delete(obj)
    db.commit()


def _cleanup_subs_for_customer(db: Session, customer_id) -> None:
    from sqlalchemy import select, delete
    db.execute(
        delete(Subscription).where(Subscription.customer_id == customer_id)
    )
    db.commit()


# ---------------------------------------------------------------------------
# Subscription creation
# ---------------------------------------------------------------------------


def test_create_subscription_success(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    today = date.today().isoformat()
    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": today,
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["subscription_code"].startswith("TDB-SUB-")
    assert body["status"] == "ACTIVE"
    assert body["customer_code"] == customer.customer_code

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


def test_subscription_code_format(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    code = r.json()["subscription_code"]
    parts = code.split("-")
    assert parts[:2] == ["TDB", "SUB"]
    assert parts[2].isdigit() and len(parts[2]) == 5

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


# ---------------------------------------------------------------------------
# Snapshot creation
# ---------------------------------------------------------------------------


def test_snapshot_fields_stored(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["plan_name_snapshot"] == plan.name
    assert body["plan_code_snapshot"] == plan.plan_code
    assert body["speed_mbps_snapshot"] == plan.speed_mbps
    assert body["billing_cycle_snapshot"] == "MONTHLY"
    assert float(body["base_price_snapshot"]) == 799.0
    assert float(body["gst_percentage_snapshot"]) == 18.0

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


# ---------------------------------------------------------------------------
# Duplicate ACTIVE subscription rejection
# ---------------------------------------------------------------------------


def test_duplicate_active_subscription_rejected(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    today = date.today().isoformat()
    r1 = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": today,
        },
        headers=_bearer(admin_token),
    )
    assert r1.status_code == 201

    r2 = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": today,
        },
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 409

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


# ---------------------------------------------------------------------------
# Expiry calculation
# ---------------------------------------------------------------------------


def test_expiry_calculation_monthly(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    start = date(2026, 1, 15)
    expected_expiry = date(2026, 2, 15)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": start.isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["expiry_date"] == expected_expiry.isoformat()
    assert body["renewal_date"] == expected_expiry.isoformat()

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


def test_expiry_calculation_quarterly(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan = Plan(
        plan_code=f"TDB-PLAN-Q{uuid_mod.uuid4().hex[:4].upper()}",
        name=f"Quarterly Plan {uuid_mod.uuid4().hex[:6]}",
        speed_mbps=50,
        data_policy=DataPolicy.UNLIMITED,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    pricing = PlanPricing(
        plan_id=plan.id,
        billing_cycle=BillingCycle.QUARTERLY,
        base_price="2000.00",
        gst_percentage="18.00",
        total_price="2360.00",
        is_active=True,
    )
    db.add(pricing)
    db.commit()
    db.refresh(pricing)

    start = date(2026, 1, 15)
    expected_expiry = date(2026, 4, 15)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": start.isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201, r.json()
    assert r.json()["expiry_date"] == expected_expiry.isoformat()

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


# ---------------------------------------------------------------------------
# Renewal flow
# ---------------------------------------------------------------------------


def test_renewal_extends_expiry(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    start = date(2026, 1, 1)
    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": start.isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201
    sub_id = r.json()["id"]
    first_expiry = r.json()["expiry_date"]

    r2 = client.post(
        f"{PREFIX}/subscriptions/{sub_id}/renew",
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 200
    new_expiry = r2.json()["expiry_date"]
    assert new_expiry > first_expiry

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


def test_renewal_requires_active_status(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201
    sub_id = r.json()["id"]

    client.patch(
        f"{PREFIX}/subscriptions/{sub_id}/status",
        json={"status": "SUSPENDED"},
        headers=_bearer(admin_token),
    )

    r2 = client.post(
        f"{PREFIX}/subscriptions/{sub_id}/renew",
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 409

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


# ---------------------------------------------------------------------------
# Plan change
# ---------------------------------------------------------------------------


def test_plan_change_creates_new_subscription(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    plan2 = Plan(
        plan_code=f"TDB-PLAN-N{uuid_mod.uuid4().hex[:4].upper()}",
        name=f"New Plan {uuid_mod.uuid4().hex[:6]}",
        speed_mbps=200,
        data_policy=DataPolicy.UNLIMITED,
        is_active=True,
    )
    db.add(plan2)
    db.flush()
    pricing2 = PlanPricing(
        plan_id=plan2.id,
        billing_cycle=BillingCycle.MONTHLY,
        base_price="1299.00",
        gst_percentage="18.00",
        total_price="1532.82",
        is_active=True,
    )
    db.add(pricing2)
    db.commit()
    db.refresh(pricing2)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201
    old_sub_id = r.json()["id"]

    r2 = client.post(
        f"{PREFIX}/subscriptions/{old_sub_id}/change-plan",
        json={
            "plan_pricing_id": str(pricing2.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 201, r2.json()
    new_body = r2.json()
    assert new_body["status"] == "ACTIVE"
    assert new_body["id"] != old_sub_id
    assert new_body["plan_name_snapshot"] == plan2.name

    # Old subscription must now be CANCELLED
    r3 = client.get(
        f"{PREFIX}/subscriptions/{old_sub_id}",
        headers=_bearer(admin_token),
    )
    assert r3.json()["status"] == "CANCELLED"

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing2, plan2, pricing, plan, customer, user)


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------


def test_list_subscriptions_requires_auth():
    r = client.get(f"{PREFIX}/subscriptions")
    assert r.status_code == 401


def test_create_subscription_requires_auth():
    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(uuid_mod.uuid4()),
            "plan_pricing_id": str(uuid_mod.uuid4()),
            "start_date": date.today().isoformat(),
        },
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Pagination & search
# ---------------------------------------------------------------------------


def test_list_subscriptions_paginated(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201

    r2 = client.get(
        f"{PREFIX}/subscriptions?page=1&page_size=10",
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 200
    body = r2.json()
    assert "items" in body
    assert "total" in body
    assert "total_pages" in body

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)


def test_search_subscriptions(admin_token: str, db: Session):
    user = _make_user(db)
    customer = _make_customer(db, user)
    plan, pricing = _make_plan(db)

    r = client.post(
        f"{PREFIX}/subscriptions",
        json={
            "customer_id": str(customer.id),
            "plan_pricing_id": str(pricing.id),
            "start_date": date.today().isoformat(),
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201

    r2 = client.get(
        f"{PREFIX}/subscriptions?search={customer.customer_code}",
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 200
    assert r2.json()["total"] >= 1

    _cleanup_subs_for_customer(db, customer.id)
    _cleanup(db, pricing, plan, customer, user)
