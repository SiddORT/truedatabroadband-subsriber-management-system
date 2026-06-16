"""Invoice business logic — generation, editing, locking, cancellation."""

from __future__ import annotations

import io
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import (
    ACTION_INVOICE_CANCELLED,
    ACTION_INVOICE_CREATED,
    ACTION_INVOICE_LOCKED,
    ACTION_INVOICE_UPDATED,
)
from app.models.invoice import ChangeType, Invoice, InvoiceStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company_settings import CompanySettingsRepository
from app.repositories.invoice import InvoiceRepository
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate
from app.storage.service import get_storage_service

INVOICE_BUCKET = "invoices"
PDF_PREFIX = "pdf"


class InvoiceError(Exception):
    """Business-rule violation in the invoice domain."""


class InvoiceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = InvoiceRepository(db)
        self.audit = AuditLogRepository(db)

    # ── Internal helpers ───────────────────────────────────────────────────

    def _get_subscription_or_raise(self, sub_id: uuid.UUID) -> Subscription:
        sub = self.db.get(Subscription, sub_id)
        if sub is None or sub.deleted_at is not None:
            raise InvoiceError("Subscription not found")
        if sub.status != SubscriptionStatus.ACTIVE:
            raise InvoiceError("Only ACTIVE subscriptions can be invoiced")
        return sub

    def _build_company_address(self, cs) -> str | None:
        parts = [
            cs.address_line_1,
            cs.address_line_2,
            cs.landmark,
            cs.city,
            cs.state,
            cs.pincode,
            cs.country,
        ]
        return ", ".join(p for p in parts if p) or None

    def _build_installation_address(self, customer) -> str:
        parts = [
            customer.installation_address,
            customer.address_line_2,
            customer.landmark,
            customer.city,
            customer.state,
            customer.pincode,
        ]
        return ", ".join(p for p in parts if p)

    def _compute_status(self, invoice: Invoice, today: date | None = None) -> InvoiceStatus:
        today = today or date.today()
        if invoice.status == InvoiceStatus.CANCELLED:
            return InvoiceStatus.CANCELLED
        if invoice.balance_amount <= 0:
            return InvoiceStatus.PAID
        if invoice.paid_amount > 0:
            return InvoiceStatus.PARTIALLY_PAID
        if invoice.due_date < today and invoice.balance_amount > 0:
            return InvoiceStatus.OVERDUE
        return InvoiceStatus.UNPAID

    def _generate_and_store_pdf(self, invoice: Invoice) -> str:
        from app.services.pdf_invoice import generate_invoice_pdf
        # Resolve logo absolute path from company settings
        logo_abs_path: str | None = None
        try:
            cs = CompanySettingsRepository(self.db).get()
            if cs and cs.logo_path:
                storage = get_storage_service()
                candidate = storage.url("company", cs.logo_path)
                import os
                if os.path.isfile(candidate):
                    logo_abs_path = candidate
        except Exception:
            pass
        pdf_bytes = generate_invoice_pdf(invoice, logo_path=logo_abs_path)
        key = f"{PDF_PREFIX}/{invoice.invoice_number}.pdf"
        storage = get_storage_service()
        storage.save(INVOICE_BUCKET, key, io.BytesIO(pdf_bytes))
        return key

    # ── Create ─────────────────────────────────────────────────────────────

    def create(
        self,
        payload: InvoiceCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Invoice:
        sub = self._get_subscription_or_raise(payload.subscription_id)
        customer = sub.customer
        plan = sub.plan

        # Fresh pricing snapshot from current plan_pricing record
        from app.models.plan import Plan, PlanPricing
        pricing = self.db.get(PlanPricing, sub.plan_pricing_id)
        if pricing is None:
            raise InvoiceError("Plan pricing not found")

        base = pricing.base_price
        gst_pct = pricing.gst_percentage
        discount_scope = payload.discount_scope or "base"

        # Custom line items (computed first so "overall" scope can use the total)
        line_items_data: list[dict] = []
        line_items_total = Decimal("0.00")
        for item in (payload.line_items or []):
            amt = Decimal(str(item.amount)).quantize(Decimal("0.01"))
            if amt > 0:
                entry: dict = {"description": item.description, "amount": str(amt)}
                if item.original_amount is not None:
                    entry["original_amount"] = str(Decimal(str(item.original_amount)).quantize(Decimal("0.01")))
                if item.discount_type:
                    entry["discount_type"] = item.discount_type
                if item.discount_value is not None:
                    entry["discount_value"] = str(item.discount_value)
                if item.discount_amount is not None:
                    entry["discount_amount"] = str(Decimal(str(item.discount_amount)).quantize(Decimal("0.01")))
                line_items_data.append(entry)
                line_items_total += amt

        discount_type = payload.discount_type
        discount_value = payload.discount_value or Decimal("0")
        discount_amount = Decimal("0.00")

        if discount_type and discount_value > 0:
            if discount_scope == "overall":
                # Discount on the grand total (base + GST + all items)
                # GST computed on the full base first
                gst_on_full_base = (base * gst_pct / 100).quantize(Decimal("0.01"))
                subtotal = base + gst_on_full_base + line_items_total
                if discount_type == "percentage":
                    discount_amount = (subtotal * discount_value / 100).quantize(Decimal("0.01"))
                else:
                    discount_amount = min(discount_value, subtotal).quantize(Decimal("0.01"))
                # GST stays on full base; total is subtotal minus discount
                gst_amt = gst_on_full_base
                total = (subtotal - discount_amount).quantize(Decimal("0.01"))
            else:
                # "base" scope (default): discount reduces the plan base before GST
                if discount_type == "percentage":
                    discount_amount = (base * discount_value / 100).quantize(Decimal("0.01"))
                else:
                    discount_amount = min(discount_value, base).quantize(Decimal("0.01"))
                effective_base = base - discount_amount
                gst_amt = (effective_base * gst_pct / 100).quantize(Decimal("0.01"))
                total = (effective_base + gst_amt + line_items_total).quantize(Decimal("0.01"))
        else:
            # No discount
            gst_amt = (base * gst_pct / 100).quantize(Decimal("0.01"))
            total = (base + gst_amt + line_items_total).quantize(Decimal("0.01"))

        # Company settings snapshot
        cs = CompanySettingsRepository(self.db).get_or_create()

        # Invoice number
        today = payload.invoice_date
        inv_num = self.repo.generate_invoice_number(
            cs.invoice_prefix, today.year, today.month
        )

        # Due date
        due = payload.due_date
        if due is None:
            from datetime import timedelta
            due = today + timedelta(days=cs.invoice_due_days)

        invoice = Invoice(
            invoice_number=inv_num,
            subscription_id=sub.id,
            version_number=1,
            edited_count=0,
            is_locked=False,
            # Company snapshots
            company_name_snapshot=cs.company_name,
            legal_name_snapshot=cs.legal_name,
            gst_number_snapshot=cs.gst_number,
            pan_number_snapshot=cs.pan_number,
            support_email_snapshot=cs.support_email,
            support_phone_snapshot=cs.support_phone,
            company_address_snapshot=self._build_company_address(cs),
            invoice_footer_snapshot=cs.invoice_footer_text,
            terms_snapshot=cs.terms_and_conditions,
            # Customer snapshots
            customer_code_snapshot=customer.customer_code,
            customer_name_snapshot=customer.full_name,
            customer_email_snapshot=getattr(customer, "email", None),
            customer_mobile_snapshot=getattr(customer, "mobile_number", None),
            # Connection snapshots
            connection_name_snapshot=sub.subscription_code,
            installation_address_snapshot=self._build_installation_address(customer),
            # Plan snapshots
            plan_code_snapshot=plan.plan_code,
            plan_name_snapshot=plan.name,
            speed_mbps_snapshot=plan.speed_mbps,
            data_policy_snapshot=plan.data_policy.value,
            fup_limit_gb_snapshot=plan.fup_limit_gb,
            # Pricing snapshots
            billing_cycle_snapshot=pricing.billing_cycle.value,
            base_amount=base,
            gst_percentage=gst_pct,
            gst_amount=gst_amt,
            total_amount=total,
            # Payment tracking
            paid_amount=Decimal("0.00"),
            balance_amount=total,
            # Custom line items
            line_items=line_items_data if line_items_data else None,
            line_items_total=line_items_total,
            # Discount
            discount_type=discount_type,
            discount_value=discount_value if discount_amount > 0 else None,
            discount_amount=discount_amount,
            discount_label=payload.discount_label,
            discount_scope=discount_scope,
            # Dates
            billing_period_start=payload.billing_period_start,
            billing_period_end=payload.billing_period_end,
            invoice_date=today,
            due_date=due,
            # Status
            status=InvoiceStatus.UNPAID,
            remarks=payload.remarks,
            # Bank / payment snapshots from company settings
            bank_name_snapshot=getattr(cs, "bank_name", None),
            account_name_snapshot=getattr(cs, "account_name", None),
            account_number_snapshot=getattr(cs, "account_number", None),
            ifsc_code_snapshot=getattr(cs, "ifsc_code", None),
            upi_id_snapshot=getattr(cs, "upi_id", None),
        )
        invoice = self.repo.create(invoice)

        # Generate PDF
        try:
            pdf_key = self._generate_and_store_pdf(invoice)
            invoice = self.repo.update(invoice, pdf_path=pdf_key)
        except Exception:
            pass  # PDF failure should not block invoice creation

        # Change log
        self.repo.add_change_log(
            invoice.id,
            actor_id,
            ChangeType.CREATED,
            new_values={"invoice_number": inv_num, "status": invoice.status.value},
        )

        self.audit.log(ACTION_INVOICE_CREATED, user_id=actor_id, ip_address=ip_address, user_agent=user_agent)
        return self.repo.get(invoice.id)

    # ── Edit ───────────────────────────────────────────────────────────────

    def update(
        self,
        invoice: Invoice,
        payload: InvoiceUpdate,
        *,
        actor_id: uuid.UUID,
    ) -> Invoice:
        if invoice.is_locked:
            raise InvoiceError(
                "Invoice cannot be modified because payment has already been recorded."
            )
        if invoice.status not in (InvoiceStatus.DRAFT, InvoiceStatus.UNPAID):
            raise InvoiceError(
                f"Invoice in status '{invoice.status}' cannot be edited"
            )
        if invoice.paid_amount > 0:
            raise InvoiceError("Invoice with recorded payments cannot be edited")

        old: dict[str, Any] = {}
        new: dict[str, Any] = {}

        fields_map = {
            "billing_period_start": payload.billing_period_start,
            "billing_period_end": payload.billing_period_end,
            "invoice_date": payload.invoice_date,
            "due_date": payload.due_date,
            "remarks": payload.remarks,
        }
        updates = {}
        for field, value in fields_map.items():
            if value is not None:
                current = getattr(invoice, field)
                if current != value:
                    old[field] = str(current) if current else None
                    new[field] = str(value) if value else None
                    updates[field] = value

        if not updates:
            return invoice

        updates["edited_count"] = invoice.edited_count + 1
        invoice = self.repo.update(invoice, **updates)

        # Regenerate PDF
        try:
            pdf_key = self._generate_and_store_pdf(invoice)
            invoice = self.repo.update(invoice, pdf_path=pdf_key)
        except Exception:
            pass

        self.repo.add_change_log(
            invoice.id, actor_id, ChangeType.UPDATED,
            old_values=old, new_values=new,
            change_reason=payload.change_reason,
        )
        self.audit.log(ACTION_INVOICE_UPDATED, user_id=actor_id)
        return invoice

    # ── Status change ──────────────────────────────────────────────────────

    def update_status(
        self,
        invoice: Invoice,
        new_status: str,
        change_reason: str,
        *,
        actor_id: uuid.UUID,
    ) -> Invoice:
        try:
            target = InvoiceStatus(new_status)
        except ValueError:
            raise InvoiceError(f"Invalid status: {new_status}")

        if invoice.status == InvoiceStatus.CANCELLED:
            raise InvoiceError("Cancelled invoices cannot be reopened")

        old_status = invoice.status
        invoice = self.repo.update(invoice, status=target)

        if target == InvoiceStatus.CANCELLED:
            self.repo.add_change_log(
                invoice.id, actor_id, ChangeType.CANCELLED,
                old_values={"status": old_status.value},
                new_values={"status": target.value},
                change_reason=change_reason,
            )
            self.audit.log(ACTION_INVOICE_CANCELLED, user_id=actor_id)
        else:
            self.repo.add_change_log(
                invoice.id, actor_id, ChangeType.STATUS_CHANGED,
                old_values={"status": old_status.value},
                new_values={"status": target.value},
                change_reason=change_reason,
            )
        return invoice

    # ── Lock ───────────────────────────────────────────────────────────────

    def lock(self, invoice: Invoice, *, actor_id: uuid.UUID) -> Invoice:
        if invoice.is_locked:
            return invoice
        invoice = self.repo.update(invoice, is_locked=True)
        self.repo.add_change_log(
            invoice.id, actor_id, ChangeType.LOCKED,
            new_values={"is_locked": True},
        )
        self.audit.log(ACTION_INVOICE_LOCKED, user_id=actor_id)
        return invoice

    # ── Recalculate amounts & status after payment ─────────────────────────

    def recalculate_after_payment(
        self, invoice: Invoice, *, actor_id: uuid.UUID
    ) -> Invoice:
        invoice = self.repo.recalculate_amounts(invoice)
        new_status = self._compute_status(invoice)
        invoice = self.repo.update(invoice, status=new_status)
        return invoice

    # ── PDF ────────────────────────────────────────────────────────────────

    def get_pdf_path(self, invoice: Invoice) -> str:
        """Return the absolute filesystem path to the invoice PDF, regenerating if missing."""
        storage = get_storage_service()
        if invoice.pdf_path and storage.exists(INVOICE_BUCKET, invoice.pdf_path):
            return storage.url(INVOICE_BUCKET, invoice.pdf_path)
        # Regenerate
        pdf_key = self._generate_and_store_pdf(invoice)
        self.repo.update(invoice, pdf_path=pdf_key)
        self.repo.add_change_log(
            invoice.id, None, ChangeType.PDF_REGENERATED,
            new_values={"pdf_path": pdf_key},
        )
        return storage.url(INVOICE_BUCKET, pdf_key)

    # ── Create replacement ─────────────────────────────────────────────────

    def create_replacement(
        self,
        original: Invoice,
        payload: InvoiceCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Invoice:
        """Cancel original and create a replacement linked to it."""
        if original.status != InvoiceStatus.CANCELLED:
            self.update_status(
                original, InvoiceStatus.CANCELLED.value,
                "Replaced by new invoice", actor_id=actor_id
            )

        new_inv = self.create(payload, actor_id=actor_id, ip_address=ip_address, user_agent=user_agent)
        new_inv = self.repo.update(new_inv, original_invoice_id=original.id)
        return new_inv
