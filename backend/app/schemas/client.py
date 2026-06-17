"""Pydantic schemas for the /api/v1/client namespace."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

class ClientProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Read-only identifiers
    customer_code: str
    full_name: str
    customer_type: str

    # Primary contact (read-only)
    email: str
    mobile_number: str

    # Editable alternate contact
    alternate_mobile_number: str | None = None

    # Address (read-only view)
    installation_address: str
    city: str
    state: str
    pincode: str

    # Meta
    status: str
    connection_date: str | None = None
    created_at: datetime


class ClientProfileUpdate(BaseModel):
    alternate_mobile_number: str | None = Field(
        None,
        max_length=15,
        pattern=r"^\d{10,15}$",
        description="Alternate mobile (digits only, 10-15 chars)",
    )


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    jti: uuid.UUID
    user_agent: str | None = None
    ip_address: str | None = None
    created_at: datetime
    expires_at: datetime
    is_current: bool = False


class RevokeSessionRequest(BaseModel):
    jti: uuid.UUID
