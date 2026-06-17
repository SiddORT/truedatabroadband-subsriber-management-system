"""Scheduled Jobs management API — SuperAdmin only."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.audit_log import (
    ACTION_SCHEDULED_JOB_DISABLED,
    ACTION_SCHEDULED_JOB_ENABLED,
    ACTION_SCHEDULED_JOB_FAILED,
    ACTION_SCHEDULED_JOB_RUN,
    ACTION_SCHEDULED_JOB_UPDATED,
)
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.scheduled_job import (
    JobExecutionLogRepository,
    ScheduledJobRepository,
)
from app.schemas.jobs import (
    JobListResponse,
    JobRunResponse,
    JobToggleResponse,
    ScheduledJobDetail,
    ScheduledJobOut,
    ScheduledJobUpdate,
    JobExecutionLogOut,
)

router = APIRouter(prefix="/jobs", tags=["Scheduled Jobs"])


def _audit(request: Request, db: Session, user: User, action: str, **kwargs) -> None:
    AuditLogRepository(db).log(
        action,
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        performed_by_name=user.full_name,
        **kwargs,
    )


@router.get("", response_model=JobListResponse)
def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = ScheduledJobRepository(db)
    result = repo.list_paginated(page=page, page_size=page_size)

    from app.services.scheduler_service import get_scheduler
    svc = get_scheduler()

    items_out = []
    for job in result["items"]:
        # Sync next_run from APScheduler
        next_run = svc.get_next_run(job.job_key)
        if next_run and next_run != job.next_run_at:
            repo.update(job, next_run_at=next_run)
        items_out.append(ScheduledJobOut.model_validate(job))

    return JobListResponse(
        items=items_out,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
    )


@router.get("/{job_id}", response_model=ScheduledJobDetail)
def get_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = ScheduledJobRepository(db)
    job = repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return ScheduledJobDetail.model_validate(job)


@router.get("/{job_id}/logs", response_model=list[JobExecutionLogOut])
def get_job_logs(
    job_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    log_status: str | None = Query(None, alias="status"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = ScheduledJobRepository(db)
    job = repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    log_repo = JobExecutionLogRepository(db)
    logs = log_repo.list_for_job(
        job.id,
        limit=limit,
        status=log_status,
        date_from=date_from,
        date_to=date_to,
    )
    return [JobExecutionLogOut.model_validate(lg) for lg in logs]


@router.put("/{job_id}", response_model=ScheduledJobOut)
def update_job(
    job_id: uuid.UUID,
    payload: ScheduledJobUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = ScheduledJobRepository(db)
    job = repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    old_values = {
        "cron_expression": job.cron_expression,
        "max_retries": job.max_retries,
    }
    updated = repo.update(
        job,
        cron_expression=payload.cron_expression,
        max_retries=payload.max_retries,
    )

    # Reschedule in APScheduler if cron changed and job is enabled
    if payload.cron_expression and updated.is_enabled:
        from app.services.scheduler_service import get_scheduler
        get_scheduler().reschedule_job(updated.job_key, payload.cron_expression)

    new_values = {
        "cron_expression": updated.cron_expression,
        "max_retries": updated.max_retries,
    }
    _audit(
        request, db, current_user,
        ACTION_SCHEDULED_JOB_UPDATED,
        entity_type="scheduled_job",
        entity_id=str(updated.id),
        entity_name=updated.job_name,
        old_values=old_values,
        new_values=new_values,
    )
    return ScheduledJobOut.model_validate(updated)


@router.patch("/{job_id}/toggle", response_model=JobToggleResponse)
def toggle_job(
    job_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = ScheduledJobRepository(db)
    job = repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    new_enabled = not job.is_enabled
    updated = repo.update(job, is_enabled=new_enabled)

    from app.services.scheduler_service import get_scheduler
    svc = get_scheduler()
    if new_enabled:
        svc.enable_job(updated.job_key, updated.cron_expression)
        action = ACTION_SCHEDULED_JOB_ENABLED
        msg = f"Job '{updated.job_name}' enabled"
    else:
        svc.disable_job(updated.job_key)
        action = ACTION_SCHEDULED_JOB_DISABLED
        msg = f"Job '{updated.job_name}' disabled"

    _audit(
        request, db, current_user,
        action,
        entity_type="scheduled_job",
        entity_id=str(updated.id),
        entity_name=updated.job_name,
        new_values={"is_enabled": new_enabled},
    )
    return JobToggleResponse(
        id=updated.id,
        job_key=updated.job_key,
        is_enabled=updated.is_enabled,
        message=msg,
    )


@router.post("/{job_id}/run", response_model=JobRunResponse)
def run_job_now(
    job_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = ScheduledJobRepository(db)
    job = repo.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    from app.services.scheduler_service import get_scheduler
    svc = get_scheduler()

    try:
        _status, log_id = svc.run_job_now(job.job_key)
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job is already running. Please wait for it to complete.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    _audit(
        request, db, current_user,
        ACTION_SCHEDULED_JOB_RUN,
        entity_type="scheduled_job",
        entity_id=str(job.id),
        entity_name=job.job_name,
        remarks="Manual execution triggered",
    )

    return JobRunResponse(
        job_key=job.job_key,
        message=f"Job '{job.job_name}' queued for execution.",
        execution_log_id=log_id,
    )
