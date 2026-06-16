"""Add custom line items and discount fields to invoices.

Revision ID: 0011_invoice_line_items_discount
Revises: 0010_invoices_payments
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_invoice_line_items_discount"
down_revision = "0010_invoices_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("line_items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column(
            "line_items_total",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default="0.00",
        ),
    )
    op.add_column(
        "invoices",
        sa.Column("discount_type", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("discount_value", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column(
            "discount_amount",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default="0.00",
        ),
    )
    op.add_column(
        "invoices",
        sa.Column("discount_label", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invoices", "discount_label")
    op.drop_column("invoices", "discount_amount")
    op.drop_column("invoices", "discount_value")
    op.drop_column("invoices", "discount_type")
    op.drop_column("invoices", "line_items_total")
    op.drop_column("invoices", "line_items")
