"""Abstract base class for SMS providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SmsProviderConfig:
    api_key: str
    sender_id: str
    base_url: str | None = None
    entity_id: str | None = None


@dataclass
class SmsResult:
    success: bool
    provider_message_id: str | None = None
    raw_response: dict | None = None
    error: str | None = None


class BaseSmsProvider(ABC):
    """All SMS provider implementations must satisfy this interface."""

    def __init__(self, config: SmsProviderConfig) -> None:
        self.config = config

    @abstractmethod
    def send(
        self,
        mobile: str,
        message: str,
        dlt_template_id: str | None = None,
        dlt_entity_id: str | None = None,
    ) -> SmsResult:
        """Send an SMS and return a result object."""
        ...
