"""SMS service — provider abstraction layer."""
from __future__ import annotations

from dataclasses import dataclass

from app.core.logging import get_logger
from app.models.notification import DLT_REQUIRED_KEYS, TemplateKey
from .providers.base import BaseSmsProvider, SmsProviderConfig, SmsResult
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

        sms_settings keys: provider, api_key, sender_id, base_url, entity_id
        """
        if not sms_settings or not sms_settings.get("provider"):
            return SmsSendResult(
                success=False,
                error="SMS provider not configured — set sms_provider in Company Settings",
            )

        provider_name: str = sms_settings["provider"]
        api_key = sms_settings.get("api_key") or ""
        sender_id = sms_settings.get("sender_id") or ""

        if not api_key:
            return SmsSendResult(
                success=False,
                provider_name=provider_name,
                error="SMS api_key not configured",
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
            sender_id=sender_id,
            base_url=sms_settings.get("base_url"),
            entity_id=sms_settings.get("entity_id"),
        )
        provider: BaseSmsProvider = self._get_provider(provider_name, config)

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
        )

    @staticmethod
    def _get_provider(provider_name: str, config: SmsProviderConfig) -> BaseSmsProvider:
        mapping = {
            "MSG91": Msg91Provider,
            "TEXTLOCAL": TextLocalProvider,
            "TWILIO": TwilioProvider,
        }
        cls = mapping.get(provider_name.upper())
        if cls is None:
            raise ValueError(f"Unknown SMS provider: {provider_name}")
        return cls(config)
