"""Repository for Invoice and InvoiceChangeLog."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.invoice import ChangeType, Invoice, InvoiceChangeLog, InvoiceStatus, InvoiceSubscriptionItem


class InvoiceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Fetch ─────────────────────────────────────────────────────────────

    def get(self, invoice_id: uuid.UUID) -> Invoice | None:
        stmt = (
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .where(Invoice.deleted_at.is_(None))
            .options(
                selectinload(Invoice.payments),
                selectinload(Invoice.change_logs),
                selectinload(Invoice.subscription_items),
            )
        )
        return self.db.scalars(stmt).first()

    def get_by_number(self, invoice_number: str) -> Invoice | None:
        stmt = select(Invoice).where(Invoice.invoice_number == invoice_number)
        return self.db.scalars(stmt).first()

    def list_by_subscription(self, subscription_id: uuid.UUID) -> list[Invoice]:
        stmt = (
            select(Invoice)
            .where(Invoice.subscription_id == subscription_id)
            .where(Invoice.deleted_at.is_(None))
            .order_by(Invoice.invoice_date.desc())
        )
        return list(self.db.scalars(stmt).all())

    def list_by_customer_user(
        self, user_id: uuid.UUID, *, page: int = 1, page_size: int = 10
    ) -> tuple[list[Invoice], int]:
        """For client portal — invoices whose subscription (SINGLE) or customer_id (CONSOLIDATED)
        belong to this user's customer account."""
        from app.models.customer import Customer
        from app.models.subscription import Subscription

        stmt = (
            select(Invoice)
            .where(Invoice.deleted_at.is_(None))
            .where(
                or_(
                    Invoice.subscription_id.in_(
                        select(Subscription.id)
                        .join(Customer, Subscription.customer_id == Customer.id)
                        .where(Customer.user_id == user_id)
                        .where(Subscription.deleted_at.is_(None))
                    ),
                    Invoice.customer_id.in_(
                        select(Customer.id)
                        .where(Customer.user_id == user_id)
                        .where(Customer.deleted_at.is_(None))
                    ),
                )
            )
            .order_by(Invoice.invoice_date.desc())
        )
        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        )
        return items, total

    def list_paginated(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        search: str = "",
        sort_by: str = "created_at",
        sort_order: str = "desc",
        status_filter: str | None = None,
        customer_filter: str | None = None,
        customer_id: str | None = None,
        plan_filter: str | None = None,
        invoice_date_from: date | None = None,
        invoice_date_to: date | None = None,
        due_date_from: date | None = None,
        due_date_to: date | None = None,
        quick_filter: str | None = None,
    ) -> tuple[list[Invoice], int]:
        stmt = select(Invoice).where(Invoice.deleted_at.is_(None))

        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Invoice.invoice_number.ilike(term),
                    Invoice.customer_name_snapshot.ilike(term),
                    Invoice.customer_code_snapshot.ilike(term),
                    Invoice.connection_name_snapshot.ilike(term),
                )
            )

        if status_filter:
            try:
                s = InvoiceStatus(status_filter)
                stmt = stmt.where(Invoice.status == s)
            except ValueError:
                pass

        if customer_filter:
            term = f"%{customer_filter}%"
            stmt = stmt.where(
                or_(
                    Invoice.customer_name_snapshot.ilike(term),
                    Invoice.customer_code_snapshot.ilike(term),
                )
            )

        if customer_id:
            import uuid as _uuid
            try:
                cid = _uuid.UUID(customer_id)
                stmt = stmt.where(Invoice.customer_id == cid)
            except ValueError:
                pass

        if plan_filter:
            term = f"%{plan_filter}%"
            stmt = stmt.where(
                or_(
                    Invoice.plan_name_snapshot.ilike(term),
                    Invoice.plan_code_snapshot.ilike(term),
                )
            )

        if invoice_date_from:
            stmt = stmt.where(Invoice.invoice_date >= invoice_date_from)
        if invoice_date_to:
            stmt = stmt.where(Invoice.invoice_date <= invoice_date_to)

        if due_date_from:
            stmt = stmt.where(Invoice.due_date >= due_date_from)
        if due_date_to:
            stmt = stmt.where(Invoice.due_date <= due_date_to)

        if quick_filter:
            today = date.today()
            if quick_filter == "due_today":
                stmt = stmt.where(Invoice.due_date == today)
                stmt = stmt.where(Invoice.balance_amount > 0)
            elif quick_filter == "due_7d":
                stmt = stmt.where(Invoice.due_date >= today)
                stmt = stmt.where(Invoice.due_date <= today + timedelta(days=7))
                stmt = stmt.where(Invoice.balance_amount > 0)
            elif quick_filter == "due_15d":
                stmt = stmt.where(Invoice.due_date >= today)
                stmt = stmt.where(Invoice.due_date <= today + timedelta(days=15))
                stmt = stmt.where(Invoice.balance_amount > 0)
            elif quick_filter == "due_30d":
                stmt = stmt.where(Invoice.due_date >= today)
                stmt = stmt.where(Invoice.due_date <= today + timedelta(days=30))
                stmt = stmt.where(Invoice.balance_amount > 0)
            elif quick_filter == "overdue":
                stmt = stmt.where(Invoice.due_date < today)
                stmt = stmt.where(Invoice.balance_amount > 0)

        _sort_map = {
            "invoice_date": Invoice.invoice_date,
            "due_date": Invoice.due_date,
            "total_amount": Invoice.total_amount,
            "balance_amount": Invoice.balance_amount,
            "status": Invoice.status,
            "created_at": Invoice.created_at,
        }
        col = _sort_map.get(sort_by, Invoice.created_at)
        stmt = stmt.order_by(col.desc() if sort_order == "desc" else col.asc())

        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        )
        return items, total

    # ── Duplicate / overlap checks ─────────────────────────────────────────

    def check_duplicate(
        self,
        subscription_id: uuid.UUID,
        billing_period_start: date,
        billing_period_end: date,
        exclude_id: uuid.UUID | None = None,
    ) -> bool:
        """Return True if a non-cancelled invoice exists for the same subscription + billing period."""
        stmt = (
            select(Invoice.id)
            .where(Invoice.subscription_id == subscription_id)
            .where(Invoice.billing_period_start == billing_period_start)
            .where(Invoice.billing_period_end == billing_period_end)
            .where(Invoice.status != InvoiceStatus.CANCELLED)
            .where(Invoice.deleted_at.is_(None))
        )
        if exclude_id is not None:
            stmt = stmt.where(Invoice.id != exclude_id)
        return self.db.scalars(stmt).first() is not None

    def check_overlapping_billing_period(
        self,
        subscription_id: uuid.UUID,
        billing_period_start: date,
        billing_period_end: date,
        exclude_id: uuid.UUID | None = None,
    ) -> bool:
        """Return True if an existing non-cancelled invoice overlaps the given billing period."""
        stmt = (
            select(Invoice.id)
            .where(Invoice.subscription_id == subscription_id)
            .where(Invoice.status != InvoiceStatus.CANCELLED)
            .where(Invoice.deleted_at.is_(None))
            .where(Invoice.billing_period_start < billing_period_end)
            .where(Invoice.billing_period_end > billing_period_start)
        )
        if exclude_id is not None:
            stmt = stmt.where(Invoice.id != exclude_id)
        return self.db.scalars(stmt).first() is not None

    # ── Invoice number generation ──────────────────────────────────────────

    def generate_invoice_number(self, prefix: str, year: int, month: int) -> str:
        """Global sequential invoice number — never reuses across any month."""
        result = self.db.execute(select(func.max(Invoice.invoice_number))).scalar()
        if result is None:
            n = 1
        else:
            try:
                n = int(result.split("-")[-1]) + 1
            except (ValueError, IndexError):
                n = 1
        return f"{prefix}-{year:04d}{month:02d}-{n:05d}"

    # ── Create ────────────────────────────────────────────────────────────

    def create(self, invoice: Invoice) -> Invoice:
        self.db.add(invoice)
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    # ── Update ────────────────────────────────────────────────────────────

    def update(self, invoice: Invoice, **fields) -> Invoice:
        for key, value in fields.items():
            setattr(invoice, key, value)
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    # ── Soft delete ───────────────────────────────────────────────────────

    def soft_delete(self, invoice: Invoice) -> None:
        from datetime import datetime, timezone
        invoice.deleted_at = datetime.now(timezone.utc)
        self.db.commit()

    # ── Change log ────────────────────────────────────────────────────────

    def add_change_log(
        self,
        invoice_id: uuid.UUID,
        changed_by_user_id: uuid.UUID | None,
        change_type: ChangeType,
        old_values: dict | None = None,
        new_values: dict | None = None,
        change_reason: str | None = None,
    ) -> InvoiceChangeLog:
        log = InvoiceChangeLog(
            invoice_id=invoice_id,
            changed_by_user_id=changed_by_user_id,
            change_type=change_type,
            old_values=old_values,
            new_values=new_values,
            change_reason=change_reason,
        )
        self.db.add(log)
        self.db.commit()
        return log

    # ── Payment aggregation ───────────────────────────────────────────────

    def recalculate_amounts(self, invoice: Invoice) -> Invoice:
        """Recompute paid_amount and balance_amount from all non-deleted payments."""
        from app.models.payment import Payment

        paid = (
            self.db.scalar(
                select(func.coalesce(func.sum(Payment.amount), 0))
                .where(Payment.invoice_id == invoice.id)
                .where(Payment.deleted_at.is_(None))
            )
            or Decimal("0.00")
        )
        invoice.paid_amount = Decimal(str(paid))
        invoice.balance_amount = invoice.total_amount - invoice.paid_amount
        self.db.commit()
        self.db.refresh(invoice)
        return invoice
