"""Invoice business logic — generation, editing, locking, cancellation."""

from __future__ import annotations

import io
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import (
    ACTION_DUPLICATE_INVOICE_BLOCKED,
    ACTION_INVOICE_CANCELLED,
    ACTION_INVOICE_CREATED,
    ACTION_INVOICE_DELETED,
    ACTION_INVOICE_EDITED,
    ACTION_INVOICE_GENERATION_REJECTED,
    ACTION_INVOICE_LOCKED,
    ACTION_INVOICE_PDF_REGENERATED,
    ACTION_INVOICE_UPDATED,
)
from app.models.invoice import ChangeType, Invoice, InvoiceStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company_settings import CompanySettingsRepository
from app.repositories.invoice import InvoiceRepository
from app.schemas.invoice import ConsolidatedInvoiceCreate, InvoiceCreate, InvoiceUpdate
from app.storage.service import get_storage_service

INVOICE_BUCKET = "invoices"
PDF_PREFIX = "pdf"


class InvoiceError(Exception):
    """Business-rule violation in the invoice domain."""


class DuplicateInvoiceError(InvoiceError):
    """Raised when a duplicate invoice is detected (same sub + billing period)."""


class OverlappingBillingPeriodError(InvoiceError):
    """Raised when a new invoice's billing period overlaps an existing one."""


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

    def _process_line_items(self, line_items_in) -> tuple[list[dict], Decimal]:
        """Convert LineItemIn list → (stored list, total). Returns ([], Decimal(0)) for empty."""
        line_items_data: list[dict] = []
        line_items_total = Decimal("0.00")
        for item in (line_items_in or []):
            amt = Decimal(str(item.amount)).quantize(Decimal("0.01"))
            if amt > 0:
                entry: dict = {"description": item.description, "amount": str(amt)}
                if item.original_amount is not None:
                    entry["original_amount"] = str(
                        Decimal(str(item.original_amount)).quantize(Decimal("0.01"))
                    )
                if item.discount_type:
                    entry["discount_type"] = item.discount_type
                if item.discount_value is not None:
                    entry["discount_value"] = str(item.discount_value)
                if item.discount_amount is not None:
                    entry["discount_amount"] = str(
                        Decimal(str(item.discount_amount)).quantize(Decimal("0.01"))
                    )
                line_items_data.append(entry)
                line_items_total += amt
        return line_items_data, line_items_total

    def _compute_totals(
        self,
        base: Decimal,
        gst_pct: Decimal,
        line_items_total: Decimal,
        discount_type: str | None,
        discount_value: Decimal,
        discount_scope: str,
    ) -> tuple[Decimal, Decimal, Decimal, Decimal]:
        """Return (base, gst_amount, total, discount_amount)."""
        discount_amount = Decimal("0.00")
        if discount_type and discount_value > 0:
            if discount_scope == "overall":
                gst_on_full_base = (base * gst_pct / 100).quantize(Decimal("0.01"))
                subtotal = base + gst_on_full_base + line_items_total
                if discount_type == "percentage":
                    discount_amount = (subtotal * discount_value / 100).quantize(Decimal("0.01"))
                else:
                    discount_amount = min(discount_value, subtotal).quantize(Decimal("0.01"))
                gst_amt = gst_on_full_base
                total = (subtotal - discount_amount).quantize(Decimal("0.01"))
            else:
                if discount_type == "percentage":
                    discount_amount = (base * discount_value / 100).quantize(Decimal("0.01"))
                else:
                    discount_amount = min(discount_value, base).quantize(Decimal("0.01"))
                effective_base = base - discount_amount
                gst_amt = (effective_base * gst_pct / 100).quantize(Decimal("0.01"))
                total = (effective_base + gst_amt + line_items_total).quantize(Decimal("0.01"))
        else:
            gst_amt = (base * gst_pct / 100).quantize(Decimal("0.01"))
            total = (base + gst_amt + line_items_total).quantize(Decimal("0.01"))
        return base, gst_amt, total, discount_amount

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

        # ── Duplicate invoice guard ─────────────────────────────────────────
        if self.repo.check_duplicate(
            sub.id, payload.billing_period_start, payload.billing_period_end
        ):
            self.audit.log(
                ACTION_DUPLICATE_INVOICE_BLOCKED,
                user_id=actor_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            raise DuplicateInvoiceError(
                "An invoice already exists for this billing period."
            )

        # ── Overlapping billing period guard ────────────────────────────────
        if self.repo.check_overlapping_billing_period(
            sub.id, payload.billing_period_start, payload.billing_period_end
        ):
            self.audit.log(
                ACTION_INVOICE_GENERATION_REJECTED,
                user_id=actor_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            raise OverlappingBillingPeriodError(
                "Billing period overlaps with an existing invoice for this subscription."
            )

        # Fresh pricing snapshot from current plan_pricing record
        from app.models.plan import Plan, PlanPricing
        pricing = self.db.get(PlanPricing, sub.plan_pricing_id)
        if pricing is None:
            raise InvoiceError("Plan pricing not found")

        base = pricing.base_price
        gst_pct = pricing.gst_percentage
        discount_scope = payload.discount_scope or "base"

        line_items_data, line_items_total = self._process_line_items(payload.line_items)

        discount_type = payload.discount_type
        discount_value = payload.discount_value or Decimal("0")
        _, gst_amt, total, discount_amount = self._compute_totals(
            base, gst_pct, line_items_total, discount_type, discount_value, discount_scope
        )

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
            customer_type_snapshot=customer.customer_type.value if customer.customer_type else None,
            customer_company_snapshot=getattr(customer, "company_name", None),
            customer_gst_snapshot=getattr(customer, "gst_number", None),
            # Connection snapshots
            connection_name_snapshot=sub.connection_name or sub.subscription_code,
            installation_address_snapshot=sub.installation_address or self._build_installation_address(customer),
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
            gpay_number_snapshot=getattr(cs, "gpay_number", None),
        )
        invoice = self.repo.create(invoice)

        # Generate PDF
        try:
            pdf_key = self._generate_and_store_pdf(invoice)
            invoice = self.repo.update(invoice, pdf_path=pdf_key)
        except Exception:
            pass

        # Change log
        self.repo.add_change_log(
            invoice.id,
            actor_id,
            ChangeType.CREATED,
            new_values={"invoice_number": inv_num, "status": invoice.status.value},
        )

        self.audit.log(
            ACTION_INVOICE_CREATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="invoice",
            entity_id=str(invoice.id),
            entity_name=invoice.invoice_number,
        )
        # Send invoice generated email (fire-and-forget)
        try:
            from app.services.notifications.notification_service import NotificationService, Recipient
            notif_svc = NotificationService(self.db)
            notif_svc.send(
                template_key="INVOICE_GENERATED",
                recipient=Recipient(
                    email=invoice.customer_email_snapshot,
                    mobile=invoice.customer_mobile_snapshot,
                ),
                variables={
                    "customer_name": invoice.customer_name_snapshot or customer.full_name,
                    "invoice_number": invoice.invoice_number,
                    "amount": f"{invoice.total_amount:,.2f}",
                    "due_date": str(invoice.due_date),
                },
                customer_id=customer.id,
            )
        except Exception:
            pass
        return self.repo.get(invoice.id)

    # ── Full edit ──────────────────────────────────────────────────────────

    def update(
        self,
        invoice: Invoice,
        payload: InvoiceUpdate,
        *,
        actor_id: uuid.UUID,
    ) -> Invoice:
        if invoice.is_locked:
            raise InvoiceError("Invoice cannot be modified because it is locked.")
        if invoice.status not in (InvoiceStatus.DRAFT, InvoiceStatus.UNPAID):
            raise InvoiceError(f"Invoice in status '{invoice.status}' cannot be edited")
        if invoice.paid_amount > 0:
            raise InvoiceError("Invoice with recorded payments cannot be edited")

        # Capture old values for the change log
        old: dict[str, Any] = {
            "subscription_id": str(invoice.subscription_id) if invoice.subscription_id else None,
            "billing_period_start": str(invoice.billing_period_start),
            "billing_period_end": str(invoice.billing_period_end),
            "invoice_date": str(invoice.invoice_date),
            "due_date": str(invoice.due_date),
            "total_amount": str(invoice.total_amount),
            "remarks": invoice.remarks,
        }

        # Determine effective subscription
        sub_changed = (
            payload.subscription_id is not None
            and payload.subscription_id != invoice.subscription_id
        )
        if sub_changed:
            sub = self._get_subscription_or_raise(payload.subscription_id)
        else:
            sub = invoice.subscription
            if sub is None and invoice.subscription_id:
                sub = self.db.get(Subscription, invoice.subscription_id)

        updates: dict[str, Any] = {}

        # ── Re-compute financial totals when financial fields are provided ───
        needs_recalc = (
            sub_changed
            or payload.line_items is not None
            or payload.discount_type is not None
            or payload.discount_value is not None
            or payload.discount_scope is not None
        )

        if needs_recalc and sub is not None:
            from app.models.plan import PlanPricing
            pricing = self.db.get(PlanPricing, sub.plan_pricing_id)
            if pricing is None:
                raise InvoiceError("Plan pricing not found")

            base = pricing.base_price
            gst_pct = pricing.gst_percentage

            # Effective line items: use payload if provided, else keep existing
            if payload.line_items is not None:
                line_items_data, line_items_total = self._process_line_items(payload.line_items)
            else:
                line_items_data = list(invoice.line_items or [])
                line_items_total = invoice.line_items_total

            # Effective discount params
            discount_scope = (
                payload.discount_scope
                if payload.discount_scope is not None
                else (invoice.discount_scope or "base")
            )
            discount_type = (
                payload.discount_type
                if payload.discount_type is not None
                else invoice.discount_type
            )
            discount_value = (
                payload.discount_value
                if payload.discount_value is not None
                else (invoice.discount_value or Decimal("0"))
            )
            discount_label = (
                payload.discount_label
                if payload.discount_label is not None
                else invoice.discount_label
            )

            _, gst_amt, total, discount_amount = self._compute_totals(
                base, gst_pct, line_items_total,
                discount_type, discount_value or Decimal("0"), discount_scope,
            )

            updates.update({
                "base_amount": base,
                "gst_percentage": gst_pct,
                "gst_amount": gst_amt,
                "total_amount": total,
                "balance_amount": total - invoice.paid_amount,
                "line_items": line_items_data if line_items_data else None,
                "line_items_total": line_items_total,
                "discount_type": discount_type,
                "discount_value": discount_value if discount_amount > 0 else None,
                "discount_amount": discount_amount,
                "discount_label": discount_label,
                "discount_scope": discount_scope,
            })

            if sub_changed:
                customer = sub.customer
                plan = sub.plan
                updates.update({
                    "subscription_id": sub.id,
                    "customer_code_snapshot": customer.customer_code,
                    "customer_name_snapshot": customer.full_name,
                    "customer_email_snapshot": getattr(customer, "email", None),
                    "customer_mobile_snapshot": getattr(customer, "mobile_number", None),
                    "connection_name_snapshot": sub.connection_name or sub.subscription_code,
                    "installation_address_snapshot": (
                        sub.installation_address or self._build_installation_address(customer)
                    ),
                    "plan_code_snapshot": plan.plan_code,
                    "plan_name_snapshot": plan.name,
                    "speed_mbps_snapshot": plan.speed_mbps,
                    "data_policy_snapshot": plan.data_policy.value,
                    "fup_limit_gb_snapshot": plan.fup_limit_gb,
                    "billing_cycle_snapshot": pricing.billing_cycle.value,
                })

        # ── Non-financial field updates ─────────────────────────────────────
        if payload.billing_period_start is not None:
            updates["billing_period_start"] = payload.billing_period_start
        if payload.billing_period_end is not None:
            updates["billing_period_end"] = payload.billing_period_end
        if payload.invoice_date is not None:
            updates["invoice_date"] = payload.invoice_date
        if payload.due_date is not None:
            updates["due_date"] = payload.due_date
        if payload.remarks is not None:
            updates["remarks"] = payload.remarks

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

        new: dict[str, Any] = {
            k: str(v) if v is not None else None
            for k, v in updates.items()
            if k != "edited_count"
        }

        self.repo.add_change_log(
            invoice.id, actor_id, ChangeType.EDITED,
            old_values=old, new_values=new,
            change_reason=payload.change_reason,
        )
        self.audit.log(
            ACTION_INVOICE_EDITED,
            user_id=actor_id,
            entity_type="invoice",
            entity_id=str(invoice.id),
            entity_name=invoice.invoice_number,
        )
        return self.repo.get(invoice.id)

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
            self.audit.log(
                ACTION_INVOICE_CANCELLED,
                user_id=actor_id,
                entity_type="invoice",
                entity_id=str(invoice.id),
                entity_name=invoice.invoice_number,
                old_values={"status": old_status.value},
                new_values={"status": target.value},
            )
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
        self.audit.log(
            ACTION_INVOICE_LOCKED,
            user_id=actor_id,
            entity_type="invoice",
            entity_id=str(invoice.id),
            entity_name=invoice.invoice_number,
        )
        return invoice

    # ── Recalculate amounts & status after payment ─────────────────────────

    def recalculate_after_payment(
        self, invoice: Invoice, *, actor_id: uuid.UUID
    ) -> Invoice:
        invoice = self.repo.recalculate_amounts(invoice)
        new_status = self._compute_status(invoice)
        invoice = self.repo.update(invoice, status=new_status)
        # Regenerate PDF so it reflects the updated payment status
        try:
            pdf_key = self._generate_and_store_pdf(invoice)
            invoice = self.repo.update(invoice, pdf_path=pdf_key)
        except Exception:
            pass
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

    # ── Soft delete ────────────────────────────────────────────────────────

    def delete(
        self,
        invoice: Invoice,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        self.repo.soft_delete(invoice)
        self.audit.log(
            ACTION_INVOICE_DELETED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="invoice",
            entity_id=str(invoice.id),
            entity_name=invoice.invoice_number,
        )

    # ── Create consolidated ────────────────────────────────────────────────

    def create_consolidated(
        self,
        payload: ConsolidatedInvoiceCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Invoice:
        """Create a single invoice covering multiple subscriptions for one customer."""
        from datetime import timedelta

        from app.models.customer import Customer
        from app.models.invoice import InvoiceSubscriptionItem
        from app.models.plan import Plan, PlanPricing

        customer = self.db.get(Customer, payload.customer_id)
        if customer is None or customer.deleted_at is not None:
            raise InvoiceError("Customer not found")

        if not payload.subscriptions:
            raise InvoiceError("At least one subscription is required")

        cs = CompanySettingsRepository(self.db).get_or_create()

        sub_computations: list[dict] = []
        grand_total = Decimal("0.00")

        for idx, sub_billing in enumerate(payload.subscriptions):
            sub = self._get_subscription_or_raise(sub_billing.subscription_id)
            if sub.customer_id != customer.id:
                raise InvoiceError(
                    f"Subscription {sub.subscription_code} does not belong to customer {customer.customer_code}"
                )

            # Guard: check for existing individual invoice overlapping the same billing period
            sub_bp_start = sub_billing.billing_period_start or payload.billing_period_start
            sub_bp_end = sub_billing.billing_period_end or payload.billing_period_end
            if sub_bp_start is None or sub_bp_end is None:
                raise InvoiceError("Billing period is required for each subscription.")
            if self.repo.check_overlapping_billing_period(
                sub.id, sub_bp_start, sub_bp_end
            ):
                raise InvoiceError(
                    f"Subscription {sub.subscription_code} already has an invoice that overlaps "
                    f"the billing period {sub_bp_start} – {sub_bp_end}."
                )

            plan = sub.plan
            pricing = self.db.get(PlanPricing, sub.plan_pricing_id)
            if pricing is None:
                raise InvoiceError(f"Plan pricing not found for subscription {sub.subscription_code}")

            base = pricing.base_price
            gst_pct = pricing.gst_percentage
            disc_scope = sub_billing.discount_scope or "base"

            line_items_data, lit = self._process_line_items(sub_billing.line_items)

            disc_type = sub_billing.discount_type
            disc_value = sub_billing.discount_value or Decimal("0")

            _, gst_amt, total, disc_amt = self._compute_totals(
                base, gst_pct, lit, disc_type, disc_value, disc_scope
            )

            grand_total += total
            sub_computations.append({
                "sub": sub, "plan": plan, "pricing": pricing,
                "base": base, "gst_pct": gst_pct, "gst_amt": gst_amt,
                "total": total, "lit": lit, "disc_amt": disc_amt,
                "disc_type": disc_type,
                "disc_value": disc_value if disc_amt > 0 else None,
                "disc_label": sub_billing.discount_label,
                "disc_scope": disc_scope,
                "line_items_data": line_items_data,
                "sort_order": idx,
                "bp_start": sub_bp_start,
                "bp_end": sub_bp_end,
            })

        grand_base = sum(c["base"] for c in sub_computations)
        grand_gst  = sum(c["gst_amt"] for c in sub_computations)
        grand_lit  = sum(c["lit"] for c in sub_computations)
        grand_disc = sum(c["disc_amt"] for c in sub_computations)
        first = sub_computations[0]

        today = payload.invoice_date
        inv_num = self.repo.generate_invoice_number(cs.invoice_prefix, today.year, today.month)

        due = payload.due_date
        if due is None:
            due = today + timedelta(days=cs.invoice_due_days)

        sub_count = len(sub_computations)
        invoice = Invoice(
            invoice_number=inv_num,
            subscription_id=None,
            invoice_type="CONSOLIDATED",
            customer_id=customer.id,
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
            customer_type_snapshot=customer.customer_type.value if customer.customer_type else None,
            customer_company_snapshot=getattr(customer, "company_name", None),
            customer_gst_snapshot=getattr(customer, "gst_number", None),
            # Connection snapshots — use first sub's data
            connection_name_snapshot=(
                f"{sub_count} connections"
                if sub_count > 1
                else (first["sub"].connection_name or first["sub"].subscription_code)
            ),
            installation_address_snapshot=None,
            # Plan snapshots — use first sub's data
            plan_code_snapshot=first["plan"].plan_code,
            plan_name_snapshot=(
                f"Multiple ({sub_count} plans)"
                if sub_count > 1
                else first["plan"].name
            ),
            speed_mbps_snapshot=first["sub"].speed_mbps_snapshot,
            data_policy_snapshot=first["plan"].data_policy.value,
            fup_limit_gb_snapshot=first["plan"].fup_limit_gb,
            billing_cycle_snapshot=first["pricing"].billing_cycle.value,
            # Aggregated amounts
            base_amount=grand_base,
            gst_percentage=first["gst_pct"],
            gst_amount=grand_gst,
            total_amount=grand_total,
            paid_amount=Decimal("0.00"),
            balance_amount=grand_total,
            line_items=None,
            line_items_total=grand_lit,
            discount_type=None,
            discount_value=None,
            discount_amount=grand_disc,
            discount_label=None,
            discount_scope="base",
            billing_period_start=min(c["bp_start"] for c in sub_computations),
            billing_period_end=max(c["bp_end"] for c in sub_computations),
            invoice_date=today,
            due_date=due,
            status=InvoiceStatus.UNPAID,
            remarks=payload.remarks,
            bank_name_snapshot=getattr(cs, "bank_name", None),
            account_name_snapshot=getattr(cs, "account_name", None),
            account_number_snapshot=getattr(cs, "account_number", None),
            ifsc_code_snapshot=getattr(cs, "ifsc_code", None),
            upi_id_snapshot=getattr(cs, "upi_id", None),
            gpay_number_snapshot=getattr(cs, "gpay_number", None),
        )
        invoice = self.repo.create(invoice)

        # Create per-subscription items
        for comp in sub_computations:
            sub = comp["sub"]
            item = InvoiceSubscriptionItem(
                invoice_id=invoice.id,
                subscription_id=sub.id,
                sort_order=comp["sort_order"],
                connection_name_snapshot=sub.connection_name or sub.subscription_code,
                installation_address_snapshot=sub.installation_address or self._build_installation_address(sub.customer),
                plan_code_snapshot=comp["plan"].plan_code,
                plan_name_snapshot=comp["plan"].name,
                speed_mbps_snapshot=sub.speed_mbps_snapshot,
                data_policy_snapshot=comp["plan"].data_policy.value,
                fup_limit_gb_snapshot=comp["plan"].fup_limit_gb,
                billing_cycle_snapshot=comp["pricing"].billing_cycle.value,
                billing_period_start=comp["bp_start"],
                billing_period_end=comp["bp_end"],
                base_amount=comp["base"],
                gst_percentage=comp["gst_pct"],
                gst_amount=comp["gst_amt"],
                total_amount=comp["total"],
                line_items=comp["line_items_data"] if comp["line_items_data"] else None,
                line_items_total=comp["lit"],
                discount_type=comp["disc_type"],
                discount_value=comp["disc_value"],
                discount_amount=comp["disc_amt"],
                discount_label=comp["disc_label"],
                discount_scope=comp["disc_scope"],
            )
            self.db.add(item)
        self.db.commit()

        # Generate PDF
        try:
            pdf_key = self._generate_and_store_pdf(invoice)
            invoice = self.repo.update(invoice, pdf_path=pdf_key)
        except Exception:
            pass

        self.repo.add_change_log(
            invoice.id, actor_id, ChangeType.CREATED,
            new_values={"invoice_number": inv_num, "invoice_type": "CONSOLIDATED"},
        )
        self.audit.log(
            ACTION_INVOICE_CREATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="invoice",
            entity_id=str(invoice.id),
            entity_name=invoice.invoice_number,
        )
        # Send invoice generated email (fire-and-forget)
        try:
            from app.services.notifications.notification_service import NotificationService, Recipient
            notif_svc = NotificationService(self.db)
            notif_svc.send(
                template_key="INVOICE_GENERATED",
                recipient=Recipient(
                    email=invoice.customer_email_snapshot,
                    mobile=invoice.customer_mobile_snapshot,
                ),
                variables={
                    "customer_name": invoice.customer_name_snapshot or customer.full_name,
                    "invoice_number": invoice.invoice_number,
                    "amount": f"{invoice.total_amount:,.2f}",
                    "due_date": str(invoice.due_date),
                },
                customer_id=customer.id,
            )
        except Exception:
            pass
        return self.repo.get(invoice.id)
