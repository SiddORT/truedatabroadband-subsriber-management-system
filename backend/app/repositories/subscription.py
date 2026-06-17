import uuid
from datetime import date, timedelta

from sqlalchemy import func, or_, select

from app.models.customer import Customer
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionStatus
from app.repositories.base import BaseRepository


class SubscriptionRepository(BaseRepository[Subscription]):
    def __init__(self, db):
        super().__init__(Subscription, db)

    def generate_next_code(self) -> str:
        """Return next subscription code in the format ``TDB-SUB-00001``.

        Reads the highest *numeric* code so deleted/test codes never collide.
        """
        rows = self.db.execute(
            select(Subscription.subscription_code)
            .where(Subscription.subscription_code.regexp_match(r"^TDB-SUB-\d+$"))
        ).scalars().all()
        nums = []
        for code in rows:
            try:
                nums.append(int(code.split("-")[-1]))
            except (ValueError, IndexError):
                pass
        n = (max(nums) if nums else 0) + 1
        return f"TDB-SUB-{n:05d}"

    def get_active_by_customer(self, customer_id: uuid.UUID) -> Subscription | None:
        """Return the first ACTIVE subscription for a customer, if any."""
        stmt = (
            select(Subscription)
            .where(Subscription.customer_id == customer_id)
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
            .where(Subscription.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def find_active_at_address(
        self, customer_id: uuid.UUID, installation_address: str
    ) -> Subscription | None:
        """Return an ACTIVE subscription for this customer at the same address (case-insensitive)."""
        normalised = installation_address.strip().lower()
        stmt = (
            select(Subscription)
            .where(Subscription.customer_id == customer_id)
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
            .where(Subscription.deleted_at.is_(None))
        )
        for sub in self.db.scalars(stmt).all():
            if sub.installation_address and sub.installation_address.strip().lower() == normalised:
                return sub
        return None

    def get_by_customer_user(self, user_id: uuid.UUID) -> Subscription | None:
        """Return the ACTIVE subscription for the customer linked to a user."""
        stmt = (
            select(Subscription)
            .join(Customer, Subscription.customer_id == Customer.id)
            .where(Customer.user_id == user_id)
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
            .where(Subscription.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def list_by_customer(self, customer_id: uuid.UUID) -> list[Subscription]:
        """All non-deleted subscriptions for a given customer, newest first."""
        stmt = (
            select(Subscription)
            .where(Subscription.customer_id == customer_id)
            .where(Subscription.deleted_at.is_(None))
            .order_by(Subscription.created_at.desc())
        )
        return list(self.db.scalars(stmt).all())

    def list_by_expiry_date(self, expiry_date: "date") -> list[Subscription]:
        """ACTIVE subscriptions whose expiry_date matches the given date (used by scheduler)."""
        from datetime import date as _date
        stmt = (
            select(Subscription)
            .where(Subscription.expiry_date == expiry_date)
            .where(Subscription.deleted_at.is_(None))
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
        )
        return list(self.db.scalars(stmt).all())

    def list_paginated(
        self,
        *,
        page: int = 1,
        page_size: int = 10,
        search: str = "",
        sort_by: str = "expiry_date",
        sort_order: str = "asc",
        status_filter: str | None = None,
        plan_id: uuid.UUID | None = None,
        start_date_from: date | None = None,
        start_date_to: date | None = None,
        expiry_date_from: date | None = None,
        expiry_date_to: date | None = None,
        quick_filter: str | None = None,
    ) -> tuple[list[Subscription], int]:
        stmt = (
            select(Subscription)
            .join(Customer, Subscription.customer_id == Customer.id)
            .where(Subscription.deleted_at.is_(None))
        )

        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Subscription.subscription_code.ilike(term),
                    Customer.customer_code.ilike(term),
                    Customer.full_name.ilike(term),
                    Subscription.plan_name_snapshot.ilike(term),
                )
            )

        if status_filter:
            try:
                s = SubscriptionStatus(status_filter)
                stmt = stmt.where(Subscription.status == s)
            except ValueError:
                pass

        if plan_id is not None:
            stmt = stmt.where(Subscription.plan_id == plan_id)

        if start_date_from is not None:
            stmt = stmt.where(Subscription.start_date >= start_date_from)
        if start_date_to is not None:
            stmt = stmt.where(Subscription.start_date <= start_date_to)

        if expiry_date_from is not None:
            stmt = stmt.where(Subscription.expiry_date >= expiry_date_from)
        if expiry_date_to is not None:
            stmt = stmt.where(Subscription.expiry_date <= expiry_date_to)

        if quick_filter:
            today = date.today()
            if quick_filter == "expiring_7":
                stmt = stmt.where(Subscription.expiry_date >= today)
                stmt = stmt.where(Subscription.expiry_date <= today + timedelta(days=7))
                stmt = stmt.where(Subscription.status == SubscriptionStatus.ACTIVE)
            elif quick_filter == "expiring_15":
                stmt = stmt.where(Subscription.expiry_date >= today)
                stmt = stmt.where(Subscription.expiry_date <= today + timedelta(days=15))
                stmt = stmt.where(Subscription.status == SubscriptionStatus.ACTIVE)
            elif quick_filter == "expiring_30":
                stmt = stmt.where(Subscription.expiry_date >= today)
                stmt = stmt.where(Subscription.expiry_date <= today + timedelta(days=30))
                stmt = stmt.where(Subscription.status == SubscriptionStatus.ACTIVE)
            elif quick_filter == "expired":
                stmt = stmt.where(Subscription.status == SubscriptionStatus.EXPIRED)

        _sort_map = {
            "subscription_code": Subscription.subscription_code,
            "customer_name": Customer.full_name,
            "renewal_date": Subscription.renewal_date,
            "expiry_date": Subscription.expiry_date,
            "start_date": Subscription.start_date,
            "status": Subscription.status,
            "created_at": Subscription.created_at,
        }
        sort_col = _sort_map.get(sort_by, Subscription.expiry_date)
        stmt = stmt.order_by(
            sort_col.desc() if sort_order == "desc" else sort_col.asc()
        )

        total: int = (
            self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        )
        items = list(
            self.db.scalars(
                stmt.offset((page - 1) * page_size).limit(page_size)
            ).all()
        )
        return items, total
