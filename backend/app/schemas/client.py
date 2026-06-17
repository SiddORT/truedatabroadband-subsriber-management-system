"""Pydantic schemas for the /api/v1/client namespace."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


# ---------------------------------------------------------------------------
# Billing & Invoices
# ---------------------------------------------------------------------------

class BillingSummary(BaseModel):
    total_invoiced: Decimal
    total_paid: Decimal
    outstanding_amount: Decimal
    overdue_amount: Decimal
    last_payment_amount: Decimal | None = None
    last_payment_date: str | None = None


class ClientInvoiceListItem(BaseModel):
    id: uuid.UUID
    invoice_number: str
    connection_name: str | None
    invoice_date: str
    due_date: str
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    status: str


class ClientInvoicesPage(BaseModel):
    items: list[ClientInvoiceListItem]
    total: int
    page: int
    page_size: int
    pages: int


class ClientInvoicePayment(BaseModel):
    id: uuid.UUID
    payment_number: str
    payment_date: str
    amount: Decimal
    payment_method: str
    transaction_reference: str | None = None


class ClientInvoiceDetail(BaseModel):
    id: uuid.UUID
    invoice_number: str
    invoice_date: str
    due_date: str
    status: str
    # Connection
    connection_name: str | None
    plan_name: str
    billing_period_start: str
    billing_period_end: str
    # Financial
    base_amount: Decimal
    discount_amount: Decimal
    gst_amount: Decimal
    gst_percentage: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    # Payments
    payments: list[ClientInvoicePayment]
    # Meta
    pdf_available: bool


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------

class ClientPaymentListItem(BaseModel):
    id: uuid.UUID
    payment_number: str
    payment_date: str
    invoice_number: str
    connection_name: str | None
    amount: Decimal
    payment_method: str
    transaction_reference: str | None = None


class ClientPaymentsPage(BaseModel):
    items: list[ClientPaymentListItem]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Connections (Subscriptions — client view)
# ---------------------------------------------------------------------------

class ClientSubscriptionListItem(BaseModel):
    id: uuid.UUID
    subscription_code: str
    connection_name: str | None
    plan_name: str
    speed_mbps: int
    billing_cycle: str
    start_date: str
    renewal_date: str
    expiry_date: str
    status: str
    days_remaining: int


class ClientSubscriptionsPage(BaseModel):
    items: list[ClientSubscriptionListItem]
    total: int
    page: int
    page_size: int
    pages: int


class ClientSubscriptionDetail(BaseModel):
    id: uuid.UUID
    subscription_code: str
    connection_name: str | None
    plan_id: uuid.UUID
    plan_name: str
    plan_code: str
    speed_mbps: int
    billing_cycle: str
    data_policy: str
    fup_limit_gb: int | None
    base_price: Decimal
    total_price: Decimal
    start_date: str
    renewal_date: str
    expiry_date: str
    installation_address: str | None
    status: str
    days_remaining: int
    pending_renewal_request: bool
    pending_plan_change_request: bool
    recent_invoices: list[ClientInvoiceListItem]
    recent_payments: list[ClientPaymentListItem]
    recent_notifications: list[DashboardNotification]


# ---------------------------------------------------------------------------
# Renewal Requests
# ---------------------------------------------------------------------------

class RenewalRequestCreate(BaseModel):
    requested_billing_cycle: str = Field(..., description="MONTHLY | QUARTERLY | HALF_YEARLY | ANNUALLY")
    remarks: str | None = Field(None, max_length=1000)

    @field_validator("requested_billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        allowed = {"MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"}
        if v not in allowed:
            raise ValueError(f"Must be one of: {', '.join(sorted(allowed))}")
        return v


# ---------------------------------------------------------------------------
# Plan Change Requests
# ---------------------------------------------------------------------------

class PlanChangeRequestCreate(BaseModel):
    requested_plan_id: uuid.UUID
    remarks: str | None = Field(None, max_length=1000)


# ---------------------------------------------------------------------------
# Request History (combined renewal + plan change)
# ---------------------------------------------------------------------------

class ClientRequestHistoryItem(BaseModel):
    id: uuid.UUID
    request_type: str
    status: str
    created_at: datetime
    remarks: str | None
    review_notes: str | None
    reviewed_at: datetime | None
    requested_billing_cycle: str | None = None
    current_plan_name: str | None = None
    requested_plan_name: str | None = None


# ---------------------------------------------------------------------------
# Plan list (for plan-change request form)
# ---------------------------------------------------------------------------

class ClientPlanPricingItem(BaseModel):
    id: uuid.UUID
    billing_cycle: str
    total_price: Decimal


class ClientPlanListItem(BaseModel):
    id: uuid.UUID
    plan_code: str
    name: str
    speed_mbps: int
    data_policy: str
    fup_limit_gb: int | None
    pricing: list[ClientPlanPricingItem]
