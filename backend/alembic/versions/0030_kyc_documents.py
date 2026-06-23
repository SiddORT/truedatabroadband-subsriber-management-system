"""add kyc_documents jsonb column to customers

Revision ID: 0030_kyc_documents
Revises: 0029_email_hash_unique_per_role
Create Date: 2026-06-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0030_kyc_documents"
down_revision = "0029_email_hash_unique_per_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("kyc_documents", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customers", "kyc_documents")
