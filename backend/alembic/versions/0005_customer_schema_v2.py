"""expand customer schema: type, kyc, billing address, spokesperson, documents

Revision ID: 0005_customer_schema_v2
Revises: 0004_customers
Create Date: 2026-06-16 02:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_customer_schema_v2"
down_revision: Union[str, None] = "0004_customers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── New ENUM types ───────────────────────────────────────────────────────
    op.execute(
        "CREATE TYPE customer_type AS ENUM ('INDIVIDUAL', 'BUSINESS')"
    )
    op.execute(
        "CREATE TYPE kyc_type AS ENUM "
        "('AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE')"
    )

    # ── Customer type ────────────────────────────────────────────────────────
    op.add_column(
        "customers",
        sa.Column(
            "customer_type",
            sa.Enum("INDIVIDUAL", "BUSINESS", name="customer_type"),
            nullable=False,
            server_default="INDIVIDUAL",
        ),
    )
    op.add_column("customers", sa.Column("company_name", sa.String(255), nullable=True))
    op.add_column("customers", sa.Column("gst_number", sa.String(15), nullable=True))

    # ── Identity ─────────────────────────────────────────────────────────────
    op.add_column(
        "customers",
        sa.Column(
            "kyc_type",
            sa.Enum(
                "AADHAAR", "PAN", "PASSPORT", "VOTER_ID", "DRIVING_LICENSE",
                name="kyc_type",
            ),
            nullable=True,
        ),
    )
    op.add_column("customers", sa.Column("kyc_number", sa.String(50), nullable=True))

    # ── Installation address extras ───────────────────────────────────────────
    op.add_column("customers", sa.Column("address_line_2", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("landmark", sa.String(255), nullable=True))

    # ── Billing address ───────────────────────────────────────────────────────
    op.add_column(
        "customers",
        sa.Column(
            "billing_same_as_installation",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column("customers", sa.Column("billing_address_line_1", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("billing_address_line_2", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("billing_landmark", sa.String(255), nullable=True))
    op.add_column("customers", sa.Column("billing_city", sa.String(100), nullable=True))
    op.add_column("customers", sa.Column("billing_state", sa.String(100), nullable=True))
    op.add_column("customers", sa.Column("billing_pincode", sa.String(10), nullable=True))

    # ── Spokesperson ──────────────────────────────────────────────────────────
    op.add_column("customers", sa.Column("spokesperson_name", sa.String(255), nullable=True))
    op.add_column("customers", sa.Column("spokesperson_mobile", sa.String(15), nullable=True))
    op.add_column("customers", sa.Column("spokesperson_email", sa.String(255), nullable=True))
    op.add_column("customers", sa.Column("spokesperson_designation", sa.String(100), nullable=True))

    # ── Additional information ────────────────────────────────────────────────
    op.add_column("customers", sa.Column("connection_date", sa.Date(), nullable=True))
    op.add_column("customers", sa.Column("reference_source", sa.String(100), nullable=True))
    op.add_column("customers", sa.Column("sales_person", sa.String(100), nullable=True))

    # ── Documents ─────────────────────────────────────────────────────────────
    op.add_column("customers", sa.Column("profile_photo_path", sa.String(500), nullable=True))
    op.add_column("customers", sa.Column("kyc_document_path", sa.String(500), nullable=True))
    op.add_column("customers", sa.Column("agreement_document_path", sa.String(500), nullable=True))


def downgrade() -> None:
    cols = [
        "agreement_document_path", "kyc_document_path", "profile_photo_path",
        "sales_person", "reference_source", "connection_date",
        "spokesperson_designation", "spokesperson_email",
        "spokesperson_mobile", "spokesperson_name",
        "billing_pincode", "billing_state", "billing_city",
        "billing_landmark", "billing_address_line_2", "billing_address_line_1",
        "billing_same_as_installation",
        "landmark", "address_line_2",
        "kyc_number", "kyc_type",
        "gst_number", "company_name", "customer_type",
    ]
    for col in cols:
        op.drop_column("customers", col)

    op.execute("DROP TYPE IF EXISTS kyc_type")
    op.execute("DROP TYPE IF EXISTS customer_type")
