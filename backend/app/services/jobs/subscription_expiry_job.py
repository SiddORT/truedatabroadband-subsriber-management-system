"""Subscription auto-expiry job.

Runs daily. Finds all ACTIVE subscriptions whose expiry_date is in the past
and marks them EXPIRED.
"""
from __future__ import annotations

from datetime import date

from app.core.logging import get_logger

logger = get_logger(__name__)

JOB_KEY = "subscription_expiry_job"


class SubscriptionExpiryJob:
    def run(self) -> dict:
        from app.core.database import SessionLocal
        from app.models.subscription import SubscriptionStatus
        from app.repositories.subscription import SubscriptionRepository

        db = SessionLocal()
        expired_count = 0
        errors = 0

        try:
            today = date.today()
            repo = SubscriptionRepository(db)
            subs = repo.list_active_expired_as_of(today)

            for sub in subs:
                try:
                    sub.status = SubscriptionStatus.EXPIRED
                    expired_count += 1
                except Exception as exc:
                    logger.error(
                        "subscription_expiry_job.item_error",
                        subscription_id=str(sub.id),
                        error=str(exc),
                    )
                    errors += 1

            db.commit()
            logger.info(
                "subscription_expiry_job.complete",
                expired=expired_count,
                errors=errors,
            )
            return {"expired": expired_count, "errors": errors}

        except Exception as exc:
            logger.error("subscription_expiry_job.error", error=str(exc))
            db.rollback()
            raise
        finally:
            db.close()
