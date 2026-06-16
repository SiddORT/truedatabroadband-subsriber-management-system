"""Add extra snapshot fields to invoices + bank fields to company_settings.

Revision ID: 0013_invoice_extra_snapshots
Revises: 0012_invoice_discount_scope
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_invoice_extra_snapshots"
down_revision = "0012_invoice_discount_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Invoice: missing customer + bank snapshots ──────────────────────────
    op.add_column("invoices", sa.Column("customer_email_snapshot",  sa.String(255), nullable=True))
    op.add_column("invoices", sa.Column("customer_mobile_snapshot", sa.String(20),  nullable=True))
    op.add_column("invoices", sa.Column("bank_name_snapshot",       sa.String(100), nullable=True))
    op.add_column("invoices", sa.Column("account_name_snapshot",    sa.String(100), nullable=True))
    op.add_column("invoices", sa.Column("account_number_snapshot",  sa.String(50),  nullable=True))
    op.add_column("invoices", sa.Column("ifsc_code_snapshot",       sa.String(20),  nullable=True))
    op.add_column("invoices", sa.Column("upi_id_snapshot",          sa.String(100), nullable=True))

    # ── CompanySettings: bank / UPI payment details ─────────────────────────
    op.add_column("company_settings", sa.Column("bank_name",       sa.String(100), nullable=True))
    op.add_column("company_settings", sa.Column("account_name",    sa.String(100), nullable=True))
    op.add_column("company_settings", sa.Column("account_number",  sa.String(50),  nullable=True))
    op.add_column("company_settings", sa.Column("ifsc_code",       sa.String(20),  nullable=True))
    op.add_column("company_settings", sa.Column("upi_id",          sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "customer_email_snapshot")
    op.drop_column("invoices", "customer_mobile_snapshot")
    op.drop_column("invoices", "bank_name_snapshot")
    op.drop_column("invoices", "account_name_snapshot")
    op.drop_column("invoices", "account_number_snapshot")
    op.drop_column("invoices", "ifsc_code_snapshot")
    op.drop_column("invoices", "upi_id_snapshot")
    op.drop_column("company_settings", "bank_name")
    op.drop_column("company_settings", "account_name")
    op.drop_column("company_settings", "account_number")
    op.drop_column("company_settings", "ifsc_code")
    op.drop_column("company_settings", "upi_id")
