"""Dashboard aggregation API — SuperAdmin only."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.dialects.postgresql import NUMERIC
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_superadmin
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

_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _month_label(year: int, month: int) -> str:
    return f"{_MONTH_NAMES[month - 1]} {year}"


def _date_filter_or_current_month(date_from: str | None, date_to: str | None):
    """Return (from_date, to_date) for period queries.

    If no explicit range is given, default to the current calendar month.
    """
    if date_from and date_to:
        try:
            return date.fromisoformat(date_from), date.fromisoformat(date_to)
        except ValueError:
            pass
    today = date.today()
    return date(today.year, today.month, 1), today


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryOut)
def get_summary(
    request: Request,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> SummaryOut:
    """KPI summary card data. Logs dashboard_viewed audit event."""

    AuditLogRepository(db).log(
        ACTION_DASHBOARD_VIEWED,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    today = date.today()
    expiry_threshold = today + timedelta(days=30)
    period_from, period_to = _date_filter_or_current_month(date_from, date_to)

    # ── Customer counts ───────────────────────────────────────────────────
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

    # ── Subscription counts ───────────────────────────────────────────────
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

    # ── Invoice counts / amounts ──────────────────────────────────────────
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

    # ── Period metrics ────────────────────────────────────────────────────
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
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[TrendPoint]:
    """Monthly revenue for the last 12 months."""
    today = date.today()
    start = date(today.year, today.month, 1) - timedelta(days=335)  # ~11 months back

    rows = db.execute(
        select(
            func.date_trunc("month", Invoice.invoice_date).label("month"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("revenue"),
        )
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.invoice_date >= start,
            Invoice.status.not_in([InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT]),
        )
        .group_by(func.date_trunc("month", Invoice.invoice_date))
        .order_by(func.date_trunc("month", Invoice.invoice_date))
    ).fetchall()

    row_map = {r.month.date().strftime("%Y-%m"): float(r.revenue) for r in rows}

    result: list[TrendPoint] = []
    for i in range(12):
        m = (today.month - 11 + i - 1) % 12 + 1
        y = today.year + (today.month - 11 + i - 1) // 12
        key = f"{y:04d}-{m:02d}"
        result.append(TrendPoint(
            month=key,
            label=_month_label(y, m),
            revenue=row_map.get(key, 0.0),
        ))
    return result


@router.get("/customer-growth", response_model=list[CustomerGrowthPoint])
def get_customer_growth(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[CustomerGrowthPoint]:
    """New customers per month for the last 12 months."""
    today = date.today()
    start = date(today.year, today.month, 1) - timedelta(days=335)

    rows = db.execute(
        select(
            func.date_trunc("month", Customer.created_at).label("month"),
            func.count().label("cnt"),
        )
        .where(
            Customer.deleted_at.is_(None),
            Customer.created_at >= start,
        )
        .group_by(func.date_trunc("month", Customer.created_at))
        .order_by(func.date_trunc("month", Customer.created_at))
    ).fetchall()

    row_map = {r.month.date().strftime("%Y-%m"): r.cnt for r in rows}

    result: list[CustomerGrowthPoint] = []
    for i in range(12):
        m = (today.month - 11 + i - 1) % 12 + 1
        y = today.year + (today.month - 11 + i - 1) // 12
        key = f"{y:04d}-{m:02d}"
        result.append(CustomerGrowthPoint(
            month=key,
            label=_month_label(y, m),
            new_customers=row_map.get(key, 0),
        ))
    return result


@router.get("/subscription-growth", response_model=list[SubscriptionGrowthPoint])
def get_subscription_growth(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[SubscriptionGrowthPoint]:
    """New subscriptions per month for the last 12 months."""
    today = date.today()
    start = date(today.year, today.month, 1) - timedelta(days=335)

    rows = db.execute(
        select(
            func.date_trunc("month", Subscription.created_at).label("month"),
            func.count().label("cnt"),
        )
        .where(
            Subscription.deleted_at.is_(None),
            Subscription.created_at >= start,
        )
        .group_by(func.date_trunc("month", Subscription.created_at))
        .order_by(func.date_trunc("month", Subscription.created_at))
    ).fetchall()

    row_map = {r.month.date().strftime("%Y-%m"): r.cnt for r in rows}

    result: list[SubscriptionGrowthPoint] = []
    for i in range(12):
        m = (today.month - 11 + i - 1) % 12 + 1
        y = today.year + (today.month - 11 + i - 1) // 12
        key = f"{y:04d}-{m:02d}"
        result.append(SubscriptionGrowthPoint(
            month=key,
            label=_month_label(y, m),
            new_subscriptions=row_map.get(key, 0),
        ))
    return result


@router.get("/plan-distribution", response_model=list[PlanDistributionItem])
def get_plan_distribution(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[PlanDistributionItem]:
    """Active subscription count per plan, sorted descending."""
    rows = db.execute(
        select(
            Plan.id.label("plan_id"),
            Plan.name.label("plan_name"),
            func.count(Subscription.id).label("active_count"),
        )
        .join(Subscription, and_(
            Subscription.plan_id == Plan.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.deleted_at.is_(None),
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
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[RecentCustomerOut]:
    """Latest 10 customers."""
    rows = db.execute(
        select(Customer)
        .where(Customer.deleted_at.is_(None))
        .order_by(Customer.created_at.desc())
        .limit(10)
    ).scalars().all()

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
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[RecentInvoiceOut]:
    """Latest 10 invoices sorted by created_at DESC."""
    rows = db.execute(
        select(Invoice)
        .where(Invoice.deleted_at.is_(None))
        .order_by(Invoice.created_at.desc())
        .limit(10)
    ).scalars().all()

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
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[RecentPaymentOut]:
    """Latest 10 payments sorted by payment_date DESC."""
    rows = db.execute(
        select(Payment, Invoice.invoice_number, Invoice.customer_name_snapshot)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .where(Payment.deleted_at.is_(None))
        .order_by(Payment.payment_date.desc(), Payment.created_at.desc())
        .limit(10)
    ).fetchall()

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
    days: int = Query(30, ge=1, le=365),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[ExpiringSubscriptionOut]:
    """Active subscriptions expiring within the next N days."""
    today = date.today()
    threshold = today + timedelta(days=days)

    rows = db.execute(
        select(Subscription, Customer.full_name, Customer.id.label("cust_id"))
        .join(Customer, Subscription.customer_id == Customer.id)
        .where(
            Subscription.deleted_at.is_(None),
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.expiry_date >= today,
            Subscription.expiry_date <= threshold,
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
            days_remaining=(r.Subscription.expiry_date - today).days,
            customer_id=str(r.cust_id),
        )
        for r in rows
    ]


@router.get("/overdue-invoices", response_model=list[OverdueInvoiceOut])
def get_overdue_invoices(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[OverdueInvoiceOut]:
    """Invoices with past due date and outstanding balance."""
    today = date.today()

    rows = db.execute(
        select(Invoice)
        .where(
            Invoice.deleted_at.is_(None),
            Invoice.due_date < today,
            Invoice.balance_amount > 0,
            Invoice.status.not_in([InvoiceStatus.PAID, InvoiceStatus.CANCELLED]),
        )
        .order_by(Invoice.due_date.asc())
        .limit(50)
    ).scalars().all()

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
