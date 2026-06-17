"""Report cleanup job.

Deletes generated report files from storage/reports/ older than 24 hours.
"""
from __future__ import annotations

import time
from pathlib import Path

from app.core.logging import get_logger

logger = get_logger(__name__)

JOB_KEY = "report_cleanup_job"
MAX_AGE_HOURS = 24


class ReportCleanupJob:
    def run(self) -> dict:
        from app.core.config import settings

        reports_dir = Path(settings.STORAGE_ROOT) / "reports"
        if not reports_dir.exists():
            return {"deleted": 0, "skipped": "directory_not_found"}

        cutoff = time.time() - MAX_AGE_HOURS * 3600
        deleted = 0
        errors = 0

        for path in reports_dir.iterdir():
            if not path.is_file():
                continue
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
                    deleted += 1
            except Exception as exc:
                errors += 1
                logger.error("report_cleanup_job.delete_error", path=str(path), error=str(exc))

        logger.info("report_cleanup_job.done", deleted=deleted, errors=errors)
        return {"deleted": deleted, "errors": errors}
