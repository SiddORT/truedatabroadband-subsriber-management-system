"""Invoice and InvoiceChangeLog models."""

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class InvoiceStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    UNPAID = "UNPAID"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"


class ChangeType(str, enum.Enum):
    CREATED = "CREATED"
    UPDATED = "UPDATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    LOCKED = "LOCKED"
    CANCELLED = "CANCELLED"
    PDF_REGENERATED = "PDF_REGENERATED"


class Invoice(Base, BaseModelMixin):
    """
    Immutable financial document once locked.

    All customer, company, plan and pricing data are stored as snapshots
    so historical invoices are unaffected by future record changes.
    """

    __tablename__ = "invoices"

    # ── Identifiers ────────────────────────────────────────────────────────
    invoice_number: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # ── Versioning / locking ───────────────────────────────────────────────
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    edited_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Replacement invoice link (set when this invoice is a replacement)
    original_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Company snapshots ──────────────────────────────────────────────────
    company_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gst_number_snapshot: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pan_number_snapshot: Mapped[str | None] = mapped_column(String(10), nullable=True)
    support_email_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    support_phone_snapshot: Mapped[str | None] = mapped_column(String(20), nullable=True)
    company_address_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoice_footer_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Customer snapshots ─────────────────────────────────────────────────
    customer_code_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    customer_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)

    # ── Connection snapshots ───────────────────────────────────────────────
    connection_name_snapshot: Mapped[str] = mapped_column(String(50), nullable=False)
    installation_address_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Plan snapshots ─────────────────────────────────────────────────────
    plan_code_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    plan_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    speed_mbps_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    data_policy_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    fup_limit_gb_snapshot: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Pricing snapshots ──────────────────────────────────────────────────
    billing_cycle_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    gst_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # ── Payment tracking ───────────────────────────────────────────────────
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    balance_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # ── Billing period ─────────────────────────────────────────────────────
    billing_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    billing_period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # ── Dates ──────────────────────────────────────────────────────────────
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    # ── Status ─────────────────────────────────────────────────────────────
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"),
        nullable=False,
        default=InvoiceStatus.DRAFT,
    )

    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────
    subscription: Mapped["Subscription"] = relationship(  # type: ignore[name-defined]
        "Subscription", foreign_keys=[subscription_id], lazy="select"
    )
    payments: Mapped[list["Payment"]] = relationship(  # type: ignore[name-defined]
        "Payment",
        back_populates="invoice",
        lazy="select",
        foreign_keys="Payment.invoice_id",
    )
    change_logs: Mapped[list["InvoiceChangeLog"]] = relationship(
        "InvoiceChangeLog",
        back_populates="invoice",
        lazy="select",
        foreign_keys="InvoiceChangeLog.invoice_id",
    )

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} status={self.status}>"


class InvoiceChangeLog(Base):
    """Append-only audit trail for every change to an invoice."""

    __tablename__ = "invoice_change_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    change_type: Mapped[ChangeType] = mapped_column(
        Enum(ChangeType, name="invoice_change_type"),
        nullable=False,
    )
    old_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    invoice: Mapped["Invoice"] = relationship(
        "Invoice", back_populates="change_logs", foreign_keys=[invoice_id]
    )

    def __repr__(self) -> str:
        return f"<InvoiceChangeLog {self.change_type} invoice={self.invoice_id}>"
