"""Repository for customer notification preferences."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import NotificationPreference


class NotificationPreferenceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_customer(self, customer_id: uuid.UUID) -> NotificationPreference | None:
        return self.db.scalars(
            select(NotificationPreference).where(
                NotificationPreference.customer_id == customer_id
            )
        ).first()

    def get_or_create(self, customer_id: uuid.UUID) -> NotificationPreference:
        pref = self.get_by_customer(customer_id)
        if pref is not None:
            return pref
        pref = NotificationPreference(id=uuid.uuid4(), customer_id=customer_id)
        self.db.add(pref)
        self.db.commit()
        self.db.refresh(pref)
        return pref

    def update(self, pref: NotificationPreference, data: dict) -> NotificationPreference:
        for field, value in data.items():
            setattr(pref, field, value)
        self.db.commit()
        self.db.refresh(pref)
        return pref
