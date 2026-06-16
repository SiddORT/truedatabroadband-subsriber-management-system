import re
import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.customer import CustomerStatus, CustomerType, KycType


# ---------------------------------------------------------------------------
# Field validators
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


def _check_gst(v: str) -> str:
    if not re.match(r'^[0-9A-Z]{15}$', v.upper()):
        raise ValueError("GST number must be 15 alphanumeric characters")
    return v.upper()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CustomerCreate(BaseModel):
    # Customer type
    customer_type: CustomerType = CustomerType.INDIVIDUAL
    company_name: Optional[str] = None
    gst_number: Optional[str] = None

    # Basic information
    full_name: str
    mobile_number: str
    alternate_mobile_number: Optional[str] = None
    email: str

    # Identity
    kyc_type: Optional[KycType] = None
    kyc_number: Optional[str] = None

    # Installation address
    installation_address: str
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: str
    state: str
    pincode: str

    # Billing address
    billing_same_as_installation: bool = True
    billing_address_line_1: Optional[str] = None
    billing_address_line_2: Optional[str] = None
    billing_landmark: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_pincode: Optional[str] = None

    # Spokesperson
    spokesperson_name: Optional[str] = None
    spokesperson_mobile: Optional[str] = None
    spokesperson_email: Optional[str] = None
    spokesperson_designation: Optional[str] = None

    # Additional information
    connection_date: Optional[date] = None
    reference_source: Optional[str] = None
    sales_person: Optional[str] = None
    notes: Optional[str] = None

    # Validators
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
    def validate_alt_mobile(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_mobile(v)
        return None

    @field_validator("spokesperson_mobile")
    @classmethod
    def validate_spokesperson_mobile(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_mobile(v)
        return None

    @field_validator("spokesperson_email")
    @classmethod
    def validate_spokesperson_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_email(v)
        return None

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: str) -> str:
        return _check_pincode(v)

    @field_validator("billing_pincode")
    @classmethod
    def validate_billing_pincode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_pincode(v)
        return None

    @field_validator("gst_number")
    @classmethod
    def validate_gst(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_gst(v)
        return None

    @model_validator(mode="after")
    def validate_cross_fields(self) -> "CustomerCreate":
        if self.customer_type == CustomerType.BUSINESS and not self.company_name:
            raise ValueError("company_name is required for BUSINESS customers")
        if not self.billing_same_as_installation:
            missing = []
            if not self.billing_address_line_1:
                missing.append("billing_address_line_1")
            if not self.billing_city:
                missing.append("billing_city")
            if not self.billing_state:
                missing.append("billing_state")
            if not self.billing_pincode:
                missing.append("billing_pincode")
            if missing:
                raise ValueError(
                    f"Billing address fields required when different from installation: "
                    f"{', '.join(missing)}"
                )
        return self


class CustomerUpdate(BaseModel):
    # Customer type
    customer_type: Optional[CustomerType] = None
    company_name: Optional[str] = None
    gst_number: Optional[str] = None

    # Basic information
    full_name: Optional[str] = None
    mobile_number: Optional[str] = None
    alternate_mobile_number: Optional[str] = None
    email: Optional[str] = None

    # Identity
    kyc_type: Optional[KycType] = None
    kyc_number: Optional[str] = None

    # Installation address
    installation_address: Optional[str] = None
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    # Billing address
    billing_same_as_installation: Optional[bool] = None
    billing_address_line_1: Optional[str] = None
    billing_address_line_2: Optional[str] = None
    billing_landmark: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_pincode: Optional[str] = None

    # Spokesperson
    spokesperson_name: Optional[str] = None
    spokesperson_mobile: Optional[str] = None
    spokesperson_email: Optional[str] = None
    spokesperson_designation: Optional[str] = None

    # Additional information
    connection_date: Optional[date] = None
    reference_source: Optional[str] = None
    sales_person: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        return _check_email(v) if v else v

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile(cls, v: Optional[str]) -> Optional[str]:
        return _check_mobile(v) if v else v

    @field_validator("alternate_mobile_number")
    @classmethod
    def validate_alt_mobile(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_mobile(v)
        return None

    @field_validator("spokesperson_mobile")
    @classmethod
    def validate_spokesperson_mobile(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_mobile(v)
        return None

    @field_validator("spokesperson_email")
    @classmethod
    def validate_spokesperson_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_email(v)
        return None

    @field_validator("pincode")
    @classmethod
    def validate_pincode(cls, v: Optional[str]) -> Optional[str]:
        return _check_pincode(v) if v else v

    @field_validator("billing_pincode")
    @classmethod
    def validate_billing_pincode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_pincode(v)
        return None

    @field_validator("gst_number")
    @classmethod
    def validate_gst(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            return _check_gst(v)
        return None


class CustomerStatusUpdate(BaseModel):
    status: CustomerStatus


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_code: str

    # Customer type
    customer_type: CustomerType
    company_name: Optional[str] = None
    gst_number: Optional[str] = None

    # Basic information
    user_id: uuid.UUID
    full_name: str
    mobile_number: str
    alternate_mobile_number: Optional[str] = None
    email: str

    # Identity
    kyc_type: Optional[KycType] = None
    kyc_number: Optional[str] = None

    # Installation address
    installation_address: str
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: str
    state: str
    pincode: str

    # Billing address
    billing_same_as_installation: bool = True
    billing_address_line_1: Optional[str] = None
    billing_address_line_2: Optional[str] = None
    billing_landmark: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_pincode: Optional[str] = None

    # Spokesperson
    spokesperson_name: Optional[str] = None
    spokesperson_mobile: Optional[str] = None
    spokesperson_email: Optional[str] = None
    spokesperson_designation: Optional[str] = None

    # Additional information
    connection_date: Optional[date] = None
    reference_source: Optional[str] = None
    sales_person: Optional[str] = None
    notes: Optional[str] = None

    # Status
    status: CustomerStatus

    # Documents (storage keys — use /documents/{type} endpoint to download)
    profile_photo_path: Optional[str] = None
    kyc_document_path: Optional[str] = None
    agreement_document_path: Optional[str] = None

    # Denormalised from users table (defaults; overridden in _to_out)
    is_active: bool = True
    must_change_password: bool = False

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
