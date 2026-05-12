from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    RETRY_SCHEDULED = "retry_scheduled"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    DISCARDED = "discarded"


class SeniorityLevel(str, Enum):
    INTERN = "intern"
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    LEAD = "lead"
    PRINCIPAL = "principal"
    DIRECTOR = "director"


@dataclass
class Analysis:
    id: UUID
    resume_version_id: UUID
    ai_model_id: UUID
    prompt_template_id: UUID
    requested_by: UUID
    created_at: datetime
    updated_at: datetime
    job_id: Optional[UUID] = None
    status: AnalysisStatus = AnalysisStatus.PENDING
    priority: int = 5
    idempotency_key: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 4
    attempts: int = 0
    next_retry_at: Optional[datetime] = None
    provider_error_type: Optional[str] = None
    provider_status_code: Optional[int] = None
    queue_name: str = "analysis"
    worker_id: Optional[str] = None
    task_id: Optional[str] = None

    @classmethod
    def create(
        cls,
        resume_version_id: UUID,
        ai_model_id: UUID,
        prompt_template_id: UUID,
        requested_by: UUID,
        job_id: Optional[UUID] = None,
        idempotency_key: Optional[str] = None,
        priority: int = 5,
    ) -> "Analysis":
        now = datetime.now(timezone.utc)
        return cls(
            id=uuid4(),
            resume_version_id=resume_version_id,
            ai_model_id=ai_model_id,
            prompt_template_id=prompt_template_id,
            requested_by=requested_by,
            job_id=job_id,
            idempotency_key=idempotency_key,
            priority=priority,
            created_at=now,
            updated_at=now,
        )

    def mark_processing(self, worker_id: str, task_id: str) -> None:
        self.status = AnalysisStatus.PROCESSING
        self.worker_id = worker_id
        self.task_id = task_id
        self.started_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def mark_completed(self) -> None:
        self.status = AnalysisStatus.COMPLETED
        self.completed_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def mark_failed(self, reason: str) -> None:
        self.status = AnalysisStatus.FAILED
        self.failure_reason = reason
        self.failed_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    @property
    def can_retry(self) -> bool:
        return self.retry_count < self.max_retries
