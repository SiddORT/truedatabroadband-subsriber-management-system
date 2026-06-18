"""Support ticket service — business logic, orchestration, notifications."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models.admin_notification import AdminNotification, AdminNotificationType
from app.models.audit_log import (
    ACTION_SUPPORT_EMAIL_FAILED,
    ACTION_SUPPORT_EMAIL_SENT,
    ACTION_SUPPORT_NOTIFICATION_CREATED,
    ACTION_SUPPORT_TICKET_ASSIGNED,
    ACTION_SUPPORT_TICKET_CLOSED,
    ACTION_SUPPORT_TICKET_CREATED,
    ACTION_SUPPORT_TICKET_INTERNAL_NOTE,
    ACTION_SUPPORT_TICKET_REPLIED,
    ACTION_SUPPORT_TICKET_RESOLVED,
    ACTION_SUPPORT_TICKET_UPDATED,
    AuditLog,
)
from app.models.notification import TemplateKey
from app.models.support_ticket import (
    ALLOWED_TRANSITIONS,
    SupportTicket,
    TicketAttachment,
    TicketMessage,
    TicketStatus,
)
from app.models.user import User, UserRole
from app.repositories.admin_notification import AdminNotificationRepository
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company_settings import CompanySettingsRepository
from app.repositories.customer import CustomerRepository
from app.repositories.support_ticket import (
    SupportTicketRepository,
    TicketAttachmentRepository,
    TicketMessageRepository,
)
from app.schemas.support_ticket import AdminTicketUpdate, ClientTicketCreate
from app.services.notifications.notification_service import NotificationService, Recipient

logger = get_logger(__name__)


class SupportError(Exception):
    pass


class SupportTicketService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = SupportTicketRepository(db)
        self.msg_repo = TicketMessageRepository(db)
        self.att_repo = TicketAttachmentRepository(db)
        self.notif_repo = AdminNotificationRepository(db)
        self.audit_repo = AuditLogRepository(db)
        self.notif_svc = NotificationService(db)
        self.cs_repo = CompanySettingsRepository(db)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _portal_url(self, path: str = "") -> str:
        base = settings.SITE_URL.rstrip("/") if settings.SITE_URL else ""
        return f"{base}{path}" if base else path

    def _get_superadmins(self) -> list[User]:
        return list(
            self.db.scalars(
                select(User).where(
                    User.role == UserRole.SUPERADMIN,
                    User.is_active.is_(True),
                    User.deleted_at.is_(None),
                )
            ).all()
        )

    def _create_admin_notifications(
        self,
        ticket: SupportTicket,
        title: str,
        message: str,
        actor_user_id: uuid.UUID | None = None,
    ) -> None:
        admins = self._get_superadmins()
        action_url = f"/admin/support/{ticket.id}"
        notifs = [
            AdminNotification(
                user_id=admin.id,
                notification_type=AdminNotificationType.SUPPORT,
                title=title,
                message=message,
                entity_type="support_ticket",
                entity_id=str(ticket.id),
                action_url=action_url,
            )
            for admin in admins
            if actor_user_id is None or admin.id != actor_user_id
        ]
        if notifs:
            self.notif_repo.create_bulk(notifs)
        self.audit_repo.log(
            action=ACTION_SUPPORT_NOTIFICATION_CREATED,
            entity_type="support_ticket",
            entity_id=str(ticket.id),
            entity_name=ticket.ticket_number,
            new_values={"notification_count": len(notifs)},
        )

    def _send_support_email(
        self,
        template_key: str,
        recipient_email: str,
        variables: dict,
        ticket: SupportTicket,
    ) -> None:
        try:
            self.notif_svc.send(
                template_key=template_key,
                recipient=Recipient(email=recipient_email),
                variables=variables,
                entity_type="support_ticket",
                entity_id=str(ticket.id),
            )
            self.audit_repo.log(
                action=ACTION_SUPPORT_EMAIL_SENT,
                entity_type="support_ticket",
                entity_id=str(ticket.id),
                entity_name=ticket.ticket_number,
                new_values={"template": template_key, "to": recipient_email},
            )
        except Exception as exc:
            logger.warning(
                "support.email_failed",
                template=template_key,
                to=recipient_email,
                error=str(exc),
            )
            self.audit_repo.log(
                action=ACTION_SUPPORT_EMAIL_FAILED,
                entity_type="support_ticket",
                entity_id=str(ticket.id),
                entity_name=ticket.ticket_number,
                new_values={"template": template_key, "error": str(exc)},
            )

    # ------------------------------------------------------------------
    # Client: create ticket
    # ------------------------------------------------------------------

    def create_ticket(
        self,
        payload: ClientTicketCreate,
        customer_id: uuid.UUID,
        creator_user_id: uuid.UUID,
        *,
        actor_ip: str | None = None,
        actor_ua: str | None = None,
    ) -> SupportTicket:
        ticket_number = self.repo.generate_next_ticket_number()

        ticket = SupportTicket(
            ticket_number=ticket_number,
            customer_id=customer_id,
            subscription_id=payload.subscription_id,
            created_by_user_id=creator_user_id,
            subject=payload.subject,
            description=payload.description,
            category=payload.category.value,
            priority="MEDIUM",
            status=TicketStatus.OPEN,
        )
        ticket = self.repo.create(ticket)

        # Initial message from description
        msg = TicketMessage(
            ticket_id=ticket.id,
            sender_user_id=creator_user_id,
            message=payload.description,
            is_internal_note=False,
        )
        self.msg_repo.create(msg)

        # Audit log
        self.audit_repo.log(
            action=ACTION_SUPPORT_TICKET_CREATED,
            entity_type="support_ticket",
            entity_id=str(ticket.id),
            entity_name=ticket_number,
            user_id=creator_user_id,
            ip_address=actor_ip,
            user_agent=actor_ua,
            new_values={
                "subject": payload.subject,
                "category": payload.category.value,
                "priority": "MEDIUM",
            },
        )

        # Admin portal notifications
        customer = CustomerRepository(self.db).get(customer_id)
        customer_name = customer.full_name if customer else "Unknown"
        self._create_admin_notifications(
            ticket,
            title=f"New Support Ticket: {ticket_number}",
            message=f"{customer_name} raised a ticket — {payload.subject}",
        )

        # Email to support_email
        cs = self.cs_repo.get_or_create()
        support_email = cs.support_email or "admin@truedatabroadband.com"
        subscription_name = ""
        if payload.subscription_id:
            from app.models.subscription import Subscription
            sub = self.db.get(Subscription, payload.subscription_id)
            if sub:
                subscription_name = sub.connection_name or sub.plan_name_snapshot or ""

        self._send_support_email(
            TemplateKey.SUPPORT_TICKET_CREATED.value,
            support_email,
            {
                "ticket_number": ticket_number,
                "customer_name": customer_name,
                "customer_code": customer.customer_code if customer else "",
                "customer_mobile": customer.mobile_number if customer else "",
                "customer_email": customer.email if customer else "",
                "subscription_name": subscription_name,
                "category": payload.category.value.replace("_", " ").title(),
                "priority": "Medium",
                "subject": payload.subject,
                "description": payload.description,
                "portal_url": self._portal_url(f"/admin/support/{ticket.id}"),
            },
            ticket,
        )

        return ticket

    # ------------------------------------------------------------------
    # Client: reply
    # ------------------------------------------------------------------

    def client_reply(
        self,
        ticket: SupportTicket,
        sender_user_id: uuid.UUID,
        message_text: str,
        *,
        actor_ip: str | None = None,
        actor_ua: str | None = None,
    ) -> TicketMessage:
        if ticket.status == TicketStatus.CLOSED:
            raise SupportError("Closed tickets cannot receive replies.")

        msg = TicketMessage(
            ticket_id=ticket.id,
            sender_user_id=sender_user_id,
            message=message_text,
            is_internal_note=False,
        )
        msg = self.msg_repo.create(msg)

        # Auto-move from WAITING_FOR_CUSTOMER → IN_PROGRESS
        if ticket.status == TicketStatus.WAITING_FOR_CUSTOMER:
            ticket.status = TicketStatus.IN_PROGRESS
            self.repo.update(ticket)

        self.audit_repo.log(
            action=ACTION_SUPPORT_TICKET_REPLIED,
            entity_type="support_ticket",
            entity_id=str(ticket.id),
            entity_name=ticket.ticket_number,
            user_id=sender_user_id,
            ip_address=actor_ip,
            user_agent=actor_ua,
        )

        # Admin portal notifications
        customer = CustomerRepository(self.db).get_by_id(ticket.customer_id)
        customer_name = customer.full_name if customer else "Unknown"
        self._create_admin_notifications(
            ticket,
            title=f"Customer Reply: {ticket.ticket_number}",
            message=f"{customer_name} replied — {ticket.subject}",
        )

        # Email to support_email
        cs = self.cs_repo.get_or_create()
        support_email = cs.support_email or "admin@truedatabroadband.com"
        self._send_support_email(
            TemplateKey.SUPPORT_TICKET_REPLY.value,
            support_email,
            {
                "ticket_number": ticket.ticket_number,
                "customer_name": customer_name,
                "subject": ticket.subject,
                "latest_message": message_text,
                "portal_url": self._portal_url(f"/admin/support/{ticket.id}"),
            },
            ticket,
        )

        return msg

    # ------------------------------------------------------------------
    # Admin: reply / internal note
    # ------------------------------------------------------------------

    def admin_reply(
        self,
        ticket: SupportTicket,
        sender_user_id: uuid.UUID,
        message_text: str,
        is_internal_note: bool = False,
        *,
        actor_ip: str | None = None,
        actor_ua: str | None = None,
    ) -> TicketMessage:
        if ticket.status == TicketStatus.CLOSED and not is_internal_note:
            raise SupportError("Cannot reply to a closed ticket.")

        msg = TicketMessage(
            ticket_id=ticket.id,
            sender_user_id=sender_user_id,
            message=message_text,
            is_internal_note=is_internal_note,
        )
        msg = self.msg_repo.create(msg)

        # Set first_response_at if this is the first non-internal admin reply
        if not is_internal_note and ticket.first_response_at is None:
            ticket.first_response_at = datetime.now(timezone.utc)
            self.repo.update(ticket)

        action = (
            ACTION_SUPPORT_TICKET_INTERNAL_NOTE
            if is_internal_note
            else ACTION_SUPPORT_TICKET_REPLIED
        )
        self.audit_repo.log(
            action=action,
            entity_type="support_ticket",
            entity_id=str(ticket.id),
            entity_name=ticket.ticket_number,
            user_id=sender_user_id,
            ip_address=actor_ip,
            user_agent=actor_ua,
        )

        # Send email to customer for non-internal replies
        if not is_internal_note:
            customer = CustomerRepository(self.db).get_by_id(ticket.customer_id)
            customer_email = customer.email if customer else None
            if customer_email:
                self._send_support_email(
                    TemplateKey.SUPPORT_TICKET_UPDATED.value,
                    customer_email,
                    {
                        "ticket_number": ticket.ticket_number,
                        "status": ticket.status.replace("_", " ").title(),
                        "priority": ticket.priority.title(),
                        "latest_message": message_text,
                        "portal_url": self._portal_url(f"/client/support/{ticket.id}"),
                    },
                    ticket,
                )

        return msg

    # ------------------------------------------------------------------
    # Admin: update ticket (status, priority, assignment)
    # ------------------------------------------------------------------

    def admin_update_ticket(
        self,
        ticket: SupportTicket,
        update: AdminTicketUpdate,
        actor_user_id: uuid.UUID,
        *,
        actor_ip: str | None = None,
        actor_ua: str | None = None,
    ) -> SupportTicket:
        if ticket.status == TicketStatus.CLOSED:
            raise SupportError("Closed tickets cannot be modified.")

        old_status = ticket.status
        old_priority = ticket.priority
        now = datetime.now(timezone.utc)

        # Validate status transition
        if update.status is not None and update.status.value != ticket.status:
            allowed = ALLOWED_TRANSITIONS.get(ticket.status, [])
            if update.status.value not in allowed:
                raise SupportError(
                    f"Cannot transition from {ticket.status} to {update.status.value}."
                )
            ticket.status = update.status.value
            if ticket.status == TicketStatus.RESOLVED:
                ticket.resolved_at = now
                self.audit_repo.log(
                    action=ACTION_SUPPORT_TICKET_RESOLVED,
                    entity_type="support_ticket",
                    entity_id=str(ticket.id),
                    entity_name=ticket.ticket_number,
                    user_id=actor_user_id,
                    ip_address=actor_ip,
                    user_agent=actor_ua,
                )
            elif ticket.status == TicketStatus.CLOSED:
                ticket.closed_at = now
                self.audit_repo.log(
                    action=ACTION_SUPPORT_TICKET_CLOSED,
                    entity_type="support_ticket",
                    entity_id=str(ticket.id),
                    entity_name=ticket.ticket_number,
                    user_id=actor_user_id,
                    ip_address=actor_ip,
                    user_agent=actor_ua,
                )

        if update.priority is not None:
            ticket.priority = update.priority.value

        # Handle assignment
        assignment_changed = (
            update.assigned_to_user_id is not None
            and update.assigned_to_user_id != ticket.assigned_to_user_id
        )
        if update.assigned_to_user_id is not None:
            ticket.assigned_to_user_id = update.assigned_to_user_id
            if assignment_changed:
                self.audit_repo.log(
                    action=ACTION_SUPPORT_TICKET_ASSIGNED,
                    entity_type="support_ticket",
                    entity_id=str(ticket.id),
                    entity_name=ticket.ticket_number,
                    user_id=actor_user_id,
                    new_values={"assigned_to": str(update.assigned_to_user_id)},
                )

        ticket = self.repo.update(ticket)

        # General update audit log
        self.audit_repo.log(
            action=ACTION_SUPPORT_TICKET_UPDATED,
            entity_type="support_ticket",
            entity_id=str(ticket.id),
            entity_name=ticket.ticket_number,
            user_id=actor_user_id,
            ip_address=actor_ip,
            user_agent=actor_ua,
            old_values={"status": old_status, "priority": old_priority},
            new_values={"status": ticket.status, "priority": ticket.priority},
        )

        # Email customer on status/priority change
        customer = CustomerRepository(self.db).get_by_id(ticket.customer_id)
        customer_email = customer.email if customer else None
        if customer_email and (
            old_status != ticket.status or old_priority != ticket.priority
        ):
            resolved_notes = (
                "Your issue has been resolved." if ticket.status == TicketStatus.RESOLVED
                else f"Status changed to {ticket.status.replace('_', ' ').title()}."
            )
            if ticket.status == TicketStatus.RESOLVED:
                self._send_support_email(
                    TemplateKey.SUPPORT_TICKET_RESOLVED.value,
                    customer_email,
                    {
                        "ticket_number": ticket.ticket_number,
                        "resolution_notes": resolved_notes,
                        "portal_url": self._portal_url(f"/client/support/{ticket.id}"),
                    },
                    ticket,
                )
            else:
                self._send_support_email(
                    TemplateKey.SUPPORT_TICKET_UPDATED.value,
                    customer_email,
                    {
                        "ticket_number": ticket.ticket_number,
                        "status": ticket.status.replace("_", " ").title(),
                        "priority": ticket.priority.title(),
                        "latest_message": f"Ticket status updated to {ticket.status.replace('_', ' ').title()}.",
                        "portal_url": self._portal_url(f"/client/support/{ticket.id}"),
                    },
                    ticket,
                )

        return ticket

    # ------------------------------------------------------------------
    # Attachment handling
    # ------------------------------------------------------------------

    def save_attachment(
        self,
        message: TicketMessage,
        ticket_number: str,
        original_filename: str,
        file_bytes: bytes,
        mime_type: str,
        storage_service,
    ) -> TicketAttachment:
        import os

        folder = f"support/{ticket_number}"
        safe_name = original_filename.replace(" ", "_")
        file_path = storage_service.save(file_bytes, folder, safe_name)

        att = TicketAttachment(
            ticket_message_id=message.id,
            original_filename=original_filename,
            file_name=safe_name,
            file_path=file_path,
            file_size=len(file_bytes),
            mime_type=mime_type,
        )
        return self.att_repo.create(att)
