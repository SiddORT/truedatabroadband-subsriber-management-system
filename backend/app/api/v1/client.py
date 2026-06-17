"""Client self-service portal API — /api/v1/client/*

All endpoints require an authenticated CLIENT user.
Ownership is enforced at the query level (customer_id == current_user's customer).
"""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_client
from app.models.audit_log import (
    ACTION_CLIENT_BILLING_VIEWED,
    ACTION_CLIENT_DASHBOARD_VIEWED,
    ACTION_CLIENT_INVOICE_DOWNLOADED,
    ACTION_CLIENT_INVOICE_EMAILED,
    ACTION_CLIENT_INVOICE_VIEWED,
    ACTION_CLIENT_LOGOUT_ALL,
    ACTION_CLIENT_PAYMENT_HISTORY_VIEWED,
    ACTION_CLIENT_PROFILE_UPDATED,
    ACTION_CLIENT_SESSION_REVOKED,
    ACTION_CLIENT_UNAUTHORIZED_ACCESS,
)
from app.models.invoice import Invoice, InvoiceStatus
from app.models.notification import NotificationLog, TemplateKey
from app.models.payment import Payment
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.customer import CustomerRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.schemas.auth import MessageResponse
from app.schemas.client import (
    BillingSummary,
    ClientInvoiceDetail,
    ClientInvoiceListItem,
    ClientInvoicePayment,
    ClientInvoicesPage,
    ClientPaymentListItem,
    ClientPaymentsPage,
    ClientProfileOut,
    ClientProfileUpdate,
    DashboardConnection,
    DashboardInvoice,
    DashboardInvoicesResponse,
    DashboardNotification,
    DashboardOutstandingInvoice,
    DashboardPayment,
    DashboardSummary,
    RevokeSessionRequest,
    SessionOut,
)
from app.services.invoice import InvoiceService
from app.services.notifications.notification_service import NotificationService

router = APIRouter(prefix="/client", tags=["client"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _audit(db: Session, action: str, request: Request, *, user_id: object = None) -> None:
    AuditLogRepository(db).log(
        action,
        user_id=user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def _get_customer_or_403(user: User, db: Session, request: Request):
    """Return the Customer linked to this CLIENT user, or raise 403."""
    customer = CustomerRepository(db).get_by_user_id(user.id)
    if customer is None:
        _audit(db, ACTION_CLIENT_UNAUTHORIZED_ACCESS, request, user_id=user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No customer account is linked to this login.",
        )
    return customer


def _invoice_ownership_filter(customer, db: Session):
    """Build OR filter covering SINGLE (subscription_id) and CONSOLIDATED (customer_id) invoices."""
    sub_ids = (
        db.query(Subscription.id)
        .filter(
            Subscription.customer_id == customer.id,
            Subscription.deleted_at.is_(None),
        )
    )
    return or_(
        Invoice.customer_id == customer.id,
        Invoice.subscription_id.in_(sub_ids),
    )


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


@router.get("/profile", response_model=ClientProfileOut)
def get_profile(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> ClientProfileOut:
    customer = _get_customer_or_403(current_user, db, request)
    conn_date = customer.connection_date.isoformat() if customer.connection_date else None
    return ClientProfileOut(
        customer_code=customer.customer_code,
        full_name=customer.full_name,
        customer_type=customer.customer_type.value,
        email=customer.email,
        mobile_number=customer.mobile_number,
        alternate_mobile_number=customer.alternate_mobile_number,
        installation_address=customer.installation_address,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        status=customer.status.value,
        connection_date=conn_date,
        created_at=customer.created_at,
    )


@router.put("/profile", response_model=ClientProfileOut)
def update_profile(
    payload: ClientProfileUpdate,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> ClientProfileOut:
    customer = _get_customer_or_403(current_user, db, request)

    changed: dict = {}
    if payload.alternate_mobile_number is not None:
        changed["alternate_mobile_number"] = payload.alternate_mobile_number
        customer.alternate_mobile_number = payload.alternate_mobile_number or None

    if changed:
        db.commit()
        db.refresh(customer)
        _audit(
            db,
            ACTION_CLIENT_PROFILE_UPDATED,
            request,
            user_id=current_user.id,
        )

    conn_date = customer.connection_date.isoformat() if customer.connection_date else None
    return ClientProfileOut(
        customer_code=customer.customer_code,
        full_name=customer.full_name,
        customer_type=customer.customer_type.value,
        email=customer.email,
        mobile_number=customer.mobile_number,
        alternate_mobile_number=customer.alternate_mobile_number,
        installation_address=customer.installation_address,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        status=customer.status.value,
        connection_date=conn_date,
        created_at=customer.created_at,
    )


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


def _parse_ua(ua: str | None) -> tuple[str, str]:
    """Very light UA parse — returns (browser_hint, os_hint)."""
    if not ua:
        return "Unknown browser", "Unknown OS"
    ua_lower = ua.lower()

    browser = "Unknown browser"
    for name, token in [
        ("Chrome", "chrome"),
        ("Firefox", "firefox"),
        ("Safari", "safari"),
        ("Edge", "edg"),
        ("Opera", "opr"),
    ]:
        if token in ua_lower:
            browser = name
            break

    os_name = "Unknown OS"
    for name, token in [
        ("Windows", "windows"),
        ("macOS", "mac os"),
        ("Linux", "linux"),
        ("Android", "android"),
        ("iOS", "iphone"),
        ("iOS", "ipad"),
    ]:
        if token in ua_lower:
            os_name = name
            break

    return browser, os_name


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> list[SessionOut]:
    _get_customer_or_403(current_user, db, request)

    repo = RefreshTokenRepository(db)
    tokens = repo.list_active_for_user(current_user.id)

    from app.core.security import decode_token
    try:
        auth_header = request.headers.get("authorization", "")
        raw_token = auth_header.removeprefix("Bearer ").strip()
        payload = decode_token(raw_token)
        current_jti = uuid.UUID(payload["jti"]) if "jti" in payload else None
    except Exception:
        current_jti = None

    out = []
    for t in tokens:
        out.append(
            SessionOut(
                id=t.id,
                jti=t.jti,
                user_agent=t.user_agent,
                ip_address=t.ip_address,
                created_at=t.created_at,
                expires_at=t.expires_at,
                is_current=(current_jti is not None and t.jti == current_jti),
            )
        )
    return out


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _get_customer_or_403(current_user, db, request)
    RefreshTokenRepository(db).revoke_all_for_user(current_user.id)
    _audit(db, ACTION_CLIENT_LOGOUT_ALL, request, user_id=current_user.id)
    return MessageResponse(message="All sessions have been revoked.")


@router.post("/sessions/revoke", response_model=MessageResponse)
def revoke_session(
    payload: RevokeSessionRequest,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _get_customer_or_403(current_user, db, request)

    repo = RefreshTokenRepository(db)
    token = repo.get_by_jti(payload.jti)
    if token is None or token.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    repo.revoke_by_jti(payload.jti)
    _audit(db, ACTION_CLIENT_SESSION_REVOKED, request, user_id=current_user.id)
    return MessageResponse(message="Session revoked successfully.")


# ---------------------------------------------------------------------------
# Dashboard — Summary KPIs
# ---------------------------------------------------------------------------


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    customer = _get_customer_or_403(current_user, db, request)
    today = date.today()
    expiry_threshold = today + timedelta(days=30)

    active_count: int = (
        db.query(func.count(Subscription.id))
        .filter(
            Subscription.customer_id == customer.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    expiring_count: int = (
        db.query(func.count(Subscription.id))
        .filter(
            Subscription.customer_id == customer.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expiry_date <= expiry_threshold,
            Subscription.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    outstanding_statuses = [
        InvoiceStatus.UNPAID,
        InvoiceStatus.PARTIALLY_PAID,
        InvoiceStatus.OVERDUE,
    ]
    inv_filter = _invoice_ownership_filter(customer, db)
    outstanding_amount = (
        db.query(func.coalesce(func.sum(Invoice.balance_amount), 0))
        .filter(
            inv_filter,
            Invoice.status.in_(outstanding_statuses),
            Invoice.balance_amount > 0,
            Invoice.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    last_payment = (
        db.query(Payment.amount, Payment.payment_date)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(
            inv_filter,
            Payment.deleted_at.is_(None),
            Invoice.deleted_at.is_(None),
        )
        .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
        .first()
    )

    _audit(db, ACTION_CLIENT_DASHBOARD_VIEWED, request, user_id=current_user.id)

    return DashboardSummary(
        active_connections=active_count,
        expiring_soon=expiring_count,
        outstanding_amount=outstanding_amount,
        last_payment_amount=last_payment.amount if last_payment else None,
        last_payment_date=last_payment.payment_date.isoformat() if last_payment else None,
    )


# ---------------------------------------------------------------------------
# Dashboard — Connections
# ---------------------------------------------------------------------------


@router.get("/dashboard/connections", response_model=list[DashboardConnection])
def dashboard_connections(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> list[DashboardConnection]:
    customer = _get_customer_or_403(current_user, db, request)
    today = date.today()

    subs = (
        db.query(Subscription)
        .filter(
            Subscription.customer_id == customer.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.deleted_at.is_(None),
        )
        .order_by(Subscription.expiry_date.asc())
        .all()
    )

    result = []
    for s in subs:
        days_remaining = (s.expiry_date - today).days
        result.append(
            DashboardConnection(
                id=s.id,
                connection_name=s.connection_name,
                plan_name=s.plan_name_snapshot,
                speed_mbps=s.speed_mbps_snapshot,
                billing_cycle=s.billing_cycle_snapshot,
                expiry_date=s.expiry_date.isoformat(),
                days_remaining=days_remaining,
                status=s.status.value,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Dashboard — Invoices (recent + outstanding)
# ---------------------------------------------------------------------------


@router.get("/dashboard/invoices", response_model=DashboardInvoicesResponse)
def dashboard_invoices(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> DashboardInvoicesResponse:
    customer = _get_customer_or_403(current_user, db, request)
    today = date.today()
    inv_filter = _invoice_ownership_filter(customer, db)

    recent_rows = (
        db.query(Invoice)
        .filter(
            inv_filter,
            Invoice.status != InvoiceStatus.DRAFT,
            Invoice.status != InvoiceStatus.CANCELLED,
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.created_at.desc())
        .limit(10)
        .all()
    )

    outstanding_statuses = [
        InvoiceStatus.UNPAID,
        InvoiceStatus.PARTIALLY_PAID,
        InvoiceStatus.OVERDUE,
    ]
    outstanding_rows = (
        db.query(Invoice)
        .filter(
            inv_filter,
            Invoice.status.in_(outstanding_statuses),
            Invoice.balance_amount > 0,
            Invoice.deleted_at.is_(None),
        )
        .order_by(Invoice.due_date.asc())
        .all()
    )

    def _to_recent(inv: Invoice) -> DashboardInvoice:
        return DashboardInvoice(
            id=inv.id,
            invoice_number=inv.invoice_number,
            connection_name=inv.connection_name_snapshot,
            invoice_date=inv.invoice_date.isoformat(),
            due_date=inv.due_date.isoformat(),
            total_amount=inv.total_amount,
            balance_amount=inv.balance_amount,
            status=inv.status.value,
        )

    def _to_outstanding(inv: Invoice) -> DashboardOutstandingInvoice:
        days_overdue = max(0, (today - inv.due_date).days)
        return DashboardOutstandingInvoice(
            id=inv.id,
            invoice_number=inv.invoice_number,
            due_date=inv.due_date.isoformat(),
            outstanding_amount=inv.balance_amount,
            days_overdue=days_overdue,
        )

    return DashboardInvoicesResponse(
        recent=[_to_recent(i) for i in recent_rows],
        outstanding=[_to_outstanding(i) for i in outstanding_rows],
    )


# ---------------------------------------------------------------------------
# Dashboard — Payments
# ---------------------------------------------------------------------------


@router.get("/dashboard/payments", response_model=list[DashboardPayment])
def dashboard_payments(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> list[DashboardPayment]:
    customer = _get_customer_or_403(current_user, db, request)
    inv_filter = _invoice_ownership_filter(customer, db)

    rows = (
        db.query(
            Payment.id,
            Payment.payment_number,
            Payment.payment_date,
            Payment.amount,
            Payment.payment_method,
            Invoice.invoice_number,
            Invoice.connection_name_snapshot,
        )
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(
            inv_filter,
            Payment.deleted_at.is_(None),
            Invoice.deleted_at.is_(None),
        )
        .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
        .limit(10)
        .all()
    )

    return [
        DashboardPayment(
            id=r.id,
            payment_number=r.payment_number,
            payment_date=r.payment_date.isoformat(),
            invoice_number=r.invoice_number,
            connection_name=r.connection_name_snapshot,
            amount=r.amount,
            payment_method=r.payment_method.value,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Dashboard — Notifications
# ---------------------------------------------------------------------------


@router.get("/dashboard/notifications", response_model=list[DashboardNotification])
def dashboard_notifications(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> list[DashboardNotification]:
    customer = _get_customer_or_403(current_user, db, request)

    sub_ids = (
        db.query(Subscription.id)
        .filter(
            Subscription.customer_id == customer.id,
            Subscription.deleted_at.is_(None),
        )
    )

    notif_filter = or_(
        NotificationLog.subscription_id.in_(sub_ids),
        and_(
            NotificationLog.entity_type == "CUSTOMER",
            NotificationLog.entity_id == str(customer.id),
        ),
        NotificationLog.recipient_mobile == customer.mobile_number,
        NotificationLog.recipient_email == customer.email,
    )

    rows = (
        db.query(NotificationLog)
        .filter(notif_filter)
        .order_by(NotificationLog.created_at.desc())
        .limit(10)
        .all()
    )

    return [
        DashboardNotification(
            id=r.id,
            created_at=r.created_at,
            template_key=r.template_key,
            channel=r.channel,
            status=r.status,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Billing helpers
# ---------------------------------------------------------------------------

_VALID_SORT_COLS = {
    "invoice_date": Invoice.invoice_date,
    "due_date": Invoice.due_date,
    "total_amount": Invoice.total_amount,
    "invoice_number": Invoice.invoice_number,
    "status": Invoice.status,
    "created_at": Invoice.created_at,
}

_NON_DRAFT_STATUSES = [
    InvoiceStatus.UNPAID,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.PAID,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.CANCELLED,
]

_OUTSTANDING_STATUSES = [
    InvoiceStatus.UNPAID,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.OVERDUE,
]


def _get_owned_invoice_or_404(invoice_id: uuid.UUID, customer, db: Session) -> Invoice:
    """Fetch an invoice that belongs to this customer. Returns 404 for both
    not-found and access-denied (prevents ID enumeration)."""
    inv = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            _invoice_ownership_filter(customer, db),
            Invoice.deleted_at.is_(None),
        )
        .first()
    )
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return inv


def _get_owned_payment_or_404(payment_id: uuid.UUID, customer, db: Session) -> Payment:
    """Fetch a payment that belongs to this customer via invoice ownership."""
    pay = (
        db.query(Payment)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(
            Payment.id == payment_id,
            _invoice_ownership_filter(customer, db),
            Payment.deleted_at.is_(None),
            Invoice.deleted_at.is_(None),
        )
        .first()
    )
    if pay is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return pay


# ---------------------------------------------------------------------------
# Billing — Summary KPIs
# ---------------------------------------------------------------------------


@router.get("/billing/summary", response_model=BillingSummary)
def billing_summary(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> BillingSummary:
    customer = _get_customer_or_403(current_user, db, request)
    inv_filter = _invoice_ownership_filter(customer, db)

    base_q = db.query(Invoice).filter(
        inv_filter,
        Invoice.status.in_(_NON_DRAFT_STATUSES),
        Invoice.deleted_at.is_(None),
    )

    total_invoiced = (
        db.query(func.coalesce(func.sum(Invoice.total_amount), 0))
        .filter(inv_filter, Invoice.status.in_(_NON_DRAFT_STATUSES), Invoice.deleted_at.is_(None))
        .scalar()
        or 0
    )

    total_paid = (
        db.query(func.coalesce(func.sum(Invoice.paid_amount), 0))
        .filter(inv_filter, Invoice.status.in_(_NON_DRAFT_STATUSES), Invoice.deleted_at.is_(None))
        .scalar()
        or 0
    )

    outstanding_amount = (
        db.query(func.coalesce(func.sum(Invoice.balance_amount), 0))
        .filter(
            inv_filter,
            Invoice.status.in_(_OUTSTANDING_STATUSES),
            Invoice.balance_amount > 0,
            Invoice.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    overdue_amount = (
        db.query(func.coalesce(func.sum(Invoice.balance_amount), 0))
        .filter(
            inv_filter,
            Invoice.status == InvoiceStatus.OVERDUE,
            Invoice.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )

    last_pay = (
        db.query(Payment.amount, Payment.payment_date)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(inv_filter, Payment.deleted_at.is_(None), Invoice.deleted_at.is_(None))
        .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
        .first()
    )

    _audit(db, ACTION_CLIENT_BILLING_VIEWED, request, user_id=current_user.id)

    return BillingSummary(
        total_invoiced=total_invoiced,
        total_paid=total_paid,
        outstanding_amount=outstanding_amount,
        overdue_amount=overdue_amount,
        last_payment_amount=last_pay.amount if last_pay else None,
        last_payment_date=last_pay.payment_date.isoformat() if last_pay else None,
    )


# ---------------------------------------------------------------------------
# Billing — Invoice list
# ---------------------------------------------------------------------------


@router.get("/invoices", response_model=ClientInvoicesPage)
def list_invoices(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query(""),
    filter_status: str | None = Query(None, alias="status"),
    connection_id: uuid.UUID | None = Query(None),
    invoice_date_start: date | None = Query(None),
    invoice_date_end: date | None = Query(None),
    due_date_start: date | None = Query(None),
    due_date_end: date | None = Query(None),
    due_today: bool = Query(False),
    due_in_7_days: bool = Query(False),
    overdue: bool = Query(False),
    sort_by: str = Query("invoice_date"),
    sort_order: str = Query("desc"),
) -> ClientInvoicesPage:
    customer = _get_customer_or_403(current_user, db, request)
    inv_filter = _invoice_ownership_filter(customer, db)
    today = date.today()

    q = db.query(Invoice).filter(
        inv_filter,
        Invoice.status.in_(_NON_DRAFT_STATUSES),
        Invoice.deleted_at.is_(None),
    )

    if search:
        pat = f"%{search}%"
        q = q.filter(
            or_(
                Invoice.invoice_number.ilike(pat),
                Invoice.connection_name_snapshot.ilike(pat),
            )
        )

    if filter_status and filter_status in InvoiceStatus.__members__:
        q = q.filter(Invoice.status == InvoiceStatus[filter_status])

    if connection_id:
        q = q.filter(Invoice.subscription_id == connection_id)

    if invoice_date_start:
        q = q.filter(Invoice.invoice_date >= invoice_date_start)
    if invoice_date_end:
        q = q.filter(Invoice.invoice_date <= invoice_date_end)

    if due_date_start:
        q = q.filter(Invoice.due_date >= due_date_start)
    if due_date_end:
        q = q.filter(Invoice.due_date <= due_date_end)

    if due_today:
        q = q.filter(Invoice.due_date == today)
    if due_in_7_days:
        q = q.filter(Invoice.due_date >= today, Invoice.due_date <= today + timedelta(days=7))
    if overdue:
        q = q.filter(Invoice.status == InvoiceStatus.OVERDUE)

    sort_col = _VALID_SORT_COLS.get(sort_by, Invoice.invoice_date)
    q = q.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())

    total = q.count()
    pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()

    _audit(db, ACTION_CLIENT_BILLING_VIEWED, request, user_id=current_user.id)

    return ClientInvoicesPage(
        items=[
            ClientInvoiceListItem(
                id=r.id,
                invoice_number=r.invoice_number,
                connection_name=r.connection_name_snapshot,
                invoice_date=r.invoice_date.isoformat(),
                due_date=r.due_date.isoformat(),
                total_amount=r.total_amount,
                paid_amount=r.paid_amount,
                balance_amount=r.balance_amount,
                status=r.status.value,
            )
            for r in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# Billing — Invoice detail
# ---------------------------------------------------------------------------


@router.get("/invoices/{invoice_id}", response_model=ClientInvoiceDetail)
def get_invoice_detail(
    invoice_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> ClientInvoiceDetail:
    customer = _get_customer_or_403(current_user, db, request)
    invoice = _get_owned_invoice_or_404(invoice_id, customer, db)

    payments = [
        ClientInvoicePayment(
            id=p.id,
            payment_number=p.payment_number,
            payment_date=p.payment_date.isoformat(),
            amount=p.amount,
            payment_method=p.payment_method.value,
            transaction_reference=p.transaction_reference,
        )
        for p in sorted(invoice.payments, key=lambda x: x.payment_date, reverse=True)
        if p.deleted_at is None
    ]

    _audit(db, ACTION_CLIENT_INVOICE_VIEWED, request, user_id=current_user.id)

    return ClientInvoiceDetail(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date.isoformat(),
        due_date=invoice.due_date.isoformat(),
        status=invoice.status.value,
        connection_name=invoice.connection_name_snapshot,
        plan_name=invoice.plan_name_snapshot,
        billing_period_start=invoice.billing_period_start.isoformat(),
        billing_period_end=invoice.billing_period_end.isoformat(),
        base_amount=invoice.base_amount,
        discount_amount=invoice.discount_amount,
        gst_amount=invoice.gst_amount,
        gst_percentage=invoice.gst_percentage,
        total_amount=invoice.total_amount,
        paid_amount=invoice.paid_amount,
        balance_amount=invoice.balance_amount,
        payments=payments,
        pdf_available=bool(invoice.pdf_path),
    )


# ---------------------------------------------------------------------------
# Billing — Invoice PDF download
# ---------------------------------------------------------------------------


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> FileResponse:
    customer = _get_customer_or_403(current_user, db, request)
    invoice = _get_owned_invoice_or_404(invoice_id, customer, db)

    if not invoice.pdf_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not yet available for this invoice.",
        )

    from app.storage.service import get_storage_service

    storage = get_storage_service()
    if not storage.exists("invoices", invoice.pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF file not found.",
        )

    path = storage.url("invoices", invoice.pdf_path)

    _audit(db, ACTION_CLIENT_INVOICE_DOWNLOADED, request, user_id=current_user.id)

    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{invoice.invoice_number}.pdf",
    )


# ---------------------------------------------------------------------------
# Billing — Email invoice
# ---------------------------------------------------------------------------


@router.post("/invoices/{invoice_id}/email", response_model=MessageResponse)
def email_invoice(
    invoice_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> MessageResponse:
    customer = _get_customer_or_403(current_user, db, request)
    invoice = _get_owned_invoice_or_404(invoice_id, customer, db)

    five_min_ago = datetime.utcnow() - timedelta(minutes=5)
    recent = (
        db.query(NotificationLog)
        .filter(
            NotificationLog.entity_type == "INVOICE",
            NotificationLog.entity_id == str(invoice.id),
            NotificationLog.template_key == TemplateKey.INVOICE_GENERATED,
            NotificationLog.created_at >= five_min_ago,
        )
        .first()
    )
    if recent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Invoice email was sent recently. Please wait 5 minutes before requesting again.",
        )

    svc = NotificationService(db)
    svc.send(
        template_key=TemplateKey.INVOICE_GENERATED,
        recipient={"email": customer.email, "mobile": customer.mobile_number},
        variables={
            "customer_name": invoice.customer_name_snapshot,
            "invoice_number": invoice.invoice_number,
            "amount": str(invoice.total_amount),
            "due_date": invoice.due_date.isoformat(),
            "portal_url": "",
        },
        entity_type="INVOICE",
        entity_id=str(invoice.id),
        customer_id=customer.id,
    )

    _audit(db, ACTION_CLIENT_INVOICE_EMAILED, request, user_id=current_user.id)
    return MessageResponse(message="Invoice email sent successfully.")


# ---------------------------------------------------------------------------
# Billing — Payment list
# ---------------------------------------------------------------------------


@router.get("/payments", response_model=ClientPaymentsPage)
def list_payments(
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query(""),
    connection_id: uuid.UUID | None = Query(None),
    payment_date_start: date | None = Query(None),
    payment_date_end: date | None = Query(None),
    sort_by: str = Query("payment_date"),
    sort_order: str = Query("desc"),
) -> ClientPaymentsPage:
    customer = _get_customer_or_403(current_user, db, request)
    inv_filter = _invoice_ownership_filter(customer, db)

    q = (
        db.query(Payment)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .filter(
            inv_filter,
            Payment.deleted_at.is_(None),
            Invoice.deleted_at.is_(None),
        )
    )

    if search:
        pat = f"%{search}%"
        q = q.filter(
            or_(
                Payment.payment_number.ilike(pat),
                Invoice.invoice_number.ilike(pat),
                Invoice.connection_name_snapshot.ilike(pat),
                Payment.transaction_reference.ilike(pat),
            )
        )

    if connection_id:
        q = q.filter(Invoice.subscription_id == connection_id)

    if payment_date_start:
        q = q.filter(Payment.payment_date >= payment_date_start)
    if payment_date_end:
        q = q.filter(Payment.payment_date <= payment_date_end)

    pay_sort_cols = {
        "payment_date": Payment.payment_date,
        "amount": Payment.amount,
        "payment_number": Payment.payment_number,
    }
    sort_col = pay_sort_cols.get(sort_by, Payment.payment_date)
    q = q.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc(), Payment.created_at.desc())

    total = q.count()
    pages = max(1, math.ceil(total / page_size))
    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()

    _audit(db, ACTION_CLIENT_PAYMENT_HISTORY_VIEWED, request, user_id=current_user.id)

    return ClientPaymentsPage(
        items=[
            ClientPaymentListItem(
                id=r.id,
                payment_number=r.payment_number,
                payment_date=r.payment_date.isoformat(),
                invoice_number=r.invoice.invoice_number,
                connection_name=r.invoice.connection_name_snapshot,
                amount=r.amount,
                payment_method=r.payment_method.value,
                transaction_reference=r.transaction_reference,
            )
            for r in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# Billing — Payment detail
# ---------------------------------------------------------------------------


@router.get("/payments/{payment_id}", response_model=ClientPaymentListItem)
def get_payment_detail(
    payment_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_client),
    db: Session = Depends(get_db),
) -> ClientPaymentListItem:
    customer = _get_customer_or_403(current_user, db, request)
    pay = _get_owned_payment_or_404(payment_id, customer, db)

    _audit(db, ACTION_CLIENT_PAYMENT_HISTORY_VIEWED, request, user_id=current_user.id)

    return ClientPaymentListItem(
        id=pay.id,
        payment_number=pay.payment_number,
        payment_date=pay.payment_date.isoformat(),
        invoice_number=pay.invoice.invoice_number,
        connection_name=pay.invoice.connection_name_snapshot,
        amount=pay.amount,
        payment_method=pay.payment_method.value,
        transaction_reference=pay.transaction_reference,
    )
