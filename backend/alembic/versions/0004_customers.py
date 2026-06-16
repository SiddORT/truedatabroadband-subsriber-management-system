"""add customers table

Revision ID: 0004_customers
Revises: 0003_audit_logs
Create Date: 2026-06-16 01:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_customers"
down_revision: Union[str, None] = "0003_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_code", sa.String(20), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("mobile_number", sa.String(15), nullable=False),
        sa.Column("alternate_mobile_number", sa.String(15), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("installation_address", sa.Text(), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("state", sa.String(100), nullable=False),
        sa.Column("pincode", sa.String(10), nullable=False),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "SUSPENDED", "DISCONNECTED", name="customer_status"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("customer_code"),
        sa.UniqueConstraint("mobile_number"),
    )
    op.create_index("ix_customers_user_id", "customers", ["user_id"])
    op.create_index("ix_customers_customer_code", "customers", ["customer_code"])
    op.create_index("ix_customers_mobile_number", "customers", ["mobile_number"])
    op.create_index("ix_customers_email", "customers", ["email"])


def downgrade() -> None:
    op.drop_index("ix_customers_email", table_name="customers")
    op.drop_index("ix_customers_mobile_number", table_name="customers")
    op.drop_index("ix_customers_customer_code", table_name="customers")
    op.drop_index("ix_customers_user_id", table_name="customers")
    op.drop_table("customers")
    op.execute("DROP TYPE IF EXISTS customer_status")
