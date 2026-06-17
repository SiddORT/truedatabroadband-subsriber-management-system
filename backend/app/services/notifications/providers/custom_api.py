"""CUSTOM_API SMS provider — configurable GET-based SMS gateway."""
from __future__ import annotations

import time

import httpx

from app.core.logging import get_logger
from .base import BaseSmsProvider, SmsProviderConfig, SmsResult

logger = get_logger(__name__)

_SEND_PATH = "/api/v2/SendSMS"
_STATUS_PATH = "/api/v2/SMS"
_TIMEOUT = 10
_MAX_RETRIES = 3


class CustomApiProvider(BaseSmsProvider):
    """Configurable GET-based SMS provider.

    Send:   GET {base_url}/api/v2/SendSMS?ApiKey=...&ClientId=...&SenderId=...&Message=...&MobileNumbers=...
    Status: GET {status_url}/api/v2/SMS?ApiKey=...&ClientId=...&MessageId=...
    """

    def __init__(self, config: SmsProviderConfig, client_id: str | None = None, status_url: str | None = None) -> None:
        super().__init__(config)
        self.client_id = client_id or ""
        self.status_url = status_url or config.base_url or ""

    def send(
        self,
        mobile: str,
        message: str,
        dlt_template_id: str | None = None,
        dlt_entity_id: str | None = None,
    ) -> SmsResult:
        if not self.config.base_url:
            return SmsResult(success=False, error="sms_api_base_url not configured")

        url = self.config.base_url.rstrip("/") + _SEND_PATH
        params: dict = {
            "ApiKey": self.config.api_key,
            "ClientId": self.client_id,
            "SenderId": self.config.sender_id,
            "Message": message,
            "MobileNumbers": mobile,
        }
        if dlt_entity_id:
            params["EntityId"] = dlt_entity_id
        if dlt_template_id:
            params["DLTTemplateId"] = dlt_template_id

        for attempt in range(_MAX_RETRIES):
            try:
                resp = httpx.get(url, params=params, timeout=_TIMEOUT)
                data: dict = {}
                try:
                    data = resp.json()
                except Exception:
                    data = {"raw": resp.text}

                # Mask credentials from the stored response
                safe_params = {k: v for k, v in params.items() if k not in ("ApiKey", "ClientId")}
                safe_params["ApiKey"] = "***"
                safe_params["ClientId"] = "***"

                success = resp.status_code == 200 and self._is_success(data)
                msg_id = self._extract_message_id(data)

                if success:
                    return SmsResult(
                        success=True,
                        provider_message_id=msg_id,
                        raw_response=data,
                    )

                error_msg = self._extract_error(data, resp.status_code)
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
                    continue

                return SmsResult(success=False, error=error_msg, raw_response=data)

            except httpx.TimeoutException:
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
                    continue
                return SmsResult(success=False, error="Request timed out after retries")
            except Exception as exc:
                logger.error("custom_api.send.error", attempt=attempt, error=str(exc))
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
                    continue
                return SmsResult(success=False, error=str(exc))

        return SmsResult(success=False, error="All retries exhausted")

    def get_status(self, provider_message_id: str) -> SmsResult:
        """Fetch delivery status for a previously sent message."""
        if not self.status_url:
            return SmsResult(success=False, error="sms_status_api_url not configured")

        url = self.status_url.rstrip("/") + _STATUS_PATH
        params = {
            "ApiKey": self.config.api_key,
            "ClientId": self.client_id,
            "MessageId": provider_message_id,
        }

        try:
            resp = httpx.get(url, params=params, timeout=_TIMEOUT)
            data: dict = {}
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}

            return SmsResult(
                success=resp.status_code == 200,
                provider_message_id=provider_message_id,
                raw_response=data,
            )
        except Exception as exc:
            logger.error("custom_api.get_status.error", error=str(exc))
            return SmsResult(success=False, error=str(exc))

    @staticmethod
    def _is_success(data: dict) -> bool:
        """Try multiple common success indicators."""
        if isinstance(data.get("Status"), int) and data["Status"] == 0:
            return True
        if str(data.get("Status", "")).upper() in ("SUCCESS", "OK", "SENT"):
            return True
        if str(data.get("status", "")).upper() in ("SUCCESS", "OK", "SENT"):
            return True
        if data.get("ErrorCode") == "000":
            return True
        return False

    @staticmethod
    def _extract_message_id(data: dict) -> str | None:
        for key in ("MessageId", "message_id", "msgid", "Id", "id"):
            if val := data.get(key):
                return str(val)
        return None

    @staticmethod
    def _extract_error(data: dict, status_code: int) -> str:
        for key in ("ErrorMessage", "error_message", "error", "Message", "message"):
            if val := data.get(key):
                return str(val)
        return f"HTTP {status_code}"
