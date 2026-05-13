from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from src.domain.entities.analysis import AnalysisStatus


@dataclass(frozen=True)
class RequestAnalysisCommand:
    resume_version_id: UUID
    requested_by: UUID
    job_id: Optional[UUID] = None
    force_reanalyze: bool = False       # sobrescreve análise existente completa
    priority: int = 5                   # 1 (mais urgente) a 10 (batch)
    allow_pending_resume_extraction: bool = False

@dataclass(frozen=True)
class RequestAnalysisResult:
    analysis_id: UUID
    status: AnalysisStatus
    estimated_wait_seconds: int         # estimativa baseada no tamanho da fila
    enqueue_required: bool = True
    created: bool = True
    reused: bool = False
    blocked: bool = False
    stuck: bool = False
    reason: str = "analysis_created"


@dataclass(frozen=True)
class AnalysisStatusResult:
    analysis_id: UUID
    status: AnalysisStatus
    retry_count: int
    started_at: Optional[str]
    completed_at: Optional[str]
    failed_at: Optional[str]
    failure_reason: Optional[str]
