"""Company & invoice settings API — SuperAdmin only."""

from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.audit_log import (
    ACTION_SMS_SETTINGS_UPDATED,
    ACTION_EMAIL_SETTINGS_UPDATED,
    ACTION_NOTIFICATION_TEST_SMS_SENT,
    ACTION_NOTIFICATION_TEST_EMAIL_SENT,
)
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.communication_log import CommunicationLogRepository
from app.repositories.company_settings import CompanySettingsRepository
from app.schemas.company_settings import (
    CommunicationLogOut,
    CommunicationLogPage,
    CompanySettingsOut,
    CompanySettingsUpdate,
    EmailSettingsOut,
    EmailSettingsUpdate,
    LogoUploadResponse,
    SmsSettingsOut,
    SmsSettingsUpdate,
    TestEmailRequest,
    TestSmsRequest,
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


def _audit(db: Session, action: str, request: Request, user_id=None) -> None:
    AuditLogRepository(db).log(
        action,
        user_id=user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


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


# ── SMS Settings ──────────────────────────────────────────────────────────────


@router.get("/communication/sms", response_model=SmsSettingsOut)
def get_sms_settings(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SmsSettingsOut:
    record = CompanySettingsRepository(db).get_or_create()
    return SmsSettingsOut(
        is_enabled=record.sms_is_enabled,
        provider=record.sms_provider,
        api_base_url=record.sms_api_base_url,
        status_api_url=record.sms_status_api_url,
        api_key_configured=bool(record.sms_api_key_encrypted),
        client_id_configured=bool(record.sms_client_id_encrypted),
        sender_id_configured=bool(record.sms_sender_id_encrypted),
        entity_id_configured=bool(record.sms_entity_id_encrypted),
    )


@router.put("/communication/sms", response_model=SmsSettingsOut)
def update_sms_settings(
    payload: SmsSettingsUpdate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SmsSettingsOut:
    repo = CompanySettingsRepository(db)
    record = repo.get_or_create()
    record = repo.update_sms_settings(
        record,
        is_enabled=payload.is_enabled,
        provider=payload.provider,
        api_base_url=payload.api_base_url,
        status_api_url=payload.status_api_url,
        api_key=payload.api_key,
        client_id=payload.client_id,
        sender_id=payload.sender_id,
        entity_id=payload.entity_id,
        replace_api_key=payload.replace_api_key,
        replace_client_id=payload.replace_client_id,
        replace_sender_id=payload.replace_sender_id,
        replace_entity_id=payload.replace_entity_id,
    )
    _audit(db, ACTION_SMS_SETTINGS_UPDATED, request, user_id=current_user.id)
    return SmsSettingsOut(
        is_enabled=record.sms_is_enabled,
        provider=record.sms_provider,
        api_base_url=record.sms_api_base_url,
        status_api_url=record.sms_status_api_url,
        api_key_configured=bool(record.sms_api_key_encrypted),
        client_id_configured=bool(record.sms_client_id_encrypted),
        sender_id_configured=bool(record.sms_sender_id_encrypted),
        entity_id_configured=bool(record.sms_entity_id_encrypted),
    )


@router.post("/communication/sms/test", status_code=status.HTTP_200_OK)
def test_sms(
    payload: TestSmsRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict:
    from app.services.notifications.sms_service import SmsService
    from app.models.communication_log import CommStatus

    repo = CompanySettingsRepository(db)
    record = repo.get_or_create()
    sms_settings = repo.get_sms_settings(record)

    svc = SmsService()
    result = svc.send(
        mobile_number=payload.mobile_number,
        template_key="TEST",
        rendered_body="This is a test SMS from True Data Broadband Pvt. Ltd.",
        sms_settings=sms_settings,
    )

    # Log to communication_logs
    CommunicationLogRepository(db).create(
        channel="SMS",
        template_key="TEST",
        recipient_mobile=payload.mobile_number,
        provider_name=result.provider_name,
        provider_message_id=result.provider_message_id,
        request_payload={"mobile_number": payload.mobile_number, "api_key": "***"},
        response_payload=result.raw_response,
        status=CommStatus.SENT if result.success else CommStatus.FAILED,
        error_message=result.error,
        entity_type="user",
        entity_id=str(current_user.id),
    )
    _audit(db, ACTION_NOTIFICATION_TEST_SMS_SENT, request, user_id=current_user.id)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.error or "SMS send failed",
        )
    return {"success": True, "provider_message_id": result.provider_message_id}


# ── Email Settings ────────────────────────────────────────────────────────────


@router.get("/communication/email", response_model=EmailSettingsOut)
def get_email_settings(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> EmailSettingsOut:
    record = CompanySettingsRepository(db).get_or_create()
    return EmailSettingsOut(
        is_enabled=record.email_is_enabled,
        host=record.smtp_host,
        port=record.smtp_port,
        from_email=record.smtp_from_email,
        from_name=record.smtp_from_name,
        use_tls=record.smtp_use_tls,
        use_ssl=record.smtp_use_ssl,
        username_configured=bool(record.smtp_username_encrypted),
        password_configured=bool(record.smtp_password_encrypted),
    )


@router.put("/communication/email", response_model=EmailSettingsOut)
def update_email_settings(
    payload: EmailSettingsUpdate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> EmailSettingsOut:
    repo = CompanySettingsRepository(db)
    record = repo.get_or_create()
    record = repo.update_email_settings(
        record,
        is_enabled=payload.is_enabled,
        host=payload.host,
        port=payload.port,
        from_email=payload.from_email,
        from_name=payload.from_name,
        use_tls=payload.use_tls,
        use_ssl=payload.use_ssl,
        username=payload.username,
        password=payload.password,
        replace_username=payload.replace_username,
        replace_password=payload.replace_password,
    )
    _audit(db, ACTION_EMAIL_SETTINGS_UPDATED, request, user_id=current_user.id)
    return EmailSettingsOut(
        is_enabled=record.email_is_enabled,
        host=record.smtp_host,
        port=record.smtp_port,
        from_email=record.smtp_from_email,
        from_name=record.smtp_from_name,
        use_tls=record.smtp_use_tls,
        use_ssl=record.smtp_use_ssl,
        username_configured=bool(record.smtp_username_encrypted),
        password_configured=bool(record.smtp_password_encrypted),
    )


@router.post("/communication/email/test", status_code=status.HTTP_200_OK)
def test_email(
    payload: TestEmailRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict:
    from app.core.config import settings as app_settings
    from app.services.notifications.email_layout import wrap_from_settings
    from app.services.notifications.email_service import EmailService
    from app.models.communication_log import CommStatus

    repo = CompanySettingsRepository(db)
    record = repo.get_or_create()
    smtp_settings = repo.get_smtp_settings(record)

    inner = (
        "<h2 style='margin:0 0 12px;font-size:20px;color:#1F4959;'>Test Email</h2>"
        "<p style='margin:0 0 10px;'>Your SMTP configuration is working correctly.</p>"
        "<p style='margin:0;'>This is a test message sent from "
        "<strong>True Data Broadband Pvt. Ltd.</strong> to verify that "
        "outbound email delivery is set up and operational.</p>"
    )
    html_body = wrap_from_settings(inner, record, base_url=app_settings.SITE_URL)

    svc = EmailService()
    result = svc.send(
        to_email=payload.email,
        subject="Test Email — True Data Broadband",
        html_body=html_body,
        smtp_settings=smtp_settings,
    )

    CommunicationLogRepository(db).create(
        channel="EMAIL",
        template_key="TEST",
        recipient_email=payload.email,
        provider_name="SMTP",
        request_payload={"to": payload.email, "subject": "Test Email", "smtp_password": "***"},
        response_payload={"success": result.success, "error": result.error},
        status=CommStatus.SENT if result.success else CommStatus.FAILED,
        error_message=result.error,
        entity_type="user",
        entity_id=str(current_user.id),
    )
    _audit(db, ACTION_NOTIFICATION_TEST_EMAIL_SENT, request, user_id=current_user.id)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.error or "Email send failed",
        )
    return {"success": True, "message": "Test email sent"}


# ── Communication Logs ────────────────────────────────────────────────────────


@router.get("/communication/logs", response_model=CommunicationLogPage)
def list_communication_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    channel: Optional[str] = Query(None),
    template_key: Optional[str] = Query(None),
    log_status: Optional[str] = Query(None, alias="status"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> CommunicationLogPage:
    repo = CommunicationLogRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        channel=channel,
        template_key=template_key,
        status=log_status,
        date_from=date_from,
        date_to=date_to,
    )
    return CommunicationLogPage(
        items=[CommunicationLogOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/communication/logs/{log_id}/refresh", status_code=status.HTTP_200_OK)
def refresh_log_status(
    log_id: str,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict:
    """Manually refresh delivery status for an SMS log entry."""
    import uuid as _uuid
    from app.services.notifications.sms_service import SmsService
    from app.models.communication_log import CommStatus

    try:
        uid = _uuid.UUID(log_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid log ID")

    log_repo = CommunicationLogRepository(db)
    log = log_repo.get(uid)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")

    if log.channel != "SMS" or not log.provider_message_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status refresh only available for SMS with a provider message ID",
        )

    settings_repo = CompanySettingsRepository(db)
    record = settings_repo.get_or_create()
    sms_settings = settings_repo.get_sms_settings(record)

    svc = SmsService()
    result = svc.get_status(log.provider_message_id, sms_settings=sms_settings)

    new_status = log.status
    if result.success:
        raw = result.raw_response or {}
        status_str = str(raw.get("Status", raw.get("status", ""))).upper()
        if status_str in ("DELIVERED", "DELIVRD"):
            new_status = CommStatus.DELIVERED
        elif status_str in ("FAILED", "UNDELIVERED"):
            new_status = CommStatus.FAILED
        else:
            new_status = CommStatus.SENT

    log_repo.update_status(log, new_status, response_payload=result.raw_response)
    return {"status": new_status}


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
