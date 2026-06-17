"""Pydantic schemas for the Support Ticket module."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.support_ticket import TicketCategory, TicketPriority, TicketStatus


# ---------------------------------------------------------------------------
# Attachment
# ---------------------------------------------------------------------------


class TicketAttachmentOut(BaseModel):
    id: uuid.UUID
    ticket_message_id: uuid.UUID
    original_filename: str
    file_name: str
    file_size: int
    mime_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Message
# ---------------------------------------------------------------------------


class TicketMessageOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    sender_user_id: uuid.UUID
    sender_name: str = ""
    sender_role: str = ""
    message: str
    is_internal_note: bool
    created_at: datetime
    attachments: list[TicketAttachmentOut] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Client schemas
# ---------------------------------------------------------------------------


class ClientTicketCreate(BaseModel):
    subject: str = Field(..., min_length=5, max_length=255)
    description: str = Field(..., min_length=10)
    category: TicketCategory
    subscription_id: Optional[uuid.UUID] = None


class ClientTicketReply(BaseModel):
    message: str = Field(..., min_length=1)


class ClientTicketListItem(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    category: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClientTicketOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: str
    category: str
    status: str
    priority: str
    subscription_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    messages: list[TicketMessageOut] = []

    model_config = {"from_attributes": True}


class ClientTicketsPage(BaseModel):
    items: list[ClientTicketListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Admin schemas
# ---------------------------------------------------------------------------


class AdminTicketListItem(BaseModel):
    id: uuid.UUID
    ticket_number: str
    customer_name: str = ""
    customer_code: str = ""
    connection_name: str = ""
    subject: str
    category: str
    priority: str
    status: str
    assigned_to_name: str = ""
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerContext(BaseModel):
    customer_name: str
    customer_code: str
    mobile_number: str
    email: str


class SubscriptionContext(BaseModel):
    connection_name: str
    plan_name: str
    expiry_date: Optional[datetime]


class AdminTicketOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: str
    category: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime
    first_response_at: Optional[datetime]
    resolved_at: Optional[datetime]
    closed_at: Optional[datetime]
    assigned_to_user_id: Optional[uuid.UUID]
    assigned_to_name: str = ""
    customer: CustomerContext
    subscription: Optional[SubscriptionContext]
    outstanding_amount: float = 0.0
    messages: list[TicketMessageOut] = []

    model_config = {"from_attributes": True}


class AdminTicketUpdate(BaseModel):
    priority: Optional[TicketPriority] = None
    status: Optional[TicketStatus] = None
    assigned_to_user_id: Optional[uuid.UUID] = None


class AdminReplyCreate(BaseModel):
    message: str = Field(..., min_length=1)
    is_internal_note: bool = False


class AdminTicketsPage(BaseModel):
    items: list[AdminTicketListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# ---------------------------------------------------------------------------
# Admin notifications
# ---------------------------------------------------------------------------


class AdminNotificationOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    notification_type: str
    title: str
    message: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    action_url: Optional[str]
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AdminNotificationsPage(BaseModel):
    items: list[AdminNotificationOut]
    total: int
    unread_count: int


# ---------------------------------------------------------------------------
# Dashboard support widget
# ---------------------------------------------------------------------------


class SupportDashboardStats(BaseModel):
    open_tickets: int
    high_priority_tickets: int
    waiting_for_customer: int
    resolved_today: int
    recent_tickets: list[AdminTicketListItem]
