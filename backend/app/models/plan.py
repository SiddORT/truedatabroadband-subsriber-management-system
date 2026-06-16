import enum
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean, Enum, ForeignKey, Index, Integer, Numeric, String, Text, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class DataPolicy(str, enum.Enum):
    UNLIMITED = "UNLIMITED"
    FUP = "FUP"


class BillingCycle(str, enum.Enum):
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    HALF_YEARLY = "HALF_YEARLY"
    ANNUALLY = "ANNUALLY"


class Plan(Base, BaseModelMixin):
    """Broadband plan definition with optional FUP policy."""

    __tablename__ = "plans"

    plan_code: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    speed_mbps: Mapped[int] = mapped_column(Integer, nullable=False)
    data_policy: Mapped[DataPolicy] = mapped_column(
        Enum(DataPolicy, name="data_policy"),
        nullable=False,
        default=DataPolicy.UNLIMITED,
    )
    fup_limit_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # All pricing rows (including soft-deleted); filter in Python / service layer
    pricing: Mapped[list["PlanPricing"]] = relationship(
        "PlanPricing",
        back_populates="plan",
        lazy="select",
        foreign_keys="PlanPricing.plan_id",
    )

    def __repr__(self) -> str:
        return f"<Plan {self.plan_code} — {self.name}>"


class PlanPricing(Base, BaseModelMixin):
    """One pricing row per billing cycle per plan.

    A partial unique index enforces uniqueness among non-deleted rows so that
    a billing cycle can be recreated after a soft delete.
    """

    __tablename__ = "plan_pricing"
    __table_args__ = (
        # Partial unique: active (non-deleted) rows only
        Index(
            "uq_plan_active_billing_cycle",
            "plan_id",
            "billing_cycle",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(BillingCycle, name="billing_cycle"),
        nullable=False,
    )
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    gst_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    plan: Mapped["Plan"] = relationship(
        "Plan", back_populates="pricing", foreign_keys=[plan_id]
    )

    def __repr__(self) -> str:
        return f"<PlanPricing plan_id={self.plan_id} cycle={self.billing_cycle}>"
