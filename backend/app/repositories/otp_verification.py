"""Repository for OTP verifications."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.otp_verification import OtpVerification, OtpPurpose


class OtpVerificationRepository:
    MAX_REQUESTS_PER_HOUR = 5
    RESEND_COOLDOWN_SECONDS = 30
    OTP_VALIDITY_MINUTES = 5

    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        mobile_number: str,
        otp_code_hash: str,
        user_id: uuid.UUID | None = None,
        purpose: str = OtpPurpose.LOGIN,
    ) -> OtpVerification:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=self.OTP_VALIDITY_MINUTES)
        record = OtpVerification(
            id=uuid.uuid4(),
            user_id=user_id,
            mobile_number=mobile_number,
            purpose=purpose,
            otp_code_hash=otp_code_hash,
            expires_at=expires_at,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_latest_active(
        self,
        mobile_number: str,
        purpose: str = OtpPurpose.LOGIN,
    ) -> OtpVerification | None:
        """Get the most recent unverified, non-expired OTP for this mobile."""
        now = datetime.now(timezone.utc)
        return self.db.scalar(
            select(OtpVerification)
            .where(
                OtpVerification.mobile_number == mobile_number,
                OtpVerification.purpose == purpose,
                OtpVerification.verified_at.is_(None),
                OtpVerification.expires_at > now,
                OtpVerification.attempt_count < OtpVerification.max_attempts,
            )
            .order_by(OtpVerification.created_at.desc())
            .limit(1)
        )

    def count_recent_requests(
        self,
        mobile_number: str,
        purpose: str = OtpPurpose.LOGIN,
        window_minutes: int = 60,
    ) -> int:
        since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        count = self.db.scalar(
            select(func.count()).where(
                OtpVerification.mobile_number == mobile_number,
                OtpVerification.purpose == purpose,
                OtpVerification.created_at >= since,
            )
        )
        return count or 0

    def get_latest_request_time(
        self,
        mobile_number: str,
        purpose: str = OtpPurpose.LOGIN,
    ) -> datetime | None:
        result = self.db.scalar(
            select(OtpVerification.created_at)
            .where(
                OtpVerification.mobile_number == mobile_number,
                OtpVerification.purpose == purpose,
            )
            .order_by(OtpVerification.created_at.desc())
            .limit(1)
        )
        return result

    def increment_attempts(self, record: OtpVerification) -> OtpVerification:
        record.attempt_count += 1
        self.db.commit()
        self.db.refresh(record)
        return record

    def mark_verified(self, record: OtpVerification) -> OtpVerification:
        record.verified_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(record)
        return record

    def invalidate_all(
        self,
        mobile_number: str,
        purpose: str = OtpPurpose.LOGIN,
    ) -> None:
        """Expire all active OTPs for this mobile (called after successful verify)."""
        now = datetime.now(timezone.utc)
        records = list(
            self.db.scalars(
                select(OtpVerification)
                .where(
                    OtpVerification.mobile_number == mobile_number,
                    OtpVerification.purpose == purpose,
                    OtpVerification.verified_at.is_(None),
                )
            ).all()
        )
        for r in records:
            r.expires_at = now
        self.db.commit()
