import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ActivityListItem(BaseModel):
    id: uuid.UUID
    created_at: datetime
    module: str | None
    action: str
    entity_type: str | None
    entity_name: str | None
    performed_by_name: str | None
    ip_address: str | None

    model_config = {"from_attributes": True}


class ActivityDetail(ActivityListItem):
    entity_id: str | None
    user_id: uuid.UUID | None
    user_agent: str | None
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    remarks: str | None

    model_config = {"from_attributes": True}


class ActivityPage(BaseModel):
    items: list[ActivityListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class ActivityExportRequest(BaseModel):
    format: str = "csv"
    filters: dict[str, Any] = {}
