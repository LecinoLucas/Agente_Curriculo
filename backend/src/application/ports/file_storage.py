from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class PresignedUploadURL:
    url: str
    fields: dict[str, str]   # campos para multipart POST direto ao S3
    s3_key: str
    expires_in_seconds: int


@dataclass
class PresignedDownloadURL:
    url: str
    expires_in_seconds: int


class FileStorageService(ABC):
    @abstractmethod
    async def generate_upload_url(
        self, s3_key: str, content_type: str = "application/pdf"
    ) -> PresignedUploadURL: ...

    @abstractmethod
    async def generate_download_url(self, s3_key: str) -> PresignedDownloadURL: ...

    @abstractmethod
    async def delete(self, s3_key: str) -> None: ...

    @abstractmethod
    async def file_exists(self, s3_key: str) -> bool: ...
