"""Add consolidated invoice support.

Revision ID: 0014_consolidated_invoice
Revises: 0013_invoice_extra_snapshots
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0014_consolidated_invoice"
down_revision = "0013_invoice_extra_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── invoices: make subscription_id nullable ────────────────────────────
    op.alter_column(
        "invoices", "subscription_id",
        existing_type=UUID(),
        nullable=True,
    )

    # ── invoices: add invoice_type + customer_id ───────────────────────────
    op.add_column(
        "invoices",
        sa.Column("invoice_type", sa.String(20), nullable=False, server_default="SINGLE"),
    )
    op.add_column(
        "invoices",
        sa.Column("customer_id", UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_invoices_customer_id",
        "invoices", "customers",
        ["customer_id"], ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_invoices_customer_id", "invoices", ["customer_id"])

    # ── invoice_subscription_items ─────────────────────────────────────────
    op.create_table(
        "invoice_subscription_items",
        sa.Column("id", UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("invoice_id", UUID(), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subscription_id", UUID(), sa.ForeignKey("subscriptions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        # Subscription / connection snapshots
        sa.Column("connection_name_snapshot", sa.String(50), nullable=False),
        sa.Column("installation_address_snapshot", sa.Text, nullable=True),
        # Plan snapshots
        sa.Column("plan_code_snapshot", sa.String(20), nullable=False),
        sa.Column("plan_name_snapshot", sa.String(255), nullable=False),
        sa.Column("speed_mbps_snapshot", sa.Integer, nullable=False),
        sa.Column("data_policy_snapshot", sa.String(20), nullable=False),
        sa.Column("fup_limit_gb_snapshot", sa.Integer, nullable=True),
        sa.Column("billing_cycle_snapshot", sa.String(20), nullable=False),
        # Billing period
        sa.Column("billing_period_start", sa.Date, nullable=False),
        sa.Column("billing_period_end", sa.Date, nullable=False),
        # Amounts
        sa.Column("base_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("gst_percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("gst_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        # Line items
        sa.Column("line_items", JSONB, nullable=True),
        sa.Column("line_items_total", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        # Discount
        sa.Column("discount_type", sa.String(10), nullable=True),
        sa.Column("discount_value", sa.Numeric(10, 2), nullable=True),
        sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("discount_label", sa.String(100), nullable=True),
        sa.Column("discount_scope", sa.String(20), nullable=False, server_default="base"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("invoice_subscription_items")
    op.drop_index("ix_invoices_customer_id", "invoices")
    op.drop_constraint("fk_invoices_customer_id", "invoices", type_="foreignkey")
    op.drop_column("invoices", "customer_id")
    op.drop_column("invoices", "invoice_type")
    op.alter_column(
        "invoices", "subscription_id",
        existing_type=UUID(),
        nullable=False,
    )
