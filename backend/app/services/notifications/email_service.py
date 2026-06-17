"""SMTP email service."""
from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class EmailResult:
    success: bool
    error: str | None = None


@dataclass
class Attachment:
    filename: str
    data: bytes
    mime_type: str = "application/octet-stream"


class EmailService:
    """SMTP email sender. Settings are loaded lazily from company_settings."""

    def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        attachments: list[Attachment] | None = None,
        smtp_settings: dict | None = None,
    ) -> EmailResult:
        """Send an HTML email.

        smtp_settings keys: host, port, username, password, from_email,
                            from_name, use_tls, use_ssl
        """
        if not smtp_settings or not smtp_settings.get("host"):
            return EmailResult(
                success=False,
                error="SMTP not configured — set smtp_host in Company Settings",
            )

        host = smtp_settings["host"]
        port = smtp_settings.get("port") or 587
        username = smtp_settings.get("username") or ""
        password = smtp_settings.get("password") or ""
        from_email = smtp_settings.get("from_email") or username
        from_name = smtp_settings.get("from_name") or from_email
        use_tls = smtp_settings.get("use_tls", True)
        use_ssl = smtp_settings.get("use_ssl", False)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        msg.attach(MIMEText(html_body, "html", "utf-8"))

        for att in (attachments or []):
            part = MIMEBase(*att.mime_type.split("/", 1))
            part.set_payload(att.data)
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition", "attachment", filename=att.filename
            )
            msg.attach(part)

        try:
            if use_ssl:
                smtp = smtplib.SMTP_SSL(host, port, timeout=15)
            else:
                smtp = smtplib.SMTP(host, port, timeout=15)
                if use_tls:
                    smtp.starttls()

            if username and password:
                smtp.login(username, password)

            smtp.sendmail(from_email, to_email, msg.as_string())
            smtp.quit()
            logger.info("email_service.sent", to=to_email, subject=subject)
            return EmailResult(success=True)
        except Exception as exc:
            logger.error("email_service.error", to=to_email, error=str(exc))
            return EmailResult(success=False, error=str(exc))
