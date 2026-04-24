from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class ResumeStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class ExtractionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ResumeVersion:
    id: UUID
    resume_id: UUID
    version_number: int
    s3_bucket: str
    s3_key: str
    original_file_name: str
    file_size_bytes: int
    file_hash_sha256: str
    uploaded_by: UUID
    uploaded_at: datetime
    mime_type: str = "application/pdf"
    s3_etag: Optional[str] = None
    s3_version_id: Optional[str] = None
    extracted_text: Optional[str] = None
    extraction_status: ExtractionStatus = ExtractionStatus.PENDING
    extraction_error: Optional[str] = None
    page_count: Optional[int] = None
    word_count: Optional[int] = None
    language_detected: Optional[str] = None

    @classmethod
    def create(
        cls,
        resume_id: UUID,
        version_number: int,
        s3_bucket: str,
        s3_key: str,
        original_file_name: str,
        file_size_bytes: int,
        file_hash_sha256: str,
        uploaded_by: UUID,
    ) -> "ResumeVersion":
        return cls(
            id=uuid4(),
            resume_id=resume_id,
            version_number=version_number,
            s3_bucket=s3_bucket,
            s3_key=s3_key,
            original_file_name=original_file_name,
            file_size_bytes=file_size_bytes,
            file_hash_sha256=file_hash_sha256,
            uploaded_by=uploaded_by,
            uploaded_at=datetime.now(timezone.utc),
        )


@dataclass
class Resume:
    id: UUID
    candidate_id: UUID
    title: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    status: ResumeStatus = ResumeStatus.ACTIVE
    current_version: int = 1
    deleted_at: Optional[datetime] = None

    @classmethod
    def create(cls, candidate_id: UUID, title: str, created_by: UUID) -> "Resume":
        now = datetime.now(timezone.utc)
        return cls(
            id=uuid4(),
            candidate_id=candidate_id,
            title=title.strip(),
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )

    @property
    def is_active(self) -> bool:
        return self.status == ResumeStatus.ACTIVE and self.deleted_at is None

    def archive(self) -> None:
        self.status = ResumeStatus.ARCHIVED
        self.updated_at = datetime.now(timezone.utc)

    def soft_delete(self) -> None:
        self.status = ResumeStatus.DELETED
        self.deleted_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def increment_version(self) -> None:
        self.current_version += 1
        self.updated_at = datetime.now(timezone.utc)
