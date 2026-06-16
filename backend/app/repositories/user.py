from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, db: Session):
        super().__init__(User, db)

    def get_by_email(
        self, email: str, *, include_deleted: bool = False
    ) -> User | None:
        stmt = select(User).where(User.email == email.lower())
        if not include_deleted:
            stmt = stmt.where(User.deleted_at.is_(None))
        return self.db.scalars(stmt).first()
