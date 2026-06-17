"""Export cleanup job.

Deletes export files from storage/exports/ older than 24 hours.
"""
from __future__ import annotations

import time
from pathlib import Path

from app.core.logging import get_logger

logger = get_logger(__name__)

JOB_KEY = "export_cleanup_job"
MAX_AGE_HOURS = 24


class ExportCleanupJob:
    def run(self) -> dict:
        from app.core.config import settings

        exports_dir = Path(settings.STORAGE_ROOT) / "exports"
        if not exports_dir.exists():
            return {"deleted": 0, "skipped": "directory_not_found"}

        cutoff = time.time() - MAX_AGE_HOURS * 3600
        deleted = 0
        errors = 0

        for path in exports_dir.iterdir():
            if not path.is_file():
                continue
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
                    deleted += 1
            except Exception as exc:
                errors += 1
                logger.error("export_cleanup_job.delete_error", path=str(path), error=str(exc))

        logger.info("export_cleanup_job.done", deleted=deleted, errors=errors)
        return {"deleted": deleted, "errors": errors}
