"""MSG91 SMS provider."""
from __future__ import annotations

import httpx

from app.core.logging import get_logger
from .base import BaseSmsProvider, SmsProviderConfig, SmsResult

logger = get_logger(__name__)

DEFAULT_URL = "https://api.msg91.com/api/v5/flow/"


class Msg91Provider(BaseSmsProvider):
    def send(
        self,
        mobile: str,
        message: str,
        dlt_template_id: str | None = None,
        dlt_entity_id: str | None = None,
    ) -> SmsResult:
        url = self.config.base_url or DEFAULT_URL
        payload: dict = {
            "sender": self.config.sender_id,
            "route": "4",  # transactional
            "country": "91",
            "sms": [
                {
                    "message": message,
                    "to": [mobile],
                }
            ],
        }
        if dlt_template_id:
            payload["sms"][0]["template_id"] = dlt_template_id
        if dlt_entity_id or self.config.entity_id:
            payload["entity_id"] = dlt_entity_id or self.config.entity_id

        headers = {"authkey": self.config.api_key, "content-type": "application/json"}
        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=10)
            data = resp.json() if resp.content else {}
            success = resp.status_code == 200 and data.get("type") == "success"
            return SmsResult(
                success=success,
                provider_message_id=data.get("message"),
                raw_response=data,
                error=None if success else str(data),
            )
        except Exception as exc:
            logger.error("msg91.send.error", error=str(exc))
            return SmsResult(success=False, error=str(exc))
