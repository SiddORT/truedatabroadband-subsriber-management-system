"""Payment model — records cash receipts against invoices."""

import enum
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    UPI = "UPI"
    BANK_TRANSFER = "BANK_TRANSFER"
    CHEQUE = "CHEQUE"


class Payment(Base, BaseModelMixin):
    """A single payment receipt applied to an invoice."""

    __tablename__ = "payments"

    payment_number: Mapped[str] = mapped_column(
        String(30), unique=True, index=True, nullable=False
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method"),
        nullable=False,
        default=PaymentMethod.CASH,
    )
    transaction_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────
    invoice: Mapped["Invoice"] = relationship(  # type: ignore[name-defined]
        "Invoice", back_populates="payments", foreign_keys=[invoice_id]
    )

    def __repr__(self) -> str:
        return f"<Payment {self.payment_number} amount={self.amount}>"
