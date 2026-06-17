"""Subscription renewal reminder job.

Scans subscriptions for upcoming/overdue expiry dates and sends notifications.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.core.logging import get_logger
from app.models.notification import TemplateKey

logger = get_logger(__name__)

REMINDER_SCHEDULE: list[tuple[int, str]] = [
    (-15, TemplateKey.SUBSCRIPTION_EXPIRING),
    (-7, TemplateKey.SUBSCRIPTION_EXPIRING),
    (-3, TemplateKey.SUBSCRIPTION_EXPIRING),
    (-1, TemplateKey.SUBSCRIPTION_EXPIRING),
    (0, TemplateKey.SUBSCRIPTION_EXPIRED),
    (3, TemplateKey.SUBSCRIPTION_EXPIRED),
    (7, TemplateKey.SUBSCRIPTION_EXPIRED),
    (15, TemplateKey.SUBSCRIPTION_EXPIRED),
]

JOB_KEY = "subscription_reminder_job"


class SubscriptionReminderJob:
    def run(self) -> dict:
        from app.core.database import SessionLocal
        from app.models.subscription import SubscriptionStatus
        from app.repositories.company_settings import CompanySettingsRepository
        from app.repositories.notification_preference import NotificationPreferenceRepository
        from app.repositories.subscription import SubscriptionRepository
        from app.services.notifications.notification_service import NotificationService, Recipient

        db = SessionLocal()
        sent = 0
        errors = 0
        try:
            today = date.today()
            sub_repo = SubscriptionRepository(db)
            notif_svc = NotificationService(db)

            for days_offset, template_key in REMINDER_SCHEDULE:
                target_expiry = today + timedelta(days=-days_offset)
                subs = sub_repo.list_by_expiry_date(target_expiry)

                for sub in subs:
                    if sub.status != SubscriptionStatus.ACTIVE:
                        continue
                    if sub.customer is None:
                        continue

                    customer = sub.customer
                    variables = {
                        "customer_name": customer.full_name,
                        "connection_name": sub.connection_name or "",
                        "plan_name": sub.plan.name if sub.plan else "",
                        "expiry_date": sub.expiry_date.strftime("%d %b %Y") if sub.expiry_date else "",
                        "days_remaining": str(abs(days_offset)) if days_offset < 0 else "0",
                        "days_overdue": str(days_offset) if days_offset >= 0 else "0",
                        "portal_url": "",
                        "support_email": "",
                        "support_phone": "",
                    }

                    try:
                        cs = CompanySettingsRepository(db).get_or_create()
                        variables["support_email"] = cs.support_email or ""
                        variables["support_phone"] = cs.support_phone or ""
                    except Exception:
                        pass

                    recipient = Recipient(
                        email=customer.email,
                        mobile=customer.mobile_number,
                    )

                    try:
                        notif_svc.send(
                            template_key=template_key,
                            recipient=recipient,
                            variables=variables,
                            entity_type="subscription",
                            entity_id=str(sub.id),
                            subscription_id=sub.id,
                            days_offset=days_offset,
                            customer_id=customer.id,
                        )
                        sent += 1
                    except Exception as exc:
                        errors += 1
                        logger.error(
                            "subscription_reminder_job.send_error",
                            sub_id=str(sub.id),
                            template_key=template_key,
                            error=str(exc),
                        )

            logger.info("subscription_reminder_job.done", date=str(today), sent=sent, errors=errors)
            return {"sent": sent, "errors": errors}
        finally:
            db.close()
