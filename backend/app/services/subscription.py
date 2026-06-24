import calendar
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.audit_log import (
    ACTION_SUBSCRIPTION_CREATED,
    ACTION_SUBSCRIPTION_DELETED,
    ACTION_SUBSCRIPTION_PLAN_CHANGED,
    ACTION_SUBSCRIPTION_RENEWED,
    ACTION_SUBSCRIPTION_STATUS_CHANGED,
)
from app.models.customer import Customer, CustomerStatus
from app.models.plan import Plan, PlanPricing
from app.models.subscription import Subscription, SubscriptionStatus
from app.repositories.audit_log import AuditLogRepository
from app.repositories.subscription import SubscriptionRepository
from app.schemas.subscription import SubscriptionChangePlan, SubscriptionCreate


# Billing cycle → months mapping
_CYCLE_MONTHS: dict[str, int] = {
    "MONTHLY": 1,
    "QUARTERLY": 3,
    "HALF_YEARLY": 6,
    "ANNUALLY": 12,
}


def _add_months(d: date, months: int) -> date:
    """Add N months to a date, clamping the day at month-end if needed."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _compute_expiry(start_date: date, billing_cycle: str) -> date:
    months = _CYCLE_MONTHS.get(billing_cycle, 1)
    return _add_months(start_date, months)


# ---------------------------------------------------------------------------
# Exception
# ---------------------------------------------------------------------------


class SubscriptionError(Exception):
    """Business-rule violation in the subscription domain."""


class DuplicateAddressWarning(Exception):
    """Soft warning: an active subscription already exists at this address."""

    def __init__(self, existing_code: str) -> None:
        self.existing_code = existing_code
        super().__init__(
            f"An active subscription already exists at this address ({existing_code})"
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class SubscriptionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.subs = SubscriptionRepository(db)
        self.audit = AuditLogRepository(db)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_customer_or_raise(self, customer_id: uuid.UUID) -> Customer:
        customer = self.db.get(Customer, customer_id)
        if customer is None or customer.deleted_at is not None:
            raise SubscriptionError("Customer not found")
        return customer

    def _get_pricing_or_raise(self, plan_pricing_id: uuid.UUID) -> PlanPricing:
        pricing = self.db.get(PlanPricing, plan_pricing_id)
        if pricing is None or pricing.deleted_at is not None:
            raise SubscriptionError("Plan pricing not found")
        if not pricing.is_active:
            raise SubscriptionError("Plan pricing must be ACTIVE")
        return pricing

    def _get_plan_or_raise(self, plan_id: uuid.UUID) -> Plan:
        plan = self.db.get(Plan, plan_id)
        if plan is None or plan.deleted_at is not None:
            raise SubscriptionError("Plan not found")
        if not plan.is_active:
            raise SubscriptionError("Plan must be ACTIVE")
        return plan

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create(
        self,
        payload: SubscriptionCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
        force: bool = False,
    ) -> Subscription:
        customer = self._get_customer_or_raise(payload.customer_id)

        # Resolve installation address — fall back to customer's primary address
        installation_address = (
            payload.installation_address.strip()
            if payload.installation_address and payload.installation_address.strip()
            else customer.installation_address or ""
        )

        # Soft duplicate-address check (bypass with force=True)
        if not force and installation_address:
            existing = self.subs.find_active_at_address(
                payload.customer_id, installation_address
            )
            if existing:
                raise DuplicateAddressWarning(existing.subscription_code)

        pricing = self._get_pricing_or_raise(payload.plan_pricing_id)
        plan = self._get_plan_or_raise(pricing.plan_id)

        expiry = _compute_expiry(payload.start_date, pricing.billing_cycle.value)
        code = self.subs.generate_next_code()

        sub = Subscription(
            subscription_code=code,
            customer_id=customer.id,
            plan_id=plan.id,
            plan_pricing_id=pricing.id,
            plan_name_snapshot=plan.name,
            plan_code_snapshot=plan.plan_code,
            speed_mbps_snapshot=plan.speed_mbps,
            billing_cycle_snapshot=pricing.billing_cycle.value,
            base_price_snapshot=pricing.base_price,
            gst_percentage_snapshot=pricing.gst_percentage,
            total_price_snapshot=pricing.total_price,
            start_date=payload.start_date,
            renewal_date=expiry,
            expiry_date=expiry,
            status=SubscriptionStatus.ACTIVE,
            connection_name=payload.connection_name.strip() if payload.connection_name else None,
            installation_address=installation_address or None,
            remarks=payload.remarks,
        )
        self.db.add(sub)

        # Re-activate customer if they were suspended/disconnected
        if customer.status != CustomerStatus.ACTIVE:
            customer.status = CustomerStatus.ACTIVE

        self.db.commit()
        self.db.refresh(sub)
        self.audit.log(
            ACTION_SUBSCRIPTION_CREATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="subscription",
            entity_id=str(sub.id),
            entity_name=sub.subscription_code,
        )
        return sub

    # ------------------------------------------------------------------
    # Renew
    # ------------------------------------------------------------------

    def renew(
        self,
        sub: Subscription,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Subscription:
        if sub.status != SubscriptionStatus.ACTIVE:
            raise SubscriptionError("Only ACTIVE subscriptions can be renewed")

        # New subscription starts the day the old one expires
        new_start = sub.renewal_date
        new_expiry = _compute_expiry(new_start, sub.billing_cycle_snapshot)
        new_code = self.subs.generate_next_code()

        new_sub = Subscription(
            subscription_code=new_code,
            customer_id=sub.customer_id,
            plan_id=sub.plan_id,
            plan_pricing_id=sub.plan_pricing_id,
            plan_name_snapshot=sub.plan_name_snapshot,
            plan_code_snapshot=sub.plan_code_snapshot,
            speed_mbps_snapshot=sub.speed_mbps_snapshot,
            billing_cycle_snapshot=sub.billing_cycle_snapshot,
            base_price_snapshot=sub.base_price_snapshot,
            gst_percentage_snapshot=sub.gst_percentage_snapshot,
            total_price_snapshot=sub.total_price_snapshot,
            start_date=new_start,
            renewal_date=new_expiry,
            expiry_date=new_expiry,
            status=SubscriptionStatus.ACTIVE,
            connection_name=sub.connection_name,
            installation_address=sub.installation_address,
            remarks=sub.remarks,
        )
        self.db.add(new_sub)

        # Mark the old subscription as expired
        sub.status = SubscriptionStatus.EXPIRED
        self.db.commit()
        self.db.refresh(new_sub)

        self.audit.log(
            ACTION_SUBSCRIPTION_RENEWED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="subscription",
            entity_id=str(new_sub.id),
            entity_name=new_sub.subscription_code,
            remarks=f"Renewed from {sub.subscription_code}",
        )
        return new_sub

    # ------------------------------------------------------------------
    # Status change
    # ------------------------------------------------------------------

    def set_status(
        self,
        sub: Subscription,
        new_status: SubscriptionStatus,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Subscription:
        sub.status = new_status
        self.db.commit()
        self.db.refresh(sub)
        self.audit.log(
            ACTION_SUBSCRIPTION_STATUS_CHANGED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="subscription",
            entity_id=str(sub.id),
            entity_name=sub.subscription_code,
        )
        return sub

    # ------------------------------------------------------------------
    # Plan change (cancel current + create new)
    # ------------------------------------------------------------------

    def change_plan(
        self,
        sub: Subscription,
        payload: SubscriptionChangePlan,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Subscription:
        # Carry forward connection details from the old subscription
        carried_connection_name = sub.connection_name
        carried_installation_address = sub.installation_address

        # End current subscription
        sub.status = SubscriptionStatus.CANCELLED
        self.db.commit()

        pricing = self._get_pricing_or_raise(payload.plan_pricing_id)
        plan = self._get_plan_or_raise(pricing.plan_id)

        expiry = _compute_expiry(payload.start_date, pricing.billing_cycle.value)
        code = self.subs.generate_next_code()

        new_sub = Subscription(
            subscription_code=code,
            customer_id=sub.customer_id,
            plan_id=plan.id,
            plan_pricing_id=pricing.id,
            plan_name_snapshot=plan.name,
            plan_code_snapshot=plan.plan_code,
            speed_mbps_snapshot=plan.speed_mbps,
            billing_cycle_snapshot=pricing.billing_cycle.value,
            base_price_snapshot=pricing.base_price,
            gst_percentage_snapshot=pricing.gst_percentage,
            total_price_snapshot=pricing.total_price,
            start_date=payload.start_date,
            renewal_date=expiry,
            expiry_date=expiry,
            status=SubscriptionStatus.ACTIVE,
            connection_name=carried_connection_name,
            installation_address=carried_installation_address,
            remarks=payload.remarks,
        )
        self.db.add(new_sub)
        self.db.commit()
        self.db.refresh(new_sub)
        self.audit.log(
            ACTION_SUBSCRIPTION_PLAN_CHANGED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="subscription",
            entity_id=str(new_sub.id),
            entity_name=new_sub.subscription_code,
        )
        return new_sub

    # ------------------------------------------------------------------
    # Update remarks
    # ------------------------------------------------------------------

    def update(
        self,
        sub: Subscription,
        *,
        connection_name: str | None = None,
        installation_address: str | None = None,
        remarks: str | None = None,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Subscription:
        sub.connection_name = connection_name
        sub.installation_address = installation_address
        sub.remarks = remarks
        self.db.commit()
        self.db.refresh(sub)
        return sub

    def delete(
        self,
        sub: Subscription,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        self.subs.soft_delete(sub)
        self.db.commit()
        self.audit.log(
            ACTION_SUBSCRIPTION_DELETED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            entity_type="subscription",
            entity_id=str(sub.id),
            entity_name=sub.subscription_code,
        )
