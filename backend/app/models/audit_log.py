import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
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

# Plan domain
ACTION_PLAN_CREATED = "plan_created"
ACTION_PLAN_UPDATED = "plan_updated"
ACTION_PRICING_CREATED = "pricing_created"
ACTION_PRICING_UPDATED = "pricing_updated"
ACTION_PRICING_DELETED = "pricing_deleted"

# Subscription domain
ACTION_SUBSCRIPTION_CREATED = "subscription_created"
ACTION_SUBSCRIPTION_RENEWED = "subscription_renewed"
ACTION_SUBSCRIPTION_STATUS_CHANGED = "subscription_status_changed"
ACTION_SUBSCRIPTION_PLAN_CHANGED = "subscription_plan_changed"

# Settings domain
ACTION_SETTINGS_UPDATED = "settings_updated"
ACTION_SETTINGS_LOGO_UPLOADED = "settings_logo_uploaded"

# Invoice domain
ACTION_INVOICE_CREATED = "invoice_created"
ACTION_INVOICE_UPDATED = "invoice_updated"
ACTION_INVOICE_LOCKED = "invoice_locked"
ACTION_INVOICE_CANCELLED = "invoice_cancelled"

# Payment domain
ACTION_PAYMENT_RECORDED = "payment_recorded"


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
    # Nullable so records survive even if the user is later soft-deleted.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} user_id={self.user_id}>"
