"""Notification cleanup / archive job.

Archives notification logs older than 180 days by setting archived_at.
Data is never deleted.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.core.logging import get_logger

logger = get_logger(__name__)

JOB_KEY = "notification_cleanup_job"
ARCHIVE_AFTER_DAYS = 180


class NotificationCleanupJob:
    def run(self) -> dict:
        from app.core.database import SessionLocal
        from app.models.notification import NotificationLog

        db = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_AFTER_DAYS)
            now = datetime.now(timezone.utc)
            result = db.execute(
                update(NotificationLog)
                .where(
                    NotificationLog.created_at < cutoff,
                    NotificationLog.archived_at.is_(None),
                )
                .values(archived_at=now)
            )
            db.commit()
            archived = result.rowcount
            logger.info("notification_cleanup_job.done", archived=archived)
            return {"archived": archived}
        finally:
            db.close()
