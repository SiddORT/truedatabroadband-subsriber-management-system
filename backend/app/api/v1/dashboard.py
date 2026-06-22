"""Dashboard aggregation API — SuperAdmin only."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Generator

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_staff_or_superadmin
from app.models.audit_log import ACTION_DASHBOARD_VIEWED
from app.models.customer import Customer, CustomerStatus, CustomerType
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ── Pydantic response models ──────────────────────────────────────────────────

class SummaryOut(BaseModel):
    total_customers: int
    active_customers: int
    business_customers: int
    individual_customers: int
    active_subscriptions: int
    expiring_subscriptions: int
    expired_subscriptions: int
    unpaid_invoices: int
    overdue_invoices: int
    outstanding_amount: float
    collections_this_period: float
    revenue_this_period: float


class TrendPoint(BaseModel):
    month: str
    label: str
    revenue: float


class CustomerGrowthPoint(BaseModel):
    month: str
    label: str
    new_customers: int


class SubscriptionGrowthPoint(BaseModel):
    month: str
    label: str
    new_subscriptions: int


class PlanDistributionItem(BaseModel):
    plan_id: str
    plan_name: str
    active_count: int


class RecentCustomerOut(BaseModel):
    id: str
    customer_code: str
    full_name: str
    city: str
    status: str
    created_at: str


class RecentInvoiceOut(BaseModel):
    id: str
    invoice_number: str
    customer_name: str
    connection_name: str
    total_amount: float
    status: str
    created_at: str


class RecentPaymentOut(BaseModel):
    id: str
    payment_number: str
    customer_name: str
    invoice_number: str
    amount: float
    payment_date: str
    invoice_id: str


class ExpiringSubscriptionOut(BaseModel):
    id: str
    subscription_code: str
    customer_name: str
    connection_name: str | None
    plan_name: str
    expiry_date: str
    days_remaining: int
    customer_id: str


class OverdueInvoiceOut(BaseModel):
    id: str
    invoice_number: str
    customer_name: str
    connection_name: str
    due_date: str
    balance_amount: float


# ── Helpers ───────────────────────────────────────────────────────────────────

_MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def _month_label(year: int, month: int) -> str:
    return f"{_MONTH_NAMES[month - 1]} {year}"


def _parse_period(date_from: str | None, date_to: str | None) -> tuple[date, date]:
    """Return (from_date, to_date).

    If both values parse successfully they are returned as-is.
    Otherwise falls back to the current calendar month.
    """
    if date_from and date_to:
        try:
            return date.fromisoformat(date_from), date.fromisoformat(date_to)
        except ValueError:
            pass
    today = date.today()
    return date(today.year, today.month, 1), today


def _parse_period_or_12m(date_from: str | None, date_to: str | None) -> tuple[date, date]:
    """Like _parse_period but defaults to last 12 months when no range given."""
    if date_from and date_to:
        try:
            return date.fromisoformat(date_from), date.fromisoformat(date_to)
        except ValueError:
            pass
    today = date.today()
    start = date(today.year, today.month, 1) - timedelta(days=335)
    return start, today


def _monthly_buckets(start: date, end: date) -> Generator[tuple[int, int, str], None, None]:
    """Yield (year, month, 'YYYY-MM') from start's month through end's month.

    Capped at 24 buckets to avoid huge result sets.
    """
    y, m = start.year, start.month
    end_y, end_m = end.year, end.month
    count = 0
    while (y, m) <= (end_y, end_m) and count < 24:
        yield y, m, f"{y:04d}-{m:02d}"
        m += 1
        if m > 12:
            m = 1
            y += 1
        count += 1


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryOut)
def get_summary(
    request: Request,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    current_user: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> SummaryOut:
    """KPI summary. Logs dashboard_viewed.  Snapshot counts are current state;
    period collections/revenue respect date_from/date_to."""

    AuditLogRepository(db).log(
        ACTION_DASHBOARD_VIEWED,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    today = date.today()
    expiry_threshold = today + timedelta(days=30)
    period_from, period_to = _parse_period(date_from, date_to)

    total_customers = db.scalar(
        select(func.count()).select_from(Customer)
        .where(Customer.deleted_at.is_(None))
    ) or 0

    active_customers = db.scalar(
        select(func.count()).select_from(Customer)
        .where(Customer.deleted_at.is_(None), Customer.status == CustomerStatus.ACTIVE)
    ) or 0

    business_customers = db.scalar(
        select(func.count()).select_from(Customer)
        .where(Customer.deleted_at.is_(None), Customer.customer_type == CustomerType.BUSINESS)
    ) or 0

    individual_customers = db.scalar(
        select(func.count()).select_from(Customer)
        .where(Customer.deleted_at.is_(None), Customer.customer_type == CustomerType.INDIVIDUAL)
    ) or 0

    active_subscriptions = db.scalar(
        select(func.count()).select_from(Subscription)
        .where(Subscription.deleted_at.is_(None), Subscription.status == SubscriptionStatus.ACTIVE)
    ) or 0

    expiring_subscriptions = db.scalar(
        select(func.count()).select_from(Subscription)
        .where(
            Subscription.deleted_at.is_(None),
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expiry_date >= today,
            Subscription.expiry_date <= expiry_threshold,
        )
    ) or 0

    expired_subscriptions = db.scalar(
        select(func.count()).select_from(Subscription)
        .where(Subscription.deleted_at.is_(None), Subscription.status == SubscriptionStatus.EXPIRED)
    ) or 0

    unpaid_invoices = db.scalar(
        select(func.count()).select_from(Invoice)
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.status.in_([InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID]),
        )
    ) or 0

    overdue_invoices = db.scalar(
        select(func.count()).select_from(Invoice)
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.due_date < today,
            Invoice.balance_amount > 0,
            Invoice.status.not_in([InvoiceStatus.PAID, InvoiceStatus.CANCELLED]),
        )
    ) or 0

    outstanding_amount = float(db.scalar(
        select(func.coalesce(func.sum(Invoice.balance_amount), 0))
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.balance_amount > 0,
            Invoice.status.not_in([InvoiceStatus.PAID, InvoiceStatus.CANCELLED]),
        )
    ) or 0)

    collections_this_period = float(db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            Payment.deleted_at.is_(None),
            Payment.payment_date >= period_from,
            Payment.payment_date <= period_to,
        )
    ) or 0)

    revenue_this_period = float(db.scalar(
        select(func.coalesce(func.sum(Invoice.total_amount), 0))
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.invoice_date >= period_from,
            Invoice.invoice_date <= period_to,
            Invoice.status.not_in([InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT]),
        )
    ) or 0)

    return SummaryOut(
        total_customers=total_customers,
        active_customers=active_customers,
        business_customers=business_customers,
        individual_customers=individual_customers,
        active_subscriptions=active_subscriptions,
        expiring_subscriptions=expiring_subscriptions,
        expired_subscriptions=expired_subscriptions,
        unpaid_invoices=unpaid_invoices,
        overdue_invoices=overdue_invoices,
        outstanding_amount=outstanding_amount,
        collections_this_period=collections_this_period,
        revenue_this_period=revenue_this_period,
    )


@router.get("/revenue-trend", response_model=list[TrendPoint])
def get_revenue_trend(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[TrendPoint]:
    """Monthly revenue within the selected period (defaults: last 12 months)."""
    start, end = _parse_period_or_12m(date_from, date_to)

    rows = db.execute(
        select(
            func.date_trunc("month", Invoice.invoice_date).label("month"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("revenue"),
        )
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.invoice_date >= start,
            Invoice.invoice_date <= end,
            Invoice.status.not_in([InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT]),
        )
        .group_by(func.date_trunc("month", Invoice.invoice_date))
        .order_by(func.date_trunc("month", Invoice.invoice_date))
    ).fetchall()

    row_map = {r.month.date().strftime("%Y-%m"): float(r.revenue) for r in rows}

    return [
        TrendPoint(month=key, label=_month_label(y, m), revenue=row_map.get(key, 0.0))
        for y, m, key in _monthly_buckets(start, end)
    ]


@router.get("/customer-growth", response_model=list[CustomerGrowthPoint])
def get_customer_growth(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[CustomerGrowthPoint]:
    """New customers per month within the selected period."""
    start, end = _parse_period_or_12m(date_from, date_to)

    rows = db.execute(
        select(
            func.date_trunc("month", Customer.created_at).label("month"),
            func.count().label("cnt"),
        )
        .where(
            Customer.deleted_at.is_(None),
            Customer.created_at >= start,
            Customer.created_at <= end,
        )
        .group_by(func.date_trunc("month", Customer.created_at))
        .order_by(func.date_trunc("month", Customer.created_at))
    ).fetchall()

    row_map = {r.month.date().strftime("%Y-%m"): r.cnt for r in rows}

    return [
        CustomerGrowthPoint(month=key, label=_month_label(y, m), new_customers=row_map.get(key, 0))
        for y, m, key in _monthly_buckets(start, end)
    ]


@router.get("/subscription-growth", response_model=list[SubscriptionGrowthPoint])
def get_subscription_growth(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[SubscriptionGrowthPoint]:
    """New subscriptions per month within the selected period."""
    start, end = _parse_period_or_12m(date_from, date_to)

    rows = db.execute(
        select(
            func.date_trunc("month", Subscription.created_at).label("month"),
            func.count().label("cnt"),
        )
        .where(
            Subscription.deleted_at.is_(None),
            Subscription.created_at >= start,
            Subscription.created_at <= end,
        )
        .group_by(func.date_trunc("month", Subscription.created_at))
        .order_by(func.date_trunc("month", Subscription.created_at))
    ).fetchall()

    row_map = {r.month.date().strftime("%Y-%m"): r.cnt for r in rows}

    return [
        SubscriptionGrowthPoint(month=key, label=_month_label(y, m), new_subscriptions=row_map.get(key, 0))
        for y, m, key in _monthly_buckets(start, end)
    ]


@router.get("/plan-distribution", response_model=list[PlanDistributionItem])
def get_plan_distribution(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[PlanDistributionItem]:
    """Active subscription count per plan.

    When date_from/date_to are supplied, counts subscriptions that were
    created on or before date_to and whose expiry_date is on or after date_from
    (i.e. were active at some point within the window).
    """
    _, period_to = _parse_period(date_from, date_to)
    period_from, _ = _parse_period(date_from, date_to)
    has_filter = bool(date_from and date_to)

    sub_filters = [
        Subscription.status == SubscriptionStatus.ACTIVE,
        Subscription.deleted_at.is_(None),
    ]
    if has_filter:
        sub_filters.extend([
            Subscription.created_at <= period_to,
            Subscription.expiry_date >= period_from,
        ])

    rows = db.execute(
        select(
            Plan.id.label("plan_id"),
            Plan.name.label("plan_name"),
            func.count(Subscription.id).label("active_count"),
        )
        .join(Subscription, and_(
            Subscription.plan_id == Plan.id,
            *sub_filters,
        ), isouter=True)
        .where(Plan.deleted_at.is_(None), Plan.is_active.is_(True))
        .group_by(Plan.id, Plan.name)
        .order_by(func.count(Subscription.id).desc())
    ).fetchall()

    return [
        PlanDistributionItem(
            plan_id=str(r.plan_id),
            plan_name=r.plan_name,
            active_count=r.active_count or 0,
        )
        for r in rows
    ]


@router.get("/recent-customers", response_model=list[RecentCustomerOut])
def get_recent_customers(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[RecentCustomerOut]:
    """Latest 10 customers created within the period."""
    period_from, period_to = _parse_period(date_from, date_to)
    has_filter = bool(date_from and date_to)

    q = select(Customer).where(Customer.deleted_at.is_(None))
    if has_filter:
        q = q.where(Customer.created_at >= period_from, Customer.created_at <= period_to)
    q = q.order_by(Customer.created_at.desc()).limit(10)

    rows = db.execute(q).scalars().all()

    return [
        RecentCustomerOut(
            id=str(c.id),
            customer_code=c.customer_code,
            full_name=c.full_name,
            city=c.city,
            status=c.status.value,
            created_at=c.created_at.isoformat(),
        )
        for c in rows
    ]


@router.get("/recent-invoices", response_model=list[RecentInvoiceOut])
def get_recent_invoices(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[RecentInvoiceOut]:
    """Latest 10 invoices created within the period."""
    period_from, period_to = _parse_period(date_from, date_to)
    has_filter = bool(date_from and date_to)

    q = select(Invoice).where(Invoice.deleted_at.is_(None))
    if has_filter:
        q = q.where(Invoice.created_at >= period_from, Invoice.created_at <= period_to)
    q = q.order_by(Invoice.created_at.desc()).limit(10)

    rows = db.execute(q).scalars().all()

    return [
        RecentInvoiceOut(
            id=str(inv.id),
            invoice_number=inv.invoice_number,
            customer_name=inv.customer_name_snapshot,
            connection_name=inv.connection_name_snapshot,
            total_amount=float(inv.total_amount),
            status=inv.status.value,
            created_at=inv.created_at.isoformat(),
        )
        for inv in rows
    ]


@router.get("/recent-payments", response_model=list[RecentPaymentOut])
def get_recent_payments(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[RecentPaymentOut]:
    """Latest 10 payments within the period."""
    period_from, period_to = _parse_period(date_from, date_to)
    has_filter = bool(date_from and date_to)

    q = (
        select(Payment, Invoice.invoice_number, Invoice.customer_name_snapshot)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .where(Payment.deleted_at.is_(None))
    )
    if has_filter:
        q = q.where(Payment.payment_date >= period_from, Payment.payment_date <= period_to)
    q = q.order_by(Payment.payment_date.desc(), Payment.created_at.desc()).limit(10)

    rows = db.execute(q).fetchall()

    return [
        RecentPaymentOut(
            id=str(r.Payment.id),
            payment_number=r.Payment.payment_number,
            customer_name=r.customer_name_snapshot,
            invoice_number=r.invoice_number,
            amount=float(r.Payment.amount),
            payment_date=r.Payment.payment_date.isoformat(),
            invoice_id=str(r.Payment.invoice_id),
        )
        for r in rows
    ]


@router.get("/expiring-subscriptions", response_model=list[ExpiringSubscriptionOut])
def get_expiring_subscriptions(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[ExpiringSubscriptionOut]:
    """Active subscriptions expiring within the period window.

    When date_from/date_to supplied, shows subscriptions expiring between those dates.
    Otherwise defaults to the next ``days`` days from today.
    """
    today = date.today()
    has_filter = bool(date_from and date_to)

    if has_filter:
        win_from, win_to = _parse_period(date_from, date_to)
        reference = win_from
    else:
        win_from, win_to = today, today + timedelta(days=days)
        reference = today

    rows = db.execute(
        select(Subscription, Customer.full_name, Customer.id.label("cust_id"))
        .join(Customer, Subscription.customer_id == Customer.id)
        .where(
            Subscription.deleted_at.is_(None),
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expiry_date >= win_from,
            Subscription.expiry_date <= win_to,
        )
        .order_by(Subscription.expiry_date.asc())
    ).fetchall()

    return [
        ExpiringSubscriptionOut(
            id=str(r.Subscription.id),
            subscription_code=r.Subscription.subscription_code,
            customer_name=r.full_name,
            connection_name=r.Subscription.connection_name,
            plan_name=r.Subscription.plan_name_snapshot,
            expiry_date=r.Subscription.expiry_date.isoformat(),
            days_remaining=(r.Subscription.expiry_date - reference).days,
            customer_id=str(r.cust_id),
        )
        for r in rows
    ]


@router.get("/overdue-invoices", response_model=list[OverdueInvoiceOut])
def get_overdue_invoices(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    _: User = Depends(require_staff_or_superadmin),
    db: Session = Depends(get_db),
) -> list[OverdueInvoiceOut]:
    """Invoices past due with outstanding balance.

    When date_from/date_to supplied, filters by invoices whose due_date
    falls within (or before) that window.
    """
    today = date.today()
    has_filter = bool(date_from and date_to)
    period_from, period_to = _parse_period(date_from, date_to)

    q = select(Invoice).where(
        Invoice.deleted_at.is_(None),
        Invoice.balance_amount > 0,
        Invoice.status.not_in([InvoiceStatus.PAID, InvoiceStatus.CANCELLED]),
    )
    if has_filter:
        q = q.where(Invoice.due_date >= period_from, Invoice.due_date <= period_to)
    else:
        q = q.where(Invoice.due_date < today)

    rows = db.execute(q.order_by(Invoice.due_date.asc()).limit(50)).scalars().all()

    return [
        OverdueInvoiceOut(
            id=str(inv.id),
            invoice_number=inv.invoice_number,
            customer_name=inv.customer_name_snapshot,
            connection_name=inv.connection_name_snapshot,
            due_date=inv.due_date.isoformat(),
            balance_amount=float(inv.balance_amount),
        )
        for inv in rows
    ]
