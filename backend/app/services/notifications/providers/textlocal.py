"""TextLocal SMS provider."""
from __future__ import annotations

import httpx

from app.core.logging import get_logger
from .base import BaseSmsProvider, SmsResult

logger = get_logger(__name__)

DEFAULT_URL = "https://api.textlocal.in/send/"


class TextLocalProvider(BaseSmsProvider):
    def send(
        self,
        mobile: str,
        message: str,
        dlt_template_id: str | None = None,
        dlt_entity_id: str | None = None,
    ) -> SmsResult:
        url = self.config.base_url or DEFAULT_URL
        data = {
            "apikey": self.config.api_key,
            "numbers": mobile,
            "message": message,
            "sender": self.config.sender_id,
        }
        if dlt_template_id:
            data["template_id"] = dlt_template_id
        try:
            resp = httpx.post(url, data=data, timeout=10)
            body = resp.json() if resp.content else {}
            success = resp.status_code == 200 and body.get("status") == "success"
            msg_id = None
            if success and body.get("messages"):
                msg_id = str(body["messages"][0].get("id", ""))
            return SmsResult(
                success=success,
                provider_message_id=msg_id,
                raw_response=body,
                error=None if success else str(body),
            )
        except Exception as exc:
            logger.error("textlocal.send.error", error=str(exc))
            return SmsResult(success=False, error=str(exc))
