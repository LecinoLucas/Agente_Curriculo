from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from src.domain.entities.analysis import AnalysisStatus, SeniorityLevel


@dataclass(frozen=True)
class RequestAnalysisCommand:
    resume_version_id: UUID
    requested_by: UUID
    job_id: Optional[UUID] = None
    force_reanalyze: bool = False       # sobrescreve análise existente completa
    priority: int = 5                   # 1 (mais urgente) a 10 (batch)


@dataclass(frozen=True)
class RequestAnalysisResult:
    analysis_id: UUID
    status: AnalysisStatus
    estimated_wait_seconds: int         # estimativa baseada no tamanho da fila


@dataclass(frozen=True)
class AnalysisStatusResult:
    analysis_id: UUID
    status: AnalysisStatus
    retry_count: int
    started_at: Optional[str]
    completed_at: Optional[str]
    failed_at: Optional[str]
    failure_reason: Optional[str]


@dataclass
class AnalysisResultDetail:
    analysis_id: UUID
    resume_version_id: UUID
    status: AnalysisStatus
    overall_score: Optional[Decimal]
    technical_score: Optional[Decimal]
    experience_score: Optional[Decimal]
    education_score: Optional[Decimal]
    communication_score: Optional[Decimal]
    leadership_score: Optional[Decimal]
    seniority_level: Optional[SeniorityLevel]
    total_experience_years: Optional[Decimal]
    candidate_summary: Optional[str]
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]
    keywords: list[str]
    extracted_data: dict[str, Any]
    score_details: dict[str, Any]
    ai_model_used: str
    prompt_version_used: Optional[str]
    processing_time_ms: Optional[int]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    cache_read_tokens: Optional[int]


@dataclass(frozen=True)
class MatchResumeToJobCommand:
    analysis_id: UUID
    job_id: UUID
    requested_by: UUID


@dataclass
class MatchResumeToJobResult:
    match_id: UUID
    analysis_id: UUID
    job_id: UUID
    match_score: Decimal
    recommendation: str
    matched_skills: list[str]
    missing_mandatory_skills: list[str]
    missing_optional_skills: list[str]
    bonus_skills: list[str]
    match_summary: str
    score_breakdown: dict[str, Any]
    engine_used: str = "legacy"
