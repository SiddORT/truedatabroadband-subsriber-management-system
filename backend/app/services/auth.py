import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    REFRESH_TOKEN_TYPE,
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.user import User
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository


class AuthError(Exception):
    """Raised when authentication or token validation fails."""


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.tokens = RefreshTokenRepository(db)

    # ------------------------------------------------------------------
    # Login
    # ------------------------------------------------------------------

    def authenticate(self, email: str, password: str) -> User:
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Invalid email or password")
        if not user.is_active:
            raise AuthError("Account is inactive")

        user.last_login_at = datetime.now(timezone.utc)
        self.users.update(user)
        return user

    def issue_tokens(
        self,
        user: User,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[str, str]:
        """
        Issue an access token + refresh token pair and persist the session.

        Returns ``(access_token, refresh_token)`` as raw JWT strings.
        """
        jti = uuid.uuid4()
        access_token = create_access_token(str(user.id))
        refresh_token = create_refresh_token(str(user.id), str(jti))

        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        self.tokens.create(
            user_id=user.id,
            jti=jti,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return access_token, refresh_token

    # ------------------------------------------------------------------
    # Token refresh (DB-validated)
    # ------------------------------------------------------------------

    def refresh_access_token(self, refresh_token: str) -> str:
        """
        Validate the refresh JWT and the DB session record, then issue a new
        access token.

        Raises :exc:`AuthError` on any validation failure.
        """
        try:
            decoded = decode_token(refresh_token)
        except JWTError:
            raise AuthError("Invalid refresh token")

        if decoded.get("type") != REFRESH_TOKEN_TYPE:
            raise AuthError("Invalid refresh token type")

        jti_str = decoded.get("jti")
        sub = decoded.get("sub")
        if not jti_str or not sub:
            raise AuthError("Malformed refresh token")

        try:
            jti = uuid.UUID(jti_str)
        except ValueError:
            raise AuthError("Malformed refresh token")

        record = self.tokens.get_by_jti(jti)
        if record is None:
            raise AuthError("Session not found — please log in again")
        if not record.is_valid:
            raise AuthError("Session has expired or been revoked")

        try:
            user_id = uuid.UUID(sub)
        except ValueError:
            raise AuthError("Malformed refresh token")

        user = self.users.get(user_id)
        if user is None or not user.is_active:
            raise AuthError("User not found or inactive")

        return create_access_token(str(user.id))

    # ------------------------------------------------------------------
    # Logout (token revocation)
    # ------------------------------------------------------------------

    def logout(
        self, user_id: uuid.UUID, refresh_token: str | None = None
    ) -> None:
        """
        Revoke a specific refresh token session, or all sessions for the user.

        If *refresh_token* is provided its jti is extracted and only that
        session is revoked.  If omitted, every active session for the user is
        revoked (full logout / "log out everywhere").
        """
        if refresh_token:
            try:
                decoded = decode_token(refresh_token)
                jti_str = decoded.get("jti")
                if jti_str:
                    self.tokens.revoke_by_jti(uuid.UUID(jti_str))
                    return
            except Exception:
                pass  # Fall through to revoke-all

        self.tokens.revoke_all_for_user(user_id)
