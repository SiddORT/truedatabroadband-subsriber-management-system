"""Pydantic schemas for LineItemMaster."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class LineItemMasterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    hsn_sac_code: str | None = Field(None, max_length=20)
    description: str | None = None
    default_amount: Decimal | None = Field(None, ge=0)
    gst_percentage: Decimal = Field(Decimal("18"), ge=0, le=100)
    is_active: bool = True

    @field_validator("gst_percentage")
    @classmethod
    def validate_gst(cls, v: Decimal) -> Decimal:
        allowed = {Decimal("0"), Decimal("5"), Decimal("12"), Decimal("18"), Decimal("28")}
        if v not in allowed:
            raise ValueError("GST must be one of 0, 5, 12, 18, 28")
        return v


class LineItemMasterUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    hsn_sac_code: str | None = None
    description: str | None = None
    default_amount: Decimal | None = Field(None, ge=0)
    gst_percentage: Decimal | None = None
    is_active: bool | None = None

    @field_validator("gst_percentage")
    @classmethod
    def validate_gst(cls, v: Decimal | None) -> Decimal | None:
        if v is None:
            return v
        allowed = {Decimal("0"), Decimal("5"), Decimal("12"), Decimal("18"), Decimal("28")}
        if v not in allowed:
            raise ValueError("GST must be one of 0, 5, 12, 18, 28")
        return v


class LineItemMasterOut(BaseModel):
    id: uuid.UUID
    name: str
    hsn_sac_code: str | None
    description: str | None
    default_amount: Decimal | None
    gst_percentage: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LineItemMasterListResponse(BaseModel):
    items: list[LineItemMasterOut]
    total: int
    page: int
    page_size: int
    total_pages: int
