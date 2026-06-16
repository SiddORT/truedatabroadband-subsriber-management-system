"""Add discount_scope to invoices.

Revision ID: 0012_invoice_discount_scope
Revises: 0011_invoice_line_items_discount
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_invoice_discount_scope"
down_revision = "0011_invoice_line_items_discount"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column(
            "discount_scope",
            sa.String(length=20),
            nullable=False,
            server_default="base",
        ),
    )


def downgrade() -> None:
    op.drop_column("invoices", "discount_scope")
