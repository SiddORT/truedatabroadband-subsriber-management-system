"""Add STAFF role, staff user fields, and customer FK columns.

Revision ID: 0028_staff_users_columns
Revises: 0027_roles_table
Create Date: 2026-06-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0028_staff_users_columns"
down_revision = "0027_roles_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add STAFF value to user_role enum
    op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STAFF'"))

    # Add staff fields to users table
    op.add_column("users", sa.Column("display_name", sa.String(100), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "role_id",
            UUID(as_uuid=True),
            sa.ForeignKey("roles.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    op.add_column("users", sa.Column("invite_token", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("invite_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Add staff FK columns to customers table
    op.add_column(
        "customers",
        sa.Column(
            "assigned_staff_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    op.add_column(
        "customers",
        sa.Column(
            "reference_partner_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("customers", "reference_partner_id")
    op.drop_column("customers", "assigned_staff_id")
    op.drop_column("users", "invite_accepted_at")
    op.drop_column("users", "invite_token_expires_at")
    op.drop_column("users", "invite_token")
    op.drop_column("users", "role_id")
    op.drop_column("users", "display_name")
