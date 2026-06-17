"""CommunicationLog — append-only log of every SMS/Email send attempt."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CommChannel(str, Enum):
    SMS = "SMS"
    EMAIL = "EMAIL"


class CommStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"


class CommunicationLog(Base):
    """One row per send attempt.

    request_payload / response_payload are JSONB with sensitive values masked.
    Never store: api_key, smtp_password, otp_code.
    """

    __tablename__ = "communication_logs"
    __table_args__ = (
        Index("ix_comm_log_provider_msg_id", "provider_message_id"),
        Index("ix_comm_log_status", "status"),
        Index("ix_comm_log_created_at", "created_at"),
        Index("ix_comm_log_channel", "channel"),
        Index("ix_comm_log_template_key", "template_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    template_key: Mapped[str | None] = mapped_column(String(50), nullable=True)

    recipient_mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    provider_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    request_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="PENDING"
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<CommunicationLog {self.channel}/{self.template_key} {self.status}>"
