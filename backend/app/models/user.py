import uuid
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.encryption import EncryptedString, hash_for_lookup
from app.models.base import BaseModelMixin


class UserRole(str, enum.Enum):
    SUPERADMIN = "SUPERADMIN"
    CLIENT = "CLIENT"


class User(Base, BaseModelMixin):
    __tablename__ = "users"

    # email is stored encrypted; email_hash is a keyed HMAC-SHA256 used for
    # indexed lookups so we never need to scan and decrypt all rows.
    email: Mapped[str] = mapped_column(EncryptedString, nullable=False)
    email_hash: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.CLIENT,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(  # type: ignore[name-defined]
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


# ---------------------------------------------------------------------------
# Auto-compute email_hash before insert/update so callers only set .email
# ---------------------------------------------------------------------------

def _sync_email_hash(mapper: object, connection: object, target: User) -> None:  # noqa: ARG001
    if target.email is not None:
        target.email_hash = hash_for_lookup(target.email)


event.listen(User, "before_insert", _sync_email_hash)
event.listen(User, "before_update", _sync_email_hash)
