"""Single-record company configuration used by invoice generation and PDFs."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.encryption import EncryptedString


class CompanySettings(Base):
    """Singleton table — at most one row ever exists.

    Enforced at the application layer (repository raises if a second create
    is attempted) and guarded by a unique index on a constant column.
    """

    __tablename__ = "company_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # ── Company Information ────────────────────────────────────────────────
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(10), nullable=True)
    support_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    support_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ── Address ────────────────────────────────────────────────────────────
    address_line_1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    landmark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    country: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default="India"
    )

    # ── Branding ───────────────────────────────────────────────────────────
    logo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Invoice Preferences ────────────────────────────────────────────────
    invoice_prefix: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="TDB-INV"
    )
    invoice_due_days: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="7"
    )
    default_gst_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="18.00"
    )
    invoice_footer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms_and_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Bank / Payment Details ──────────────────────────────────────────────
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ifsc_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    upi_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── SMS Provider ────────────────────────────────────────────────────────
    sms_is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    sms_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sms_api_base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sms_status_api_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Encrypted — decrypted only in memory, never exposed via API
    sms_api_key_encrypted: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    sms_client_id_encrypted: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    sms_sender_id_encrypted: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    sms_entity_id_encrypted: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)

    # ── SMTP / Email ─────────────────────────────────────────────────────────
    email_is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    smtp_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default="587"
    )
    smtp_from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    smtp_use_ssl: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    # Encrypted credentials
    smtp_username_encrypted: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    smtp_password_encrypted: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)

    # ── Audit timestamps ───────────────────────────────────────────────────
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
        return f"<CompanySettings company_name={self.company_name!r}>"
