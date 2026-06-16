"""add refresh_tokens table and PII encryption for users.email

Revision ID: 0002_sessions_and_pii
Revises: 0001_initial
Create Date: 2026-06-16 00:01:00.000000

Changes
-------
* users.email   — widened to TEXT and encrypted at rest with Fernet.
* users.email_hash — new TEXT column (HMAC-SHA256), unique-indexed, used for
                     lookups instead of scanning/decrypting email.
* ix_users_email — unique index on plaintext email is dropped (email_hash
                   takes over uniqueness enforcement).
* refresh_tokens — new table tracking DB-backed JWT sessions (jti claim).

Data migration
--------------
Existing rows in ``users`` are migrated in-place:
  - email is encrypted using the same key derivation as app.core.encryption.
  - email_hash is computed using the same HMAC derivation.

The SECRET_KEY (or SESSION_SECRET) environment variable must be accessible at
migration runtime — the same value the application uses.
"""

from typing import Sequence, Union
import base64
import hashlib
import hmac as _hmac
import os

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "0002_sessions_and_pii"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Key derivation — must match app.core.encryption exactly.
# ---------------------------------------------------------------------------

def _derive_keys() -> tuple["Fernet", bytes]:  # type: ignore[name-defined]
    from cryptography.fernet import Fernet  # type: ignore[import]

    enc_key_env = os.getenv("ENCRYPTION_KEY")
    if enc_key_env:
        fernet = Fernet(enc_key_env.encode())
        raw = base64.urlsafe_b64decode(enc_key_env.encode())
        mac_key = hashlib.sha256(b"mac:" + raw).digest()[:16]
        return fernet, mac_key

    secret = (
        os.getenv("SECRET_KEY") or os.getenv("SESSION_SECRET") or ""
    ).encode("utf-8")
    fernet_raw = hashlib.sha256(b"enc:" + secret).digest()
    mac_raw = hashlib.sha256(b"mac:" + secret).digest()
    fernet_key = base64.urlsafe_b64encode(fernet_raw)
    return Fernet(fernet_key), mac_raw[:16]


def _migrate_user_emails(conn: sa.engine.Connection) -> None:
    fernet, mac_key = _derive_keys()

    rows = conn.execute(text("SELECT id, email FROM users")).fetchall()
    for row in rows:
        raw_email = row.email

        # Detect if the value was somehow already encrypted.
        try:
            plaintext = fernet.decrypt(raw_email.encode()).decode()
        except Exception:
            plaintext = raw_email.strip().lower()

        encrypted = fernet.encrypt(plaintext.encode()).decode()
        email_hash = _hmac.new(mac_key, plaintext.encode(), hashlib.sha256).hexdigest()

        conn.execute(
            text(
                "UPDATE users SET email = :enc, email_hash = :h WHERE id = :id"
            ),
            {"enc": encrypted, "h": email_hash, "id": str(row.id)},
        )


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # 1. Extend email column to TEXT (Fernet ciphertext is longer than 255 chars)
    op.alter_column("users", "email", type_=sa.Text(), nullable=False)

    # 2. Add email_hash as nullable first (will be populated, then made NOT NULL)
    op.add_column(
        "users",
        sa.Column("email_hash", sa.String(64), nullable=True),
    )

    # 3. Drop the old plaintext unique index — email_hash will replace it.
    op.drop_index("ix_users_email", table_name="users")

    # 4. Create the refresh_tokens table.
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("jti", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True
    )
    op.create_index(
        "ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False
    )

    # 5. Data migration: encrypt existing email values and compute hashes.
    conn = op.get_bind()
    _migrate_user_emails(conn)

    # 6. Enforce NOT NULL + unique on email_hash.
    op.alter_column("users", "email_hash", nullable=False)
    op.create_index("ix_users_email_hash", "users", ["email_hash"], unique=True)


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    fernet, mac_key = _derive_keys()

    # Decrypt all emails back to plaintext before removing the hash column.
    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, email FROM users")).fetchall()
    for row in rows:
        try:
            plaintext = fernet.decrypt(row.email.encode()).decode()
        except Exception:
            plaintext = row.email
        conn.execute(
            text("UPDATE users SET email = :e WHERE id = :id"),
            {"e": plaintext, "id": str(row.id)},
        )

    op.drop_index("ix_users_email_hash", table_name="users")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_jti", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_column("users", "email_hash")

    # Restore plaintext email index and shrink column back to VARCHAR(255).
    op.alter_column("users", "email", type_=sa.String(255), nullable=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
