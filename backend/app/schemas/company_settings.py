"""Pydantic v2 schemas for the company settings module."""

import re
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# ── Validators ────────────────────────────────────────────────────────────────

GST_RE = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
)
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def _val_gst(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not GST_RE.match(v.upper()):
        raise ValueError("Invalid GST number format (e.g. 27AAAPL1234C1ZV)")
    return v.upper()


def _val_pan(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not PAN_RE.match(v.upper()):
        raise ValueError("Invalid PAN number format (e.g. AAAPL1234C)")
    return v.upper()


def _val_phone(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    digits = re.sub(r"\D", "", v)
    if not PHONE_RE.match(digits):
        raise ValueError("Invalid phone number — must be a 10-digit Indian mobile number")
    return digits


# ── Request ───────────────────────────────────────────────────────────────────


class CompanySettingsUpdate(BaseModel):
    """All fields optional — partial update pattern."""

    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    legal_name: Optional[str] = Field(None, max_length=255)
    gst_number: Optional[str] = Field(None)
    pan_number: Optional[str] = Field(None)
    support_email: Optional[EmailStr] = None
    support_phone: Optional[str] = None

    address_line_1: Optional[str] = Field(None, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    landmark: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=10)
    country: Optional[str] = Field(None, max_length=100)

    invoice_prefix: Optional[str] = Field(None, min_length=1, max_length=20)
    invoice_due_days: Optional[int] = Field(None, ge=0, le=365)
    default_gst_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    invoice_footer_text: Optional[str] = None
    terms_and_conditions: Optional[str] = None

    @field_validator("gst_number", mode="before")
    @classmethod
    def validate_gst(cls, v: str | None) -> str | None:
        return _val_gst(v)

    @field_validator("pan_number", mode="before")
    @classmethod
    def validate_pan(cls, v: str | None) -> str | None:
        return _val_pan(v)

    @field_validator("support_phone", mode="before")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        return _val_phone(v)


# ── Response ──────────────────────────────────────────────────────────────────


class CompanySettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_name: str
    legal_name: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None

    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = "India"

    logo_path: Optional[str] = None
    logo_url: Optional[str] = None

    invoice_prefix: str = "TDB-INV"
    invoice_due_days: int = 7
    default_gst_percentage: Decimal = Decimal("18.00")
    invoice_footer_text: Optional[str] = None
    terms_and_conditions: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class LogoUploadResponse(BaseModel):
    logo_path: str
    logo_url: str
    message: str = "Logo uploaded successfully"
