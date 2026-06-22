"""email_hash unique per role (allow same email across STAFF and CLIENT)

Revision ID: 0029_email_hash_unique_per_role
Revises: 0028_staff_users_columns
Create Date: 2026-06-22
"""

from __future__ import annotations

from alembic import op

revision = "0029_email_hash_unique_per_role"
down_revision = "0028_staff_users_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS ix_users_email_hash"
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_users_email_hash_role
        ON users (email_hash, role)
        WHERE deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_users_email_hash_role")
    op.execute(
        """
        CREATE UNIQUE INDEX ix_users_email_hash
        ON users (email_hash)
        WHERE deleted_at IS NULL
        """
    )
