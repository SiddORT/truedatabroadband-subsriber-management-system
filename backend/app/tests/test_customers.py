"""Customer management tests."""

import uuid as uuid_mod

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app
from app.models.customer import Customer
from app.models.user import User

# Re-use shared http_client and token fixtures from conftest.py
from app.tests.conftest import http_client

PREFIX = settings.API_V1_PREFIX

client = http_client


# ---------------------------------------------------------------------------
# Helpers
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


def _uid() -> str:
    """8-char hex string used for unique names / emails."""
    return str(uuid_mod.uuid4()).replace("-", "")[:8]


def _mobile() -> str:
    """10-digit mobile number (all digits, starts with 9)."""
    # uuid.int gives a large integer; take 9 decimal digits for the suffix.
    suffix = str(uuid_mod.uuid4().int)[:9].zfill(9)
    return f"9{suffix}"


def _payload(**overrides) -> dict:
    uid = _uid()
    base = {
        "full_name": f"Test Customer {uid}",
        "mobile_number": _mobile(),
        "email": f"cust_{uid}@example.com",
        "installation_address": "42 Test Lane",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
    }
    base.update(overrides)
    return base


def _cleanup(db: Session, customer_id: str) -> None:
    """Hard-delete test customer and its linked user."""
    c = db.get(Customer, uuid_mod.UUID(customer_id))
    if c:
        uid = c.user_id
        db.delete(c)
        db.commit()
        u = db.get(User, uid)
        if u:
            db.delete(u)
            db.commit()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def test_create_customer_success(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["customer_code"].startswith("TDB-CUST-")
    assert "temp_password" in body
    assert len(body["temp_password"]) >= 12
    _cleanup(db, body["id"])


def test_customer_code_format(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    code = r.json()["customer_code"]
    parts = code.split("-")
    assert parts[:2] == ["TDB", "CUST"]
    assert parts[2].isdigit() and len(parts[2]) == 5
    _cleanup(db, r.json()["id"])


def test_duplicate_email_rejected(admin_token: str, db: Session):
    p = _payload()
    r1 = client.post(f"{PREFIX}/customers", json=p, headers=_bearer(admin_token))
    assert r1.status_code == 201, r1.json()
    # Same email, different mobile
    r2 = client.post(
        f"{PREFIX}/customers",
        json=_payload(email=p["email"]),
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 409
    _cleanup(db, r1.json()["id"])


def test_duplicate_mobile_rejected(admin_token: str, db: Session):
    p = _payload()
    r1 = client.post(f"{PREFIX}/customers", json=p, headers=_bearer(admin_token))
    assert r1.status_code == 201, r1.json()
    uid2 = _uid()
    r2 = client.post(
        f"{PREFIX}/customers",
        json=_payload(mobile_number=p["mobile_number"], email=f"other_{uid2}@example.com"),
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 409
    _cleanup(db, r1.json()["id"])


def test_create_requires_auth():
    r = client.post(f"{PREFIX}/customers", json=_payload())
    assert r.status_code == 401


def test_invalid_email_rejected(admin_token: str):
    r = client.post(f"{PREFIX}/customers", json=_payload(email="not-an-email"), headers=_bearer(admin_token))
    assert r.status_code == 422


def test_invalid_mobile_rejected(admin_token: str):
    r = client.post(f"{PREFIX}/customers", json=_payload(mobile_number="123"), headers=_bearer(admin_token))
    assert r.status_code == 422


def test_invalid_pincode_rejected(admin_token: str):
    r = client.post(f"{PREFIX}/customers", json=_payload(pincode="12345"), headers=_bearer(admin_token))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Read / List
# ---------------------------------------------------------------------------


def test_list_customers(admin_token: str):
    r = client.get(f"{PREFIX}/customers", headers=_bearer(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "total" in body and "total_pages" in body


def test_pagination_defaults(admin_token: str):
    r = client.get(f"{PREFIX}/customers", headers=_bearer(admin_token))
    body = r.json()
    assert body["page"] == 1
    assert body["page_size"] == 10


def test_search(admin_token: str, db: Session):
    uid = _uid()
    p = _payload(full_name=f"UniqueSearchName{uid}")
    r = client.post(f"{PREFIX}/customers", json=p, headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]

    results = client.get(
        f"{PREFIX}/customers",
        params={"search": f"UniqueSearchName{uid}"},
        headers=_bearer(admin_token),
    )
    assert results.json()["total"] >= 1
    names = [c["full_name"] for c in results.json()["items"]]
    assert any(f"UniqueSearchName{uid}" in n for n in names)
    _cleanup(db, cid)


def test_get_customer_by_id(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]
    r2 = client.get(f"{PREFIX}/customers/{cid}", headers=_bearer(admin_token))
    assert r2.status_code == 200
    assert r2.json()["id"] == cid
    _cleanup(db, cid)


def test_get_nonexistent_customer(admin_token: str):
    r = client.get(f"{PREFIX}/customers/{uuid_mod.uuid4()}", headers=_bearer(admin_token))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Status change
# ---------------------------------------------------------------------------


def test_status_change_suspended(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]
    r2 = client.patch(
        f"{PREFIX}/customers/{cid}/status",
        json={"status": "SUSPENDED"},
        headers=_bearer(admin_token),
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "SUSPENDED"
    _cleanup(db, cid)


def test_status_disconnected_deactivates_user(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]
    client.patch(
        f"{PREFIX}/customers/{cid}/status",
        json={"status": "DISCONNECTED"},
        headers=_bearer(admin_token),
    )
    r2 = client.get(f"{PREFIX}/customers/{cid}", headers=_bearer(admin_token))
    assert r2.json()["is_active"] is False
    _cleanup(db, cid)


def test_status_active_reactivates_user(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]
    client.patch(
        f"{PREFIX}/customers/{cid}/status",
        json={"status": "DISCONNECTED"},
        headers=_bearer(admin_token),
    )
    client.patch(
        f"{PREFIX}/customers/{cid}/status",
        json={"status": "ACTIVE"},
        headers=_bearer(admin_token),
    )
    r2 = client.get(f"{PREFIX}/customers/{cid}", headers=_bearer(admin_token))
    assert r2.json()["is_active"] is True
    _cleanup(db, cid)


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


def test_password_reset(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]
    r2 = client.post(f"{PREFIX}/customers/{cid}/reset-password", headers=_bearer(admin_token))
    assert r2.status_code == 200
    assert "temp_password" in r2.json()
    assert len(r2.json()["temp_password"]) >= 12
    _cleanup(db, cid)


def test_password_reset_sets_must_change(admin_token: str, db: Session):
    r = client.post(f"{PREFIX}/customers", json=_payload(), headers=_bearer(admin_token))
    assert r.status_code == 201, r.json()
    cid = r.json()["id"]
    client.post(f"{PREFIX}/customers/{cid}/reset-password", headers=_bearer(admin_token))
    r2 = client.get(f"{PREFIX}/customers/{cid}", headers=_bearer(admin_token))
    assert r2.json()["must_change_password"] is True
    _cleanup(db, cid)
