"""create plans and plan_pricing tables

Revision ID: 0007_plans
Revises: 0006_add_district
Create Date: 2026-06-16 09:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_plans"
down_revision: Union[str, None] = "0006_add_district"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enum types ────────────────────────────────────────────────────────
    data_policy = sa.Enum("UNLIMITED", "FUP", name="data_policy")
    billing_cycle = sa.Enum(
        "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY", name="billing_cycle"
    )
    data_policy.create(op.get_bind(), checkfirst=True)
    billing_cycle.create(op.get_bind(), checkfirst=True)

    # ── plans ─────────────────────────────────────────────────────────────
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("plan_code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("speed_mbps", sa.Integer, nullable=False),
        sa.Column(
            "data_policy",
            sa.Enum("UNLIMITED", "FUP", name="data_policy", create_type=False),
            nullable=False,
        ),
        sa.Column("fup_limit_gb", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("plan_code", name="uq_plans_plan_code"),
    )
    op.create_index("ix_plans_plan_code", "plans", ["plan_code"])

    # ── plan_pricing ──────────────────────────────────────────────────────
    op.create_table(
        "plan_pricing",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "billing_cycle",
            sa.Enum(
                "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY",
                name="billing_cycle", create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("base_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("gst_percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_plan_pricing_plan_id", "plan_pricing", ["plan_id"])
    # Partial unique index: unique per (plan_id, billing_cycle) among non-deleted rows
    op.execute(
        """
        CREATE UNIQUE INDEX uq_plan_active_billing_cycle
        ON plan_pricing (plan_id, billing_cycle)
        WHERE deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_plan_active_billing_cycle")
    op.drop_index("ix_plan_pricing_plan_id", table_name="plan_pricing")
    op.drop_table("plan_pricing")
    op.drop_index("ix_plans_plan_code", table_name="plans")
    op.drop_table("plans")
    sa.Enum(name="billing_cycle").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="data_policy").drop(op.get_bind(), checkfirst=True)
