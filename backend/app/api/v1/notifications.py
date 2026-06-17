"""Notification framework API — SuperAdmin only."""
from __future__ import annotations

import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.audit_log import (
    ACTION_NOTIFICATION_FAILED,
    ACTION_NOTIFICATION_SENT,
    ACTION_NOTIFICATION_TEMPLATE_UPDATED,
    ACTION_NOTIFICATION_TEST_EMAIL_SENT,
    ACTION_NOTIFICATION_TEST_SMS_SENT,
)
from app.models.notification import TemplateKey
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.notification_log import NotificationLogRepository
from app.repositories.notification_preference import NotificationPreferenceRepository
from app.repositories.notification_template import NotificationTemplateRepository
from app.schemas.notification import (
    NotificationLogListResponse,
    NotificationLogOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    NotificationTemplateOut,
    NotificationTemplateUpdate,
    TestEmailRequest,
    TestSendResponse,
    TestSmsRequest,
)
from app.services.notifications.email_service import EmailService
from app.services.notifications.notification_service import NotificationService, Recipient
from app.services.notifications.sms_service import SmsService

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


@router.get("/templates", response_model=list[NotificationTemplateOut])
def list_templates(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[NotificationTemplateOut]:
    templates = NotificationTemplateRepository(db).list_all()
    return [NotificationTemplateOut.model_validate(t) for t in templates]


@router.put("/templates/{template_id}", response_model=NotificationTemplateOut)
def update_template(
    template_id: uuid.UUID,
    payload: NotificationTemplateUpdate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> NotificationTemplateOut:
    repo = NotificationTemplateRepository(db)
    template = repo.get(template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    data = payload.model_dump(exclude_unset=True)
    updated = repo.update(template, data)

    AuditLogRepository(db).log(
        ACTION_NOTIFICATION_TEMPLATE_UPDATED,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        entity_type="notification_template",
        entity_id=str(updated.id),
        entity_name=f"{updated.template_key}/{updated.channel}",
    )
    return NotificationTemplateOut.model_validate(updated)


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------


@router.get("/logs", response_model=NotificationLogListResponse)
def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    template_key: str = Query(""),
    channel: str = Query(""),
    status: str = Query(""),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> NotificationLogListResponse:
    repo = NotificationLogRepository(db)
    items, total = repo.list_paginated(
        page=page,
        page_size=page_size,
        template_key=template_key or None,
        channel=channel or None,
        status=status or None,
        date_from=date_from,
        date_to=date_to,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return NotificationLogListResponse(
        items=[NotificationLogOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# Customer preferences
# ---------------------------------------------------------------------------


@router.get("/preferences/{customer_id}", response_model=NotificationPreferenceOut)
def get_preferences(
    customer_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> NotificationPreferenceOut:
    pref = NotificationPreferenceRepository(db).get_or_create(customer_id)
    return NotificationPreferenceOut.model_validate(pref)


@router.put("/preferences/{customer_id}", response_model=NotificationPreferenceOut)
def update_preferences(
    customer_id: uuid.UUID,
    payload: NotificationPreferenceUpdate,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> NotificationPreferenceOut:
    repo = NotificationPreferenceRepository(db)
    pref = repo.get_or_create(customer_id)
    data = payload.model_dump(exclude_unset=True)
    updated = repo.update(pref, data)
    return NotificationPreferenceOut.model_validate(updated)


# ---------------------------------------------------------------------------
# Test send
# ---------------------------------------------------------------------------


@router.post("/test-email", response_model=TestSendResponse)
def test_email(
    payload: TestEmailRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> TestSendResponse:
    from app.repositories.company_settings import CompanySettingsRepository

    settings = CompanySettingsRepository(db).get_or_create()
    smtp = {
        "host": settings.smtp_host,
        "port": settings.smtp_port,
        "username": settings.smtp_username,
        "password": settings.smtp_password,
        "from_email": settings.smtp_from_email,
        "from_name": settings.smtp_from_name,
        "use_tls": settings.smtp_use_tls,
        "use_ssl": settings.smtp_use_ssl,
    }
    result = EmailService().send(
        to_email=payload.to_email,
        subject=payload.subject,
        html_body=payload.body,
        smtp_settings=smtp,
    )

    action = ACTION_NOTIFICATION_TEST_EMAIL_SENT if result.success else ACTION_NOTIFICATION_FAILED
    AuditLogRepository(db).log(
        action,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        remarks=f"Test email to {payload.to_email}" + (f" — {result.error}" if result.error else ""),
    )

    return TestSendResponse(
        success=result.success,
        message="Email sent successfully" if result.success else f"Failed: {result.error}",
    )


@router.post("/test-sms", response_model=TestSendResponse)
def test_sms(
    payload: TestSmsRequest,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> TestSendResponse:
    from app.repositories.company_settings import CompanySettingsRepository

    settings = CompanySettingsRepository(db).get_or_create()
    sms_cfg = {
        "provider": settings.sms_provider,
        "api_key": settings.sms_api_key,
        "sender_id": settings.sms_sender_id,
        "base_url": settings.sms_base_url,
        "entity_id": settings.sms_entity_id,
    }
    result = SmsService().send(
        mobile_number=payload.to_mobile,
        template_key="TEST",
        rendered_body=payload.message,
        sms_settings=sms_cfg,
    )

    action = ACTION_NOTIFICATION_TEST_SMS_SENT if result.success else ACTION_NOTIFICATION_FAILED
    AuditLogRepository(db).log(
        action,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        remarks=f"Test SMS to {payload.to_mobile}" + (f" — {result.error}" if result.error else ""),
    )

    return TestSendResponse(
        success=result.success,
        message="SMS sent successfully" if result.success else f"Failed: {result.error}",
        provider_response={"provider": result.provider_name, "message_id": result.provider_message_id},
    )
