"""sms_test_fields

Revision ID: 0023_sms_test_fields
Revises: 0022_support_module
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0023_sms_test_fields"
down_revision = "0022_support_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("company_settings", sa.Column("sms_test_template_id", sa.String(100), nullable=True))
    op.add_column("company_settings", sa.Column("sms_test_message", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("company_settings", "sms_test_message")
    op.drop_column("company_settings", "sms_test_template_id")
