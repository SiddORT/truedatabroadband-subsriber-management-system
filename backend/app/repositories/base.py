import uuid
from datetime import datetime, timezone
from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """Generic repository with soft-delete aware helpers."""

    def __init__(self, model: type[ModelType], db: Session):
        self.model = model
        self.db = db

    def get(self, id: uuid.UUID, *, include_deleted: bool = False) -> ModelType | None:
        stmt = select(self.model).where(self.model.id == id)
        if not include_deleted:
            stmt = stmt.where(self.model.deleted_at.is_(None))
        return self.db.scalars(stmt).first()

    def list(
        self,
        *,
        skip: int = 0,
        limit: int = 10,
        include_deleted: bool = False,
    ) -> list[ModelType]:
        stmt = select(self.model)
        if not include_deleted:
            stmt = stmt.where(self.model.deleted_at.is_(None))
        stmt = stmt.offset(skip).limit(limit)
        return list(self.db.scalars(stmt).all())

    def add(self, obj: ModelType) -> ModelType:
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def update(self, obj: ModelType) -> ModelType:
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def soft_delete(self, obj: ModelType) -> ModelType:
        """Soft delete only — never physically remove rows."""
        obj.deleted_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(obj)
        return obj
