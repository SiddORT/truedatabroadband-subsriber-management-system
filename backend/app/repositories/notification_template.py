"""Repository for notification templates."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import NotificationTemplate


class NotificationTemplateRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_all(self) -> list[NotificationTemplate]:
        return list(self.db.scalars(select(NotificationTemplate).order_by(
            NotificationTemplate.template_key, NotificationTemplate.channel
        )).all())

    def get(self, template_id: uuid.UUID) -> NotificationTemplate | None:
        return self.db.get(NotificationTemplate, template_id)

    def get_by_key_and_channel(
        self, template_key: str, channel: str
    ) -> NotificationTemplate | None:
        return self.db.scalars(
            select(NotificationTemplate).where(
                NotificationTemplate.template_key == template_key,
                NotificationTemplate.channel == channel,
            )
        ).first()

    def list_by_key(self, template_key: str, active_only: bool = True) -> list[NotificationTemplate]:
        q = select(NotificationTemplate).where(NotificationTemplate.template_key == template_key)
        if active_only:
            q = q.where(NotificationTemplate.is_active.is_(True))
        return list(self.db.scalars(q).all())

    def update(self, template: NotificationTemplate, data: dict) -> NotificationTemplate:
        for field, value in data.items():
            setattr(template, field, value)
        self.db.commit()
        self.db.refresh(template)
        return template

    def upsert(self, template_key: str, channel: str, **kwargs: object) -> NotificationTemplate:
        """Create or update a template by key+channel. Used by seed."""
        existing = self.get_by_key_and_channel(template_key, channel)
        if existing is not None:
            return existing  # preserve any admin edits
        tmpl = NotificationTemplate(
            id=uuid.uuid4(),
            template_key=template_key,
            channel=channel,
            **kwargs,
        )
        self.db.add(tmpl)
        self.db.commit()
        self.db.refresh(tmpl)
        return tmpl
