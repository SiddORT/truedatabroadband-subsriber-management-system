"""Enrich audit_logs table with module, entity, change-tracking, and remarks columns.

Revision ID: 0017_audit_enrich
Revises: 0016_inv_change_edited
Create Date: 2026-06-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017_audit_enrich"
down_revision = "0016_inv_change_edited"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("module", sa.String(32), nullable=True))
    op.add_column("audit_logs", sa.Column("entity_type", sa.String(64), nullable=True))
    op.add_column("audit_logs", sa.Column("entity_id", sa.String(36), nullable=True))
    op.add_column("audit_logs", sa.Column("entity_name", sa.String(255), nullable=True))
    op.add_column("audit_logs", sa.Column("performed_by_name", sa.String(255), nullable=True))
    op.add_column("audit_logs", sa.Column("old_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("audit_logs", sa.Column("new_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("audit_logs", sa.Column("remarks", sa.Text(), nullable=True))

    op.create_index("ix_audit_logs_module", "audit_logs", ["module"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # Back-fill module from action for all existing rows
    op.execute("""
        UPDATE audit_logs SET module = CASE
            WHEN action IN ('login', 'logout') OR action LIKE '%password%' THEN 'AUTH'
            WHEN action LIKE 'customer%' THEN 'CUSTOMERS'
            WHEN action LIKE 'plan%' OR action LIKE 'pricing%' THEN 'PLANS'
            WHEN action LIKE 'subscription%' THEN 'SUBSCRIPTIONS'
            WHEN action LIKE 'settings%' OR action LIKE 'logo%' THEN 'SETTINGS'
            WHEN action LIKE 'invoice%' OR action LIKE 'duplicate_invoice%' THEN 'INVOICES'
            WHEN action LIKE 'payment%' THEN 'PAYMENTS'
            WHEN action LIKE 'report%' THEN 'REPORTS'
            WHEN action LIKE 'dashboard%' THEN 'DASHBOARD'
            ELSE 'SYSTEM'
        END
        WHERE module IS NULL
    """)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", "audit_logs")
    op.drop_index("ix_audit_logs_entity_id", "audit_logs")
    op.drop_index("ix_audit_logs_entity_type", "audit_logs")
    op.drop_index("ix_audit_logs_module", "audit_logs")
    op.drop_column("audit_logs", "remarks")
    op.drop_column("audit_logs", "new_values")
    op.drop_column("audit_logs", "old_values")
    op.drop_column("audit_logs", "performed_by_name")
    op.drop_column("audit_logs", "entity_name")
    op.drop_column("audit_logs", "entity_id")
    op.drop_column("audit_logs", "entity_type")
    op.drop_column("audit_logs", "module")
