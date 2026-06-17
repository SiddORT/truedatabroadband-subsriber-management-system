"""SMS delivery status polling job.

Finds PENDING SMS communication logs and updates delivery status.
"""
from __future__ import annotations

from app.core.logging import get_logger

logger = get_logger(__name__)

JOB_KEY = "sms_delivery_status_job"


class SmsDeliveryStatusJob:
    def run(self) -> dict:
        from app.core.database import SessionLocal
        from app.models.communication_log import CommStatus
        from app.repositories.communication_log import CommunicationLogRepository
        from app.repositories.company_settings import CompanySettingsRepository
        from app.services.notifications.sms_service import SmsService

        db = SessionLocal()
        checked = 0
        updated = 0
        errors = 0
        try:
            settings_repo = CompanySettingsRepository(db)
            record = settings_repo.get()
            if record is None:
                return {"checked": 0, "updated": 0, "errors": 0, "skipped": "no_settings"}

            sms_settings = settings_repo.get_sms_settings(record)
            if not sms_settings.get("is_enabled") or not sms_settings.get("provider"):
                return {"checked": 0, "updated": 0, "errors": 0, "skipped": "sms_disabled"}

            log_repo = CommunicationLogRepository(db)
            pending = log_repo.list_pending_sms(limit=50)

            if not pending:
                return {"checked": 0, "updated": 0, "errors": 0}

            sms_svc = SmsService()
            checked = len(pending)

            for log in pending:
                try:
                    result = sms_svc.get_status(log.provider_message_id, sms_settings=sms_settings)
                    if result.success and result.raw_response:
                        raw = result.raw_response
                        status_str = str(raw.get("Status", raw.get("status", ""))).upper()
                        if status_str in ("DELIVERED", "DELIVRD"):
                            new_status = CommStatus.DELIVERED
                        elif status_str in ("FAILED", "UNDELIVERED"):
                            new_status = CommStatus.FAILED
                        else:
                            continue
                        log_repo.update_status(log, new_status, response_payload=raw)
                        updated += 1
                except Exception as exc:
                    errors += 1
                    logger.error(
                        "sms_delivery_status_job.error",
                        log_id=str(log.id),
                        error=str(exc),
                    )

            logger.info(
                "sms_delivery_status_job.done",
                checked=checked,
                updated=updated,
                errors=errors,
            )
            return {"checked": checked, "updated": updated, "errors": errors}
        finally:
            db.close()
