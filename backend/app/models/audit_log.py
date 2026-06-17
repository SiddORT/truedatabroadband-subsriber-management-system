import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Supported audit actions — stored as plain strings for flexibility.
ACTION_LOGIN = "login"
ACTION_LOGOUT = "logout"
ACTION_PASSWORD_CHANGE = "password_change"

# Customer domain
ACTION_CUSTOMER_CREATED = "customer_created"
ACTION_CUSTOMER_UPDATED = "customer_updated"
ACTION_CUSTOMER_STATUS_CHANGED = "customer_status_changed"
ACTION_CUSTOMER_PASSWORD_RESET = "customer_password_reset"
ACTION_CUSTOMER_DELETED = "customer_deleted"

# Plan domain
ACTION_PLAN_CREATED = "plan_created"
ACTION_PLAN_UPDATED = "plan_updated"
ACTION_PLAN_DELETED = "plan_deleted"
ACTION_PRICING_CREATED = "pricing_created"
ACTION_PRICING_UPDATED = "pricing_updated"
ACTION_PRICING_DELETED = "pricing_deleted"

# Subscription domain
ACTION_SUBSCRIPTION_CREATED = "subscription_created"
ACTION_SUBSCRIPTION_RENEWED = "subscription_renewed"
ACTION_SUBSCRIPTION_STATUS_CHANGED = "subscription_status_changed"
ACTION_SUBSCRIPTION_PLAN_CHANGED = "subscription_plan_changed"
ACTION_SUBSCRIPTION_DELETED = "subscription_deleted"

# Settings domain
ACTION_SETTINGS_UPDATED = "settings_updated"
ACTION_SETTINGS_LOGO_UPLOADED = "settings_logo_uploaded"

# Invoice domain
ACTION_INVOICE_CREATED = "invoice_created"
ACTION_INVOICE_UPDATED = "invoice_updated"
ACTION_INVOICE_EDITED = "invoice_edited"
ACTION_INVOICE_PDF_REGENERATED = "invoice_pdf_regenerated"
ACTION_INVOICE_GENERATION_REJECTED = "invoice_generation_rejected"
ACTION_DUPLICATE_INVOICE_BLOCKED = "duplicate_invoice_blocked"
ACTION_INVOICE_LOCKED = "invoice_locked"
ACTION_INVOICE_CANCELLED = "invoice_cancelled"
ACTION_INVOICE_DELETED = "invoice_deleted"
ACTION_INVOICE_EMAILED = "invoice_emailed"

# Payment domain
ACTION_PAYMENT_RECORDED = "payment_recorded"
ACTION_PAYMENT_DELETED = "payment_deleted"

# Dashboard domain
ACTION_DASHBOARD_VIEWED = "dashboard_viewed"

# Reports domain
ACTION_REPORT_VIEWED = "report_viewed"
ACTION_REPORT_EXPORTED = "report_exported"

# Notifications domain
ACTION_NOTIFICATION_TEMPLATE_UPDATED = "notification_template_updated"
ACTION_NOTIFICATION_TEST_EMAIL_SENT = "test_email_sent"
ACTION_NOTIFICATION_TEST_SMS_SENT = "test_sms_sent"
ACTION_NOTIFICATION_SENT = "notification_sent"
ACTION_NOTIFICATION_FAILED = "notification_failed"

# Client portal domain
ACTION_CLIENT_LOGIN = "client_login"
ACTION_CLIENT_LOGOUT = "client_logout"
ACTION_CLIENT_LOGOUT_ALL = "client_logout_all"
ACTION_CLIENT_PROFILE_UPDATED = "client_profile_updated"
ACTION_CLIENT_SESSION_REVOKED = "client_session_revoked"
ACTION_CLIENT_UNAUTHORIZED_ACCESS = "unauthorized_client_access_attempt"

# Communication / OTP domain
ACTION_SMS_SETTINGS_UPDATED = "sms_settings_updated"
ACTION_EMAIL_SETTINGS_UPDATED = "email_settings_updated"
ACTION_SMS_SENT = "sms_sent"
ACTION_SMS_FAILED = "sms_failed"
ACTION_SMS_DELIVERED = "sms_delivered"
ACTION_EMAIL_SENT = "email_sent"
ACTION_EMAIL_FAILED = "email_failed"
ACTION_OTP_REQUESTED = "otp_requested"
ACTION_OTP_SENT = "otp_sent"
ACTION_OTP_VERIFIED = "otp_verified"
ACTION_OTP_FAILED = "otp_failed"


def derive_module(action: str) -> str:
    """Derive the logical module name from an action string."""
    if action.startswith("client_"):
        return "CLIENT"
    if action == "unauthorized_client_access_attempt":
        return "CLIENT"
    if action in ("login", "logout") or "password" in action:
        return "AUTH"
    if action.startswith("customer"):
        return "CUSTOMERS"
    if action.startswith("plan") or action.startswith("pricing"):
        return "PLANS"
    if action.startswith("subscription"):
        return "SUBSCRIPTIONS"
    if action.startswith("settings") or action.startswith("logo"):
        return "SETTINGS"
    if action.startswith("invoice") or action.startswith("duplicate_invoice"):
        return "INVOICES"
    if action.startswith("payment"):
        return "PAYMENTS"
    if action.startswith("report"):
        return "REPORTS"
    if action.startswith("dashboard"):
        return "DASHBOARD"
    if action.startswith("notification") or action in ("test_email_sent", "test_sms_sent"):
        return "NOTIFICATIONS"
    return "SYSTEM"


class AuditLog(Base):
    """
    Immutable audit trail for security-sensitive events.

    Rows are never updated or deleted — append-only by convention.
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    # Module classification (AUTH, CUSTOMERS, PLANS, …)
    module: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    # Action performed
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Entity this action touched
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    entity_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Who performed the action — nullable so records survive user soft-delete.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    performed_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Request metadata
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Change tracking (JSONB — only changed fields stored)
    old_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Free-form note
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} user_id={self.user_id}>"
