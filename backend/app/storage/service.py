from functools import lru_cache

from app.core.config import settings
from app.storage.base import StorageService
from app.storage.local import LocalStorageService


@lru_cache
def get_storage_service() -> StorageService:
    """Return the configured storage backend.

    Future backends (AWS S3, Cloudflare R2) plug in here without changing
    callers, since they all implement the StorageService interface.
    """
    backend = settings.STORAGE_BACKEND.lower()
    if backend == "local":
        return LocalStorageService(settings.STORAGE_ROOT)

    # Placeholders for future backends.
    if backend in {"s3", "r2"}:
        raise NotImplementedError(
            f"Storage backend '{backend}' is planned but not implemented yet"
        )

    raise ValueError(f"Unknown storage backend: {settings.STORAGE_BACKEND}")


def init_storage() -> None:
    """Create the storage folder structure on application startup."""
    get_storage_service().ensure_buckets()
