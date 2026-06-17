"""Central scheduler service.

Replaces the ad-hoc notifications/scheduler.py. All background jobs run
through this service which:
  - Seeds default job configurations into the DB on first startup.
  - Re-registers enabled jobs with APScheduler on every startup
    (DB is the source of truth → survives restarts).
  - Wraps each execution in a JobExecutionLog entry.
  - Supports manual execution with duplicate-run prevention.
  - Supports cron reschedule and enable/disable via API.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.logging import get_logger

logger = get_logger(__name__)

_KOLKATA = "Asia/Kolkata"

# Default job definitions ──────────────────────────────────────────────────────
_DEFAULT_JOBS: list[dict] = [
    {
        "job_key": "subscription_reminder_job",
        "job_name": "Subscription Renewal Reminders",
        "description": (
            "Sends expiry reminder and overdue notifications to customers at "
            "D-15, D-7, D-3, D-1, D+0, D+3, D+7, D+15 intervals."
        ),
        "cron_expression": "0 8 * * *",
        "max_retries": 3,
    },
    {
        "job_key": "sms_delivery_status_job",
        "job_name": "SMS Delivery Status Poll",
        "description": (
            "Polls the SMS provider for delivery status of PENDING communication logs."
        ),
        "cron_expression": "*/15 * * * *",
        "max_retries": 3,
    },
    {
        "job_key": "otp_cleanup_job",
        "job_name": "OTP Cleanup",
        "description": "Deletes expired OTP records older than 30 days.",
        "cron_expression": "0 1 * * *",
        "max_retries": 3,
    },
    {
        "job_key": "report_cleanup_job",
        "job_name": "Report File Cleanup",
        "description": "Deletes generated report files from storage/reports/ older than 24 hours.",
        "cron_expression": "0 2 * * *",
        "max_retries": 3,
    },
    {
        "job_key": "export_cleanup_job",
        "job_name": "Export File Cleanup",
        "description": "Deletes exported CSV/XLSX files from storage/exports/ older than 24 hours.",
        "cron_expression": "15 2 * * *",
        "max_retries": 3,
    },
    {
        "job_key": "notification_cleanup_job",
        "job_name": "Notification Log Archive",
        "description": "Archives notification logs older than 180 days (sets archived_at; never deletes).",
        "cron_expression": "30 2 * * *",
        "max_retries": 3,
    },
]

# Future placeholder keys — not registered with APScheduler yet
_FUTURE_JOB_KEYS = {"payment_reconciliation_job", "network_sync_job"}


def _get_job_fn(job_key: str) -> Callable[[], dict] | None:
    """Return the callable for a job key, or None if it's a future placeholder."""
    if job_key == "subscription_reminder_job":
        from app.services.jobs.subscription_reminder_job import SubscriptionReminderJob
        return SubscriptionReminderJob().run
    if job_key == "sms_delivery_status_job":
        from app.services.jobs.sms_delivery_status_job import SmsDeliveryStatusJob
        return SmsDeliveryStatusJob().run
    if job_key == "otp_cleanup_job":
        from app.services.jobs.otp_cleanup_job import OtpCleanupJob
        return OtpCleanupJob().run
    if job_key == "report_cleanup_job":
        from app.services.jobs.report_cleanup_job import ReportCleanupJob
        return ReportCleanupJob().run
    if job_key == "export_cleanup_job":
        from app.services.jobs.export_cleanup_job import ExportCleanupJob
        return ExportCleanupJob().run
    if job_key == "notification_cleanup_job":
        from app.services.jobs.notification_cleanup_job import NotificationCleanupJob
        return NotificationCleanupJob().run
    return None


class SchedulerService:
    """Manages APScheduler lifecycle and DB-backed job configuration."""

    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone=_KOLKATA)
        self._lock = threading.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Seed defaults, register enabled jobs, start APScheduler."""
        self._seed_defaults()
        self._register_all()
        self._scheduler.start()
        logger.info("scheduler_service.started")

    def shutdown(self, wait: bool = False) -> None:
        try:
            self._scheduler.shutdown(wait=wait)
        except Exception:
            pass
        logger.info("scheduler_service.stopped")

    # ── Internal ──────────────────────────────────────────────────────────────

    def _seed_defaults(self) -> None:
        from app.core.database import SessionLocal
        from app.repositories.scheduled_job import ScheduledJobRepository

        db = SessionLocal()
        try:
            repo = ScheduledJobRepository(db)
            for defn in _DEFAULT_JOBS:
                repo.upsert_default(**defn)
        except Exception as exc:
            logger.error("scheduler_service.seed_error", error=str(exc))
        finally:
            db.close()

    def _register_all(self) -> None:
        from app.core.database import SessionLocal
        from app.repositories.scheduled_job import ScheduledJobRepository

        db = SessionLocal()
        try:
            repo = ScheduledJobRepository(db)
            for job in repo.list_enabled():
                if job.job_key in _FUTURE_JOB_KEYS:
                    continue
                self._register_job(job.job_key, job.cron_expression)
                # Update next_run_at in DB
                try:
                    aps_job = self._scheduler.get_job(job.job_key)
                    if aps_job and aps_job.next_run_time:
                        repo.update(job, next_run_at=aps_job.next_run_time)
                except Exception:
                    pass
        except Exception as exc:
            logger.error("scheduler_service.register_all_error", error=str(exc))
        finally:
            db.close()

    def _register_job(self, job_key: str, cron_expression: str) -> None:
        fn = _get_job_fn(job_key)
        if fn is None:
            return
        trigger = CronTrigger.from_crontab(cron_expression, timezone=_KOLKATA)
        self._scheduler.add_job(
            self._make_wrapper(job_key),
            trigger=trigger,
            id=job_key,
            name=job_key,
            replace_existing=True,
            misfire_grace_time=3600,
        )

    def _make_wrapper(self, job_key: str) -> Callable:
        """Return an APScheduler-compatible callable that logs the execution."""

        def _wrapped() -> None:
            self._execute_job(job_key)

        _wrapped.__name__ = f"wrapped_{job_key}"
        return _wrapped

    def _execute_job(self, job_key: str) -> uuid.UUID | None:
        """Core execution logic — creates log, runs job, updates log + job record."""
        from app.core.database import SessionLocal
        from app.repositories.scheduled_job import (
            JobExecutionLogRepository,
            JOB_STATUS_FAILED,
            JOB_STATUS_RUNNING,
            JOB_STATUS_SUCCESS,
            ScheduledJobRepository,
        )

        fn = _get_job_fn(job_key)
        if fn is None:
            logger.error("scheduler_service.no_fn", job_key=job_key)
            return None

        db = SessionLocal()
        exec_log_id: uuid.UUID | None = None
        try:
            job_repo = ScheduledJobRepository(db)
            log_repo = JobExecutionLogRepository(db)

            job = job_repo.get_by_key(job_key)
            if job is None:
                logger.error("scheduler_service.job_not_found", job_key=job_key)
                return None

            # Create running log
            exec_log = log_repo.create(
                scheduled_job_id=job.id,
                status=JOB_STATUS_RUNNING,
            )
            exec_log_id = exec_log.id
            job_repo.update(job, last_status=JOB_STATUS_RUNNING, last_run_at=datetime.now(timezone.utc))
        except Exception as exc:
            logger.error("scheduler_service.log_create_error", job_key=job_key, error=str(exc))
            db.close()
            return None
        finally:
            if exec_log_id is None:
                db.close()

        # Run job (outside the lock on DB session)
        result: dict = {}
        error_msg: str | None = None
        final_status = JOB_STATUS_SUCCESS
        max_retries = 3

        db2 = SessionLocal()
        try:
            job_repo2 = ScheduledJobRepository(db2)
            job2 = job_repo2.get_by_key(job_key)
            if job2:
                max_retries = job2.max_retries
        except Exception:
            pass
        finally:
            db2.close()

        for attempt in range(max_retries + 1):
            try:
                result = fn() or {}
                final_status = JOB_STATUS_SUCCESS
                break
            except Exception as exc:
                error_msg = str(exc)
                final_status = JOB_STATUS_FAILED
                logger.error(
                    "scheduler_service.job_error",
                    job_key=job_key,
                    attempt=attempt + 1,
                    error=error_msg,
                )
                if attempt < max_retries:
                    import time
                    time.sleep(2 ** attempt)

        # Update log
        db3 = SessionLocal()
        try:
            job_repo3 = ScheduledJobRepository(db3)
            log_repo3 = JobExecutionLogRepository(db3)
            exec_log3 = db3.get(
                __import__("app.models.scheduled_job", fromlist=["JobExecutionLog"]).JobExecutionLog,
                exec_log_id,
            )
            if exec_log3:
                log_repo3.complete(
                    exec_log3,
                    status=final_status,
                    records_processed=result.get("processed") or result.get("deleted")
                    or result.get("archived") or result.get("sent") or result.get("updated"),
                    error_message=error_msg,
                    execution_details=result if result else None,
                )

            job3 = job_repo3.get_by_key(job_key)
            if job3:
                aps_job = self._scheduler.get_job(job_key)
                next_run = aps_job.next_run_time if aps_job else None
                job_repo3.update(job3, last_status=final_status, next_run_at=next_run)
        except Exception as exc:
            logger.error("scheduler_service.log_complete_error", job_key=job_key, error=str(exc))
        finally:
            db3.close()

        if exec_log_id is not None:
            db.close()

        logger.info("scheduler_service.job_done", job_key=job_key, status=final_status, result=result)
        return exec_log_id

    # ── Public API (called from API endpoints) ────────────────────────────────

    def run_job_now(self, job_key: str) -> tuple[str, uuid.UUID | None]:
        """Manually trigger a job. Returns (status, execution_log_id).

        Raises ValueError if job not found.
        Raises RuntimeError if job already running (caller should return 409).
        """
        from app.core.database import SessionLocal
        from app.repositories.scheduled_job import ScheduledJobRepository

        db = SessionLocal()
        try:
            repo = ScheduledJobRepository(db)
            job = repo.get_by_key(job_key)
            if job is None:
                raise ValueError(f"Job '{job_key}' not found")
            if repo.is_running(job):
                raise RuntimeError("Job is already running")
        finally:
            db.close()

        log_id: list[uuid.UUID | None] = [None]

        def _run() -> None:
            log_id[0] = self._execute_job(job_key)

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=0.2)  # return quickly; job runs in background

        return "queued", log_id[0]

    def reschedule_job(self, job_key: str, cron_expression: str) -> None:
        """Update the APScheduler trigger for an enabled job."""
        try:
            trigger = CronTrigger.from_crontab(cron_expression, timezone=_KOLKATA)
            if self._scheduler.get_job(job_key):
                self._scheduler.reschedule_job(job_key, trigger=trigger)
            else:
                fn = _get_job_fn(job_key)
                if fn:
                    self._scheduler.add_job(
                        self._make_wrapper(job_key),
                        trigger=trigger,
                        id=job_key,
                        name=job_key,
                        replace_existing=True,
                        misfire_grace_time=3600,
                    )
        except Exception as exc:
            logger.error("scheduler_service.reschedule_error", job_key=job_key, error=str(exc))

    def enable_job(self, job_key: str, cron_expression: str) -> None:
        """Register or resume a job in APScheduler."""
        self._register_job(job_key, cron_expression)

    def disable_job(self, job_key: str) -> None:
        """Remove a job from APScheduler (keeps DB record)."""
        try:
            if self._scheduler.get_job(job_key):
                self._scheduler.remove_job(job_key)
        except Exception as exc:
            logger.error("scheduler_service.disable_error", job_key=job_key, error=str(exc))

    def get_next_run(self, job_key: str) -> datetime | None:
        try:
            aps_job = self._scheduler.get_job(job_key)
            return aps_job.next_run_time if aps_job else None
        except Exception:
            return None


# Module-level singleton — created once, referenced from main.py
_instance: SchedulerService | None = None


def get_scheduler() -> SchedulerService:
    global _instance
    if _instance is None:
        _instance = SchedulerService()
    return _instance
