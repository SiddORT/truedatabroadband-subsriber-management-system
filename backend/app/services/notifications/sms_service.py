"""SMS service — provider abstraction layer."""
from __future__ import annotations

from dataclasses import dataclass

from app.core.logging import get_logger
from app.models.notification import DLT_REQUIRED_KEYS, TemplateKey
from .providers.base import BaseSmsProvider, SmsProviderConfig, SmsResult
from .providers.custom_api import CustomApiProvider
from .providers.msg91 import Msg91Provider
from .providers.textlocal import TextLocalProvider
from .providers.twilio import TwilioProvider

logger = get_logger(__name__)


@dataclass
class SmsSendResult:
    success: bool
    provider_name: str | None = None
    provider_message_id: str | None = None
    error: str | None = None
    raw_response: dict | None = None


class SmsService:
    """Selects provider dynamically from company_settings and sends SMS."""

    def send(
        self,
        mobile_number: str,
        template_key: str,
        rendered_body: str,
        dlt_template_id: str | None = None,
        dlt_entity_id: str | None = None,
        sms_settings: dict | None = None,
    ) -> SmsSendResult:
        """Send an SMS.

        sms_settings keys: is_enabled, provider, api_key, client_id,
                           sender_id, base_url, status_url, entity_id
        """
        if not sms_settings or not sms_settings.get("is_enabled", False):
            return SmsSendResult(
                success=False,
                error="SMS is disabled — enable it in Communication Settings",
            )

        provider_name: str = sms_settings.get("provider") or ""
        if not provider_name:
            return SmsSendResult(success=False, error="SMS provider not configured")

        api_key = sms_settings.get("api_key") or ""
        if not api_key:
            return SmsSendResult(
                success=False,
                provider_name=provider_name,
                error="SMS API key not configured",
            )

        # DLT validation for required template keys
        tk = TemplateKey(template_key) if template_key in TemplateKey._value2member_map_ else None
        if tk in DLT_REQUIRED_KEYS:
            if not dlt_template_id:
                return SmsSendResult(
                    success=False,
                    provider_name=provider_name,
                    error=f"DLT template_id required for {template_key} but not set in template",
                )

        config = SmsProviderConfig(
            api_key=api_key,
            sender_id=sms_settings.get("sender_id") or "",
            base_url=sms_settings.get("base_url"),
            entity_id=sms_settings.get("entity_id"),
        )
        provider = self._get_provider(provider_name, config, sms_settings)

        result: SmsResult = provider.send(
            mobile=mobile_number,
            message=rendered_body,
            dlt_template_id=dlt_template_id,
            dlt_entity_id=dlt_entity_id or config.entity_id,
        )

        return SmsSendResult(
            success=result.success,
            provider_name=provider_name,
            provider_message_id=result.provider_message_id,
            error=result.error,
            raw_response=result.raw_response,
        )

    def get_status(
        self,
        provider_message_id: str,
        sms_settings: dict | None = None,
    ) -> SmsSendResult:
        """Fetch delivery status from the provider."""
        if not sms_settings or not sms_settings.get("provider"):
            return SmsSendResult(success=False, error="SMS provider not configured")

        provider_name = sms_settings["provider"]
        api_key = sms_settings.get("api_key") or ""
        config = SmsProviderConfig(
            api_key=api_key,
            sender_id=sms_settings.get("sender_id") or "",
            base_url=sms_settings.get("base_url"),
            entity_id=sms_settings.get("entity_id"),
        )
        provider = self._get_provider(provider_name, config, sms_settings)

        if not hasattr(provider, "get_status"):
            return SmsSendResult(
                success=False,
                error=f"get_status not supported by {provider_name}",
            )

        result: SmsResult = provider.get_status(provider_message_id)  # type: ignore[attr-defined]
        return SmsSendResult(
            success=result.success,
            provider_name=provider_name,
            provider_message_id=result.provider_message_id,
            error=result.error,
            raw_response=result.raw_response,
        )

    @staticmethod
    def _get_provider(
        provider_name: str,
        config: SmsProviderConfig,
        sms_settings: dict,
    ) -> BaseSmsProvider:
        name = provider_name.upper()
        if name == "CUSTOM_API":
            return CustomApiProvider(
                config,
                client_id=sms_settings.get("client_id") or "",
                status_url=sms_settings.get("status_url"),
            )
        mapping = {
            "MSG91": Msg91Provider,
            "TEXTLOCAL": TextLocalProvider,
            "TWILIO": TwilioProvider,
        }
        cls = mapping.get(name)
        if cls is None:
            raise ValueError(f"Unknown SMS provider: {provider_name}")
        return cls(config)
