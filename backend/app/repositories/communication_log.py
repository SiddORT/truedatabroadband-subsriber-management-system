"""Repository for communication logs."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.communication_log import CommunicationLog, CommStatus


class CommunicationLogRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        channel: str,
        template_key: str | None = None,
        recipient_mobile: str | None = None,
        recipient_email: str | None = None,
        provider_name: str | None = None,
        provider_message_id: str | None = None,
        request_payload: dict | None = None,
        response_payload: dict | None = None,
        status: str = CommStatus.PENDING,
        error_message: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
    ) -> CommunicationLog:
        log = CommunicationLog(
            id=uuid.uuid4(),
            channel=channel,
            template_key=template_key,
            recipient_mobile=recipient_mobile,
            recipient_email=recipient_email,
            provider_name=provider_name,
            provider_message_id=provider_message_id,
            request_payload=request_payload,
            response_payload=response_payload,
            status=status,
            error_message=error_message,
            entity_type=entity_type,
            entity_id=entity_id,
            sent_at=datetime.now(timezone.utc) if status == CommStatus.SENT else None,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get(self, log_id: uuid.UUID) -> CommunicationLog | None:
        return self.db.get(CommunicationLog, log_id)

    def update_status(
        self,
        log: CommunicationLog,
        status: str,
        response_payload: dict | None = None,
        delivered_at: datetime | None = None,
    ) -> CommunicationLog:
        log.status = status
        if response_payload is not None:
            log.response_payload = response_payload
        if delivered_at is not None:
            log.delivered_at = delivered_at
        elif status == CommStatus.DELIVERED and log.delivered_at is None:
            log.delivered_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(log)
        return log

    def list_pending_sms(self, limit: int = 100) -> list[CommunicationLog]:
        """Return PENDING SMS logs that have a provider_message_id for polling."""
        return list(
            self.db.scalars(
                select(CommunicationLog)
                .where(
                    CommunicationLog.channel == "SMS",
                    CommunicationLog.status == CommStatus.PENDING,
                    CommunicationLog.provider_message_id.isnot(None),
                )
                .order_by(CommunicationLog.created_at.asc())
                .limit(limit)
            ).all()
        )

    def list_paginated(
        self,
        page: int = 1,
        page_size: int = 25,
        channel: str | None = None,
        template_key: str | None = None,
        status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[CommunicationLog], int]:
        q = select(CommunicationLog)
        if channel:
            q = q.where(CommunicationLog.channel == channel)
        if template_key:
            q = q.where(CommunicationLog.template_key == template_key)
        if status:
            q = q.where(CommunicationLog.status == status)
        if date_from:
            q = q.where(CommunicationLog.created_at >= date_from)
        if date_to:
            q = q.where(CommunicationLog.created_at <= date_to)

        total = self.db.scalar(select(func.count()).select_from(q.subquery())) or 0
        items = list(
            self.db.scalars(
                q.order_by(CommunicationLog.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return items, total
