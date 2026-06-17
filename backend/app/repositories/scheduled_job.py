"""Repository for ScheduledJob and JobExecutionLog."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.scheduled_job import JobExecutionLog, ScheduledJob

JOB_STATUS_RUNNING = "RUNNING"
JOB_STATUS_SUCCESS = "SUCCESS"
JOB_STATUS_FAILED = "FAILED"


class ScheduledJobRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_key(self, job_key: str) -> ScheduledJob | None:
        return self.db.scalar(
            select(ScheduledJob).where(ScheduledJob.job_key == job_key)
        )

    def get(self, job_id: uuid.UUID) -> ScheduledJob | None:
        return self.db.get(ScheduledJob, job_id)

    def list_all(self) -> list[ScheduledJob]:
        return list(
            self.db.scalars(
                select(ScheduledJob).order_by(ScheduledJob.job_name.asc())
            ).all()
        )

    def list_enabled(self) -> list[ScheduledJob]:
        return list(
            self.db.scalars(
                select(ScheduledJob)
                .where(ScheduledJob.is_enabled.is_(True))
                .order_by(ScheduledJob.job_name.asc())
            ).all()
        )

    def upsert_default(
        self,
        *,
        job_key: str,
        job_name: str,
        description: str,
        cron_expression: str,
        max_retries: int = 3,
    ) -> ScheduledJob:
        """Insert default job config only if the job_key doesn't exist."""
        existing = self.get_by_key(job_key)
        if existing:
            return existing
        job = ScheduledJob(
            job_key=job_key,
            job_name=job_name,
            description=description,
            cron_expression=cron_expression,
            is_enabled=True,
            max_retries=max_retries,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def update(
        self,
        job: ScheduledJob,
        *,
        cron_expression: str | None = None,
        is_enabled: bool | None = None,
        max_retries: int | None = None,
        last_status: str | None = None,
        last_run_at: datetime | None = None,
        next_run_at: datetime | None = None,
    ) -> ScheduledJob:
        if cron_expression is not None:
            job.cron_expression = cron_expression
        if is_enabled is not None:
            job.is_enabled = is_enabled
        if max_retries is not None:
            job.max_retries = max_retries
        if last_status is not None:
            job.last_status = last_status
        if last_run_at is not None:
            job.last_run_at = last_run_at
        if next_run_at is not None:
            job.next_run_at = next_run_at
        self.db.commit()
        self.db.refresh(job)
        return job

    def is_running(self, job: ScheduledJob) -> bool:
        """Check if there is an active (no completed_at) execution log."""
        count = self.db.scalar(
            select(func.count()).select_from(
                select(JobExecutionLog)
                .where(
                    JobExecutionLog.scheduled_job_id == job.id,
                    JobExecutionLog.status == JOB_STATUS_RUNNING,
                    JobExecutionLog.completed_at.is_(None),
                )
                .subquery()
            )
        )
        return (count or 0) > 0

    def list_paginated(self, *, page: int = 1, page_size: int = 25) -> dict[str, Any]:
        total = self.db.scalar(
            select(func.count()).select_from(
                select(ScheduledJob).subquery()
            )
        ) or 0
        items = list(
            self.db.scalars(
                select(ScheduledJob)
                .order_by(ScheduledJob.job_name.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, -(-total // page_size)),
        }


class JobExecutionLogRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        scheduled_job_id: uuid.UUID,
        status: str = JOB_STATUS_RUNNING,
    ) -> JobExecutionLog:
        log = JobExecutionLog(
            scheduled_job_id=scheduled_job_id,
            started_at=datetime.now(timezone.utc),
            status=status,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def complete(
        self,
        log: JobExecutionLog,
        *,
        status: str,
        records_processed: int | None = None,
        error_message: str | None = None,
        execution_details: dict | None = None,
    ) -> JobExecutionLog:
        now = datetime.now(timezone.utc)
        log.completed_at = now
        log.status = status
        log.records_processed = records_processed
        log.error_message = error_message
        log.execution_details = execution_details
        if log.started_at:
            delta = now - log.started_at
            log.execution_time_ms = int(delta.total_seconds() * 1000)
        self.db.commit()
        self.db.refresh(log)
        return log

    def list_for_job(
        self,
        scheduled_job_id: uuid.UUID,
        *,
        limit: int = 50,
        status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[JobExecutionLog]:
        stmt = select(JobExecutionLog).where(
            JobExecutionLog.scheduled_job_id == scheduled_job_id
        )
        if status:
            stmt = stmt.where(JobExecutionLog.status == status)
        if date_from:
            stmt = stmt.where(JobExecutionLog.started_at >= date_from)
        if date_to:
            stmt = stmt.where(JobExecutionLog.started_at <= date_to)
        stmt = stmt.order_by(JobExecutionLog.started_at.desc()).limit(limit)
        return list(self.db.scalars(stmt).all())
