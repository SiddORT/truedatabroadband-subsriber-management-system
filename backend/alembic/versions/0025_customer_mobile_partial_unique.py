"""Replace hard unique constraint on customers.mobile_number with a partial
unique index that only applies to non-deleted rows, so soft-deleted customer
records do not permanently lock their mobile number.

Revision ID: 0025_customer_mobile_partial_unique
Revises: 0024_partial_email_hash_index
Create Date: 2026-06-18
"""
from __future__ import annotations

from alembic import op

revision = "0025_mobile_partial_unique"
down_revision = "0024_partial_email_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the hard unique constraint (also drops the underlying index)
    op.drop_constraint("customers_mobile_number_key", "customers", type_="unique")

    # Partial unique index — only enforces uniqueness among non-deleted rows
    op.execute(
        """
        CREATE UNIQUE INDEX customers_mobile_number_active_unique
        ON customers (mobile_number)
        WHERE deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS customers_mobile_number_active_unique")
    op.create_unique_constraint(
        "customers_mobile_number_key", "customers", ["mobile_number"]
    )
