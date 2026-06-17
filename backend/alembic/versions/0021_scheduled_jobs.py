"""0021 scheduled jobs

Revision ID: 0021_scheduled_jobs
Revises: 0020_requests
Create Date: 2026-06-17

"""
from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021_scheduled_jobs"
down_revision = "0020_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── scheduled_jobs ────────────────────────────────────────────────────────
    op.create_table(
        "scheduled_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column("job_key", sa.String(100), nullable=False),
        sa.Column("job_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(20), nullable=True),
        sa.Column("max_retries", sa.Integer, nullable=False, server_default="3"),
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
    op.create_index("ix_scheduled_jobs_job_key", "scheduled_jobs", ["job_key"])
    op.create_unique_constraint(
        "uq_scheduled_jobs_job_key", "scheduled_jobs", ["job_key"]
    )

    # ── job_execution_logs ────────────────────────────────────────────────────
    op.create_table(
        "job_execution_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
            nullable=False,
        ),
        sa.Column(
            "scheduled_job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scheduled_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("records_processed", sa.Integer, nullable=True),
        sa.Column("execution_time_ms", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("execution_details", postgresql.JSONB, nullable=True),
    )
    op.create_index(
        "ix_job_execution_logs_scheduled_job_id",
        "job_execution_logs",
        ["scheduled_job_id"],
    )
    op.create_index(
        "ix_job_execution_logs_started_at",
        "job_execution_logs",
        ["started_at"],
    )

    # ── notification_logs: add archived_at ────────────────────────────────────
    op.add_column(
        "notification_logs",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_notification_logs_archived_at",
        "notification_logs",
        ["archived_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notification_logs_archived_at", table_name="notification_logs")
    op.drop_column("notification_logs", "archived_at")
    op.drop_table("job_execution_logs")
    op.drop_index("ix_scheduled_jobs_job_key", table_name="scheduled_jobs")
    op.drop_constraint("uq_scheduled_jobs_job_key", "scheduled_jobs", type_="unique")
    op.drop_table("scheduled_jobs")
