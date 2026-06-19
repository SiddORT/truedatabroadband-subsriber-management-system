"""Add org/GST customer snapshots to invoices table.

Revision ID: 0026_invoice_org_gst
Revises: 0025_mobile_partial_unique
Create Date: 2026-06-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0026_invoice_org_gst"
down_revision = "0025_mobile_partial_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("customer_type_snapshot", sa.String(20), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("customer_company_snapshot", sa.Text(), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("customer_gst_snapshot", sa.String(15), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invoices", "customer_gst_snapshot")
    op.drop_column("invoices", "customer_company_snapshot")
    op.drop_column("invoices", "customer_type_snapshot")
