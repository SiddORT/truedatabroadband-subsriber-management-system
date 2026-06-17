"""Pydantic v2 schemas for the notification framework."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Template schemas
# ---------------------------------------------------------------------------


class NotificationTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_key: str
    channel: str
    subject: Optional[str] = None
    body: str
    is_active: bool
    dlt_template_id: Optional[str] = None
    dlt_entity_id: Optional[str] = None
    approved_variables: Optional[list[str]] = None
    created_at: datetime
    updated_at: datetime


class NotificationTemplateUpdate(BaseModel):
    """Only editable fields — template_key and dlt_template_id are immutable."""

    subject: Optional[str] = Field(None, max_length=255)
    body: Optional[str] = Field(None, min_length=1)
    is_active: Optional[bool] = None
    approved_variables: Optional[list[str]] = None


# ---------------------------------------------------------------------------
# Log schemas
# ---------------------------------------------------------------------------


class NotificationLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    template_key: str
    channel: str
    recipient_email: Optional[str] = None
    recipient_mobile: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    subscription_id: Optional[UUID] = None
    days_offset: Optional[int] = None
    provider_name: Optional[str] = None
    provider_message_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    sent_at: Optional[datetime] = None


class NotificationLogListResponse(BaseModel):
    items: list[NotificationLogOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Preference schemas
# ---------------------------------------------------------------------------


class NotificationPreferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    customer_id: UUID
    welcome_sms_enabled: bool
    welcome_email_enabled: bool
    renewal_sms_enabled: bool
    renewal_email_enabled: bool
    invoice_email_enabled: bool
    payment_email_enabled: bool
    otp_sms_enabled: bool
    otp_email_enabled: bool
    created_at: datetime
    updated_at: datetime


class NotificationPreferenceUpdate(BaseModel):
    welcome_sms_enabled: Optional[bool] = None
    welcome_email_enabled: Optional[bool] = None
    renewal_sms_enabled: Optional[bool] = None
    renewal_email_enabled: Optional[bool] = None
    invoice_email_enabled: Optional[bool] = None
    payment_email_enabled: Optional[bool] = None
    otp_sms_enabled: Optional[bool] = None
    otp_email_enabled: Optional[bool] = None


# ---------------------------------------------------------------------------
# Test-send schemas
# ---------------------------------------------------------------------------


class TestEmailRequest(BaseModel):
    to_email: str = Field(..., min_length=1)
    subject: str = Field(default="Test Email from True Data Broadband")
    body: str = Field(default="This is a test email to verify SMTP configuration.")


class TestSmsRequest(BaseModel):
    to_mobile: str = Field(..., min_length=10, max_length=15)
    message: str = Field(default="Test SMS from True Data Broadband.")


class TestSendResponse(BaseModel):
    success: bool
    message: str
    provider_response: Optional[Any] = None
