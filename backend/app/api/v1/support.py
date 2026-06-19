"""Admin support ticket API — /api/v1/admin/support/*
   Admin notification API — /api/v1/admin/notifications/*
"""
from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
from app.models.admin_notification import AdminNotification
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceStatus
from app.models.support_ticket import (
    ALLOWED_TRANSITIONS,
    SupportTicket,
    TicketMessage,
    TicketStatus,
)
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories.admin_notification import AdminNotificationRepository
from app.repositories.audit_log import AuditLogRepository
from app.repositories.support_ticket import (
    SupportTicketRepository,
    TicketAttachmentRepository,
    TicketMessageRepository,
)
from app.schemas.support_ticket import (
    AdminNotificationOut,
    AdminNotificationsPage,
    AdminReplyCreate,
    AdminTicketListItem,
    AdminTicketOut,
    AdminTicketUpdate,
    AdminTicketsPage,
    CustomerContext,
    SupportDashboardStats,
    SubscriptionContext,
    TicketAttachmentOut,
    TicketMessageOut,
)
from app.services.support_ticket import SupportError, SupportTicketService
from app.storage import get_storage_service
from app.models.audit_log import ACTION_SUPPORT_NOTIFICATION_READ

router = APIRouter(tags=["support-admin"])

_ALLOWED_MIME = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _user_display_name(db: Session, user_id: uuid.UUID | None) -> str:
    if not user_id:
        return ""
    user = db.get(User, user_id)
    if not user:
        return ""
    try:
        return user.email.split("@")[0]
    except Exception:
        return str(user_id)[:8]


def _message_out(msg: TicketMessage, db: Session) -> TicketMessageOut:
    user = db.get(User, msg.sender_user_id) if msg.sender_user_id else None
    try:
        sender_name = user.email.split("@")[0] if user else ""
    except Exception:
        sender_name = str(msg.sender_user_id)[:8] if msg.sender_user_id else ""
    return TicketMessageOut(
        id=msg.id,
        ticket_id=msg.ticket_id,
        sender_user_id=msg.sender_user_id,
        sender_name=sender_name,
        sender_role=user.role.value if user else "",
        message=msg.message,
        is_internal_note=msg.is_internal_note,
        created_at=msg.created_at,
        attachments=[TicketAttachmentOut.model_validate(a) for a in msg.attachments],
    )


def _ticket_list_item(ticket: SupportTicket, db: Session) -> AdminTicketListItem:
    customer = db.get(Customer, ticket.customer_id)
    sub = db.get(Subscription, ticket.subscription_id) if ticket.subscription_id else None
    return AdminTicketListItem(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        customer_name=customer.full_name if customer else "",
        customer_code=customer.customer_code if customer else "",
        connection_name=sub.connection_name or sub.plan_name_snapshot if sub else "",
        subject=ticket.subject,
        category=ticket.category,
        priority=ticket.priority,
        status=ticket.status,
        assigned_to_name=_user_display_name(db, ticket.assigned_to_user_id),
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


def _outstanding_amount(db: Session, customer_id: uuid.UUID) -> float:
    result = db.scalar(
        select(func.sum(Invoice.balance_amount)).where(
            Invoice.customer_id == customer_id,
            Invoice.status.in_([InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID]),
            Invoice.deleted_at.is_(None),
        )
    )
    return float(result or 0)


def _ticket_detail(ticket: SupportTicket, db: Session, *, include_internal: bool = True) -> AdminTicketOut:
    customer = db.get(Customer, ticket.customer_id)
    sub = db.get(Subscription, ticket.subscription_id) if ticket.subscription_id else None

    msg_repo = TicketMessageRepository(db)
    raw_msgs = msg_repo.list_for_ticket(ticket.id, include_internal=include_internal)
    messages = [_message_out(m, db) for m in raw_msgs]

    subscription_ctx = None
    if sub:
        subscription_ctx = SubscriptionContext(
            connection_name=sub.connection_name or "",
            plan_name=sub.plan_name_snapshot or "",
            expiry_date=sub.expiry_date if hasattr(sub, "expiry_date") else None,
        )

    return AdminTicketOut(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        subject=ticket.subject,
        description=ticket.description,
        category=ticket.category,
        status=ticket.status,
        priority=ticket.priority,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        first_response_at=ticket.first_response_at,
        resolved_at=ticket.resolved_at,
        closed_at=ticket.closed_at,
        assigned_to_user_id=ticket.assigned_to_user_id,
        assigned_to_name=_user_display_name(db, ticket.assigned_to_user_id),
        customer=CustomerContext(
            customer_name=customer.full_name if customer else "",
            customer_code=customer.customer_code if customer else "",
            mobile_number=customer.mobile_number if customer else "",
            email=customer.email if customer else "",
        ),
        subscription=subscription_ctx,
        outstanding_amount=_outstanding_amount(db, ticket.customer_id),
        messages=messages,
    )


# ---------------------------------------------------------------------------
# Admin support routes
# ---------------------------------------------------------------------------


@router.get("/admin/support", response_model=AdminTicketsPage)
def admin_list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=10, le=100),
    status: str | None = Query(None),
    category: str | None = Query(None),
    priority: str | None = Query(None),
    assigned_to_user_id: uuid.UUID | None = Query(None),
    customer_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> AdminTicketsPage:
    repo = SupportTicketRepository(db)
    skip = (page - 1) * page_size
    tickets, total = repo.list_admin(
        status=status,
        category=category,
        priority=priority,
        assigned_to_user_id=assigned_to_user_id,
        customer_id=customer_id,
        search=search,
        skip=skip,
        limit=page_size,
    )
    return AdminTicketsPage(
        items=[_ticket_list_item(t, db) for t in tickets],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 1,
    )


@router.get("/admin/support/dashboard-stats", response_model=SupportDashboardStats)
def admin_support_dashboard_stats(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SupportDashboardStats:
    repo = SupportTicketRepository(db)
    recent_tickets, _ = repo.list_admin(
        status=None, skip=0, limit=10
    )
    high_priority = db.scalar(
        select(func.count()).where(
            SupportTicket.priority.in_(["HIGH", "CRITICAL"]),
            SupportTicket.status.not_in([TicketStatus.RESOLVED, TicketStatus.CLOSED]),
            SupportTicket.deleted_at.is_(None),
        )
    ) or 0
    return SupportDashboardStats(
        open_tickets=repo.count_by_status(TicketStatus.OPEN),
        high_priority_tickets=high_priority,
        waiting_for_customer=repo.count_by_status(TicketStatus.WAITING_FOR_CUSTOMER),
        resolved_today=repo.count_resolved_today(),
        recent_tickets=[_ticket_list_item(t, db) for t in recent_tickets],
    )


@router.get("/admin/support/{ticket_id}", response_model=AdminTicketOut)
def admin_get_ticket(
    ticket_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> AdminTicketOut:
    repo = SupportTicketRepository(db)
    ticket = repo.get_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    return _ticket_detail(ticket, db, include_internal=True)


@router.patch("/admin/support/{ticket_id}", response_model=AdminTicketOut)
def admin_update_ticket(
    ticket_id: uuid.UUID,
    payload: AdminTicketUpdate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> AdminTicketOut:
    repo = SupportTicketRepository(db)
    ticket = repo.get_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    svc = SupportTicketService(db, request_origin=str(request.base_url).rstrip("/"))
    try:
        ticket = svc.admin_update_ticket(
            ticket,
            payload,
            current_user.id,
            actor_ip=request.client.host if request.client else None,
            actor_ua=request.headers.get("user-agent"),
        )
    except SupportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return _ticket_detail(ticket, db, include_internal=True)


@router.post("/admin/support/{ticket_id}/reply", response_model=TicketMessageOut)
def admin_reply(
    ticket_id: uuid.UUID,
    payload: AdminReplyCreate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> TicketMessageOut:
    repo = SupportTicketRepository(db)
    ticket = repo.get_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    svc = SupportTicketService(db, request_origin=str(request.base_url).rstrip("/"))
    try:
        msg = svc.admin_reply(
            ticket,
            current_user.id,
            payload.message,
            is_internal_note=False,
            actor_ip=request.client.host if request.client else None,
            actor_ua=request.headers.get("user-agent"),
        )
    except SupportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return _message_out(msg, db)


@router.post("/admin/support/{ticket_id}/internal-note", response_model=TicketMessageOut)
def admin_add_internal_note(
    ticket_id: uuid.UUID,
    payload: AdminReplyCreate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> TicketMessageOut:
    repo = SupportTicketRepository(db)
    ticket = repo.get_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    svc = SupportTicketService(db, request_origin=str(request.base_url).rstrip("/"))
    msg = svc.admin_reply(
        ticket,
        current_user.id,
        payload.message,
        is_internal_note=True,
        actor_ip=request.client.host if request.client else None,
        actor_ua=request.headers.get("user-agent"),
    )
    return _message_out(msg, db)


@router.post(
    "/admin/support/{ticket_id}/attachments",
    response_model=TicketAttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_attachment(
    ticket_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
    storage=Depends(get_storage_service),
) -> TicketAttachmentOut:
    repo = SupportTicketRepository(db)
    ticket = repo.get_by_id(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")

    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"File type '{file.content_type}' not allowed.")

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    # Create a placeholder message for the attachment
    msg_repo = TicketMessageRepository(db)
    att_msg = TicketMessage(
        ticket_id=ticket.id,
        sender_user_id=current_user.id,
        message=f"[Attachment: {file.filename}]",
        is_internal_note=False,
    )
    msg_repo.create(att_msg)

    svc = SupportTicketService(db)  # attachment doesn't need portal_url
    att = svc.save_attachment(
        att_msg,
        ticket.ticket_number,
        file.filename or "file",
        content,
        file.content_type or "application/octet-stream",
        storage,
    )
    return TicketAttachmentOut.model_validate(att)


# ---------------------------------------------------------------------------
# Admin notification routes
# ---------------------------------------------------------------------------


@router.get("/admin/notifications", response_model=AdminNotificationsPage)
def list_admin_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> AdminNotificationsPage:
    repo = AdminNotificationRepository(db)
    skip = (page - 1) * page_size
    items, total, unread = repo.list_for_user(current_user.id, skip=skip, limit=page_size)
    return AdminNotificationsPage(
        items=[AdminNotificationOut.model_validate(n) for n in items],
        total=total,
        unread_count=unread,
    )


@router.patch("/admin/notifications/{notif_id}/read", response_model=AdminNotificationOut)
def mark_notification_read(
    notif_id: uuid.UUID,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> AdminNotificationOut:
    repo = AdminNotificationRepository(db)
    notif = repo.get_by_id(notif_id, current_user.id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notif = repo.mark_read(notif)
    AuditLogRepository(db).log(
        action=ACTION_SUPPORT_NOTIFICATION_READ,
        entity_type="admin_notification",
        entity_id=str(notif.id),
        user_id=current_user.id,
    )
    return AdminNotificationOut.model_validate(notif)


@router.patch("/admin/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict:
    repo = AdminNotificationRepository(db)
    count = repo.mark_all_read(current_user.id)
    return {"marked_read": count}
