import enum
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    SUSPENDED = "SUSPENDED"
    CANCELLED = "CANCELLED"


class Subscription(Base, BaseModelMixin):
    """
    A subscription links a customer to a specific plan pricing tier.

    Snapshot fields capture the pricing at creation time so historical
    records are unaffected when plans or pricing rows are later edited.
    """

    __tablename__ = "subscriptions"

    subscription_code: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    plan_pricing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_pricing.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # ── Pricing snapshots (immutable after creation) ──────────────────────────
    plan_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    plan_code_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    speed_mbps_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    billing_cycle_snapshot: Mapped[str] = mapped_column(String(20), nullable=False)
    base_price_snapshot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    gst_percentage_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    total_price_snapshot: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # ── Dates ─────────────────────────────────────────────────────────────────
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    renewal_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)

    # ── Status ────────────────────────────────────────────────────────────────
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status"),
        nullable=False,
        default=SubscriptionStatus.ACTIVE,
    )

    connection_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    installation_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ────────────────────────────────────────────────────────
    customer: Mapped["Customer"] = relationship(  # type: ignore[name-defined]
        "Customer", foreign_keys=[customer_id], lazy="select"
    )
    plan: Mapped["Plan"] = relationship(  # type: ignore[name-defined]
        "Plan", foreign_keys=[plan_id], lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Subscription {self.subscription_code} customer={self.customer_id}>"
