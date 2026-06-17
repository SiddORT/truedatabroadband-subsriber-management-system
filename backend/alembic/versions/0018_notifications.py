"""Add notification framework tables and extend company_settings.

Revision ID: 0018_notifications
Revises: 0017_audit_log_enrich
Create Date: 2026-06-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0018_notifications"
down_revision = "0017_audit_enrich"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # notification_templates
    # ------------------------------------------------------------------
    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_key", sa.String(50), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("subject", sa.String(255), nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("dlt_template_id", sa.String(50), nullable=True),
        sa.Column("dlt_entity_id", sa.String(50), nullable=True),
        sa.Column("approved_variables", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("template_key", "channel", name="uq_notif_tmpl_key_channel"),
    )
    op.create_index("ix_notif_tmpl_key", "notification_templates", ["template_key"])

    # ------------------------------------------------------------------
    # notification_logs
    # ------------------------------------------------------------------
    op.create_table(
        "notification_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("template_key", sa.String(50), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("recipient_mobile", sa.String(20), nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("days_offset", sa.Integer, nullable=True),
        sa.Column("provider_name", sa.String(50), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="PENDING"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notif_log_template_key", "notification_logs", ["template_key"])
    op.create_index("ix_notif_log_subscription_id", "notification_logs", ["subscription_id"])
    op.create_index("ix_notif_log_status", "notification_logs", ["status"])
    op.create_index("ix_notif_log_created_at", "notification_logs", ["created_at"])
    # Unique index prevents duplicate renewal reminders
    op.create_index(
        "uq_notif_log_sub_tmpl_offset_ch",
        "notification_logs",
        ["subscription_id", "template_key", "days_offset", "channel"],
        unique=True,
        postgresql_where=sa.text("subscription_id IS NOT NULL AND days_offset IS NOT NULL"),
    )

    # ------------------------------------------------------------------
    # notification_preferences
    # ------------------------------------------------------------------
    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("welcome_sms_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("welcome_email_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("renewal_sms_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("renewal_email_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("invoice_email_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("payment_email_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("otp_sms_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("otp_email_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notif_pref_customer_id", "notification_preferences", ["customer_id"])

    # ------------------------------------------------------------------
    # Extend company_settings with SMS + SMTP fields
    # ------------------------------------------------------------------
    op.add_column("company_settings", sa.Column("sms_provider", sa.String(20), nullable=True))
    op.add_column("company_settings", sa.Column("sms_api_key", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("sms_sender_id", sa.String(50), nullable=True))
    op.add_column("company_settings", sa.Column("sms_base_url", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("sms_entity_id", sa.String(100), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_host", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_port", sa.Integer, nullable=True, server_default="587"))
    op.add_column("company_settings", sa.Column("smtp_username", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_password", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_from_email", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_from_name", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_use_tls", sa.Boolean, nullable=False, server_default="true"))
    op.add_column("company_settings", sa.Column("smtp_use_ssl", sa.Boolean, nullable=False, server_default="false"))


def downgrade() -> None:
    # Remove company_settings columns
    for col in [
        "smtp_use_ssl", "smtp_use_tls", "smtp_from_name", "smtp_from_email",
        "smtp_password", "smtp_username", "smtp_port", "smtp_host",
        "sms_entity_id", "sms_base_url", "sms_sender_id", "sms_api_key", "sms_provider",
    ]:
        op.drop_column("company_settings", col)

    op.drop_index("ix_notif_pref_customer_id", table_name="notification_preferences")
    op.drop_table("notification_preferences")

    op.drop_index("uq_notif_log_sub_tmpl_offset_ch", table_name="notification_logs")
    op.drop_index("ix_notif_log_created_at", table_name="notification_logs")
    op.drop_index("ix_notif_log_status", table_name="notification_logs")
    op.drop_index("ix_notif_log_subscription_id", table_name="notification_logs")
    op.drop_index("ix_notif_log_template_key", table_name="notification_logs")
    op.drop_table("notification_logs")

    op.drop_index("ix_notif_tmpl_key", table_name="notification_templates")
    op.drop_table("notification_templates")
