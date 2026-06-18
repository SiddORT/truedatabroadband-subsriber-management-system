"""partial unique index on users.email_hash (exclude soft-deleted rows)

Revision ID: 0024_partial_email_hash
Revises: 0023_sms_test_fields
Create Date: 2026-06-18
"""
from alembic import op

revision = "0024_partial_email_hash"
down_revision = "0023_sms_test_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the old full unique index
    op.drop_index("ix_users_email_hash", table_name="users")
    # Recreate as a partial unique index — soft-deleted rows are excluded
    op.execute(
        "CREATE UNIQUE INDEX ix_users_email_hash "
        "ON users (email_hash) "
        "WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_users_email_hash", table_name="users")
    op.execute(
        "CREATE UNIQUE INDEX ix_users_email_hash ON users (email_hash)"
    )
