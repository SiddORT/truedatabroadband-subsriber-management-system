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
            "TrueData: Welcome {customer_name}. Your service request has been completed "
            "successfully. Plan: {plan_name}. Thank you for choosing us."
        ),
        "approved_variables": ["customer_name", "plan_name"],
    },
    {
        "template_key": TemplateKey.WELCOME_CUSTOMER,
        "channel": NotificationChannel.EMAIL,
        "subject": "Welcome to True Data Broadband, {customer_name}!",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>Welcome to <strong>True Data Broadband!</strong></p>"
            "<p>You can manage your account, view your connection details and raise support tickets "
            "through our customer portal.</p>"

            "<div style='background:#f0f4f8;border-radius:10px;padding:20px 24px;margin:20px 0;'>"
            "<p style='margin:0 0 12px;font-size:15px;font-weight:700;color:#1F4959;'>"
            "&#128273; Portal Login Details</p>"
            "<table style='border-collapse:collapse;width:100%;'>"
            "<tr>"
            "<td style='padding:7px 16px 7px 0;color:#555;font-size:14px;white-space:nowrap;'>"
            "Portal URL</td>"
            "<td style='padding:7px 0;'>"
            "<a href='{portal_url}' style='color:#1F4959;font-weight:600;'>{portal_url}</a>"
            "</td></tr>"
            "<tr>"
            "<td style='padding:7px 16px 7px 0;color:#555;font-size:14px;'>Username</td>"
            "<td style='padding:7px 0;font-weight:600;'>{customer_email}</td>"
            "</tr>"
            "<tr>"
            "<td style='padding:7px 16px 7px 0;color:#555;font-size:14px;'>Temporary Password</td>"
            "<td style='padding:7px 0;'>"
            "<span style='font-family:monospace;font-size:15px;font-weight:700;"
            "background:#fff;border:1px solid #d0dde6;border-radius:6px;"
            "padding:3px 10px;letter-spacing:1px;'>{temp_password}</span>"
            "</td></tr>"
            "</table>"
            "</div>"

            "<p style='background:#fff8e1;border-left:4px solid #f59e0b;padding:10px 14px;"
            "border-radius:0 8px 8px 0;margin:0 0 20px;font-size:13px;color:#7c5a00;'>"
            "&#128274; For security reasons, we recommend changing your password after your first login.</p>"

            "<p style='margin:20px 0;'>"
            "<a href='{portal_url}' style='background:#1F4959;color:#fff;padding:11px 28px;"
            "border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;"
            "font-size:15px;'>Login to Portal &rarr;</a></p>"

            "<p>If you experience any issues or need assistance, you can create a support ticket "
            "directly through the customer portal.</p>"

            "<p style='margin:20px 0 4px;'>"
            "&#128231; Email: <a href='mailto:{support_email}' style='color:#1F4959;'>{support_email}</a><br/>"
            "&#128222; Phone: <strong>{support_phone}</strong>"
            "</p>"

            "<p style='margin-top:24px;'>Thank you for choosing <strong>True Data Broadband</strong>. "
            "We look forward to providing you with fast, reliable connectivity.</p>"

            "<p style='margin-top:20px;'>Regards,<br><strong>True Data Broadband Team</strong></p>"
        ),
        "approved_variables": [
            "customer_name", "customer_email", "temp_password",
            "plan_name", "portal_url", "support_email", "support_phone",
        ],
    },
    # ── OTP_LOGIN ─────────────────────────────────────────────────────────
    {
        "template_key": TemplateKey.OTP_LOGIN,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "TrueData : Your login OTP is {otp_code}."
            "This code is valid for 180 seconds. Do not share this OTP with anyone. "
            "If you did not request it, please ignore this message."
        ),
        "dlt_template_id": "1707178161067506187",
        "approved_variables": ["otp_code"],
    },
    {
        "template_key": TemplateKey.OTP_LOGIN,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your OTP - True Data Broadband",
        "body": (
            "<p>Dear Customer,</p>"
            "<p>Your One-Time Password (OTP) for True Data Broadband is:</p>"
            "<h2 style='letter-spacing:4px;'>{otp_code}</h2>"
            "<p>This OTP is valid for <strong>180 seconds</strong>.</p>"
            "<p><em>Do not share this OTP with anyone.</em></p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": ["otp_code"],
    },
    # ── SUBSCRIPTION_EXPIRING ─────────────────────────────────────────────
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRING,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "Dear {customer_name}, your TrueData plan expires on {expiry_date}. "
            "Renew now to enjoy uninterrupted service."
        ),
        "dlt_template_id": "1707178161061507836",
        "approved_variables": ["customer_name", "expiry_date"],
    },
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRING,
        "channel": NotificationChannel.EMAIL,
        "subject": "Action Required: Your Subscription Expires in {days_remaining} Day(s)",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>This is a reminder that your broadband subscription is expiring soon.</p>"
            "<ul>"
            "<li><strong>Plan:</strong> {plan_name}</li>"
            "<li><strong>Expiry Date:</strong> {expiry_date}</li>"
            "<li><strong>Days Remaining:</strong> {days_remaining}</li>"
            "</ul>"
            "<p>Please renew before the expiry date to avoid service interruption.</p>"
            "<p>Contact us: <a href='mailto:{support_email}'>{support_email}</a> / {support_phone}</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "plan_name", "expiry_date", "days_remaining",
            "portal_url", "support_email", "support_phone",
        ],
    },
    # ── SUBSCRIPTION_EXPIRED ──────────────────────────────────────────────
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRED,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "Dear {customer_name}, your TrueData plan has expired on {expiry_date}. "
            "Renew now to restore services. Call {support_phone}."
        ),
        "approved_variables": ["customer_name", "expiry_date", "support_phone"],
    },
    {
        "template_key": TemplateKey.SUBSCRIPTION_EXPIRED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your Subscription Has Expired",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>Your broadband subscription has expired.</p>"
            "<ul>"
            "<li><strong>Plan:</strong> {plan_name}</li>"
            "<li><strong>Expired On:</strong> {expiry_date}</li>"
            "</ul>"
            "<p>Please renew immediately to restore your internet services.</p>"
            "<p>Contact us: <a href='mailto:{support_email}'>{support_email}</a> / {support_phone}</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "plan_name", "expiry_date", "days_overdue",
            "portal_url", "support_email", "support_phone",
        ],
    },
    # ── INVOICE_GENERATED ─────────────────────────────────────────────────
    {
        "template_key": TemplateKey.INVOICE_GENERATED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Invoice {invoice_number} Generated - True Data Broadband",
        "body": (
            "<p>Dear <strong>{customer_name}</strong>,</p>"
            "<p>An invoice has been generated for your broadband service.</p>"
            "<ul>"
            "<li><strong>Invoice Number:</strong> {invoice_number}</li>"
            "<li><strong>Amount:</strong> &#8377;{amount}</li>"
            "<li><strong>Due Date:</strong> {due_date}</li>"
            "</ul>"
            "<p>Please make the payment before the due date.</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "invoice_number", "amount", "due_date", "portal_url",
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
    # ── SUPPORT_TICKET_CREATED ────────────────────────────────────────────
    {
        "template_key": TemplateKey.SUPPORT_TICKET_CREATED,
        "channel": NotificationChannel.EMAIL,
        "subject": "[New Support Ticket] {ticket_number} - {subject}",
        "body": (
            "<p>A new support ticket has been raised.</p>"
            "<table style='border-collapse:collapse;margin:12px 0;'>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Ticket #</td>"
            "<td style='padding:4px 0;font-weight:600;'>{ticket_number}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Customer</td>"
            "<td style='padding:4px 0;'>{customer_name} ({customer_code})</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Mobile</td>"
            "<td style='padding:4px 0;'>{customer_mobile}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Email</td>"
            "<td style='padding:4px 0;'>{customer_email}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Connection</td>"
            "<td style='padding:4px 0;'>{subscription_name}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Category</td>"
            "<td style='padding:4px 0;'>{category}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Priority</td>"
            "<td style='padding:4px 0;'>{priority}</td></tr>"
            "</table>"
            "<p><strong>Subject:</strong> {subject}</p>"
            "<p><strong>Description:</strong></p><p>{description}</p>"
            "<p><a href='{portal_url}' style='background:#1F4959;color:#fff;"
            "padding:8px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600;display:inline-block;'>View Ticket &rarr;</a></p>"
            "<p>Regards,<br>True Data Broadband Support System</p>"
        ),
        "approved_variables": [
            "ticket_number", "customer_name", "customer_code", "customer_mobile",
            "customer_email", "subscription_name", "category", "priority",
            "subject", "description", "portal_url",
        ],
    },
    # ── SUPPORT_TICKET_REPLY (client → admin) ─────────────────────────────
    {
        "template_key": TemplateKey.SUPPORT_TICKET_REPLY,
        "channel": NotificationChannel.EMAIL,
        "subject": "[Customer Reply] {ticket_number} - {subject}",
        "body": (
            "<p>A customer has replied to ticket <strong>{ticket_number}</strong>.</p>"
            "<table style='border-collapse:collapse;margin:12px 0;'>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Customer</td>"
            "<td style='padding:4px 0;font-weight:600;'>{customer_name}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Ticket #</td>"
            "<td style='padding:4px 0;'>{ticket_number}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Subject</td>"
            "<td style='padding:4px 0;'>{subject}</td></tr>"
            "</table>"
            "<p><strong>Message:</strong></p>"
            "<blockquote style='border-left:3px solid #1F4959;padding-left:12px;"
            "margin:8px 0;color:#333;'>{latest_message}</blockquote>"
            "<p><a href='{portal_url}' style='background:#1F4959;color:#fff;"
            "padding:8px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600;display:inline-block;'>View Ticket &rarr;</a></p>"
        ),
        "approved_variables": [
            "ticket_number", "customer_name", "subject", "latest_message", "portal_url",
        ],
    },
    # ── SUPPORT_TICKET_UPDATED (admin → customer) ─────────────────────────
    {
        "template_key": TemplateKey.SUPPORT_TICKET_UPDATED,
        "channel": NotificationChannel.EMAIL,
        "subject": "[Ticket Update] {ticket_number}",
        "body": (
            "<p>Dear Customer,</p>"
            "<p>Your support ticket <strong>{ticket_number}</strong> has been updated.</p>"
            "<table style='border-collapse:collapse;margin:12px 0;'>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Status</td>"
            "<td style='padding:4px 0;font-weight:600;'>{status}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Priority</td>"
            "<td style='padding:4px 0;'>{priority}</td></tr>"
            "</table>"
            "<p><strong>Message from our team:</strong></p>"
            "<blockquote style='border-left:3px solid #1F4959;padding-left:12px;"
            "margin:8px 0;color:#333;'>{latest_message}</blockquote>"
            "<p><a href='{portal_url}' style='background:#1F4959;color:#fff;"
            "padding:8px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600;display:inline-block;'>View Ticket &rarr;</a></p>"
            "<p>Regards,<br>True Data Broadband Support Team</p>"
        ),
        "approved_variables": [
            "ticket_number", "status", "priority", "latest_message", "portal_url",
        ],
    },
    # ── SUPPORT_TICKET_RESOLVED (admin → customer) ────────────────────────
    {
        "template_key": TemplateKey.SUPPORT_TICKET_RESOLVED,
        "channel": NotificationChannel.EMAIL,
        "subject": "[Ticket Resolved] {ticket_number}",
        "body": (
            "<p>Dear Customer,</p>"
            "<p>We are happy to inform you that your support ticket "
            "<strong>{ticket_number}</strong> has been resolved.</p>"
            "<p><strong>Resolution Notes:</strong></p>"
            "<blockquote style='border-left:3px solid #27ae60;padding-left:12px;"
            "margin:8px 0;color:#333;'>{resolution_notes}</blockquote>"
            "<p>If you feel this issue is not resolved, you can reopen the ticket "
            "from your client portal.</p>"
            "<p><a href='{portal_url}' style='background:#1F4959;color:#fff;"
            "padding:8px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600;display:inline-block;'>View Ticket &rarr;</a></p>"
            "<p>Thank you for choosing True Data Broadband.</p>"
            "<p>Regards,<br>True Data Broadband Support Team</p>"
        ),
        "approved_variables": [
            "ticket_number", "resolution_notes", "portal_url",
        ],
    },
    # ── SUBSCRIPTION_ACTIVATED ────────────────────────────────────────────
    {
        "template_key": TemplateKey.SUBSCRIPTION_ACTIVATED,
        "channel": NotificationChannel.SMS,
        "subject": None,
        "body": (
            "TrueData: Your broadband subscription {subscription_code} is now active. "
            "Plan: {plan_name}. Valid till {expiry_date}. "
            "Login: {portal_url}"
        ),
        "approved_variables": [
            "subscription_code", "plan_name", "expiry_date", "portal_url",
        ],
    },
    {
        "template_key": TemplateKey.SUBSCRIPTION_ACTIVATED,
        "channel": NotificationChannel.EMAIL,
        "subject": "Your Broadband Subscription is Active - True Data Broadband",
        "body": (
            "<p>Dear {customer_name},</p>"
            "<p>Your broadband subscription has been activated successfully. "
            "Here are your connection details:</p>"
            "<table style='border-collapse:collapse;margin:12px 0;'>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Subscription&nbsp;#</td>"
            "<td style='padding:4px 0;font-weight:600;'>{subscription_code}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Plan</td>"
            "<td style='padding:4px 0;'>{plan_name}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Billing Cycle</td>"
            "<td style='padding:4px 0;'>{billing_cycle}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Start Date</td>"
            "<td style='padding:4px 0;'>{start_date}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Expiry Date</td>"
            "<td style='padding:4px 0;'>{expiry_date}</td></tr>"
            "<tr><td style='padding:4px 16px 4px 0;color:#555;'>Amount</td>"
            "<td style='padding:4px 0;font-weight:600;'>&#8377;{total_price}</td></tr>"
            "</table>"
            "<p><a href='{portal_url}' style='background:#1F4959;color:#fff;"
            "padding:8px 20px;border-radius:8px;text-decoration:none;"
            "font-weight:600;display:inline-block;'>Access Client Portal &rarr;</a></p>"
            "<p>Thank you for choosing True Data Broadband.</p>"
            "<p>Regards,<br>True Data Broadband Team</p>"
        ),
        "approved_variables": [
            "customer_name", "subscription_code", "plan_name", "billing_cycle",
            "start_date", "expiry_date", "total_price", "portal_url", "connection_name",
        ],
    },
]


def seed_notification_templates() -> None:
    """Create default notification templates if they do not already exist."""
    from app.repositories.notification_template import NotificationTemplateRepository

    db = SessionLocal()
    try:
        repo = NotificationTemplateRepository(db)
        created = updated = 0
        for tmpl in _DEFAULT_TEMPLATES:
            tk = tmpl["template_key"]
            ch = tmpl["channel"]
            tk_val = tk.value if hasattr(tk, "value") else str(tk)
            ch_val = ch.value if hasattr(ch, "value") else str(ch)
            existing = repo.get_by_key_and_channel(tk_val, ch_val)
            repo.upsert(
                template_key=tk_val,
                channel=ch_val,
                subject=tmpl.get("subject"),
                body=tmpl["body"],
                dlt_template_id=tmpl.get("dlt_template_id"),
                approved_variables=tmpl.get("approved_variables"),
            )
            if existing is None:
                created += 1
            else:
                updated += 1
        logger.info("seed.notification_templates.done", created=created, updated=updated)
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
