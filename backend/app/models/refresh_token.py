import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class RefreshToken(Base, BaseModelMixin):
    """
    Persisted refresh-token session.

    Each login creates one row.  The JWT sent to the client carries the *jti*
    as a claim; the server validates jti existence and non-revocation on every
    /auth/refresh call.  Logout revokes one or all rows for a user.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    jti: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        unique=True,
        index=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")  # type: ignore[name-defined]

    @property
    def is_valid(self) -> bool:
        if self.revoked_at is not None:
            return False
        exp = self.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp > datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<RefreshToken jti={self.jti} user_id={self.user_id}>"
