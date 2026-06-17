"""Repository for support tickets, messages, and attachments."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.support_ticket import (
    SupportTicket,
    TicketAttachment,
    TicketMessage,
    TicketStatus,
)

_TICKET_RE = re.compile(r"^TDB-SUP-(\d+)$")


class SupportTicketRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Ticket number generation
    # ------------------------------------------------------------------

    def generate_next_ticket_number(self) -> str:
        """Return the next sequential TDB-SUP-NNNNN code."""
        rows = self.db.execute(
            select(SupportTicket.ticket_number).where(
                SupportTicket.ticket_number.regexp_match(r"^TDB-SUP-\d+$")
            )
        ).scalars().all()

        max_num = 0
        for code in rows:
            m = _TICKET_RE.match(code)
            if m:
                max_num = max(max_num, int(m.group(1)))

        return f"TDB-SUP-{max_num + 1:05d}"

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create(self, ticket: SupportTicket) -> SupportTicket:
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    def get_by_id(self, ticket_id: uuid.UUID) -> SupportTicket | None:
        return self.db.scalars(
            select(SupportTicket).where(
                SupportTicket.id == ticket_id,
                SupportTicket.deleted_at.is_(None),
            )
        ).first()

    def get_by_number(self, ticket_number: str) -> SupportTicket | None:
        return self.db.scalars(
            select(SupportTicket).where(
                SupportTicket.ticket_number == ticket_number,
                SupportTicket.deleted_at.is_(None),
            )
        ).first()

    def update(self, ticket: SupportTicket) -> SupportTicket:
        self.db.commit()
        self.db.refresh(ticket)
        return ticket

    # ------------------------------------------------------------------
    # Listing — client (scoped to one customer)
    # ------------------------------------------------------------------

    def list_for_customer(
        self,
        customer_id: uuid.UUID,
        *,
        status: str | None = None,
        category: str | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 25,
    ) -> tuple[list[SupportTicket], int]:
        stmt = select(SupportTicket).where(
            SupportTicket.customer_id == customer_id,
            SupportTicket.deleted_at.is_(None),
        )
        if status:
            stmt = stmt.where(SupportTicket.status == status)
        if category:
            stmt = stmt.where(SupportTicket.category == category)
        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    SupportTicket.ticket_number.ilike(term),
                    SupportTicket.subject.ilike(term),
                )
            )
        total = self.db.scalar(
            select(func.count()).select_from(stmt.subquery())
        ) or 0
        items = list(
            self.db.scalars(
                stmt.order_by(SupportTicket.created_at.desc()).offset(skip).limit(limit)
            ).all()
        )
        return items, total

    # ------------------------------------------------------------------
    # Listing — admin (all tickets)
    # ------------------------------------------------------------------

    def list_admin(
        self,
        *,
        status: str | None = None,
        category: str | None = None,
        priority: str | None = None,
        assigned_to_user_id: uuid.UUID | None = None,
        customer_id: uuid.UUID | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 25,
    ) -> tuple[list[SupportTicket], int]:
        stmt = select(SupportTicket).where(SupportTicket.deleted_at.is_(None))
        if status:
            stmt = stmt.where(SupportTicket.status == status)
        if category:
            stmt = stmt.where(SupportTicket.category == category)
        if priority:
            stmt = stmt.where(SupportTicket.priority == priority)
        if assigned_to_user_id:
            stmt = stmt.where(
                SupportTicket.assigned_to_user_id == assigned_to_user_id
            )
        if customer_id:
            stmt = stmt.where(SupportTicket.customer_id == customer_id)
        if search:
            from app.models.customer import Customer

            term = f"%{search}%"
            customer_match = (
                select(Customer.id)
                .where(Customer.full_name.ilike(term))
                .scalar_subquery()
            )
            stmt = stmt.where(
                or_(
                    SupportTicket.ticket_number.ilike(term),
                    SupportTicket.subject.ilike(term),
                    SupportTicket.customer_id.in_(customer_match),
                )
            )
        total = self.db.scalar(
            select(func.count()).select_from(stmt.subquery())
        ) or 0
        items = list(
            self.db.scalars(
                stmt.order_by(SupportTicket.created_at.desc()).offset(skip).limit(limit)
            ).all()
        )
        return items, total

    def count_by_status(self, status: str) -> int:
        return self.db.scalar(
            select(func.count()).where(
                SupportTicket.status == status,
                SupportTicket.deleted_at.is_(None),
            )
        ) or 0

    def count_resolved_today(self) -> int:
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return self.db.scalar(
            select(func.count()).where(
                SupportTicket.status == TicketStatus.RESOLVED,
                SupportTicket.resolved_at >= today_start,
                SupportTicket.deleted_at.is_(None),
            )
        ) or 0


class TicketMessageRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, msg: TicketMessage) -> TicketMessage:
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        return msg

    def list_for_ticket(
        self, ticket_id: uuid.UUID, *, include_internal: bool = True
    ) -> list[TicketMessage]:
        stmt = select(TicketMessage).where(TicketMessage.ticket_id == ticket_id)
        if not include_internal:
            stmt = stmt.where(TicketMessage.is_internal_note.is_(False))
        return list(self.db.scalars(stmt.order_by(TicketMessage.created_at)).all())

    def first_admin_reply(
        self, ticket_id: uuid.UUID, admin_user_ids: list[uuid.UUID]
    ) -> TicketMessage | None:
        return self.db.scalars(
            select(TicketMessage).where(
                TicketMessage.ticket_id == ticket_id,
                TicketMessage.sender_user_id.in_(admin_user_ids),
                TicketMessage.is_internal_note.is_(False),
            ).order_by(TicketMessage.created_at)
        ).first()


class TicketAttachmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, attachment: TicketAttachment) -> TicketAttachment:
        self.db.add(attachment)
        self.db.commit()
        self.db.refresh(attachment)
        return attachment

    def list_for_message(
        self, ticket_message_id: uuid.UUID
    ) -> list[TicketAttachment]:
        return list(
            self.db.scalars(
                select(TicketAttachment).where(
                    TicketAttachment.ticket_message_id == ticket_message_id
                )
            ).all()
        )
