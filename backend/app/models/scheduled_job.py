"""Scheduled job configuration and execution log models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ScheduledJob(Base):
    """Persisted configuration for a background job.

    APScheduler uses this table as the source of truth on every startup —
    jobs are re-registered from here so schedules survive restarts.
    """

    __tablename__ = "scheduled_jobs"
    __table_args__ = (UniqueConstraint("job_key", name="uq_scheduled_jobs_job_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    job_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    execution_logs: Mapped[list[JobExecutionLog]] = relationship(
        "JobExecutionLog",
        back_populates="scheduled_job",
        cascade="all, delete-orphan",
        order_by="JobExecutionLog.started_at.desc()",
    )

    def __repr__(self) -> str:
        return f"<ScheduledJob {self.job_key} enabled={self.is_enabled}>"


class JobExecutionLog(Base):
    """Record of a single job execution attempt."""

    __tablename__ = "job_execution_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scheduled_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scheduled_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    records_processed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    scheduled_job: Mapped[ScheduledJob] = relationship(
        "ScheduledJob", back_populates="execution_logs"
    )

    def __repr__(self) -> str:
        return f"<JobExecutionLog {self.scheduled_job_id} {self.status}>"
