"""Activity / Audit-Center API — SuperAdmin only, read-only immutable logs."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.schemas.activity import (
    ActivityDetail,
    ActivityExportRequest,
    ActivityListItem,
    ActivityPage,
)
from app.core.config import settings

router = APIRouter(prefix="/activity", tags=["activity"])


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

@router.get("", response_model=ActivityPage)
def list_activity(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str | None = Query(None),
    module: str | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    user_id: uuid.UUID | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    from datetime import datetime, timezone

    def _parse_dt(s: str | None):
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return None

    valid_sort = {"created_at", "module", "action", "performed_by_name"}
    if sort_by not in valid_sort:
        sort_by = "created_at"

    if sort_order not in ("asc", "desc"):
        sort_order = "desc"

    repo = AuditLogRepository(db)
    result = repo.list_paginated(
        page=page,
        page_size=page_size,
        search=search or None,
        module=module or None,
        action=action or None,
        entity_type=entity_type or None,
        user_id=user_id,
        date_from=_parse_dt(date_from),
        date_to=_parse_dt(date_to),
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return {
        "items": [ActivityListItem.model_validate(item) for item in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "total_pages": result["total_pages"],
    }


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------

@router.get("/{log_id}", response_model=ActivityDetail)
def get_activity(
    log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    repo = AuditLogRepository(db)
    record = repo.get(log_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity log not found",
        )
    return ActivityDetail.model_validate(record)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.post("/export")
def export_activity(
    payload: ActivityExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    fmt = payload.format.lower()
    if fmt not in {"csv", "xlsx"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="format must be 'csv' or 'xlsx'",
        )

    repo = AuditLogRepository(db)
    filename, expires_at = repo.generate_export(
        filters=payload.filters,
        fmt=fmt,
        storage_root=settings.STORAGE_ROOT,
    )

    return {
        "download_url": f"/api/v1/activity/download/{filename}",
        "expires_at": expires_at.isoformat(),
        "filename": filename,
    }


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

@router.get("/download/{filename}")
def download_activity_export(
    filename: str,
    current_user: User = Depends(require_superadmin),
):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    file_path = Path(settings.STORAGE_ROOT) / "exports" / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or has expired",
        )

    media_type = (
        "text/csv"
        if filename.endswith(".csv")
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return FileResponse(path=str(file_path), filename=filename, media_type=media_type)
