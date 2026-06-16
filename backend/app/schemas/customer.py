import math
import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.customer import CustomerStatus


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

def _check_email(v: str) -> str:
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, v):
        raise ValueError("Invalid email format")
    return v.lower().strip()


def _check_mobile(v: str) -> str:
    if not re.match(r'^\d{10}$', v):
        raise ValueError("Mobile number must be exactly 10 digits")
    return v


def _check_pincode(v: str) -> str:
    if not re.match(r'^\d{6}$', v):
        raise ValueError("Pincode must be exactly 6 digits")
    return v


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CustomerCreate(BaseModel):
    full_name: str
    mobile_number: str
    alternate_mobile_number: str | None = None
    email: str
    installation_address: str
    city: str
    state: str
    pincode: str
    notes: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _check_email(v)

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        return _check_mobile(v)

    @field_validator("alternate_mobile_number")
    @classmethod
    def validate_alt_mobile(cls, v: str | None) -> str | None:
        if v is not None and v != "":
            return _check_mobile(v)
        return v or None

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: str) -> str:
        return _check_pincode(v)


class CustomerUpdate(BaseModel):
    full_name: str | None = None
    mobile_number: str | None = None
    alternate_mobile_number: str | None = None
    email: str | None = None
    installation_address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    notes: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        return _check_email(v) if v else v

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: str | None) -> str | None:
        return _check_mobile(v) if v else v

    @field_validator("alternate_mobile_number")
    @classmethod
    def validate_alt_mobile(cls, v: str | None) -> str | None:
        if v is not None and v != "":
            return _check_mobile(v)
        return v or None

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: str | None) -> str | None:
        return _check_pincode(v) if v else v


class CustomerStatusUpdate(BaseModel):
    status: CustomerStatus


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_code: str
    user_id: uuid.UUID
    full_name: str
    mobile_number: str
    alternate_mobile_number: str | None = None
    email: str
    installation_address: str
    city: str
    state: str
    pincode: str
    status: CustomerStatus
    notes: str | None = None
    # Denormalised from users table
    is_active: bool
    must_change_password: bool
    created_at: datetime
    updated_at: datetime


class CustomerCreateResponse(CustomerOut):
    """Returned once at creation — includes the one-time temp password."""
    temp_password: str


class CustomerPasswordResetResponse(BaseModel):
    temp_password: str
    message: str = "Password reset successfully. Share this password securely."


class CustomerListResponse(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int
    total_pages: int
