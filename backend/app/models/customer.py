import enum
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class CustomerStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DISCONNECTED = "DISCONNECTED"


class CustomerType(str, enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    BUSINESS = "BUSINESS"


class KycType(str, enum.Enum):
    AADHAAR = "AADHAAR"
    PAN = "PAN"
    PASSPORT = "PASSPORT"
    VOTER_ID = "VOTER_ID"
    DRIVING_LICENSE = "DRIVING_LICENSE"


class Customer(Base, BaseModelMixin):
    """
    Full customer record linked to a CLIENT user account.

    Email and mobile numbers are plain text (not encrypted) so server-side
    ILIKE search works efficiently.
    """

    __tablename__ = "customers"

    # ── Linked user ─────────────────────────────────────────────────────────
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
        index=True,
    )
    customer_code: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )

    # ── Customer type ────────────────────────────────────────────────────────
    customer_type: Mapped[CustomerType] = mapped_column(
        Enum(CustomerType, name="customer_type"),
        nullable=False,
        default=CustomerType.INDIVIDUAL,
    )
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # ── Basic information ────────────────────────────────────────────────────
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile_number: Mapped[str] = mapped_column(
        String(15), unique=True, index=True, nullable=False
    )
    alternate_mobile_number: Mapped[str | None] = mapped_column(String(15), nullable=True)
    # Plain-text email for searchability (auth email lives encrypted in users).
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)

    # ── Identity / KYC ───────────────────────────────────────────────────────
    kyc_type: Mapped[KycType | None] = mapped_column(
        Enum(KycType, name="kyc_type"), nullable=True
    )
    kyc_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # ── Installation address ─────────────────────────────────────────────────
    installation_address: Mapped[str] = mapped_column(Text, nullable=False)
    address_line_2: Mapped[str | None] = mapped_column(Text, nullable=True)
    landmark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pincode: Mapped[str] = mapped_column(String(10), nullable=False)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)

    # ── Billing address ──────────────────────────────────────────────────────
    billing_same_as_installation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    billing_address_line_1: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_address_line_2: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_landmark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    billing_district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    billing_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    billing_state: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Spokesperson ─────────────────────────────────────────────────────────
    spokesperson_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    spokesperson_mobile: Mapped[str | None] = mapped_column(String(15), nullable=True)
    spokesperson_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    spokesperson_designation: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Additional information ───────────────────────────────────────────────
    connection_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sales_person: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Status ───────────────────────────────────────────────────────────────
    status: Mapped[CustomerStatus] = mapped_column(
        Enum(CustomerStatus, name="customer_status"),
        nullable=False,
        default=CustomerStatus.ACTIVE,
    )

    # ── Documents (storage-service keys, not absolute paths) ─────────────────
    profile_photo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    kyc_document_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    agreement_document_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Staff assignment ─────────────────────────────────────────────────────
    assigned_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reference_partner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # ── Relationships ────────────────────────────────────────────────────────
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[user_id], lazy="select"
    )
    assigned_staff: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[assigned_staff_id], lazy="select"
    )
    reference_partner: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[reference_partner_id], lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Customer {self.customer_code} — {self.full_name}>"
