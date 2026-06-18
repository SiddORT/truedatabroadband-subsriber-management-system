"""Support ticket domain models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class TicketCategory(str, enum.Enum):
    NO_INTERNET = "NO_INTERNET"
    SLOW_SPEED = "SLOW_SPEED"
    BILLING_ISSUE = "BILLING_ISSUE"
    PLAN_CHANGE = "PLAN_CHANGE"
    TECHNICAL_ISSUE = "TECHNICAL_ISSUE"
    OTHER = "OTHER"


class TicketPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TicketStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_CUSTOMER = "WAITING_FOR_CUSTOMER"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


# Valid status transitions — admin can move to any non-closed state from any non-closed state
_ALL_OPEN = [
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_CUSTOMER,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
]
ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    TicketStatus.OPEN: [TicketStatus.IN_PROGRESS, TicketStatus.WAITING_FOR_CUSTOMER, TicketStatus.RESOLVED, TicketStatus.CLOSED],
    TicketStatus.IN_PROGRESS: [TicketStatus.OPEN, TicketStatus.WAITING_FOR_CUSTOMER, TicketStatus.RESOLVED, TicketStatus.CLOSED],
    TicketStatus.WAITING_FOR_CUSTOMER: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED],
    TicketStatus.RESOLVED: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
    TicketStatus.CLOSED: [],
}


class SupportTicket(Base, BaseModelMixin):
    __tablename__ = "support_tickets"

    ticket_number: Mapped[str] = mapped_column(
        String(20), unique=True, index=True, nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="MEDIUM", index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="OPEN", index=True
    )
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    messages: Mapped[list[TicketMessage]] = relationship(
        "TicketMessage", back_populates="ticket", order_by="TicketMessage.created_at"
    )

    def __repr__(self) -> str:
        return f"<SupportTicket {self.ticket_number} status={self.status}>"


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    ticket: Mapped[SupportTicket] = relationship(
        "SupportTicket", back_populates="messages"
    )
    attachments: Mapped[list[TicketAttachment]] = relationship(
        "TicketAttachment", back_populates="message", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<TicketMessage ticket_id={self.ticket_id} internal={self.is_internal_note}>"


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ticket_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    message: Mapped[TicketMessage] = relationship(
        "TicketMessage", back_populates="attachments"
    )

    def __repr__(self) -> str:
        return f"<TicketAttachment {self.original_filename}>"
