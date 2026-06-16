from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.encryption import hash_for_lookup
from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, db: Session):
        super().__init__(User, db)

    def get_by_email(
        self, email: str, *, include_deleted: bool = False
    ) -> User | None:
        """
        Look up a user by their plaintext email address.

        Internally converts the email to a keyed HMAC hash and queries the
        indexed ``email_hash`` column — the encrypted ``email`` column is never
        scanned directly.
        """
        email_hash = hash_for_lookup(email.lower())
        stmt = select(User).where(User.email_hash == email_hash)
        if not include_deleted:
            stmt = stmt.where(User.deleted_at.is_(None))
        return self.db.scalars(stmt).first()
