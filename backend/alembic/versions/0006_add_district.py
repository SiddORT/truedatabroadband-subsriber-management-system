"""add district fields to customers

Revision ID: 0006_add_district
Revises: 0005_customer_schema_v2
Create Date: 2026-06-16 08:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_add_district"
down_revision: Union[str, None] = "0005_customer_schema_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("district", sa.String(100), nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column("billing_district", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customers", "billing_district")
    op.drop_column("customers", "district")
