"""create company_settings table

Revision ID: 0009_company_settings
Revises: 0008_subscriptions
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0009_company_settings"
down_revision: str = "0008_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("legal_name", sa.String(255), nullable=True),
        sa.Column("gst_number", sa.String(20), nullable=True),
        sa.Column("pan_number", sa.String(10), nullable=True),
        sa.Column("support_email", sa.String(255), nullable=True),
        sa.Column("support_phone", sa.String(20), nullable=True),
        # Address
        sa.Column("address_line_1", sa.String(255), nullable=True),
        sa.Column("address_line_2", sa.String(255), nullable=True),
        sa.Column("landmark", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("pincode", sa.String(10), nullable=True),
        sa.Column(
            "country",
            sa.String(100),
            nullable=False,
            server_default="India",
        ),
        # Branding
        sa.Column("logo_path", sa.String(500), nullable=True),
        # Invoice preferences
        sa.Column(
            "invoice_prefix",
            sa.String(20),
            nullable=False,
            server_default="TDB-INV",
        ),
        sa.Column(
            "invoice_due_days",
            sa.Integer,
            nullable=False,
            server_default="7",
        ),
        sa.Column(
            "default_gst_percentage",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="18.00",
        ),
        sa.Column("invoice_footer_text", sa.Text, nullable=True),
        sa.Column("terms_and_conditions", sa.Text, nullable=True),
        # Timestamps
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
    )


def downgrade() -> None:
    op.drop_table("company_settings")
