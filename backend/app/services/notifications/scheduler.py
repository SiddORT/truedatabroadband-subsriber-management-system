"""Daily renewal reminder scheduler.

Runs at 08:00 server time. Scans subscriptions for matching expiry dates
and sends SUBSCRIPTION_EXPIRING / SUBSCRIPTION_EXPIRED notifications.
"""
from __future__ import annotations

from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.logging import get_logger
from app.models.notification import NotificationChannel, TemplateKey

logger = get_logger(__name__)

# (days_offset, template_key)
# days_offset < 0  →  expiry is |days_offset| days in the future
# days_offset >= 0 →  expiry is days_offset days in the past
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


def _job() -> None:
    """Called by APScheduler in a background thread."""
    from app.core.database import SessionLocal
    from app.models.subscription import SubscriptionStatus
    from app.repositories.notification_preference import NotificationPreferenceRepository
    from app.repositories.subscription import SubscriptionRepository
    from app.services.notifications.notification_service import NotificationService, Recipient

    db = SessionLocal()
    try:
        today = date.today()
        sub_repo = SubscriptionRepository(db)
        notif_svc = NotificationService(db)

        for days_offset, template_key in REMINDER_SCHEDULE:
            # target expiry date for this offset
            # days_offset = -15 → expiry_date is 15 days from today
            target_expiry = today + timedelta(days=-days_offset)

            # fetch active subs expiring on this date
            subs = sub_repo.list_by_expiry_date(target_expiry)

            for sub in subs:
                if sub.status != SubscriptionStatus.ACTIVE:
                    continue
                if sub.customer is None:
                    continue

                customer = sub.customer
                pref_repo = NotificationPreferenceRepository(db)
                prefs = pref_repo.get_by_customer(customer.id)

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

                # Enrich with company settings
                try:
                    from app.repositories.company_settings import CompanySettingsRepository
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
                except Exception as exc:
                    logger.error(
                        "scheduler.send_error",
                        sub_id=str(sub.id),
                        template_key=template_key,
                        error=str(exc),
                    )

        logger.info("scheduler.renewal_reminders.done", date=str(today))
    except Exception as exc:
        logger.error("scheduler.renewal_reminders.error", error=str(exc))
    finally:
        db.close()


def create_scheduler() -> BackgroundScheduler:
    """Create and return a configured (not yet started) BackgroundScheduler."""
    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(
        _job,
        trigger=CronTrigger(hour=8, minute=0),
        id="renewal_reminders",
        name="Daily Renewal Reminders",
        replace_existing=True,
        misfire_grace_time=3600,  # allow up to 1h late
    )
    return scheduler
