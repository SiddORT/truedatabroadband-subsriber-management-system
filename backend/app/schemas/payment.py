"""Pydantic v2 schemas for the Payment module."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreate(BaseModel):
    invoice_id: UUID
    amount: Decimal = Field(..., gt=0, description="Must be greater than zero")
    payment_date: date
    payment_method: str = "CASH"
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    payment_number: str
    invoice_id: UUID
    amount: Decimal
    payment_date: date
    payment_method: str
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PaymentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    payment_number: str
    invoice_id: UUID
    amount: Decimal
    payment_date: date
    payment_method: str
    transaction_reference: Optional[str] = None
    created_at: datetime


class PaymentListResponse(BaseModel):
    items: list[PaymentListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
