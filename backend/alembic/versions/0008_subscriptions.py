"""create subscriptions table

Revision ID: 0008_subscriptions
Revises: 0007_plans
Create Date: 2026-06-16 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0008_subscriptions"
down_revision: Union[str, None] = "0007_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

subscription_status_enum = PgEnum(
    "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED",
    name="subscription_status",
    create_type=False,
)


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(sa.text(
        "DO $$ BEGIN "
        "  CREATE TYPE subscription_status AS ENUM "
        "  ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$;"
    ))

    op.create_table(
        "subscriptions",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_code", sa.String(20), nullable=False),
        sa.Column(
            "customer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "plan_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "plan_pricing_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_pricing.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("plan_name_snapshot", sa.String(255), nullable=False),
        sa.Column("plan_code_snapshot", sa.String(20), nullable=False),
        sa.Column("speed_mbps_snapshot", sa.Integer, nullable=False),
        sa.Column("billing_cycle_snapshot", sa.String(20), nullable=False),
        sa.Column("base_price_snapshot", sa.Numeric(10, 2), nullable=False),
        sa.Column("gst_percentage_snapshot", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_price_snapshot", sa.Numeric(10, 2), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("renewal_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=False),
        sa.Column(
            "status",
            subscription_status_enum,
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column("remarks", sa.Text, nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subscription_code", name="uq_subscriptions_code"),
    )
    op.create_index(
        "ix_subscriptions_subscription_code",
        "subscriptions",
        ["subscription_code"],
    )
    op.create_index(
        "ix_subscriptions_customer_id",
        "subscriptions",
        ["customer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_subscriptions_customer_id", table_name="subscriptions")
    op.drop_index(
        "ix_subscriptions_subscription_code", table_name="subscriptions"
    )
    op.drop_table("subscriptions")
    op.execute("DROP TYPE IF EXISTS subscription_status")
