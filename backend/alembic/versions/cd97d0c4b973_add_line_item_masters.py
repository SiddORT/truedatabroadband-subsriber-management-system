"""add_line_item_masters

Revision ID: cd97d0c4b973
Revises: 0031_bank_gpay_fields
Create Date: 2026-06-24 08:08:27.933079
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "cd97d0c4b973"
down_revision: Union[str, None] = "0031_bank_gpay_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "line_item_masters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("hsn_sac_code", sa.String(length=20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("gst_percentage", sa.Numeric(5, 2), nullable=False, server_default="18"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_line_item_masters_name", "line_item_masters", ["name"])


def downgrade() -> None:
    op.drop_index("ix_line_item_masters_name", table_name="line_item_masters")
    op.drop_table("line_item_masters")
