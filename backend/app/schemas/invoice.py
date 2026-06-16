"""Pydantic v2 schemas for the Invoice module."""

from __future__ import annotations

import math
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ── Shared sub-models ─────────────────────────────────────────────────────────


class LineItemIn(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., ge=0)


# ── Request ───────────────────────────────────────────────────────────────────


class InvoiceCreate(BaseModel):
    subscription_id: UUID
    billing_period_start: date
    billing_period_end: date
    invoice_date: date
    due_date: Optional[date] = None
    remarks: Optional[str] = None

    # Custom line items (installation charges, service charges, etc.)
    line_items: list[LineItemIn] = Field(default_factory=list)

    # Discount fields
    discount_type: Optional[str] = None   # "percentage" or "fixed"
    discount_value: Optional[Decimal] = Field(default=None, ge=0)
    discount_label: Optional[str] = Field(default=None, max_length=100)
    # "base" = applied to plan base price before GST (default)
    # "overall" = applied to entire total (base + GST + all line items)
    discount_scope: Optional[str] = Field(default="base")


class InvoiceUpdate(BaseModel):
    """Only date/remarks fields are editable; locked invoices reject this."""
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    remarks: Optional[str] = None
    change_reason: str = Field(..., min_length=1, description="Mandatory reason for edit")


class InvoiceStatusUpdate(BaseModel):
    status: str
    change_reason: str = Field(..., min_length=1)


# ── Response ──────────────────────────────────────────────────────────────────


class PaymentSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    payment_number: str
    amount: Decimal
    payment_date: date
    payment_method: str
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class ChangeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    changed_by_user_id: Optional[UUID] = None
    change_type: str
    old_values: Optional[Any] = None
    new_values: Optional[Any] = None
    change_reason: Optional[str] = None
    created_at: datetime


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_number: str
    subscription_id: UUID
    version_number: int
    edited_count: int
    is_locked: bool
    original_invoice_id: Optional[UUID] = None

    # Company snapshots
    company_name_snapshot: str
    legal_name_snapshot: Optional[str] = None
    gst_number_snapshot: Optional[str] = None
    pan_number_snapshot: Optional[str] = None
    support_email_snapshot: Optional[str] = None
    support_phone_snapshot: Optional[str] = None
    company_address_snapshot: Optional[str] = None
    invoice_footer_snapshot: Optional[str] = None
    terms_snapshot: Optional[str] = None

    # Customer snapshots
    customer_code_snapshot: str
    customer_name_snapshot: str

    # Connection snapshots
    connection_name_snapshot: str
    installation_address_snapshot: Optional[str] = None

    # Plan snapshots
    plan_code_snapshot: str
    plan_name_snapshot: str
    speed_mbps_snapshot: int
    data_policy_snapshot: str
    fup_limit_gb_snapshot: Optional[int] = None

    # Pricing snapshots
    billing_cycle_snapshot: str
    base_amount: Decimal
    gst_percentage: Decimal
    gst_amount: Decimal
    total_amount: Decimal

    # Custom line items
    line_items: Optional[list[Any]] = None
    line_items_total: Decimal = Decimal("0.00")

    # Discount
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    discount_amount: Decimal = Decimal("0.00")
    discount_label: Optional[str] = None
    discount_scope: str = "base"

    # Payment tracking
    paid_amount: Decimal
    balance_amount: Decimal

    billing_period_start: date
    billing_period_end: date
    invoice_date: date
    due_date: date
    status: str
    remarks: Optional[str] = None
    pdf_path: Optional[str] = None
    pdf_url: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    # Nested
    payments: list[PaymentSummaryOut] = []
    change_logs: list[ChangeLogOut] = []


class InvoiceListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    invoice_number: str
    customer_code_snapshot: str
    customer_name_snapshot: str
    connection_name_snapshot: str
    invoice_date: date
    due_date: date
    total_amount: Decimal
    balance_amount: Decimal
    paid_amount: Decimal
    status: str
    is_locked: bool
    pdf_path: Optional[str] = None
    created_at: datetime


class InvoiceListResponse(BaseModel):
    items: list[InvoiceListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
