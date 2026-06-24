"""Repository for LineItemMaster CRUD."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.line_item_master import LineItemMaster


class LineItemMasterRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, item_id: uuid.UUID) -> LineItemMaster | None:
        return self.db.scalar(
            select(LineItemMaster).where(
                LineItemMaster.id == item_id,
                LineItemMaster.deleted_at.is_(None),
            )
        )

    def list_paginated(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        search: str = "",
        active_only: bool = False,
    ) -> tuple[list[LineItemMaster], int]:
        stmt = select(LineItemMaster).where(LineItemMaster.deleted_at.is_(None))
        if active_only:
            stmt = stmt.where(LineItemMaster.is_active.is_(True))
        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    LineItemMaster.name.ilike(term),
                    LineItemMaster.hsn_sac_code.ilike(term),
                    LineItemMaster.description.ilike(term),
                )
            )
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total: int = self.db.scalar(count_stmt) or 0
        items = list(
            self.db.scalars(
                stmt.order_by(LineItemMaster.name).offset((page - 1) * page_size).limit(page_size)
            )
        )
        return items, total

    def create(self, **kwargs) -> LineItemMaster:
        item = LineItemMaster(**kwargs)
        self.db.add(item)
        self.db.flush()
        self.db.refresh(item)
        return item

    def update(self, item: LineItemMaster, **kwargs) -> LineItemMaster:
        for k, v in kwargs.items():
            setattr(item, k, v)
        self.db.flush()
        self.db.refresh(item)
        return item

    def soft_delete(self, item: LineItemMaster) -> None:
        from datetime import datetime, timezone
        item.deleted_at = datetime.now(timezone.utc)
        self.db.flush()
