"""Repository for admin in-app notifications."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.admin_notification import AdminNotification


class AdminNotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, notif: AdminNotification) -> AdminNotification:
        self.db.add(notif)
        self.db.commit()
        self.db.refresh(notif)
        return notif

    def create_bulk(self, notifs: list[AdminNotification]) -> None:
        for n in notifs:
            self.db.add(n)
        self.db.commit()

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        skip: int = 0,
        limit: int = 10,
    ) -> tuple[list[AdminNotification], int, int]:
        stmt = select(AdminNotification).where(
            AdminNotification.user_id == user_id
        )
        total = self.db.scalar(
            select(func.count()).select_from(stmt.subquery())
        ) or 0
        unread = self.db.scalar(
            select(func.count()).where(
                AdminNotification.user_id == user_id,
                AdminNotification.is_read.is_(False),
            )
        ) or 0
        items = list(
            self.db.scalars(
                stmt.order_by(AdminNotification.created_at.desc())
                .offset(skip)
                .limit(limit)
            ).all()
        )
        return items, total, unread

    def get_by_id(
        self, notif_id: uuid.UUID, user_id: uuid.UUID
    ) -> AdminNotification | None:
        return self.db.scalars(
            select(AdminNotification).where(
                AdminNotification.id == notif_id,
                AdminNotification.user_id == user_id,
            )
        ).first()

    def mark_read(self, notif: AdminNotification) -> AdminNotification:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(notif)
        return notif

    def mark_all_read(self, user_id: uuid.UUID) -> int:
        result = self.db.execute(
            update(AdminNotification)
            .where(
                AdminNotification.user_id == user_id,
                AdminNotification.is_read.is_(False),
            )
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        self.db.commit()
        return result.rowcount

    def unread_count(self, user_id: uuid.UUID) -> int:
        return self.db.scalar(
            select(func.count()).where(
                AdminNotification.user_id == user_id,
                AdminNotification.is_read.is_(False),
            )
        ) or 0
