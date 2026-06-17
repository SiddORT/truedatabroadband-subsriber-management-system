"""Production-ready communication infrastructure.

Adds communication_logs, otp_verifications tables.
Updates company_settings: encrypted credential columns, enabled flags,
new URL fields. Drops old plaintext credential columns.

Revision ID: 0019_comm_infra
Revises: 0018_notifications
Create Date: 2026-06-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019_comm_infra"
down_revision = "0018_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── communication_logs ──────────────────────────────────────────────────
    op.create_table(
        "communication_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("template_key", sa.String(50), nullable=True),
        sa.Column("recipient_mobile", sa.String(20), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("provider_name", sa.String(50), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("response_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="PENDING"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_comm_log_provider_msg_id", "communication_logs", ["provider_message_id"])
    op.create_index("ix_comm_log_status", "communication_logs", ["status"])
    op.create_index("ix_comm_log_created_at", "communication_logs", ["created_at"])
    op.create_index("ix_comm_log_channel", "communication_logs", ["channel"])
    op.create_index("ix_comm_log_template_key", "communication_logs", ["template_key"])

    # ── otp_verifications ───────────────────────────────────────────────────
    op.create_table(
        "otp_verifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mobile_number", sa.String(20), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False, server_default="LOGIN"),
        sa.Column("otp_code_hash", sa.String(255), nullable=False),
        sa.Column("attempt_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer, nullable=False, server_default="5"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_otp_verif_mobile", "otp_verifications", ["mobile_number"])

    # ── company_settings: new columns ───────────────────────────────────────
    op.add_column("company_settings", sa.Column("sms_is_enabled", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("company_settings", sa.Column("sms_api_base_url", sa.String(500), nullable=True))
    op.add_column("company_settings", sa.Column("sms_status_api_url", sa.String(500), nullable=True))
    op.add_column("company_settings", sa.Column("sms_api_key_encrypted", sa.Text, nullable=True))
    op.add_column("company_settings", sa.Column("sms_client_id_encrypted", sa.Text, nullable=True))
    op.add_column("company_settings", sa.Column("sms_sender_id_encrypted", sa.Text, nullable=True))
    op.add_column("company_settings", sa.Column("sms_entity_id_encrypted", sa.Text, nullable=True))
    op.add_column("company_settings", sa.Column("email_is_enabled", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("company_settings", sa.Column("smtp_username_encrypted", sa.Text, nullable=True))
    op.add_column("company_settings", sa.Column("smtp_password_encrypted", sa.Text, nullable=True))

    # ── company_settings: drop old plaintext credential columns ─────────────
    op.drop_column("company_settings", "sms_api_key")
    op.drop_column("company_settings", "sms_sender_id")
    op.drop_column("company_settings", "sms_base_url")
    op.drop_column("company_settings", "sms_entity_id")
    op.drop_column("company_settings", "smtp_username")
    op.drop_column("company_settings", "smtp_password")


def downgrade() -> None:
    # Restore old plaintext columns
    op.add_column("company_settings", sa.Column("sms_api_key", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("sms_sender_id", sa.String(50), nullable=True))
    op.add_column("company_settings", sa.Column("sms_base_url", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("sms_entity_id", sa.String(100), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_username", sa.String(255), nullable=True))
    op.add_column("company_settings", sa.Column("smtp_password", sa.String(255), nullable=True))

    op.drop_column("company_settings", "sms_is_enabled")
    op.drop_column("company_settings", "sms_api_base_url")
    op.drop_column("company_settings", "sms_status_api_url")
    op.drop_column("company_settings", "sms_api_key_encrypted")
    op.drop_column("company_settings", "sms_client_id_encrypted")
    op.drop_column("company_settings", "sms_sender_id_encrypted")
    op.drop_column("company_settings", "sms_entity_id_encrypted")
    op.drop_column("company_settings", "email_is_enabled")
    op.drop_column("company_settings", "smtp_username_encrypted")
    op.drop_column("company_settings", "smtp_password_encrypted")

    op.drop_index("ix_otp_verif_mobile", table_name="otp_verifications")
    op.drop_table("otp_verifications")

    op.drop_index("ix_comm_log_template_key", table_name="communication_logs")
    op.drop_index("ix_comm_log_channel", table_name="communication_logs")
    op.drop_index("ix_comm_log_created_at", table_name="communication_logs")
    op.drop_index("ix_comm_log_status", table_name="communication_logs")
    op.drop_index("ix_comm_log_provider_msg_id", table_name="communication_logs")
    op.drop_table("communication_logs")
