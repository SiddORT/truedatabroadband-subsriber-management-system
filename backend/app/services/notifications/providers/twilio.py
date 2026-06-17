"""Twilio SMS provider."""
from __future__ import annotations

import base64

import httpx

from app.core.logging import get_logger
from .base import BaseSmsProvider, SmsResult

logger = get_logger(__name__)


class TwilioProvider(BaseSmsProvider):
    """Twilio expects api_key as "account_sid:auth_token" joined with colon."""

    def send(
        self,
        mobile: str,
        message: str,
        dlt_template_id: str | None = None,
        dlt_entity_id: str | None = None,
    ) -> SmsResult:
        try:
            account_sid, auth_token = self.config.api_key.split(":", 1)
        except ValueError:
            return SmsResult(
                success=False,
                error="Twilio api_key must be 'account_sid:auth_token'",
            )

        url = (
            self.config.base_url
            or f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        )
        data = {
            "From": self.config.sender_id,
            "To": f"+{mobile}",
            "Body": message,
        }
        credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
        headers = {"Authorization": f"Basic {credentials}"}
        try:
            resp = httpx.post(url, data=data, headers=headers, timeout=10)
            body = resp.json() if resp.content else {}
            success = resp.status_code in (200, 201)
            return SmsResult(
                success=success,
                provider_message_id=body.get("sid"),
                raw_response=body,
                error=None if success else body.get("message", str(body)),
            )
        except Exception as exc:
            logger.error("twilio.send.error", error=str(exc))
            return SmsResult(success=False, error=str(exc))
