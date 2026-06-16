"""Repository for Payments."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.payment import Payment


class PaymentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, payment_id: uuid.UUID) -> Payment | None:
        stmt = (
            select(Payment)
            .where(Payment.id == payment_id)
            .where(Payment.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def list_by_invoice(self, invoice_id: uuid.UUID) -> list[Payment]:
        stmt = (
            select(Payment)
            .where(Payment.invoice_id == invoice_id)
            .where(Payment.deleted_at.is_(None))
            .order_by(Payment.payment_date.asc())
        )
        return list(self.db.scalars(stmt).all())

    def generate_payment_number(self) -> str:
        result = self.db.execute(select(func.max(Payment.payment_number))).scalar()
        if result is None:
            n = 1
        else:
            try:
                n = int(result.split("-")[-1]) + 1
            except (ValueError, IndexError):
                n = 1
        return f"TDB-PAY-{n:05d}"

    def create(self, payment: Payment) -> Payment:
        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def list_paginated(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        search: str = "",
        sort_by: str = "payment_date",
        sort_order: str = "desc",
        invoice_id: uuid.UUID | None = None,
    ) -> tuple[list[Payment], int]:
        stmt = select(Payment).where(Payment.deleted_at.is_(None))

        if invoice_id:
            stmt = stmt.where(Payment.invoice_id == invoice_id)

        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Payment.payment_number.ilike(term),
                    Payment.transaction_reference.ilike(term),
                )
            )

        _sort_map = {
            "payment_date": Payment.payment_date,
            "amount": Payment.amount,
            "created_at": Payment.created_at,
        }
        col = _sort_map.get(sort_by, Payment.payment_date)
        stmt = stmt.order_by(col.desc() if sort_order == "desc" else col.asc())

        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        )
        return items, total

    def list_paginated_by_user(
        self,
        user_id: uuid.UUID,
        *,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[Payment], int]:
        """Client portal — payments for invoices owned by this user's customer."""
        from app.models.customer import Customer
        from app.models.invoice import Invoice
        from app.models.subscription import Subscription

        stmt = (
            select(Payment)
            .join(Invoice, Payment.invoice_id == Invoice.id)
            .join(Subscription, Invoice.subscription_id == Subscription.id)
            .join(Customer, Subscription.customer_id == Customer.id)
            .where(Customer.user_id == user_id)
            .where(Payment.deleted_at.is_(None))
            .order_by(Payment.payment_date.desc())
        )
        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        )
        return items, total
