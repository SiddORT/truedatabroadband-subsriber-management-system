from abc import ABC, abstractmethod
from typing import BinaryIO

# Standard storage buckets created on startup.
STORAGE_BUCKETS: tuple[str, ...] = (
    "customers",
    "invoices",
    "company",
    "exports",
    "temp",
)


class StorageService(ABC):
    """Abstract storage interface.

    Implementations will support local filesystem, AWS S3 and Cloudflare R2.
    Upload logic is intentionally NOT implemented in Phase 1 — this is
    scaffolding only.
    """

    @abstractmethod
    def ensure_buckets(self) -> None:
        """Create the standard storage buckets if they don't exist."""

    @abstractmethod
    def save(self, bucket: str, key: str, content: BinaryIO) -> str:
        """Persist content and return a storage reference. (Not implemented yet.)"""

    @abstractmethod
    def url(self, bucket: str, key: str) -> str:
        """Return an accessible URL/path for the stored object."""

    @abstractmethod
    def delete(self, bucket: str, key: str) -> None:
        """Remove a stored object."""

    @abstractmethod
    def exists(self, bucket: str, key: str) -> bool:
        """Whether a stored object exists."""
