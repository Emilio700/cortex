"""Private local or S3-compatible storage for clinical files."""

import io
import os
from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi.responses import Response

from app.core.config import settings


class StorageBackend(ABC):
    @abstractmethod
    def save(self, relative_path: str, content: bytes) -> None: ...

    @abstractmethod
    def read(self, relative_path: str) -> bytes: ...

    @abstractmethod
    def delete(self, relative_path: str) -> None: ...

    @abstractmethod
    def exists(self, relative_path: str) -> bool: ...

    @abstractmethod
    def resolve_path(self, relative_path: str) -> Path: ...


class LocalStorageBackend(StorageBackend):
    def __init__(self, root_dir: str | Path = "."):
        self.root_dir = Path(root_dir)

    def _full_path(self, relative_path: str) -> Path:
        root = self.root_dir.resolve()
        candidate = (root / relative_path).resolve()
        if candidate != root and root not in candidate.parents:
            raise ValueError("Storage path escapes configured root")
        return candidate

    def save(self, relative_path: str, content: bytes) -> None:
        full_path = self._full_path(relative_path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = full_path.with_name(f".{full_path.name}.{uuid4().hex}.tmp")
        try:
            with temporary_path.open("wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary_path, full_path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()

    def read(self, relative_path: str) -> bytes:
        return self._full_path(relative_path).read_bytes()

    def delete(self, relative_path: str) -> None:
        full_path = self._full_path(relative_path)
        if full_path.exists():
            full_path.unlink()

    def exists(self, relative_path: str) -> bool:
        return self._full_path(relative_path).exists()

    def resolve_path(self, relative_path: str) -> Path:
        return self._full_path(relative_path)


class S3StorageBackend(StorageBackend):
    """Private object storage; authorization remains in the API."""

    def __init__(self):
        import boto3

        kwargs = {
            "region_name": settings.S3_REGION or None,
            "endpoint_url": settings.S3_ENDPOINT_URL or None,
            "aws_access_key_id": settings.S3_ACCESS_KEY_ID or None,
            "aws_secret_access_key": settings.S3_SECRET_ACCESS_KEY or None,
        }
        self.client = boto3.client("s3", **{key: value for key, value in kwargs.items() if value})
        self.bucket = settings.S3_BUCKET

    @staticmethod
    def _key(relative_path: str) -> str:
        key = relative_path.replace("\\", "/").lstrip("/")
        if not key or ".." in key.split("/"):
            raise ValueError("Invalid object key")
        return key

    def save(self, relative_path: str, content: bytes) -> None:
        self.client.upload_fileobj(io.BytesIO(content), self.bucket, self._key(relative_path))

    def read(self, relative_path: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=self._key(relative_path))["Body"].read()

    def delete(self, relative_path: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._key(relative_path))

    def exists(self, relative_path: str) -> bool:
        from botocore.exceptions import ClientError
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key(relative_path))
            return True
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
                return False
            raise

    def resolve_path(self, relative_path: str) -> Path:
        raise RuntimeError("Object storage has no local path")


default_storage: StorageBackend = (
    S3StorageBackend() if settings.STORAGE_BACKEND.lower() == "s3"
    else LocalStorageBackend(root_dir=".")
)


def storage_response(relative_path: str, *, media_type: str, filename: str | None = None, inline: bool = False) -> Response:
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"}
    if filename:
        disposition = "inline" if inline else "attachment"
        headers["Content-Disposition"] = f"{disposition}; filename*=UTF-8''{quote(filename)}"
    return Response(content=default_storage.read(relative_path), media_type=media_type, headers=headers)
