"""Add EDITED value to invoice_change_type enum.

Revision ID: 0016_inv_change_edited
Revises: 0015_sub_conn_fields
Create Date: 2026-06-17
"""

from alembic import op

revision = "0016_inv_change_edited"
down_revision = "0015_sub_conn_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_enum
                WHERE enumtypid = 'invoice_change_type'::regtype
                  AND enumlabel = 'EDITED'
            ) THEN
                ALTER TYPE invoice_change_type ADD VALUE 'EDITED';
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    pass
