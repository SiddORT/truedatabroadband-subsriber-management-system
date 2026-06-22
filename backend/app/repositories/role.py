"""Repository for Role model."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.role import Role
from app.models.user import User, UserRole
from app.repositories.base import BaseRepository


class RoleRepository(BaseRepository[Role]):
    def __init__(self, db: Session):
        super().__init__(Role, db)

    def get_by_name(self, name: str) -> Role | None:
        stmt = (
            select(Role)
            .where(Role.name == name)
            .where(Role.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def list_all(self, *, include_inactive: bool = False) -> list[Role]:
        stmt = select(Role).where(Role.deleted_at.is_(None))
        if not include_inactive:
            stmt = stmt.where(Role.is_active.is_(True))
        stmt = stmt.order_by(Role.name)
        return list(self.db.scalars(stmt).all())

    def count_users(self, role_id: object) -> int:
        stmt = (
            select(func.count())
            .select_from(User)
            .where(User.role_id == role_id)
            .where(User.deleted_at.is_(None))
            .where(User.role == UserRole.STAFF)
        )
        return self.db.scalar(stmt) or 0
