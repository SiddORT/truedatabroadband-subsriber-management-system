import uuid

from sqlalchemy import func, or_, select

from app.models.plan import BillingCycle, DataPolicy, Plan, PlanPricing
from app.repositories.base import BaseRepository


class PlanRepository(BaseRepository[Plan]):
    def __init__(self, db):
        super().__init__(Plan, db)

    # ------------------------------------------------------------------
    # Code generation
    # ------------------------------------------------------------------

    def generate_next_code(self) -> str:
        """Return next plan code in the format ``TDB-PLAN-00001``.

        Filters to numeric-only codes to avoid lexicographic max collision.
        """
        rows = self.db.execute(
            select(Plan.plan_code)
            .where(Plan.plan_code.regexp_match(r"^TDB-PLAN-\d+$"))
        ).scalars().all()
        nums = []
        for code in rows:
            try:
                nums.append(int(code.split("-")[-1]))
            except (ValueError, IndexError):
                pass
        n = (max(nums) if nums else 0) + 1
        return f"TDB-PLAN-{n:05d}"

    # ------------------------------------------------------------------
    # Pricing lookups
    # ------------------------------------------------------------------

    def get_pricing(
        self, plan_id: uuid.UUID, pricing_id: uuid.UUID
    ) -> PlanPricing | None:
        stmt = (
            select(PlanPricing)
            .where(PlanPricing.id == pricing_id)
            .where(PlanPricing.plan_id == plan_id)
            .where(PlanPricing.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def get_pricing_by_cycle(
        self, plan_id: uuid.UUID, billing_cycle: BillingCycle
    ) -> PlanPricing | None:
        stmt = (
            select(PlanPricing)
            .where(PlanPricing.plan_id == plan_id)
            .where(PlanPricing.billing_cycle == billing_cycle)
            .where(PlanPricing.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    # ------------------------------------------------------------------
    # Active subscription count helpers
    # ------------------------------------------------------------------

    def get_active_subscription_counts(self, plan_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """Return {plan_id: active_subscription_count} for the given plan IDs."""
        if not plan_ids:
            return {}
        from app.models.subscription import Subscription, SubscriptionStatus
        rows = self.db.execute(
            select(Subscription.plan_id, func.count(Subscription.id))
            .where(Subscription.plan_id.in_(plan_ids))
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
            .where(Subscription.deleted_at.is_(None))
            .group_by(Subscription.plan_id)
        ).all()
        return {row[0]: row[1] for row in rows}

    # ------------------------------------------------------------------
    # Paginated list
    # ------------------------------------------------------------------

    def list_paginated(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        search: str = "",
        sort_by: str = "created_at",
        sort_order: str = "desc",
        data_policy: DataPolicy | None = None,
        speed_min: int | None = None,
        speed_max: int | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[Plan], int]:
        from app.models.subscription import Subscription, SubscriptionStatus

        stmt = select(Plan).where(Plan.deleted_at.is_(None))

        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Plan.plan_code.ilike(term),
                    Plan.name.ilike(term),
                    Plan.description.ilike(term),
                )
            )

        if data_policy is not None:
            stmt = stmt.where(Plan.data_policy == data_policy)

        if speed_min is not None:
            stmt = stmt.where(Plan.speed_mbps >= speed_min)

        if speed_max is not None:
            stmt = stmt.where(Plan.speed_mbps <= speed_max)

        if is_active is not None:
            stmt = stmt.where(Plan.is_active == is_active)

        if sort_by == "active_subscription_count":
            active_count_sq = (
                select(func.count(Subscription.id))
                .where(Subscription.plan_id == Plan.id)
                .where(Subscription.status == SubscriptionStatus.ACTIVE)
                .where(Subscription.deleted_at.is_(None))
                .correlate(Plan)
                .scalar_subquery()
            )
            order_col = active_count_sq
        elif sort_by == "total_price":
            total_price_sq = (
                select(func.min(PlanPricing.total_price))
                .where(PlanPricing.plan_id == Plan.id)
                .where(PlanPricing.is_active == True)  # noqa: E712
                .where(PlanPricing.deleted_at.is_(None))
                .correlate(Plan)
                .scalar_subquery()
            )
            order_col = total_price_sq
        else:
            _sort_map = {
                "plan_code": Plan.plan_code,
                "name": Plan.name,
                "speed_mbps": Plan.speed_mbps,
                "created_at": Plan.created_at,
            }
            order_col = _sort_map.get(sort_by, Plan.created_at)

        stmt = stmt.order_by(
            order_col.desc() if sort_order == "desc" else order_col.asc()
        )

        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        )
        return items, total
