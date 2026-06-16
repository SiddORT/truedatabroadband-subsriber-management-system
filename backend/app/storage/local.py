from pathlib import Path
from typing import BinaryIO

from app.storage.base import STORAGE_BUCKETS, StorageService


class LocalStorageService(StorageService):
    """Local filesystem implementation.

    Phase 1 only creates the bucket directory structure. Upload/delete
    operations are stubbed for future implementation.
    """

    def __init__(self, root: str):
        self.root = Path(root)

    def ensure_buckets(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        for bucket in STORAGE_BUCKETS:
            (self.root / bucket).mkdir(parents=True, exist_ok=True)

    def _path(self, bucket: str, key: str) -> Path:
        return self.root / bucket / key

    def save(self, bucket: str, key: str, content: BinaryIO) -> str:
        raise NotImplementedError("Uploads are not implemented in Phase 1")

    def url(self, bucket: str, key: str) -> str:
        return str(self._path(bucket, key))

    def delete(self, bucket: str, key: str) -> None:
        raise NotImplementedError("Uploads are not implemented in Phase 1")

    def exists(self, bucket: str, key: str) -> bool:
        return self._path(bucket, key).exists()
