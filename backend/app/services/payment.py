"""Payment recording logic."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.audit_log import ACTION_PAYMENT_DELETED, ACTION_PAYMENT_RECORDED
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment, PaymentMethod
from app.repositories.audit_log import AuditLogRepository
from app.repositories.invoice import InvoiceRepository
from app.repositories.payment import PaymentRepository
from app.schemas.payment import PaymentCreate
from app.services.invoice import InvoiceError, InvoiceService


class PaymentError(Exception):
    """Business-rule violation in the payment domain."""


class PaymentService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PaymentRepository(db)
        self.inv_repo = InvoiceRepository(db)
        self.audit = AuditLogRepository(db)

    def _get_invoice_or_raise(self, invoice_id: uuid.UUID) -> Invoice:
        inv = self.inv_repo.get(invoice_id)
        if inv is None:
            raise PaymentError("Invoice not found")
        if inv.status == InvoiceStatus.CANCELLED:
            raise PaymentError("Cancelled invoices cannot accept payments")
        return inv

    def record(
        self,
        payload: PaymentCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Payment:
        invoice = self._get_invoice_or_raise(payload.invoice_id)

        # Validate amount
        if payload.amount <= 0:
            raise PaymentError("Payment amount must be greater than zero")

        projected_paid = invoice.paid_amount + payload.amount
        if projected_paid > invoice.total_amount:
            raise PaymentError(
                f"Payment of {payload.amount} would exceed invoice total. "
                f"Maximum allowable: {invoice.total_amount - invoice.paid_amount:.2f}"
            )

        # Validate method
        try:
            method = PaymentMethod(payload.payment_method)
        except ValueError:
            raise PaymentError(
                f"Invalid payment method '{payload.payment_method}'. "
                f"Allowed: {', '.join(m.value for m in PaymentMethod)}"
            )

        payment_num = self.repo.generate_payment_number()
        payment = Payment(
            payment_number=payment_num,
            invoice_id=invoice.id,
            amount=payload.amount,
            payment_date=payload.payment_date,
            payment_method=method,
            transaction_reference=payload.transaction_reference,
            notes=payload.notes,
        )
        payment = self.repo.create(payment)

        # Lock invoice on first payment
        is_first_payment = invoice.paid_amount == Decimal("0.00")
        inv_svc = InvoiceService(self.db)
        if is_first_payment:
            invoice = inv_svc.lock(invoice, actor_id=actor_id)

        # Recalculate
        invoice = inv_svc.recalculate_after_payment(invoice, actor_id=actor_id)

        self.audit.log(
            ACTION_PAYMENT_RECORDED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return payment

    def delete(
        self,
        payment: Payment,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        self.repo.soft_delete(payment)
        self.db.commit()
        self.audit.log(
            ACTION_PAYMENT_DELETED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
