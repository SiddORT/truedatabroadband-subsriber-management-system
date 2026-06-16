import re
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
    hash_password,
    verify_password,
)
from app.models.user import User
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository


class AuthError(Exception):
    """Generic authentication / authorisation failure."""


class PasswordPolicyError(AuthError):
    """Raised when a new password violates the policy."""

    def __init__(self, violations: list[str]) -> None:
        self.violations = violations
        super().__init__("; ".join(violations))


# ---------------------------------------------------------------------------
# Password policy
# ---------------------------------------------------------------------------

_POLICY: list[tuple[object, str]] = [
    (lambda p: len(p) >= 8, "at least 8 characters"),
    (lambda p: bool(re.search(r"[A-Z]", p)), "one uppercase letter"),
    (lambda p: bool(re.search(r"[a-z]", p)), "one lowercase letter"),
    (lambda p: bool(re.search(r"[0-9]", p)), "one digit"),
    (lambda p: bool(re.search(r"[^A-Za-z0-9]", p)), "one special character"),
]


def validate_password_policy(password: str) -> list[str]:
    """Return a list of unmet policy requirements (empty = valid)."""
    return [msg for check, msg in _POLICY if not check(password)]  # type: ignore[operator]


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


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
        """Create and persist a session. Returns ``(access_token, refresh_token)``."""
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
    # Token rotation (DB-validated refresh)
    # ------------------------------------------------------------------

    def refresh_tokens(self, refresh_token: str) -> tuple[str, str]:
        """
        Validate the old refresh token, revoke it, and issue a new pair.

        Returns ``(new_access_token, new_refresh_token)``.
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
            user_id = uuid.UUID(sub)
        except ValueError:
            raise AuthError("Malformed refresh token")

        record = self.tokens.get_by_jti(jti)
        if record is None:
            raise AuthError("Session not found — please log in again")
        if not record.is_valid:
            raise AuthError("Session has expired or been revoked")

        user = self.users.get(user_id)
        if user is None or not user.is_active:
            raise AuthError("User not found or inactive")

        # Revoke the consumed token and issue a fresh pair (rotation).
        self.tokens.revoke_by_jti(jti)
        return self.issue_tokens(user)

    # ------------------------------------------------------------------
    # Password change
    # ------------------------------------------------------------------

    def change_password(
        self, user: User, old_password: str, new_password: str
    ) -> None:
        """
        Change a user's password.

        Validates the current password, enforces the password policy, then:
        - Updates the password hash
        - Clears the must_change_password flag
        - Revokes all refresh-token sessions (security best-practice)
        """
        if not verify_password(old_password, user.password_hash):
            raise AuthError("Current password is incorrect")

        violations = validate_password_policy(new_password)
        if violations:
            raise PasswordPolicyError(violations)

        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        self.users.update(user)

        # Revoke all active sessions so old tokens can no longer be used.
        self.tokens.revoke_all_for_user(user.id)

    # ------------------------------------------------------------------
    # Logout (token revocation)
    # ------------------------------------------------------------------

    def logout(
        self, user_id: uuid.UUID, refresh_token: str | None = None
    ) -> None:
        """
        Revoke a specific session or all sessions for the user.

        If *refresh_token* is provided, only that jti is revoked.
        If omitted, every active session for the user is revoked.
        """
        if refresh_token:
            try:
                decoded = decode_token(refresh_token)
                jti_str = decoded.get("jti")
                if jti_str:
                    self.tokens.revoke_by_jti(uuid.UUID(jti_str))
                    return
            except Exception:
                pass
        self.tokens.revoke_all_for_user(user_id)
