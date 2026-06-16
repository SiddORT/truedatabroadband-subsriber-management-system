import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.audit_log import (
    ACTION_PLAN_CREATED,
    ACTION_PLAN_UPDATED,
    ACTION_PRICING_CREATED,
    ACTION_PRICING_DELETED,
    ACTION_PRICING_UPDATED,
)
from app.models.plan import Plan, PlanPricing
from app.repositories.audit_log import AuditLogRepository
from app.repositories.plan import PlanRepository
from app.schemas.plan import PlanCreate, PlanUpdate, PricingCreate, PricingUpdate

_HUNDRED = Decimal("100")
_CENT = Decimal("0.01")


def _compute_total(base: Decimal, gst_pct: Decimal) -> Decimal:
    return (base + base * gst_pct / _HUNDRED).quantize(_CENT)


# ---------------------------------------------------------------------------
# Exception
# ---------------------------------------------------------------------------


class PlanError(Exception):
    """Business-rule violation in the plan domain."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PlanService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.plans = PlanRepository(db)
        self.audit = AuditLogRepository(db)

    # ------------------------------------------------------------------
    # Plan CRUD
    # ------------------------------------------------------------------

    def create(
        self,
        payload: PlanCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Plan:
        code = self.plans.generate_next_code()
        plan = Plan(
            plan_code=code,
            name=payload.name,
            description=payload.description,
            speed_mbps=payload.speed_mbps,
            data_policy=payload.data_policy,
            fup_limit_gb=payload.fup_limit_gb,
            is_active=payload.is_active,
        )
        self.db.add(plan)
        self.db.flush()

        for p in payload.pricing:
            self.db.add(
                PlanPricing(
                    plan_id=plan.id,
                    billing_cycle=p.billing_cycle,
                    base_price=p.base_price,
                    gst_percentage=p.gst_percentage,
                    total_price=_compute_total(p.base_price, p.gst_percentage),
                    is_active=p.is_active,
                )
            )

        self.db.commit()
        self.db.refresh(plan)
        self.audit.log(
            ACTION_PLAN_CREATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return plan

    def update(
        self,
        plan: Plan,
        payload: PlanUpdate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Plan:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(plan, field, value)
        self.db.commit()
        self.db.refresh(plan)
        self.audit.log(
            ACTION_PLAN_UPDATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return plan

    def set_status(
        self,
        plan: Plan,
        is_active: bool,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Plan:
        plan.is_active = is_active
        self.db.commit()
        self.db.refresh(plan)
        self.audit.log(
            ACTION_PLAN_UPDATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return plan

    # ------------------------------------------------------------------
    # Pricing CRUD
    # ------------------------------------------------------------------

    def add_pricing(
        self,
        plan: Plan,
        payload: PricingCreate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> PlanPricing:
        existing = self.plans.get_pricing_by_cycle(plan.id, payload.billing_cycle)
        if existing:
            raise PlanError(
                f"A pricing row for '{payload.billing_cycle}' already exists on this plan"
            )

        pricing = PlanPricing(
            plan_id=plan.id,
            billing_cycle=payload.billing_cycle,
            base_price=payload.base_price,
            gst_percentage=payload.gst_percentage,
            total_price=_compute_total(payload.base_price, payload.gst_percentage),
            is_active=payload.is_active,
        )
        self.db.add(pricing)
        self.db.commit()
        self.db.refresh(pricing)
        self.audit.log(
            ACTION_PRICING_CREATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return pricing

    def update_pricing(
        self,
        pricing: PlanPricing,
        payload: PricingUpdate,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> PlanPricing:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(pricing, field, value)
        # Always recompute stored total after any base/gst change
        pricing.total_price = _compute_total(pricing.base_price, pricing.gst_percentage)
        self.db.commit()
        self.db.refresh(pricing)
        self.audit.log(
            ACTION_PRICING_UPDATED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return pricing

    def delete_pricing(
        self,
        pricing: PlanPricing,
        *,
        actor_id: uuid.UUID,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        pricing.deleted_at = datetime.now(timezone.utc)
        self.db.commit()
        self.audit.log(
            ACTION_PRICING_DELETED,
            user_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
