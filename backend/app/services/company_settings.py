"""Business logic for company settings including logo file management."""

from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import Request, UploadFile
from sqlalchemy.orm import Session

from app.models.audit_log import (
    ACTION_SETTINGS_LOGO_UPLOADED,
    ACTION_SETTINGS_UPDATED,
    AuditLog,
)
from app.models.company_settings import CompanySettings
from app.models.user import User
from app.repositories.company_settings import CompanySettingsRepository
from app.schemas.company_settings import CompanySettingsUpdate, LogoUploadResponse
from app.storage.service import get_storage_service

LOGO_BUCKET = "company"
LOGO_KEY = "logo/logo"
ALLOWED_MIME = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5 MB


class CompanySettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = CompanySettingsRepository(db)

    def _audit(
        self,
        actor: User,
        action: str,
        request: Request | None = None,
    ) -> None:
        log = AuditLog(
            user_id=actor.id,
            action=action,
            ip_address=(
                request.client.host
                if request and request.client
                else None
            ),
            user_agent=(
                request.headers.get("user-agent") if request else None
            ),
        )
        self.db.add(log)
        self.db.commit()

    def get_or_create(self) -> CompanySettings:
        return self.repo.get_or_create()

    def update(
        self,
        payload: CompanySettingsUpdate,
        actor: User,
        request: Request | None = None,
    ) -> CompanySettings:
        record = self.repo.get_or_create()
        record = self.repo.update(record, payload)
        self._audit(actor, ACTION_SETTINGS_UPDATED, request)
        return record

    def upload_logo(
        self,
        file: UploadFile,
        actor: User,
        request: Request | None = None,
    ) -> LogoUploadResponse:
        if file.content_type not in ALLOWED_MIME:
            raise ValueError(
                f"Unsupported file type '{file.content_type}'. "
                f"Allowed: PNG, JPG, GIF, WEBP."
            )

        content = file.file.read()
        if len(content) > MAX_LOGO_SIZE:
            raise ValueError("Logo file exceeds the 5 MB size limit.")

        ext = Path(file.filename or "logo.png").suffix.lower() or ".png"
        key = f"logo/logo{ext}"

        storage = get_storage_service()
        storage.save(LOGO_BUCKET, key, io.BytesIO(content))

        record = self.repo.get_or_create()
        record = self.repo.set_logo_path(record, key)

        self._audit(actor, ACTION_SETTINGS_LOGO_UPLOADED, request)

        return LogoUploadResponse(
            logo_path=key,
            logo_url=f"/api/v1/settings/company/logo",
        )
