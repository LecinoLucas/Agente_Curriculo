from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SeniorityLevel(str, Enum):
    INTERN = "intern"
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    LEAD = "lead"
    PRINCIPAL = "principal"
    DIRECTOR = "director"


@dataclass
class AnalysisResult:
    id: UUID
    analysis_id: UUID
    extracted_data: dict[str, Any]
    created_at: datetime
    overall_score: Optional[Decimal] = None
    technical_score: Optional[Decimal] = None
    experience_score: Optional[Decimal] = None
    education_score: Optional[Decimal] = None
    communication_score: Optional[Decimal] = None
    leadership_score: Optional[Decimal] = None
    candidate_summary: Optional[str] = None
    seniority_level: Optional[SeniorityLevel] = None
    total_experience_years: Optional[Decimal] = None
    highest_education_level: Optional[str] = None
    highest_education_field: Optional[str] = None
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cache_read_tokens: Optional[int] = None
    cache_write_tokens: Optional[int] = None
    processing_time_ms: Optional[int] = None
    raw_llm_response: Optional[str] = None
    prompt_version_used: Optional[str] = None


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
    max_retries: int = 3
    next_retry_at: Optional[datetime] = None
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
