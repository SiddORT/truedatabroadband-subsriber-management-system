from pathlib import Path
from typing import BinaryIO

from app.storage.base import STORAGE_BUCKETS, StorageService


class LocalStorageService(StorageService):
    """Local filesystem implementation of StorageService."""

    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def ensure_buckets(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        for bucket in STORAGE_BUCKETS:
            (self.root / bucket).mkdir(parents=True, exist_ok=True)

    def _path(self, bucket: str, key: str) -> Path:
        resolved = (self.root / bucket / key).resolve()
        bucket_root = (self.root / bucket).resolve()
        if not str(resolved).startswith(str(bucket_root)):
            raise ValueError("Invalid storage key: path traversal detected")
        return resolved

    def save(self, bucket: str, key: str, content: BinaryIO) -> str:
        path = self._path(bucket, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = content.read()
        path.write_bytes(data)
        return str(path)

    def url(self, bucket: str, key: str) -> str:
        return str(self._path(bucket, key))

    def delete(self, bucket: str, key: str) -> None:
        path = self._path(bucket, key)
        if path.exists():
            path.unlink()

    def exists(self, bucket: str, key: str) -> bool:
        return self._path(bucket, key).exists()
