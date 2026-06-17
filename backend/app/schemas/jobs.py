"""Pydantic schemas for Scheduled Jobs API."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


def _validate_cron(v: str) -> str:
    """Validate cron expression using APScheduler."""
    from apscheduler.triggers.cron import CronTrigger

    parts = v.strip().split()
    if len(parts) != 5:
        raise ValueError("Cron expression must have exactly 5 fields (min hr dom mon dow)")
    try:
        CronTrigger.from_crontab(v.strip())
    except Exception as exc:
        raise ValueError(f"Invalid cron expression: {exc}") from exc
    return v.strip()


class JobExecutionLogOut(BaseModel):
    id: uuid.UUID
    scheduled_job_id: uuid.UUID
    started_at: datetime
    completed_at: datetime | None
    status: str
    records_processed: int | None
    execution_time_ms: int | None
    error_message: str | None
    execution_details: dict | None

    model_config = {"from_attributes": True}


class ScheduledJobOut(BaseModel):
    id: uuid.UUID
    job_key: str
    job_name: str
    description: str | None
    cron_expression: str
    is_enabled: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    last_status: str | None
    max_retries: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScheduledJobDetail(ScheduledJobOut):
    pass


class ScheduledJobUpdate(BaseModel):
    cron_expression: str | None = Field(None)
    max_retries: int | None = Field(None, ge=0, le=10)

    @field_validator("cron_expression")
    @classmethod
    def validate_cron(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_cron(v)


class JobToggleResponse(BaseModel):
    id: uuid.UUID
    job_key: str
    is_enabled: bool
    message: str


class JobRunResponse(BaseModel):
    job_key: str
    message: str
    execution_log_id: uuid.UUID | None


class JobListResponse(BaseModel):
    items: list[ScheduledJobOut]
    total: int
    page: int
    page_size: int
    total_pages: int
