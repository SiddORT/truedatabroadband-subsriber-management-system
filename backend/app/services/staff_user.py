"""Staff user invitation and management service."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.audit_log import (
    ACTION_STAFF_DEACTIVATED,
    ACTION_STAFF_INVITE_ACCEPTED,
    ACTION_STAFF_INVITE_RESENT,
    ACTION_STAFF_INVITED,
    ACTION_STAFF_REACTIVATED,
    ACTION_STAFF_UPDATED,
)
from app.models.notification import TemplateKey
from app.models.user import User, UserRole
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company_settings import CompanySettingsRepository
from app.repositories.role import RoleRepository
from app.repositories.staff_user import StaffUserRepository
from app.schemas.staff_user import StaffUserInvite, StaffUserUpdate
from app.services.auth import PasswordPolicyError
from app.services.notifications.notification_service import NotificationService, Recipient

INVITE_EXPIRY_HOURS = 48
_DUMMY_PW = "!INVITE_PENDING!"


class StaffUserError(Exception):
    pass


class StaffUserService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = StaffUserRepository(db)
        self.role_repo = RoleRepository(db)
        self.audit = AuditLogRepository(db)

    # ── Internal helpers ────────────────────────────────────────────────────

    def _make_invite_token(self) -> tuple[str, datetime]:
        token = secrets.token_hex(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_EXPIRY_HOURS)
        return token, expires_at

    def _send_invite_email(self, user: User, token: str, base_url: str = "") -> None:
        try:
            cs = CompanySettingsRepository(self.db).get()
            company_name = cs.company_name if cs else "True Data Broadband"
            base = base_url.rstrip("/")
            invite_url = f"{base}/accept-invite?token={token}" if base else f"/accept-invite?token={token}"
            ns = NotificationService(self.db)
            ns.send(
                TemplateKey.STAFF_INVITE,
                Recipient(email=user.email),
                {
                    "company_name": company_name,
                    "invitee_name": user.display_name or user.email,
                    "invite_url": invite_url,
                    "expires_hours": str(INVITE_EXPIRY_HOURS),
                },
            )
        except Exception:
            pass

    # ── Public API ──────────────────────────────────────────────────────────

    def invite(
        self,
        payload: StaffUserInvite,
        *,
        actor_id: uuid.UUID,
        base_url: str = "",
    ) -> User:
        # Validate role exists
        role = self.role_repo.get(payload.role_id)
        if role is None:
            raise StaffUserError("Role not found")

        # Check duplicate email
        if self.repo.get_by_email(payload.email):
            raise StaffUserError("A user with this email already exists")

        token, expires_at = self._make_invite_token()

        user = User(
            email=payload.email,
            password_hash=hash_password(_DUMMY_PW),
            role=UserRole.STAFF,
            display_name=payload.display_name,
            role_id=payload.role_id,
            is_active=True,
            must_change_password=False,
            invite_token=token,
            invite_token_expires_at=expires_at,
        )
        user = self.repo.add(user)

        self._send_invite_email(user, token, base_url=base_url)
        self.audit.log(ACTION_STAFF_INVITED, user_id=actor_id)
        return user

    def resend_invite(self, user_id: uuid.UUID, *, actor_id: uuid.UUID, base_url: str = "") -> User:
        user = self.repo.get(user_id)
        if user is None or user.role != UserRole.STAFF:
            raise StaffUserError("Staff user not found")
        if user.invite_accepted_at is not None:
            raise StaffUserError("This user has already accepted the invite")

        token, expires_at = self._make_invite_token()
        user.invite_token = token
        user.invite_token_expires_at = expires_at
        user = self.repo.update(user)

        self._send_invite_email(user, token, base_url=base_url)
        self.audit.log(ACTION_STAFF_INVITE_RESENT, user_id=actor_id)
        return user

    def accept_invite(self, token: str, password: str) -> User:
        user = self.repo.get_by_invite_token(token)
        if user is None:
            raise StaffUserError("Invalid or expired invite link")
        if user.invite_token_expires_at and datetime.now(timezone.utc) > user.invite_token_expires_at:
            raise StaffUserError("Invite link has expired. Please ask your admin to resend.")
        if user.invite_accepted_at is not None:
            raise StaffUserError("This invite has already been used")

        # Validate password policy
        from app.services.auth import validate_password_policy
        violations = validate_password_policy(password)
        if violations:
            raise PasswordPolicyError(violations)

        user.password_hash = hash_password(password)
        user.invite_token = None
        user.invite_token_expires_at = None
        user.invite_accepted_at = datetime.now(timezone.utc)
        user = self.repo.update(user)

        self.audit.log(ACTION_STAFF_INVITE_ACCEPTED, user_id=user.id)
        return user

    def update(
        self,
        user_id: uuid.UUID,
        payload: StaffUserUpdate,
        *,
        actor_id: uuid.UUID,
    ) -> User:
        user = self.repo.get(user_id)
        if user is None or user.role != UserRole.STAFF:
            raise StaffUserError("Staff user not found")

        was_active = user.is_active

        if payload.display_name is not None:
            user.display_name = payload.display_name
        if payload.email is not None:
            existing = self.repo.get_by_email(payload.email)
            if existing and existing.id != user.id:
                raise StaffUserError("A user with this email already exists")
            user.email = payload.email
        if payload.role_id is not None:
            role = self.role_repo.get(payload.role_id)
            if role is None:
                raise StaffUserError("Role not found")
            user.role_id = payload.role_id
        if payload.is_active is not None:
            user.is_active = payload.is_active

        user = self.repo.update(user)

        if payload.is_active is not None and payload.is_active != was_active:
            action = ACTION_STAFF_REACTIVATED if payload.is_active else ACTION_STAFF_DEACTIVATED
        else:
            action = ACTION_STAFF_UPDATED
        self.audit.log(action, user_id=actor_id)
        return user

    def list_staff(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        role_id: uuid.UUID | None = None,
    ) -> tuple[list[User], int]:
        return self.repo.list_staff(skip=skip, limit=limit, search=search, role_id=role_id)
