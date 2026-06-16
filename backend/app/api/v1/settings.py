"""Company & invoice settings API — SuperAdmin only."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.user import User
from app.schemas.company_settings import (
    CompanySettingsOut,
    CompanySettingsUpdate,
    LogoUploadResponse,
)
from app.services.company_settings import CompanySettingsService
from app.storage.service import get_storage_service

router = APIRouter(prefix="/settings", tags=["settings"])

LOGO_BUCKET = "company"


def _to_out(record, request: Request | None = None) -> CompanySettingsOut:
    out = CompanySettingsOut.model_validate(record)
    if record.logo_path:
        out.logo_url = "/api/v1/settings/company/logo"
    return out


# ── GET settings ─────────────────────────────────────────────────────────────


@router.get("/company", response_model=CompanySettingsOut)
def get_company_settings(
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CompanySettingsOut:
    svc = CompanySettingsService(db)
    record = svc.get_or_create()
    return _to_out(record, request)


# ── PUT settings ─────────────────────────────────────────────────────────────


@router.put("/company", response_model=CompanySettingsOut)
def update_company_settings(
    payload: CompanySettingsUpdate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CompanySettingsOut:
    svc = CompanySettingsService(db)
    try:
        record = svc.update(payload, current_user, request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )
    return _to_out(record, request)


# ── POST logo ────────────────────────────────────────────────────────────────


@router.post(
    "/company/logo",
    response_model=LogoUploadResponse,
    status_code=status.HTTP_200_OK,
)
def upload_company_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> LogoUploadResponse:
    svc = CompanySettingsService(db)
    try:
        return svc.upload_logo(file, current_user, request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )


# ── GET logo (file) ──────────────────────────────────────────────────────────


@router.get("/company/logo")
def get_company_logo(
    db: Session = Depends(get_db),
):
    """Serve the company logo file.  No auth required (used in PDFs etc.)."""
    from app.repositories.company_settings import CompanySettingsRepository

    record = CompanySettingsRepository(db).get()
    if record is None or not record.logo_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No logo uploaded"
        )

    storage = get_storage_service()
    if not storage.exists(LOGO_BUCKET, record.logo_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo file not found"
        )

    file_path = storage.url(LOGO_BUCKET, record.logo_path)
    ext = Path(record.logo_path).suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    media_type = media_types.get(ext, "image/png")
    return FileResponse(file_path, media_type=media_type)
