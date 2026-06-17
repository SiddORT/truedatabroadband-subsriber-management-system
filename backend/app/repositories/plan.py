import uuid

from sqlalchemy import func, or_, select

from app.models.plan import BillingCycle, Plan, PlanPricing
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
    ) -> tuple[list[Plan], int]:
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

        _sort_map = {
            "plan_code": Plan.plan_code,
            "name": Plan.name,
            "speed_mbps": Plan.speed_mbps,
            "created_at": Plan.created_at,
        }
        sort_col = _sort_map.get(sort_by, Plan.created_at)
        stmt = stmt.order_by(
            sort_col.desc() if sort_order == "desc" else sort_col.asc()
        )

        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
        )
        return items, total
