import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.subscription import SubscriptionStatus


class SubscriptionCreate(BaseModel):
    customer_id: uuid.UUID
    plan_pricing_id: uuid.UUID
    start_date: date
    connection_name: Optional[str] = None
    installation_address: Optional[str] = None
    remarks: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    connection_name: Optional[str] = None
    installation_address: Optional[str] = None
    remarks: Optional[str] = None


class SubscriptionStatusUpdate(BaseModel):
    status: SubscriptionStatus


class SubscriptionChangePlan(BaseModel):
    plan_pricing_id: uuid.UUID
    start_date: date
    remarks: Optional[str] = None


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subscription_code: str
    customer_id: uuid.UUID
    plan_id: uuid.UUID
    plan_pricing_id: uuid.UUID

    # Snapshots
    plan_name_snapshot: str
    plan_code_snapshot: str
    speed_mbps_snapshot: int
    billing_cycle_snapshot: str
    base_price_snapshot: Decimal
    gst_percentage_snapshot: Decimal
    total_price_snapshot: Decimal

    # Dates
    start_date: date
    renewal_date: date
    expiry_date: date

    # Connection details
    connection_name: Optional[str] = None
    installation_address: Optional[str] = None

    # Status
    status: SubscriptionStatus
    remarks: Optional[str] = None

    # Enriched from relationship (populated in route layer)
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_status: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class SubscriptionListResponse(BaseModel):
    items: list[SubscriptionOut]
    total: int
    page: int
    page_size: int
    total_pages: int
