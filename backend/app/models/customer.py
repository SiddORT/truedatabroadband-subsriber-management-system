import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class CustomerStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DISCONNECTED = "DISCONNECTED"


class Customer(Base, BaseModelMixin):
    """
    One customer record per CLIENT user.

    Email and mobile_number are stored as plain text (not encrypted) so
    server-side ILIKE search works without decryption overhead.
    """

    __tablename__ = "customers"

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

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile_number: Mapped[str] = mapped_column(
        String(15), unique=True, index=True, nullable=False
    )
    alternate_mobile_number: Mapped[str | None] = mapped_column(
        String(15), nullable=True
    )
    # Plain-text email copy for searchability (auth email lives in users table).
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)

    installation_address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    pincode: Mapped[str] = mapped_column(String(10), nullable=False)

    status: Mapped[CustomerStatus] = mapped_column(
        Enum(CustomerStatus, name="customer_status"),
        nullable=False,
        default=CustomerStatus.ACTIVE,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[user_id], lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Customer {self.customer_code} — {self.full_name}>"
