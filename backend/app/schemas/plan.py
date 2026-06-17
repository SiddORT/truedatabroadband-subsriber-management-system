import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.plan import BillingCycle, DataPolicy


# ---------------------------------------------------------------------------
# Pricing schemas
# ---------------------------------------------------------------------------

class PricingCreate(BaseModel):
    billing_cycle: BillingCycle
    base_price: Decimal
    gst_percentage: Decimal
    is_active: bool = True

    @field_validator("base_price")
    @classmethod
    def validate_base_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("base_price must be >= 0")
        return v

    @field_validator("gst_percentage")
    @classmethod
    def validate_gst(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("gst_percentage must be >= 0")
        return v


class PricingUpdate(BaseModel):
    base_price: Optional[Decimal] = None
    gst_percentage: Optional[Decimal] = None
    is_active: Optional[bool] = None

    @field_validator("base_price")
    @classmethod
    def validate_base_price(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("base_price must be >= 0")
        return v

    @field_validator("gst_percentage")
    @classmethod
    def validate_gst(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("gst_percentage must be >= 0")
        return v


class PricingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    billing_cycle: BillingCycle
    base_price: Decimal
    gst_percentage: Decimal
    total_price: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Plan schemas
# ---------------------------------------------------------------------------

class PlanCreate(BaseModel):
    name: str
    description: Optional[str] = None
    speed_mbps: int
    data_policy: DataPolicy = DataPolicy.UNLIMITED
    fup_limit_gb: Optional[int] = None
    is_active: bool = True
    pricing: list[PricingCreate] = []

    @field_validator("speed_mbps")
    @classmethod
    def validate_speed(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("speed_mbps must be greater than 0")
        return v

    @model_validator(mode="after")
    def validate_cross_fields(self) -> "PlanCreate":
        if self.data_policy == DataPolicy.FUP and not self.fup_limit_gb:
            raise ValueError("fup_limit_gb is required when data_policy is FUP")
        if self.fup_limit_gb is not None and self.fup_limit_gb <= 0:
            raise ValueError("fup_limit_gb must be greater than 0")
        cycles = [p.billing_cycle for p in self.pricing]
        if len(cycles) != len(set(cycles)):
            raise ValueError("Duplicate billing cycles are not allowed in pricing")
        return self


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    speed_mbps: Optional[int] = None
    data_policy: Optional[DataPolicy] = None
    fup_limit_gb: Optional[int] = None

    @field_validator("speed_mbps")
    @classmethod
    def validate_speed(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("speed_mbps must be greater than 0")
        return v


class PlanStatusUpdate(BaseModel):
    is_active: bool


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_code: str
    name: str
    description: Optional[str] = None
    speed_mbps: int
    data_policy: DataPolicy
    fup_limit_gb: Optional[int] = None
    is_active: bool
    pricing: list[PricingOut] = []
    active_pricing_count: int = 0
    active_subscription_count: int = 0
    created_at: datetime
    updated_at: datetime


class PlanListResponse(BaseModel):
    items: list[PlanOut]
    total: int
    page: int
    page_size: int
    total_pages: int
