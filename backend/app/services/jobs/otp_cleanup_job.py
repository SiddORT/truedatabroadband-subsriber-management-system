"""OTP cleanup job.

Deletes expired OTP records (expires_at < now) older than 30 days.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.core.logging import get_logger

logger = get_logger(__name__)

JOB_KEY = "otp_cleanup_job"


class OtpCleanupJob:
    def run(self) -> dict:
        from app.core.database import SessionLocal
        from app.models.otp_verification import OtpVerification

        db = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            result = db.execute(
                delete(OtpVerification).where(
                    OtpVerification.expires_at < cutoff
                )
            )
            db.commit()
            deleted = result.rowcount
            logger.info("otp_cleanup_job.done", deleted=deleted)
            return {"deleted": deleted}
        finally:
            db.close()
