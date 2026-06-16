"""Plan management tests."""

import uuid as uuid_mod

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app
from app.models.plan import Plan, PlanPricing

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


def _plan_payload(**overrides) -> dict:
    base = {
        "name": f"Test Plan {uuid_mod.uuid4().hex[:6]}",
        "description": "A test broadband plan",
        "speed_mbps": 100,
        "data_policy": "UNLIMITED",
        "is_active": True,
        "pricing": [
            {"billing_cycle": "MONTHLY", "base_price": "799.00", "gst_percentage": "18.00"},
        ],
    }
    base.update(overrides)
    return base


def _cleanup_plan(db: Session, plan_id: str) -> None:
    """Hard-delete a test plan and all its pricing rows."""
    p = db.get(Plan, uuid_mod.UUID(plan_id))
    if p:
        for pr in p.pricing:
            db.delete(pr)
        db.commit()
        db.delete(p)
        db.commit()


# ---------------------------------------------------------------------------
# Plan creation
# ---------------------------------------------------------------------------


def test_create_plan_success(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/plans", json=_plan_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["plan_code"].startswith("TDB-PLAN-")
    assert body["active_pricing_count"] == 1
    assert len(body["pricing"]) == 1
    _cleanup_plan(db, body["id"])


def test_plan_code_format(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/plans", json=_plan_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    code = r.json()["plan_code"]
    parts = code.split("-")
    assert parts[:2] == ["TDB", "PLAN"]
    assert parts[2].isdigit() and len(parts[2]) == 5
    _cleanup_plan(db, r.json()["id"])


def test_create_plan_multiple_pricing(admin_token: str, db: Session):
    payload = _plan_payload(
        pricing=[
            {"billing_cycle": "MONTHLY",     "base_price": "799.00",  "gst_percentage": "18.00"},
            {"billing_cycle": "QUARTERLY",   "base_price": "2199.00", "gst_percentage": "18.00"},
            {"billing_cycle": "HALF_YEARLY", "base_price": "4299.00", "gst_percentage": "18.00"},
            {"billing_cycle": "ANNUALLY",    "base_price": "8499.00", "gst_percentage": "18.00"},
        ]
    )
    r = client.post(f"{PREFIX}/plans", json=payload, headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    body = r.json()
    assert len(body["pricing"]) == 4
    assert body["active_pricing_count"] == 4
    _cleanup_plan(db, body["id"])


# ---------------------------------------------------------------------------
# Price calculation
# ---------------------------------------------------------------------------


def test_price_calculation(admin_token: str, db: Session):
    """total_price must equal base_price + base_price * gst / 100."""
    payload = _plan_payload(
        pricing=[{"billing_cycle": "MONTHLY", "base_price": "1000.00", "gst_percentage": "18.00"}]
    )
    r = client.post(f"{PREFIX}/plans", json=payload, headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    pr = r.json()["pricing"][0]
    assert float(pr["base_price"]) == 1000.0
    assert float(pr["gst_percentage"]) == 18.0
    assert float(pr["total_price"]) == 1180.0   # 1000 + 1000*18/100
    _cleanup_plan(db, r.json()["id"])


def test_price_calculation_zero_gst(admin_token: str, db: Session):
    payload = _plan_payload(
        pricing=[{"billing_cycle": "MONTHLY", "base_price": "500.00", "gst_percentage": "0.00"}]
    )
    r = client.post(f"{PREFIX}/plans", json=payload, headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    pr = r.json()["pricing"][0]
    assert float(pr["total_price"]) == 500.0
    _cleanup_plan(db, r.json()["id"])


# ---------------------------------------------------------------------------
# Duplicate billing cycle rejection
# ---------------------------------------------------------------------------


def test_duplicate_billing_cycle_in_create_rejected(admin_token: str):
    payload = _plan_payload(
        pricing=[
            {"billing_cycle": "MONTHLY", "base_price": "799.00", "gst_percentage": "18.00"},
            {"billing_cycle": "MONTHLY", "base_price": "750.00", "gst_percentage": "18.00"},
        ]
    )
    r = client.post(f"{PREFIX}/plans", json=payload, headers=_bearer(admin_token))
    assert r.status_code == 422


def test_duplicate_billing_cycle_via_add_endpoint_rejected(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/plans", json=_plan_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201
    plan_id = r.json()["id"]

    r2 = client.post(
        f"{PREFIX}/plans/{plan_id}/pricing",
        json={"billing_cycle": "MONTHLY", "base_price": "900.00", "gst_percentage": "18.00"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 409
    _cleanup_plan(db, plan_id)


# ---------------------------------------------------------------------------
# FUP policy validation
# ---------------------------------------------------------------------------


def test_fup_requires_limit(admin_token: str):
    payload = _plan_payload(data_policy="FUP")
    r = client.post(f"{PREFIX}/plans", json=payload, headers=_bearer(admin_token))
    assert r.status_code == 422


def test_fup_with_limit_succeeds(admin_token: str, db: Session):
    payload = _plan_payload(data_policy="FUP", fup_limit_gb=100)
    r = client.post(f"{PREFIX}/plans", json=payload, headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    assert r.json()["fup_limit_gb"] == 100
    _cleanup_plan(db, r.json()["id"])


# ---------------------------------------------------------------------------
# Pagination & search
# ---------------------------------------------------------------------------


def test_list_plans_paginated(admin_token: str, db: Session):
    ids = []
    for i in range(3):
        r = client.post(
            f"{PREFIX}/plans",
            json=_plan_payload(name=f"Pagination Plan {i}"),
            headers=_bearer(admin_token),
        )
        assert r.status_code == 201
        ids.append(r.json()["id"])

    r = client.get(f"{PREFIX}/plans?page=1&page_size=2", headers=_bearer(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert "total_pages" in body
    assert len(body["items"]) <= 2

    for pid in ids:
        _cleanup_plan(db, pid)


def test_search_plans(admin_token: str, db: Session):
    uid = uuid_mod.uuid4().hex[:6]
    r = client.post(
        f"{PREFIX}/plans",
        json=_plan_payload(name=f"SearchableXYZ{uid}"),
        headers=_bearer(admin_token),
    )
    assert r.status_code == 201
    plan_id = r.json()["id"]

    r2 = client.get(
        f"{PREFIX}/plans?search=SearchableXYZ{uid}",
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 200
    assert r2.json()["total"] >= 1
    assert any(p["id"] == plan_id for p in r2.json()["items"])
    _cleanup_plan(db, plan_id)


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------


def test_list_plans_requires_auth():
    r = client.get(f"{PREFIX}/plans")
    assert r.status_code == 401


def test_create_plan_requires_auth():
    r = client.post(f"{PREFIX}/plans", json=_plan_payload())
    assert r.status_code == 401
