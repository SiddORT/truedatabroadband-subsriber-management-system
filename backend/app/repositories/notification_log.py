"""Repository for notification logs."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.notification import NotificationLog, NotificationStatus


class NotificationLogRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Duplicate check
    # ------------------------------------------------------------------

    def exists_for_subscription(
        self,
        subscription_id: uuid.UUID,
        template_key: str,
        days_offset: int,
        channel: str,
    ) -> bool:
        """Check if a reminder was already sent (prevents duplicates)."""
        count = self.db.scalar(
            select(func.count()).where(
                NotificationLog.subscription_id == subscription_id,
                NotificationLog.template_key == template_key,
                NotificationLog.days_offset == days_offset,
                NotificationLog.channel == channel,
            )
        )
        return (count or 0) > 0

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create(
        self,
        *,
        template_key: str,
        channel: str,
        recipient_email: str | None = None,
        recipient_mobile: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        subscription_id: uuid.UUID | None = None,
        days_offset: int | None = None,
        provider_name: str | None = None,
        provider_message_id: str | None = None,
        status: str = NotificationStatus.PENDING,
        error_message: str | None = None,
    ) -> NotificationLog:
        log = NotificationLog(
            id=uuid.uuid4(),
            template_key=template_key,
            channel=channel,
            recipient_email=recipient_email,
            recipient_mobile=recipient_mobile,
            entity_type=entity_type,
            entity_id=entity_id,
            subscription_id=subscription_id,
            days_offset=days_offset,
            provider_name=provider_name,
            provider_message_id=provider_message_id,
            status=status,
            error_message=error_message,
            sent_at=datetime.now(timezone.utc) if status == NotificationStatus.SENT else None,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    # ------------------------------------------------------------------
    # List (paginated)
    # ------------------------------------------------------------------

    def list_paginated(
        self,
        page: int = 1,
        page_size: int = 25,
        template_key: str | None = None,
        channel: str | None = None,
        status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[NotificationLog], int]:
        q = select(NotificationLog)
        if template_key:
            q = q.where(NotificationLog.template_key == template_key)
        if channel:
            q = q.where(NotificationLog.channel == channel)
        if status:
            q = q.where(NotificationLog.status == status)
        if date_from:
            q = q.where(NotificationLog.created_at >= date_from)
        if date_to:
            q = q.where(NotificationLog.created_at <= date_to)

        total = self.db.scalar(select(func.count()).select_from(q.subquery())) or 0
        items = list(
            self.db.scalars(
                q.order_by(NotificationLog.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).all()
        )
        return items, total
