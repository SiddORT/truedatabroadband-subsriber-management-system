"""OTP service — generate, hash, verify OTPs for mobile login."""
from __future__ import annotations

import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.otp_verification import OtpPurpose
from app.repositories.audit_log import AuditLogRepository
from app.repositories.otp_verification import OtpVerificationRepository
from app.repositories.user import UserRepository

logger = get_logger(__name__)

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

OTP_REQUESTED = "otp_requested"
OTP_SENT = "otp_sent"
OTP_VERIFIED = "otp_verified"
OTP_FAILED = "otp_failed"

_GENERIC_MSG = "If the mobile number is registered, an OTP has been sent."


class OtpError(Exception):
    pass


class OtpRateLimitError(OtpError):
    pass


class OtpVerifyError(OtpError):
    pass


class OtpService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.otp_repo = OtpVerificationRepository(db)
        self.user_repo = UserRepository(db)
        self.audit_repo = AuditLogRepository(db)

    # ── Generate OTP ────────────────────────────────────────────────────────

    def request_otp(
        self,
        mobile_number: str,
        purpose: str = OtpPurpose.LOGIN,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str, str]:
        """Request an OTP for the given mobile number.

        Returns (otp_plain, generic_message) — caller must send otp_plain via SMS.
        Raises OtpRateLimitError if rate limit exceeded.
        Always returns the generic message regardless of whether the mobile exists.
        """
        repo = self.otp_repo

        # Rate limit: 5 requests per hour
        recent_count = repo.count_recent_requests(mobile_number, purpose)
        if recent_count >= OtpVerificationRepository.MAX_REQUESTS_PER_HOUR:
            logger.warning("otp.rate_limit", mobile=mobile_number)
            raise OtpRateLimitError("Too many OTP requests. Please try again later.")

        # Resend cooldown: 30 seconds
        last_req = repo.get_latest_request_time(mobile_number, purpose)
        if last_req is not None:
            last_req_aware = last_req if last_req.tzinfo else last_req.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - last_req_aware).total_seconds()
            if elapsed < OtpVerificationRepository.RESEND_COOLDOWN_SECONDS:
                raise OtpRateLimitError(
                    f"Please wait {int(OtpVerificationRepository.RESEND_COOLDOWN_SECONDS - elapsed)} seconds before requesting a new OTP."
                )

        # Lookup user (don't reveal whether they exist)
        user = self._find_user_by_mobile(mobile_number)

        # Generate OTP
        otp_plain = self._generate_otp()
        otp_hash = _pwd_ctx.hash(otp_plain)

        # Store
        repo.create(
            mobile_number=mobile_number,
            otp_code_hash=otp_hash,
            user_id=user.id if user else None,
            purpose=purpose,
        )

        self.audit_repo.log(
            OTP_REQUESTED,
            user_id=user.id if user else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return otp_plain, _GENERIC_MSG

    # ── Verify OTP ──────────────────────────────────────────────────────────

    def verify_otp(
        self,
        mobile_number: str,
        otp_code: str,
        purpose: str = OtpPurpose.LOGIN,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ):
        """Verify OTP and return the associated User on success.

        Raises OtpVerifyError on any failure.
        Audit logs are always created.
        """
        from app.models.user import User
        from app.services.auth import AuthService

        record = self.otp_repo.get_latest_active(mobile_number, purpose)
        if record is None:
            self.audit_repo.log(OTP_FAILED, ip_address=ip_address, user_agent=user_agent)
            raise OtpVerifyError("Invalid or expired OTP.")

        # Increment attempt
        self.otp_repo.increment_attempts(record)

        # Check attempts after increment
        if record.attempt_count > record.max_attempts:
            self.audit_repo.log(OTP_FAILED, ip_address=ip_address, user_agent=user_agent)
            raise OtpVerifyError("Maximum OTP attempts exceeded.")

        # Verify hash
        if not _pwd_ctx.verify(otp_code, record.otp_code_hash):
            self.audit_repo.log(OTP_FAILED, ip_address=ip_address, user_agent=user_agent)
            raise OtpVerifyError("Invalid or expired OTP.")

        # Mark verified + invalidate all others
        self.otp_repo.mark_verified(record)
        self.otp_repo.invalidate_all(mobile_number, purpose)

        # Fetch user
        user_id = record.user_id
        if user_id is None:
            raise OtpVerifyError("No user associated with this OTP.")

        user = self.db.get(User, user_id)
        if user is None or not user.is_active:
            raise OtpVerifyError("User account is inactive.")

        self.audit_repo.log(
            OTP_VERIFIED,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Issue tokens
        auth_svc = AuthService(self.db)
        access_token, refresh_token = auth_svc.issue_tokens(
            user,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return user, access_token, refresh_token

    # ── Send OTP via notification service ───────────────────────────────────

    def send_otp_notification(
        self,
        mobile_number: str,
        otp_plain: str,
        db: Session,
    ) -> None:
        """Fire-and-forget: send OTP via SMS/email. Errors are logged, not raised."""
        from app.repositories.company_settings import CompanySettingsRepository
        from app.services.notifications.notification_service import NotificationService, Recipient

        try:
            notif_svc = NotificationService(db)
            # find customer email for email OTP
            customer = self._find_customer_by_mobile(mobile_number)
            notif_svc.send(
                template_key="OTP_LOGIN",
                recipient=Recipient(
                    mobile=mobile_number,
                    email=customer.email if customer else None,
                ),
                variables={"otp_code": otp_plain},
            )
        except Exception as exc:
            logger.error("otp.send_notification.error", error=str(exc))

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _find_user_by_mobile(self, mobile_number: str):
        """Find a User via their associated Customer's mobile_number."""
        from app.models.customer import Customer
        from app.models.user import User
        from sqlalchemy import select

        customer = self.db.scalar(
            select(Customer).where(
                Customer.mobile_number == mobile_number,
                Customer.deleted_at.is_(None),
            )
        )
        if customer is None:
            return None
        return self.db.get(User, customer.user_id)

    def _find_customer_by_mobile(self, mobile_number: str):
        from app.models.customer import Customer
        from sqlalchemy import select
        return self.db.scalar(
            select(Customer).where(
                Customer.mobile_number == mobile_number,
                Customer.deleted_at.is_(None),
            )
        )

    @staticmethod
    def _generate_otp(length: int = 6) -> str:
        return "".join(random.choices(string.digits, k=length))
