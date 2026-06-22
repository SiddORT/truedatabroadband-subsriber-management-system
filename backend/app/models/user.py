import uuid
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.encryption import EncryptedString, hash_for_lookup
from app.models.base import BaseModelMixin


class UserRole(str, enum.Enum):
    SUPERADMIN = "SUPERADMIN"
    STAFF = "STAFF"
    CLIENT = "CLIENT"


class User(Base, BaseModelMixin):
    __tablename__ = "users"

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

    # Staff-specific fields
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invite_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invite_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    invite_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(  # type: ignore[name-defined]
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
    staff_role: Mapped["Role | None"] = relationship(  # type: ignore[name-defined]
        "Role",
        back_populates="users",
        foreign_keys=[role_id],
        lazy="select",
    )

    @property
    def staff_role_name(self) -> "str | None":
        return self.staff_role.name if self.staff_role else None

    @property
    def staff_permissions(self) -> "dict | None":
        return self.staff_role.permissions if self.staff_role else None

    @property
    def invite_status(self) -> str:
        if not self.is_active:
            return "INACTIVE"
        if self.invite_accepted_at is not None:
            return "ACTIVE"
        if self.invite_token is not None:
            return "INVITED"
        return "ACTIVE"

    def __repr__(self) -> str:
        return f"<User {self.email} ({self.role})>"


def _sync_email_hash(mapper: object, connection: object, target: User) -> None:  # noqa: ARG001
    if target.email is not None:
        target.email_hash = hash_for_lookup(target.email)


event.listen(User, "before_insert", _sync_email_hash)
event.listen(User, "before_update", _sync_email_hash)
