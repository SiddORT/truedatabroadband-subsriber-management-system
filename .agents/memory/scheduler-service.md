---
name: Scheduler service pattern
description: How the centralized APScheduler-based job system works; key pitfalls to know before touching scheduler or jobs code.
---

## Architecture

- `backend/app/services/scheduler_service.py` — singleton `SchedulerService`, replaces the old `notifications/scheduler.py`
- `main.py` calls `get_scheduler().start()` / `shutdown()` in the lifespan context
- `scheduled_jobs` table is the source of truth; APScheduler uses in-memory store; on every startup `_register_all()` re-reads the DB and re-adds jobs → restart-safe without a persistent APScheduler job store
- Job implementations live in `backend/app/services/jobs/` (one class per job with a `run() → dict` method)

## Pitfalls

- **APScheduler 3.x API**: `scheduler.add_job(fn, trigger, id=..., replace_existing=True)` — not APScheduler 4.x
- **`CronTrigger.from_crontab(expr)`** validates 5-field cron strings; use this for API validation too (done in `schemas/jobs.py`)
- **Notification archiving**: `notification_cleanup_job` sets `archived_at` (not deletes); column was added in migration 0021; `NotificationLog` model now has `archived_at` field
- **Frontend api import**: `{ api }` is a **named export** from `"@/services/api"` — never `import api from "./api"` (default import will break with "does not provide an export named 'default'")
- **Execution log lifecycle**: status starts as RUNNING (no completed_at); `log_repo.complete()` sets completed_at + execution_time_ms; `is_running()` checks for RUNNING records with no completed_at

## Default jobs registered

| job_key | cron | description |
|---|---|---|
| subscription_reminder_job | `0 8 * * *` | D±15/7/3/1/0 reminders |
| sms_delivery_status_job | `*/15 * * * *` | Poll PENDING SMS logs |
| otp_cleanup_job | `0 1 * * *` | Delete OTPs >30 days |
| report_cleanup_job | `0 2 * * *` | Delete reports >24h |
| export_cleanup_job | `15 2 * * *` | Delete exports >24h |
| notification_cleanup_job | `30 2 * * *` | Archive notif logs >180 days |

**Why:** Centralizing all background work in one service lets the admin UI manage schedules without redeploying; DB persistence means schedule changes survive restarts without an APScheduler job store table.

**How to apply:** Any new background job → add a class in `services/jobs/`, register in `_get_job_fn()`, add a default entry in `_DEFAULT_JOBS`, seed will insert it on next startup.
