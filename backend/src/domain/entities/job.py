from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from src.domain.entities.analysis import SeniorityLevel


class JobStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    PAUSED = "paused"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class WorkModel(str, Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"


@dataclass
class Job:
    id: UUID
    title: str
    description: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    requirements: Optional[str] = None
    responsibilities: Optional[str] = None
    experience_context: Optional[str] = None
    behavioral_requirements: list[str] = field(default_factory=list)
    status: JobStatus = JobStatus.DRAFT
    job_area: Optional[str] = None
    priority: str = "normal"
    seniority_level: Optional[SeniorityLevel] = None
    work_model: Optional[WorkModel] = None
    location: Optional[str] = None
    salary_min: Optional[Decimal] = None
    salary_max: Optional[Decimal] = None
    salary_currency: str = "BRL"
    published_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    @classmethod
    def create(cls, title: str, description: str, created_by: UUID) -> "Job":
        now = datetime.now(timezone.utc)
        return cls(
            id=uuid4(),
            title=title.strip(),
            description=description.strip(),
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )

    @property
    def is_active(self) -> bool:
        return self.status == JobStatus.PUBLISHED and self.deleted_at is None

    def publish(self) -> None:
        self.status = JobStatus.PUBLISHED
        self.published_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def close(self) -> None:
        self.status = JobStatus.CLOSED
        self.closed_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def soft_delete(self) -> None:
        self.deleted_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)
