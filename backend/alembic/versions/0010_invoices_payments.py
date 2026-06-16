"""create invoices, invoice_change_logs, and payments tables

Revision ID: 0010_invoices_payments
Revises: 0009_company_settings
Create Date: 2026-06-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_invoices_payments"
down_revision: str = "0009_company_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums ──────────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE invoice_status AS ENUM (
                'DRAFT','UNPAID','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE invoice_change_type AS ENUM (
                'CREATED','UPDATED','STATUS_CHANGED','LOCKED','CANCELLED','PDF_REGENERATED'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE payment_method AS ENUM (
                'CASH','UPI','BANK_TRANSFER','CHEQUE'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── invoices ───────────────────────────────────────────────────────────
    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_number", sa.String(50), nullable=False, unique=True),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("edited_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_locked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("original_invoice_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Company snapshots
        sa.Column("company_name_snapshot", sa.String(255), nullable=False),
        sa.Column("legal_name_snapshot", sa.String(255), nullable=True),
        sa.Column("gst_number_snapshot", sa.String(20), nullable=True),
        sa.Column("pan_number_snapshot", sa.String(10), nullable=True),
        sa.Column("support_email_snapshot", sa.String(255), nullable=True),
        sa.Column("support_phone_snapshot", sa.String(20), nullable=True),
        sa.Column("company_address_snapshot", sa.Text, nullable=True),
        sa.Column("invoice_footer_snapshot", sa.Text, nullable=True),
        sa.Column("terms_snapshot", sa.Text, nullable=True),
        # Customer snapshots
        sa.Column("customer_code_snapshot", sa.String(20), nullable=False),
        sa.Column("customer_name_snapshot", sa.String(255), nullable=False),
        # Connection snapshots
        sa.Column("connection_name_snapshot", sa.String(50), nullable=False),
        sa.Column("installation_address_snapshot", sa.Text, nullable=True),
        # Plan snapshots
        sa.Column("plan_code_snapshot", sa.String(20), nullable=False),
        sa.Column("plan_name_snapshot", sa.String(255), nullable=False),
        sa.Column("speed_mbps_snapshot", sa.Integer, nullable=False),
        sa.Column("data_policy_snapshot", sa.String(20), nullable=False),
        sa.Column("fup_limit_gb_snapshot", sa.Integer, nullable=True),
        # Pricing snapshots
        sa.Column("billing_cycle_snapshot", sa.String(20), nullable=False),
        sa.Column("base_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("gst_percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("gst_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        # Payment tracking
        sa.Column("paid_amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("balance_amount", sa.Numeric(10, 2), nullable=False),
        # Billing period
        sa.Column("billing_period_start", sa.Date, nullable=False),
        sa.Column("billing_period_end", sa.Date, nullable=False),
        sa.Column("invoice_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        # Status
        sa.Column(
            "status",
            postgresql.ENUM("DRAFT","UNPAID","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED",
                            name="invoice_status", create_type=False),
            nullable=False,
            server_default="UNPAID",
        ),
        sa.Column("remarks", sa.Text, nullable=True),
        sa.Column("pdf_path", sa.String(500), nullable=True),
        # Audit
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        # FKs
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["original_invoice_id"], ["invoices.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"], unique=True)
    op.create_index("ix_invoices_subscription_id", "invoices", ["subscription_id"])
    op.create_index("ix_invoices_original_invoice_id", "invoices", ["original_invoice_id"])
    op.create_index("ix_invoices_status", "invoices", ["status"])

    # ── invoice_change_logs ────────────────────────────────────────────────
    op.create_table(
        "invoice_change_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "change_type",
            postgresql.ENUM("CREATED","UPDATED","STATUS_CHANGED","LOCKED","CANCELLED","PDF_REGENERATED",
                            name="invoice_change_type", create_type=False),
            nullable=False,
        ),
        sa.Column("old_values", postgresql.JSONB, nullable=True),
        sa.Column("new_values", postgresql.JSONB, nullable=True),
        sa.Column("change_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_invoice_change_logs_invoice_id", "invoice_change_logs", ["invoice_id"])

    # ── payments ───────────────────────────────────────────────────────────
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_number", sa.String(30), nullable=False, unique=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column(
            "payment_method",
            postgresql.ENUM("CASH","UPI","BANK_TRANSFER","CHEQUE",
                            name="payment_method", create_type=False),
            nullable=False,
            server_default="CASH",
        ),
        sa.Column("transaction_reference", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_payments_payment_number", "payments", ["payment_number"], unique=True)
    op.create_index("ix_payments_invoice_id", "payments", ["invoice_id"])


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("invoice_change_logs")
    op.drop_table("invoices")
    op.execute("DROP TYPE IF EXISTS invoice_status")
    op.execute("DROP TYPE IF EXISTS invoice_change_type")
    op.execute("DROP TYPE IF EXISTS payment_method")
