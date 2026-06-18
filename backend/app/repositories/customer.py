import uuid

from sqlalchemy import func, or_, select

from app.models.customer import Customer, CustomerStatus, CustomerType
from app.repositories.base import BaseRepository


class CustomerRepository(BaseRepository[Customer]):
    def __init__(self, db):
        super().__init__(Customer, db)

    # ------------------------------------------------------------------
    # Lookups
    # ------------------------------------------------------------------

    def get(self, customer_id: uuid.UUID) -> Customer | None:
        stmt = (
            select(Customer)
            .where(Customer.id == customer_id)
            .where(Customer.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def get_by_user_id(self, user_id: uuid.UUID) -> Customer | None:
        stmt = (
            select(Customer)
            .where(Customer.user_id == user_id)
            .where(Customer.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def get_by_email(self, email: str) -> Customer | None:
        stmt = (
            select(Customer)
            .where(Customer.email == email.lower().strip())
            .where(Customer.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    def get_by_mobile(self, mobile: str) -> Customer | None:
        stmt = (
            select(Customer)
            .where(Customer.mobile_number == mobile)
            .where(Customer.deleted_at.is_(None))
        )
        return self.db.scalars(stmt).first()

    # ------------------------------------------------------------------
    # Code generation
    # ------------------------------------------------------------------

    def generate_next_code(self) -> str:
        """
        Return the next customer code in the format ``TDB-CUST-00001``.

        Filters to numeric-only codes to avoid lexicographic max collision
        with non-standard test codes.
        """
        rows = self.db.execute(
            select(Customer.customer_code)
            .where(Customer.customer_code.regexp_match(r"^TDB-CUST-\d+$"))
        ).scalars().all()
        nums = []
        for code in rows:
            try:
                nums.append(int(code.split("-")[-1]))
            except (ValueError, IndexError):
                pass
        n = (max(nums) if nums else 0) + 1
        return f"TDB-CUST-{n:05d}"

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
        status_filter: CustomerStatus | None = None,
        customer_type_filter: CustomerType | None = None,
        city_filter: str | None = None,
        reference_source_filter: str | None = None,
        sales_person_filter: str | None = None,
    ) -> tuple[list[Customer], int]:
        stmt = select(Customer).where(Customer.deleted_at.is_(None))

        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Customer.customer_code.ilike(term),
                    Customer.full_name.ilike(term),
                    Customer.mobile_number.ilike(term),
                    Customer.email.ilike(term),
                )
            )

        if status_filter is not None:
            stmt = stmt.where(Customer.status == status_filter)

        if customer_type_filter is not None:
            stmt = stmt.where(Customer.customer_type == customer_type_filter)

        if city_filter:
            stmt = stmt.where(Customer.city.ilike(f"%{city_filter}%"))

        if reference_source_filter:
            stmt = stmt.where(Customer.reference_source.ilike(f"%{reference_source_filter}%"))

        if sales_person_filter:
            stmt = stmt.where(Customer.sales_person.ilike(f"%{sales_person_filter}%"))

        _sort_map = {
            "customer_code": Customer.customer_code,
            "full_name": Customer.full_name,
            "status": Customer.status,
            "created_at": Customer.created_at,
        }
        sort_col = _sort_map.get(sort_by, Customer.created_at)
        stmt = stmt.order_by(
            sort_col.desc() if sort_order == "desc" else sort_col.asc()
        )

        total: int = self.db.scalar(
            select(func.count()).select_from(stmt.subquery())
        ) or 0

        items = list(
            self.db.scalars(
                stmt.offset((page - 1) * page_size).limit(page_size)
            ).all()
        )
        return items, total
