"""Models for the notification framework."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums (string-backed for simple VARCHAR storage)
# ---------------------------------------------------------------------------


class NotificationChannel(str, Enum):
    EMAIL = "EMAIL"
    SMS = "SMS"


class TemplateKey(str, Enum):
    WELCOME_CUSTOMER = "WELCOME_CUSTOMER"
    PASSWORD_RESET = "PASSWORD_RESET"
    OTP_LOGIN = "OTP_LOGIN"
    INVOICE_GENERATED = "INVOICE_GENERATED"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    SUBSCRIPTION_EXPIRING = "SUBSCRIPTION_EXPIRING"
    SUBSCRIPTION_EXPIRED = "SUBSCRIPTION_EXPIRED"
    PLAN_CHANGED = "PLAN_CHANGED"
    SUPPORT_TICKET_CREATED = "SUPPORT_TICKET_CREATED"


class NotificationStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class SmsProvider(str, Enum):
    MSG91 = "MSG91"
    TEXTLOCAL = "TEXTLOCAL"
    TWILIO = "TWILIO"


# ---------------------------------------------------------------------------
# DLT-approved template keys (SMS only)
# ---------------------------------------------------------------------------

DLT_REQUIRED_KEYS = {TemplateKey.WELCOME_CUSTOMER, TemplateKey.OTP_LOGIN, TemplateKey.SUBSCRIPTION_EXPIRING}

# Template-key → default channels mapping
TEMPLATE_CHANNELS: dict[str, list[str]] = {
    TemplateKey.WELCOME_CUSTOMER: [NotificationChannel.SMS, NotificationChannel.EMAIL],
    TemplateKey.OTP_LOGIN: [NotificationChannel.SMS, NotificationChannel.EMAIL],
    TemplateKey.SUBSCRIPTION_EXPIRING: [NotificationChannel.SMS, NotificationChannel.EMAIL],
    TemplateKey.SUBSCRIPTION_EXPIRED: [NotificationChannel.SMS, NotificationChannel.EMAIL],
    TemplateKey.PASSWORD_RESET: [NotificationChannel.EMAIL],
    TemplateKey.INVOICE_GENERATED: [NotificationChannel.EMAIL],
    TemplateKey.PAYMENT_RECEIVED: [NotificationChannel.EMAIL],
    TemplateKey.PLAN_CHANGED: [NotificationChannel.EMAIL],
    TemplateKey.SUPPORT_TICKET_CREATED: [NotificationChannel.EMAIL],
}


# ---------------------------------------------------------------------------
# notification_templates
# ---------------------------------------------------------------------------


class NotificationTemplate(Base):
    """Configurable notification template per channel.

    template_key + channel is unique.
    Body uses {variable_name} placeholders (Python str.format_map style).
    """

    __tablename__ = "notification_templates"
    __table_args__ = (
        UniqueConstraint("template_key", "channel", name="uq_notif_tmpl_key_channel"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_key: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    dlt_template_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dlt_entity_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    approved_variables: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<NotificationTemplate {self.template_key}/{self.channel}>"


# ---------------------------------------------------------------------------
# notification_logs
# ---------------------------------------------------------------------------


class NotificationLog(Base):
    """Append-only log of every notification attempt.

    Unique index on (subscription_id, template_key, days_offset, channel)
    WHERE subscription_id IS NOT NULL prevents duplicate renewal reminders.
    """

    __tablename__ = "notification_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_key: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)

    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)

    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    days_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)

    provider_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="PENDING", index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<NotificationLog {self.template_key}/{self.channel} {self.status}>"


# ---------------------------------------------------------------------------
# notification_preferences
# ---------------------------------------------------------------------------


class NotificationPreference(Base):
    """Per-customer opt-in/out settings. One row per customer (enforced unique)."""

    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    welcome_sms_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    welcome_email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    renewal_sms_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    renewal_email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    invoice_email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    payment_email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    otp_sms_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    otp_email_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<NotificationPreference customer_id={self.customer_id}>"
