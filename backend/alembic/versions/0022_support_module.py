"""0022 support module

Revision ID: 0022_support_module
Revises: 0021_scheduled_jobs
Create Date: 2026-06-17

"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0022_support_module"
down_revision = "0021_scheduled_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── support_tickets ───────────────────────────────────────────────────────
    op.create_table(
        "support_tickets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column("ticket_number", sa.String(20), nullable=False),
        sa.Column(
            "customer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column(
            "priority", sa.String(20), nullable=False, server_default="MEDIUM"
        ),
        sa.Column(
            "status", sa.String(30), nullable=False, server_default="OPEN"
        ),
        sa.Column(
            "assigned_to_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_support_tickets_ticket_number", "support_tickets", ["ticket_number"]
    )
    op.create_index(
        "ix_support_tickets_ticket_number", "support_tickets", ["ticket_number"]
    )
    op.create_index(
        "ix_support_tickets_customer_id", "support_tickets", ["customer_id"]
    )
    op.create_index(
        "ix_support_tickets_subscription_id", "support_tickets", ["subscription_id"]
    )
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
    op.create_index("ix_support_tickets_priority", "support_tickets", ["priority"])
    op.create_index(
        "ix_support_tickets_assigned_to_user_id",
        "support_tickets",
        ["assigned_to_user_id"],
    )
    op.create_index(
        "ix_support_tickets_category", "support_tickets", ["category"]
    )
    op.create_index(
        "ix_support_tickets_created_at", "support_tickets", ["created_at"]
    )

    # ── ticket_messages ───────────────────────────────────────────────────────
    op.create_table(
        "ticket_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("support_tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column(
            "is_internal_note", sa.Boolean, nullable=False, server_default="false"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_ticket_messages_ticket_id", "ticket_messages", ["ticket_id"])
    op.create_index(
        "ix_ticket_messages_sender_user_id", "ticket_messages", ["sender_user_id"]
    )
    op.create_index(
        "ix_ticket_messages_created_at", "ticket_messages", ["created_at"]
    )

    # ── ticket_attachments ────────────────────────────────────────────────────
    op.create_table(
        "ticket_attachments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "ticket_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ticket_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_ticket_attachments_ticket_message_id",
        "ticket_attachments",
        ["ticket_message_id"],
    )

    # ── admin_notifications ───────────────────────────────────────────────────
    op.create_table(
        "admin_notifications",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("notification_type", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("action_url", sa.String(500), nullable=True),
        sa.Column(
            "is_read", sa.Boolean, nullable=False, server_default="false"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_admin_notifications_user_id", "admin_notifications", ["user_id"]
    )
    op.create_index(
        "ix_admin_notifications_is_read", "admin_notifications", ["is_read"]
    )
    op.create_index(
        "ix_admin_notifications_created_at", "admin_notifications", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_admin_notifications_created_at", table_name="admin_notifications")
    op.drop_index("ix_admin_notifications_is_read", table_name="admin_notifications")
    op.drop_index("ix_admin_notifications_user_id", table_name="admin_notifications")
    op.drop_table("admin_notifications")

    op.drop_index(
        "ix_ticket_attachments_ticket_message_id", table_name="ticket_attachments"
    )
    op.drop_table("ticket_attachments")

    op.drop_index("ix_ticket_messages_created_at", table_name="ticket_messages")
    op.drop_index("ix_ticket_messages_sender_user_id", table_name="ticket_messages")
    op.drop_index("ix_ticket_messages_ticket_id", table_name="ticket_messages")
    op.drop_table("ticket_messages")

    op.drop_index("ix_support_tickets_created_at", table_name="support_tickets")
    op.drop_index("ix_support_tickets_category", table_name="support_tickets")
    op.drop_index("ix_support_tickets_assigned_to_user_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_priority", table_name="support_tickets")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_subscription_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_customer_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_ticket_number", table_name="support_tickets")
    op.drop_constraint("uq_support_tickets_ticket_number", "support_tickets", type_="unique")
    op.drop_table("support_tickets")
