"""add gpay_number to company_settings and invoices

Revision ID: 0031_bank_gpay_fields
Revises: 0030_kyc_documents
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0031_bank_gpay_fields"
down_revision = "0030_kyc_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_settings",
        sa.Column("gpay_number", sa.String(50), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("gpay_number_snapshot", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("company_settings", "gpay_number")
    op.drop_column("invoices", "gpay_number_snapshot")
