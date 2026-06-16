"""
Field-level PII encryption using Fernet (AES-128-CBC + HMAC-SHA256).

Key derivation
--------------
If the ENCRYPTION_KEY environment variable is set it must be a URL-safe
base64-encoded 32-byte key (generate with `Fernet.generate_key()`).

Otherwise two sub-keys are derived from SECRET_KEY using domain-separated
SHA-256:
  - Fernet key  = base64url( SHA-256(b"enc:" + secret) )
  - HMAC key    = SHA-256(b"mac:" + secret)[:16]

This means a single strong SECRET_KEY is sufficient for development without
needing a separate ENCRYPTION_KEY, but the two keys are cryptographically
independent.

WARNING: changing the key (or SECRET_KEY without ENCRYPTION_KEY) after data
has been encrypted renders all encrypted rows unreadable. Rotate keys via a
dedicated migration that decrypts with the old key and re-encrypts with the
new one.
"""

import base64
import hashlib
import hmac
import os
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy import types


# ---------------------------------------------------------------------------
# Internal key management
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_fernet_and_mac_key() -> tuple[Fernet, bytes]:
    """Return (Fernet instance, HMAC key bytes).  Result is cached."""
    enc_key_env = os.getenv("ENCRYPTION_KEY")
    if enc_key_env:
        fernet = Fernet(enc_key_env.encode())
        # Derive independent HMAC key from the raw key bytes
        raw = base64.urlsafe_b64decode(enc_key_env.encode())
        mac_key = hashlib.sha256(b"mac:" + raw).digest()[:16]
        return fernet, mac_key

    # Derive from SECRET_KEY with domain separation
    from app.core.config import settings
    secret = settings.SECRET_KEY.encode("utf-8")
    fernet_raw = hashlib.sha256(b"enc:" + secret).digest()
    mac_raw = hashlib.sha256(b"mac:" + secret).digest()
    fernet = Fernet(base64.urlsafe_b64encode(fernet_raw))
    return fernet, mac_raw[:16]


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def encrypt(value: str) -> str:
    """Encrypt *value* and return a URL-safe base64 ciphertext string."""
    fernet, _ = _get_fernet_and_mac_key()
    return fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt(value: str) -> str:
    """Decrypt a ciphertext produced by :func:`encrypt`."""
    fernet, _ = _get_fernet_and_mac_key()
    return fernet.decrypt(value.encode("utf-8")).decode("utf-8")


def hash_for_lookup(value: str) -> str:
    """
    Return a keyed HMAC-SHA256 hex digest of *value* (lowercased).

    This is used as the indexed, searchable representation of an encrypted
    field — lookups filter on the hash without needing to decrypt every row.
    The HMAC key ensures the hash cannot be reversed or rainbow-table attacked
    without the application key.
    """
    _, mac_key = _get_fernet_and_mac_key()
    return hmac.new(mac_key, value.lower().encode("utf-8"), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------------
# SQLAlchemy TypeDecorator
# ---------------------------------------------------------------------------

class EncryptedString(types.TypeDecorator):
    """
    SQLAlchemy column type that transparently encrypts on write and decrypts
    on read.  The underlying DB column is TEXT.

    Usage::

        class MyModel(Base):
            phone: Mapped[str] = mapped_column(EncryptedString, nullable=False)
    """

    impl = types.Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return encrypt(value)

    def process_result_value(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return decrypt(value)
