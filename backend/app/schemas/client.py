"""Pydantic schemas for the /api/v1/client namespace."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

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


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardSummary(BaseModel):
    active_connections: int
    expiring_soon: int
    outstanding_amount: Decimal
    last_payment_amount: Decimal | None = None
    last_payment_date: str | None = None


class DashboardConnection(BaseModel):
    id: uuid.UUID
    connection_name: str | None
    plan_name: str
    speed_mbps: int
    billing_cycle: str
    expiry_date: str
    days_remaining: int
    status: str


class DashboardInvoice(BaseModel):
    id: uuid.UUID
    invoice_number: str
    connection_name: str
    invoice_date: str
    due_date: str
    total_amount: Decimal
    balance_amount: Decimal
    status: str


class DashboardOutstandingInvoice(BaseModel):
    id: uuid.UUID
    invoice_number: str
    due_date: str
    outstanding_amount: Decimal
    days_overdue: int


class DashboardInvoicesResponse(BaseModel):
    recent: list[DashboardInvoice]
    outstanding: list[DashboardOutstandingInvoice]


class DashboardPayment(BaseModel):
    id: uuid.UUID
    payment_number: str
    payment_date: str
    invoice_number: str
    connection_name: str
    amount: Decimal
    payment_method: str


class DashboardNotification(BaseModel):
    id: uuid.UUID
    created_at: datetime
    template_key: str
    channel: str
    status: str
