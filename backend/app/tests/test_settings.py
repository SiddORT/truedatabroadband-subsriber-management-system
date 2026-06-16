"""Company settings tests."""

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.main import app
from app.models.company_settings import CompanySettings
from app.tests.conftest import http_client

PREFIX = "/api/v1/settings"
client = http_client


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _cleanup(db: Session) -> None:
    db.query(CompanySettings).delete()
    db.commit()


# ---------------------------------------------------------------------------
# GET /settings/company — auto-creates default record
# ---------------------------------------------------------------------------


def test_get_settings_creates_default(admin_token: str, db: Session):
    _cleanup(db)
    r = client.get(f"{PREFIX}/company", headers=_bearer(admin_token))
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["company_name"] == "True Data Broadband Pvt. Ltd."
    assert body["invoice_prefix"] == "TDB-INV"
    assert body["invoice_due_days"] == 7
    assert float(body["default_gst_percentage"]) == 18.0
    _cleanup(db)


def test_get_settings_requires_auth():
    r = client.get(f"{PREFIX}/company")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# PUT /settings/company — updates settings
# ---------------------------------------------------------------------------


def test_update_company_info(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={
            "company_name": "Updated Company",
            "legal_name": "Updated Legal Pvt. Ltd.",
            "support_email": "support@test.com",
            "support_phone": "9876543210",
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["company_name"] == "Updated Company"
    assert body["legal_name"] == "Updated Legal Pvt. Ltd."
    assert body["support_email"] == "support@test.com"
    assert body["support_phone"] == "9876543210"
    _cleanup(db)


def test_update_address(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={
            "address_line_1": "123 Main Street",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "country": "India",
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["address_line_1"] == "123 Main Street"
    assert body["city"] == "Mumbai"
    assert body["pincode"] == "400001"
    _cleanup(db)


def test_update_invoice_settings(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={
            "invoice_prefix": "INV",
            "invoice_due_days": 15,
            "default_gst_percentage": "18.00",
            "invoice_footer_text": "Thank you for your business.",
            "terms_and_conditions": "Payment due within 15 days.",
        },
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["invoice_prefix"] == "INV"
    assert body["invoice_due_days"] == 15
    assert body["invoice_footer_text"] == "Thank you for your business."
    _cleanup(db)


def test_update_requires_auth():
    r = client.put(f"{PREFIX}/company", json={"company_name": "Test"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_invalid_gst_format(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={"gst_number": "INVALID_GST"},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 422
    _cleanup(db)


def test_valid_gst_format(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={"gst_number": "27AAAPL1234C1ZV"},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["gst_number"] == "27AAAPL1234C1ZV"
    _cleanup(db)


def test_invalid_pan_format(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={"pan_number": "INVALID"},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 422
    _cleanup(db)


def test_valid_pan_format(admin_token: str, db: Session):
    _cleanup(db)
    r = client.put(
        f"{PREFIX}/company",
        json={"pan_number": "AAAPL1234C"},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["pan_number"] == "AAAPL1234C"
    _cleanup(db)


# ---------------------------------------------------------------------------
# Single-record enforcement
# ---------------------------------------------------------------------------


def test_only_one_settings_record(admin_token: str, db: Session):
    _cleanup(db)
    # First call creates the record
    r1 = client.get(f"{PREFIX}/company", headers=_bearer(admin_token))
    assert r1.status_code == 200
    # Multiple GETs should not create duplicate records
    r2 = client.get(f"{PREFIX}/company", headers=_bearer(admin_token))
    assert r2.status_code == 200
    count = db.query(CompanySettings).count()
    assert count == 1
    _cleanup(db)


# ---------------------------------------------------------------------------
# Logo upload
# ---------------------------------------------------------------------------


def test_logo_upload_png(admin_token: str, db: Session):
    _cleanup(db)
    # Create a minimal PNG-like binary (real PNG header)
    png_header = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
        b"\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18"
        b"\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    r = client.post(
        f"{PREFIX}/company/logo",
        files={"file": ("logo.png", io.BytesIO(png_header), "image/png")},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 200, r.json()
    body = r.json()
    assert "logo_path" in body
    assert "logo_url" in body
    _cleanup(db)


def test_logo_upload_requires_auth():
    png = b"\x89PNG\r\n\x1a\n"
    r = client.post(
        f"{PREFIX}/company/logo",
        files={"file": ("logo.png", io.BytesIO(png), "image/png")},
    )
    assert r.status_code == 401


def test_logo_upload_invalid_type(admin_token: str, db: Session):
    _cleanup(db)
    r = client.post(
        f"{PREFIX}/company/logo",
        files={"file": ("bad.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        headers=_bearer(admin_token),
    )
    assert r.status_code == 422
    _cleanup(db)
