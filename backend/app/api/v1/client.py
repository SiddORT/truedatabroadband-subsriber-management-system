"""Client self-service portal API — /api/v1/client/*

All endpoints require an authenticated CLIENT user.
Ownership is enforced at the query level (customer_id == current_user's customer).
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_client
from app.models.audit_log import (
    ACTION_CLIENT_DASHBOARD_VIEWED,
    ACTION_CLIENT_INVOICE_DOWNLOADED,
    ACTION_CLIENT_LOGOUT_ALL,
    ACTION_CLIENT_PROFILE_UPDATED,
    ACTION_CLIENT_SESSION_REVOKED,
    ACTION_CLIENT_UNAUTHORIZED_ACCESS,
)
from app.models.invoice import Invoice, InvoiceStatus
from app.models.notification import NotificationLog
from app.models.payment import Payment
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.customer import CustomerRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.schemas.auth import MessageResponse
from app.schemas.client import (
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
