import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.refresh_token import RefreshToken


class RefreshTokenRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        user_id: uuid.UUID,
        jti: uuid.UUID,
        expires_at: datetime,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> RefreshToken:
        record = RefreshToken(
            user_id=user_id,
            jti=jti,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_by_jti(self, jti: uuid.UUID) -> RefreshToken | None:
        stmt = select(RefreshToken).where(
            RefreshToken.jti == jti,
            RefreshToken.deleted_at.is_(None),
        )
        return self.db.scalars(stmt).first()

    def revoke_by_jti(self, jti: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.jti == jti, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now, updated_at=now)
        )
        self.db.commit()

    def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        now = datetime.now(timezone.utc)
        self.db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.deleted_at.is_(None),
            )
            .values(revoked_at=now, updated_at=now)
        )
        self.db.commit()
