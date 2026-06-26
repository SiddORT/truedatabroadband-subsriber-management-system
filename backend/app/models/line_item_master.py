"""LineItemMaster — reusable charge templates for invoices."""

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import BaseModelMixin

GST_RATES = [Decimal("0"), Decimal("5"), Decimal("12"), Decimal("18"), Decimal("28")]


class LineItemMaster(Base, BaseModelMixin):
    __tablename__ = "line_item_masters"

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    hsn_sac_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    gst_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("18")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
