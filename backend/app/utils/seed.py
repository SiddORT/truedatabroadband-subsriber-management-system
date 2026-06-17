from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.notification import NotificationChannel, TemplateKey
from app.models.user import User, UserRole
from app.repositories.user import UserRepository

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Default notification templates
# ---------------------------------------------------------------------------

_DEFAULT_TEMPLATES: list[dict] = [
    # ── WELCOME_CUSTOMER ──────────────────────────────────────────────────
    {
        "template_key": TemplateKey.WELCOME_CUSTOMER,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "Dear {customer_name}, welcome to True Data Broadband! "
            "Your connection {connection_name} with plan {plan_name} is now active. "
            "For support call {support_phone}."
        ),
        "approved_variables": [
            "customer_name", "connection_name", "plan_name",
            "portal_url", "support_email", "support_phone",
        ],
    },
    {
        "template_key": TemplateKey.WELCOME_CUSTOMER,
        "channel": NotificationChannel.EMAIL,
        "subject": "Welcome to True Data Broadband, {customer_name}!",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>Welcome to <strong>True Data Broadband</strong>! "
            "Your broadband connection is now active.</p>"
            "<ul>"
            "<li><strong>Connection Name:</strong> {connection_name}</li>"
            "<li><strong>Plan:</strong> {plan_name}</li>"
            "</ul>"
            "<p>For support, contact us at <a href='mailto:{support_email}'>{support_email}</a> "
            "or call <strong>{support_phone}</strong>.</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "connection_name", "plan_name",
            "portal_url", "support_email", "support_phone",
        ],
    },
    # ── OTP_LOGIN ─────────────────────────────────────────────────────────
    {
        "template_key": TemplateKey.OTP_LOGIN,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "Your OTP for True Data Broadband is {otp_code}. "
            "Valid for {otp_expiry_minutes} minutes. Do not share this code."
        ),
        "approved_variables": ["otp_code", "otp_expiry_minutes"],
    },
    {
        "template_key": TemplateKey.OTP_LOGIN,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your OTP - True Data Broadband",
        "body": (
            "<p>Dear Customer,</p>"
            "<p>Your One-Time Password (OTP) for True Data Broadband is:</p>"
            "<h2 style='letter-spacing:4px;'>{otp_code}</h2>"
            "<p>This OTP is valid for <strong>{otp_expiry_minutes} minutes</strong>.</p>"
            "<p><em>Do not share this OTP with anyone.</em></p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": ["otp_code", "otp_expiry_minutes"],
    },
    # ── SUBSCRIPTION_EXPIRING ─────────────────────────────────────────────
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRING,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "Dear {customer_name}, your connection {connection_name} ({plan_name}) "
            "expires on {expiry_date} ({days_remaining} day(s) left). "
            "Renew now to avoid interruption. Call {support_phone}."
        ),
        "approved_variables": [
            "customer_name", "connection_name", "plan_name",
            "expiry_date", "days_remaining", "portal_url", "support_email", "support_phone",
        ],
    },
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRING,
        "channel": NotificationChannel.EMAIL,
        "subject": "Action Required: Your Subscription Expires in {days_remaining} Day(s)",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>This is a reminder that your broadband subscription is expiring soon.</p>"
            "<ul>"
            "<li><strong>Connection:</strong> {connection_name}</li>"
            "<li><strong>Plan:</strong> {plan_name}</li>"
            "<li><strong>Expiry Date:</strong> {expiry_date}</li>"
            "<li><strong>Days Remaining:</strong> {days_remaining}</li>"
            "</ul>"
            "<p>Please renew before the expiry date to avoid service interruption.</p>"
            "<p>Contact us: <a href='mailto:{support_email}'>{support_email}</a> / {support_phone}</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "connection_name", "plan_name",
            "expiry_date", "days_remaining", "portal_url", "support_email", "support_phone",
        ],
    },
    # ── SUBSCRIPTION_EXPIRED ──────────────────────────────────────────────
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRED,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "Dear {customer_name}, your connection {connection_name} ({plan_name}) "
            "expired on {expiry_date}. Renew now to restore services. Call {support_phone}."
        ),
        "approved_variables": [
            "customer_name", "connection_name", "plan_name",
            "expiry_date", "days_overdue", "portal_url", "support_email", "support_phone",
        ],
    },
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your Subscription Has Expired — {connection_name}",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>Your broadband subscription has expired.</p>"
            "<ul>"
            "<li><strong>Connection:</strong> {connection_name}</li>"
            "<li><strong>Plan:</strong> {plan_name}</li>"
            "<li><strong>Expired On:</strong> {expiry_date}</li>"
            "</ul>"
            "<p>Please renew immediately to restore your internet services.</p>"
            "<p>Contact us: <a href='mailto:{support_email}'>{support_email}</a> / {support_phone}</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "connection_name", "plan_name",
            "expiry_date", "days_overdue", "portal_url", "support_email", "support_phone",
        ],
    },
    # ── INVOICE_GENERATED ─────────────────────────────────────────────────
    {
        "template_key": TemplateKey.INVOICE_GENERATED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Invoice {invoice_number} Generated - True Data Broadband",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>An invoice has been generated for your broadband connection.</p>"
            "<ul>"
            "<li><strong>Invoice Number:</strong> {invoice_number}</li>"
            "<li><strong>Connection:</strong> {connection_name}</li>"
            "<li><strong>Amount:</strong> &#8377;{amount}</li>"
            "<li><strong>Due Date:</strong> {due_date}</li>"
            "</ul>"
            "<p>Please make the payment before the due date.</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "invoice_number", "connection_name", "amount", "due_date", "portal_url",
        ],
    },
    # ── PAYMENT_RECEIVED ──────────────────────────────────────────────────
    {
        "template_key": TemplateKey.PAYMENT_RECEIVED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Payment Received - True Data Broadband",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>We have received your payment. Thank you!</p>"
            "<ul>"
            "<li><strong>Amount Paid:</strong> &#8377;{payment_amount}</li>"
            "<li><strong>Invoice:</strong> {invoice_number}</li>"
            "<li><strong>Balance:</strong> &#8377;{balance_amount}</li>"
            "</ul>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "payment_amount", "invoice_number", "balance_amount",
        ],
    },
    # ── PASSWORD_RESET ────────────────────────────────────────────────────
    {
        "template_key": TemplateKey.PASSWORD_RESET,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your Password Has Been Reset - True Data Broadband",
        "body": (
            "<p>Dear Customer,</p>"
            "<p>Your True Data Broadband account password has been reset by the administrator.</p>"
            "<p>Please log in with your new temporary password and change it immediately.</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [],
    },
    # ── PLAN_CHANGED ──────────────────────────────────────────────────────
    {
        "template_key": TemplateKey.PLAN_CHANGED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your Broadband Plan Has Been Changed - True Data Broadband",
        "body": (
            "<p>Dear Customer,</p>"
            "<p>Your broadband plan has been updated. "
            "Please contact support if you have any questions.</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [],
    },
]


def seed_notification_templates() -> None:
    """Create default notification templates if they do not already exist."""
    from app.repositories.notification_template import NotificationTemplateRepository

    db = SessionLocal()
    try:
        repo = NotificationTemplateRepository(db)
        created = 0
        for tmpl in _DEFAULT_TEMPLATES:
            tk = tmpl["template_key"]
            ch = tmpl["channel"]
            tk_val = tk.value if hasattr(tk, "value") else str(tk)
            ch_val = ch.value if hasattr(ch, "value") else str(ch)
            existing = repo.get_by_key_and_channel(tk_val, ch_val)
            if existing is None:
                repo.upsert(
                    template_key=tk_val,
                    channel=ch_val,
                    subject=tmpl.get("subject"),
                    body=tmpl["body"],
                    approved_variables=tmpl.get("approved_variables"),
                )
                created += 1
        if created:
            logger.info("seed.notification_templates.created", count=created)
        else:
            logger.info("seed.notification_templates.exists")
    except Exception as exc:
        logger.error("seed.notification_templates.error", error=str(exc))
    finally:
        db.close()


def seed_superadmin() -> None:
    """Create the default SUPERADMIN user if it does not already exist."""
    db = SessionLocal()
    try:
        users = UserRepository(db)
        email = settings.SEED_ADMIN_EMAIL.lower()
        existing = users.get_by_email(email, include_deleted=True)
        if existing is not None:
            logger.info("seed.superadmin.exists", email=email)
            return

        user = User(
            email=email,
            password_hash=hash_password(settings.SEED_ADMIN_PASSWORD),
            role=UserRole.SUPERADMIN,
            is_active=True,
            must_change_password=False,
        )
        users.add(user)
        logger.info("seed.superadmin.created", email=email)
    finally:
        db.close()


if __name__ == "__main__":
    seed_superadmin()
