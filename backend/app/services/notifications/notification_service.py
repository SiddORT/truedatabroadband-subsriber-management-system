"""Central notification service.

Business modules call notification_service.send() — they never talk to
SMS/email providers directly.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.notification import NotificationChannel, NotificationStatus, TemplateKey
from app.repositories.company_settings import CompanySettingsRepository
from app.repositories.notification_log import NotificationLogRepository
from app.repositories.notification_preference import NotificationPreferenceRepository
from app.repositories.notification_template import NotificationTemplateRepository
from .email_layout import wrap_from_settings
from .email_service import Attachment, EmailService
from .sms_service import SmsService

logger = get_logger(__name__)

_VAR_RE = re.compile(r"\{(\w+)\}")


# ---------------------------------------------------------------------------
# Preference helper
# ---------------------------------------------------------------------------

_PREF_MAP: dict[tuple[str, str], str] = {
    (TemplateKey.WELCOME_CUSTOMER, NotificationChannel.SMS): "welcome_sms_enabled",
    (TemplateKey.WELCOME_CUSTOMER, NotificationChannel.EMAIL): "welcome_email_enabled",
    (TemplateKey.SUBSCRIPTION_EXPIRING, NotificationChannel.SMS): "renewal_sms_enabled",
    (TemplateKey.SUBSCRIPTION_EXPIRING, NotificationChannel.EMAIL): "renewal_email_enabled",
    (TemplateKey.SUBSCRIPTION_EXPIRED, NotificationChannel.SMS): "renewal_sms_enabled",
    (TemplateKey.SUBSCRIPTION_EXPIRED, NotificationChannel.EMAIL): "renewal_email_enabled",
    (TemplateKey.INVOICE_GENERATED, NotificationChannel.EMAIL): "invoice_email_enabled",
    (TemplateKey.PAYMENT_RECEIVED, NotificationChannel.EMAIL): "payment_email_enabled",
    (TemplateKey.OTP_LOGIN, NotificationChannel.SMS): "otp_sms_enabled",
    (TemplateKey.OTP_LOGIN, NotificationChannel.EMAIL): "otp_email_enabled",
}


@dataclass
class Recipient:
    email: str | None = None
    mobile: str | None = None


@dataclass
class SendResult:
    template_key: str
    channel: str
    status: str
    log_id: uuid.UUID | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class NotificationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.tmpl_repo = NotificationTemplateRepository(db)
        self.log_repo = NotificationLogRepository(db)
        self.pref_repo = NotificationPreferenceRepository(db)
        self.settings_repo = CompanySettingsRepository(db)
        self.email_svc = EmailService()
        self.sms_svc = SmsService()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def send(
        self,
        template_key: str,
        recipient: Recipient | dict,
        variables: dict[str, Any],
        *,
        entity_type: str | None = None,
        entity_id: str | None = None,
        subscription_id: uuid.UUID | None = None,
        days_offset: int | None = None,
        customer_id: uuid.UUID | None = None,
        attachments: list[Attachment] | None = None,
    ) -> list[SendResult]:
        """Send a notification.  Returns one SendResult per channel attempted."""
        if isinstance(recipient, dict):
            recipient = Recipient(
                email=recipient.get("email"),
                mobile=recipient.get("mobile"),
            )

        settings = self.settings_repo.get_or_create()
        smtp_settings = self._extract_smtp(settings)
        sms_settings = self._extract_sms(settings)

        prefs = None
        if customer_id is not None:
            prefs = self.pref_repo.get_by_customer(customer_id)

        templates = self.tmpl_repo.list_by_key(template_key, active_only=True)
        if not templates:
            logger.warning("notification_service.no_templates", template_key=template_key)
            return []

        results: list[SendResult] = []
        for tmpl in templates:
            channel = tmpl.channel
            result = self._send_channel(
                template=tmpl,
                channel=channel,
                recipient=recipient,
                variables=variables,
                entity_type=entity_type,
                entity_id=entity_id,
                subscription_id=subscription_id,
                days_offset=days_offset,
                prefs=prefs,
                smtp_settings=smtp_settings,
                sms_settings=sms_settings,
                attachments=attachments,
                company_settings=settings,
            )
            results.append(result)
        return results

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _send_channel(
        self,
        *,
        template: Any,
        channel: str,
        recipient: Recipient,
        variables: dict,
        entity_type: str | None,
        entity_id: str | None,
        subscription_id: uuid.UUID | None,
        days_offset: int | None,
        prefs: Any,
        smtp_settings: dict,
        sms_settings: dict,
        attachments: list[Attachment] | None,
        company_settings: Any = None,
    ) -> SendResult:
        template_key = template.template_key

        # Preference check
        if prefs is not None and not self._channel_allowed(template_key, channel, prefs):
            logger.info(
                "notification_service.preference_disabled",
                template_key=template_key,
                channel=channel,
            )
            return SendResult(
                template_key=template_key,
                channel=channel,
                status=NotificationStatus.FAILED,
                error="disabled by customer preference",
            )

        # Duplicate check (subscription-based reminders only)
        if subscription_id is not None and days_offset is not None:
            if self.log_repo.exists_for_subscription(
                subscription_id, template_key, days_offset, channel
            ):
                logger.info(
                    "notification_service.duplicate_skipped",
                    template_key=template_key,
                    channel=channel,
                    subscription_id=str(subscription_id),
                    days_offset=days_offset,
                )
                return SendResult(
                    template_key=template_key,
                    channel=channel,
                    status="SKIPPED",
                    error="duplicate — already sent",
                )

        # Render template
        rendered_body = self._render(template.body, variables)
        rendered_subject = self._render(template.subject or "", variables)

        # Send
        provider_name: str | None = None
        provider_message_id: str | None = None
        status = NotificationStatus.SENT
        error: str | None = None

        if channel == NotificationChannel.EMAIL:
            if not recipient.email:
                error = "no email address in recipient"
                status = NotificationStatus.FAILED
            else:
                from app.core.config import settings as app_settings
                wrapped_body = wrap_from_settings(
                    rendered_body, company_settings, base_url=app_settings.SITE_URL
                )
                result = self.email_svc.send(
                    to_email=recipient.email,
                    subject=rendered_subject,
                    html_body=wrapped_body,
                    attachments=attachments,
                    smtp_settings=smtp_settings,
                )
                provider_name = "SMTP"
                if not result.success:
                    status = NotificationStatus.FAILED
                    error = result.error

        elif channel == NotificationChannel.SMS:
            if not recipient.mobile:
                error = "no mobile number in recipient"
                status = NotificationStatus.FAILED
            else:
                result = self.sms_svc.send(
                    mobile_number=recipient.mobile,
                    template_key=template_key,
                    rendered_body=rendered_body,
                    dlt_template_id=template.dlt_template_id,
                    dlt_entity_id=template.dlt_entity_id,
                    sms_settings=sms_settings,
                )
                provider_name = result.provider_name
                provider_message_id = result.provider_message_id
                if not result.success:
                    status = NotificationStatus.FAILED
                    error = result.error
        else:
            error = f"unsupported channel: {channel}"
            status = NotificationStatus.FAILED

        # Log result
        log = self.log_repo.create(
            template_key=template_key,
            channel=channel,
            recipient_email=recipient.email if channel == NotificationChannel.EMAIL else None,
            recipient_mobile=recipient.mobile if channel == NotificationChannel.SMS else None,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            subscription_id=subscription_id,
            days_offset=days_offset,
            provider_name=provider_name,
            provider_message_id=provider_message_id,
            status=status,
            error_message=error,
        )

        if status == NotificationStatus.FAILED:
            logger.warning(
                "notification_service.failed",
                template_key=template_key,
                channel=channel,
                error=error,
            )
        else:
            logger.info(
                "notification_service.sent",
                template_key=template_key,
                channel=channel,
            )

        return SendResult(
            template_key=template_key,
            channel=channel,
            status=status,
            log_id=log.id,
            error=error,
        )

    @staticmethod
    def _render(template: str, variables: dict) -> str:
        """Replace {variable_name} placeholders in the template."""
        if not template:
            return template

        def replacer(m: re.Match) -> str:
            key = m.group(1)
            val = variables.get(key)
            return str(val) if val is not None else m.group(0)

        return _VAR_RE.sub(replacer, template)

    @staticmethod
    def _channel_allowed(template_key: str, channel: str, prefs: Any) -> bool:
        key = (template_key, channel)
        attr = _PREF_MAP.get(key)
        if attr is None:
            return True  # no preference constraint — allow
        return bool(getattr(prefs, attr, True))

    @staticmethod
    def _extract_smtp(settings: Any) -> dict:
        return {
            "is_enabled": settings.email_is_enabled,
            "host": settings.smtp_host,
            "port": settings.smtp_port,
            "username": settings.smtp_username_encrypted,
            "password": settings.smtp_password_encrypted,
            "from_email": settings.smtp_from_email,
            "from_name": settings.smtp_from_name,
            "use_tls": settings.smtp_use_tls,
            "use_ssl": settings.smtp_use_ssl,
        }

    @staticmethod
    def _extract_sms(settings: Any) -> dict:
        return {
            "is_enabled": settings.sms_is_enabled,
            "provider": settings.sms_provider,
            "api_key": settings.sms_api_key_encrypted,
            "client_id": settings.sms_client_id_encrypted,
            "sender_id": settings.sms_sender_id_encrypted,
            "base_url": settings.sms_api_base_url,
            "status_url": settings.sms_status_api_url,
            "entity_id": settings.sms_entity_id_encrypted,
        }
