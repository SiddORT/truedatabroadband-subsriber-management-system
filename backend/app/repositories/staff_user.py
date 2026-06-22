"""Repository for Staff (STAFF-role) Users."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.encryption import hash_for_lookup
from app.models.user import User, UserRole
from app.repositories.base import BaseRepository


class StaffUserRepository(BaseRepository[User]):
    def __init__(self, db: Session):
        super().__init__(User, db)

    def get_by_email(self, email: str) -> User | None:
        email_hash = hash_for_lookup(email.lower())
        stmt = (
            select(User)
            .where(User.email_hash == email_hash)
            .where(User.role == UserRole.STAFF)
            .where(User.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def get_by_invite_token(self, token: str) -> User | None:
        stmt = (
            select(User)
            .where(User.invite_token == token)
            .where(User.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def list_staff(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        role_id: object = None,
    ) -> tuple[list[User], int]:
        base = (
            select(User)
            .where(User.role == UserRole.STAFF)
            .where(User.deleted_at.is_(None))
        )
        if search:
            pattern = f"%{search}%"
            base = base.where(
                or_(
                    User.display_name.ilike(pattern),
                    User.email_hash.in_(
                        select(User.email_hash).where(User.display_name.ilike(pattern))
                    ),
                )
            )
        if role_id is not None:
            base = base.where(User.role_id == role_id)

        count_stmt = select(func.count()).select_from(base.subquery())
        total = self.db.scalar(count_stmt) or 0
        items = list(
            self.db.scalars(base.order_by(User.created_at.desc()).offset(skip).limit(limit)).all()
        )
        return items, total
