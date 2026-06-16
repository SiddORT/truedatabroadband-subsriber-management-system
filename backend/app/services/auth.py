from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
)
from app.models.user import User
from app.repositories.user import UserRepository


class AuthError(Exception):
    """Raised when authentication fails."""


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def authenticate(self, email: str, password: str) -> User:
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Invalid email or password")
        if not user.is_active:
            raise AuthError("Account is inactive")

        user.last_login_at = datetime.now(timezone.utc)
        self.users.update(user)
        return user

    @staticmethod
    def issue_tokens(user: User) -> tuple[str, str]:
        return (
            create_access_token(str(user.id)),
            create_refresh_token(str(user.id)),
        )
