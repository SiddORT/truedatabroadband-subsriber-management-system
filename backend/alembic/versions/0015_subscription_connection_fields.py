"""Add connection_name and installation_address to subscriptions.

Revision ID: 0015_sub_conn_fields
Revises: 0014_consolidated_invoice
Create Date: 2026-06-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_sub_conn_fields"
down_revision = "0014_consolidated_invoice"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("connection_name", sa.String(100), nullable=True),
    )
    op.add_column(
        "subscriptions",
        sa.Column("installation_address", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "installation_address")
    op.drop_column("subscriptions", "connection_name")
