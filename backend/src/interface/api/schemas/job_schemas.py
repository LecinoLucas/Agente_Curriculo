from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator

from src.interface.api.schemas.common import APISchemaModel, ORMAPISchemaModel

JOB_PRIORITY = Literal["low", "normal", "high", "urgent"]
SELECTION_FLOW_TYPE = Literal["simple", "standard", "technical", "leadership"]

SELECTION_FLOW_DEFAULTS: dict[str, dict[str, bool]] = {
    "simple": {
        "requires_behavioral_assessment": False,
        "requires_behavioral_ai_evaluation": False,
        "requires_interview": False,
        "requires_scorecard": False,
        "requires_manager_review": False,
    },
    "standard": {
        "requires_behavioral_assessment": True,
        "requires_behavioral_ai_evaluation": True,
        "requires_interview": True,
        "requires_scorecard": True,
        "requires_manager_review": False,
    },
    "technical": {
        "requires_behavioral_assessment": False,
        "requires_behavioral_ai_evaluation": False,
        "requires_interview": True,
        "requires_scorecard": True,
        "requires_manager_review": True,
    },
    "leadership": {
        "requires_behavioral_assessment": True,
        "requires_behavioral_ai_evaluation": True,
        "requires_interview": True,
        "requires_scorecard": True,
        "requires_manager_review": True,
    },
}

DEAL_BREAKER_FIELDS = Literal[
    "location",
    "work_model",
    "education_level",
    "experience_years",
    "skill",
    "language",
    "availability",
    "custom_text",
]

def normalize_job_area_value(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = " ".join(str(value).strip().split())

    if not cleaned:
        return None
    return cleaned


class DealBreaker(BaseModel):
    field: DEAL_BREAKER_FIELDS = Field(description="Type of field to evaluate")
    operator: Literal["equals", "not_equals", "contains", "not_contains", "in", ">=", "<="] = "equals"
    value: str | None = Field(default=None, description="Single value for operators like equals, contains, >=, <=")
    values: list[str] | None = Field(default=None, description="Multiple values for 'in' operator")
    reason: str = Field(min_length=1, max_length=500, description="Why this is a deal-breaker")
    is_active: bool = True

    @field_validator("operator", mode="after")
    @classmethod
    def validate_operator_for_field(cls, operator, info):
        if "field" not in info.data:
            return operator

        field_type = info.data.get("field")
        allowed_ops = {
            "location": {"equals", "not_equals", "contains", "in"},
            "work_model": {"equals", "not_equals"},
            "education_level": {"equals", ">="},
            "experience_years": {">=", "<=", "equals"},
            "skill": {"contains", "not_contains"},
            "language": {"equals", "contains"},
            "availability": {"equals"},
            "custom_text": {"contains"},
        }

        if field_type in allowed_ops and operator not in allowed_ops[field_type]:
            raise ValueError(
                f"Operator '{operator}' not allowed for field '{field_type}'. "
                f"Allowed: {', '.join(sorted(allowed_ops[field_type]))}"
            )

        return operator

    @field_validator("value")
    @classmethod
    def validate_value_for_operator(cls, value, info):
        operator = info.data.get("operator")

        if operator == "in":
            return value

        if operator != "in" and not value:
            raise ValueError(f"Operator '{operator}' requires 'value' field")

        return value


class JobResponse(ORMAPISchemaModel):
    id: UUID
    title: str
    description: str
    requirements: str | None = None
    status: str
    seniority_level: str | None = None
    minimum_education_level: str | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] = Field(default_factory=list)
    work_model: str | None = None
    location: str | None = None
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str
    job_area: str | None = None
    responsibilities: str | None = None
    experience_context: str | None = None
    behavioral_requirements: list[str] = Field(default_factory=list)
    priority: JOB_PRIORITY
    quality_score: int | None = None
    quality_status: Literal["weak", "acceptable", "good"] | None = None
    skill_requirements: dict[str, list[str]] | None = None
    behavioral_template_id: UUID | None = None
    selection_flow_type: SELECTION_FLOW_TYPE
    requires_behavioral_assessment: bool
    requires_behavioral_ai_evaluation: bool
    requires_interview: bool
    requires_scorecard: bool
    requires_manager_review: bool
    created_by: UUID
    archived_at: datetime | None = None
    archived_by: UUID | None = None
    archive_reason: str | None = None
    archive_reason_note: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("job_area", mode="before")
    @classmethod
    def normalize_job_area(cls, value):
        return normalize_job_area_value(value)


class JobStatusSummaryResponse(BaseModel):
    all: int = 0
    published: int = 0
    draft: int = 0
    paused: int = 0
    closed: int = 0
    cancelled: int = 0
    archived: int = 0
    attention: int = 0


class JobListResponse(BaseModel):
    data: list[JobResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: JobStatusSummaryResponse


class CreateJobRequest(APISchemaModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10)
    requirements: str | None = None
    status: Literal["draft", "published", "paused", "closed", "cancelled", "archived"] = "draft"
    seniority_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_education_level: Literal["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"] | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] = Field(default_factory=list)
    work_model: Literal["remote", "hybrid", "onsite"] | None = None
    location: str | None = Field(default=None, max_length=255)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str = Field(default="BRL", min_length=3, max_length=10)
    job_area: str | None = None
    responsibilities: str | None = None
    experience_context: str | None = None
    behavioral_requirements: list[str] = Field(default_factory=list)
    priority: JOB_PRIORITY = "normal"
    skill_requirements: dict[str, list[str]] | None = None
    selection_flow_type: SELECTION_FLOW_TYPE | None = None
    requires_behavioral_assessment: bool | None = None
    requires_behavioral_ai_evaluation: bool | None = None
    requires_interview: bool | None = None
    requires_scorecard: bool | None = None
    requires_manager_review: bool | None = None

    @model_validator(mode="after")
    def apply_flow_defaults(self) -> Self:
        flow = self.selection_flow_type or "standard"
        self.selection_flow_type = flow
        defaults = SELECTION_FLOW_DEFAULTS[flow]
        for field, default in defaults.items():
            if getattr(self, field) is None:
                setattr(self, field, default)
        return self

    @field_validator("job_area", mode="before")
    @classmethod
    def normalize_job_area_create(cls, value):
        return normalize_job_area_value(value)

    @field_validator("behavioral_requirements")
    @classmethod
    def normalize_behavioral_requirements(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()

        for value in values or []:
            cleaned = str(value).strip()
            key = cleaned.casefold()

            if not cleaned or key in seen:
                continue

            seen.add(key)
            normalized.append(cleaned)

        return normalized


class UpdateJobRequest(APISchemaModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, min_length=10)
    requirements: str | None = None
    status: Literal["draft", "published", "paused", "closed", "cancelled", "archived"] | None = None
    seniority_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_education_level: Literal["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"] | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] | None = None
    work_model: Literal["remote", "hybrid", "onsite"] | None = None
    location: str | None = Field(default=None, max_length=255)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str | None = Field(default=None, min_length=3, max_length=10)
    job_area: str | None = None
    responsibilities: str | None = None
    experience_context: str | None = None
    behavioral_requirements: list[str] | None = None
    priority: JOB_PRIORITY | None = None
    skill_requirements: dict[str, list[str]] | None = None
    selection_flow_type: SELECTION_FLOW_TYPE | None = None
    requires_behavioral_assessment: bool | None = None
    requires_behavioral_ai_evaluation: bool | None = None
    requires_interview: bool | None = None
    requires_scorecard: bool | None = None
    requires_manager_review: bool | None = None

    @field_validator("job_area", mode="before")
    @classmethod
    def normalize_job_area_update(cls, value):
        return normalize_job_area_value(value)

    @field_validator("behavioral_requirements")
    @classmethod
    def normalize_optional_behavioral_requirements(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None

        normalized: list[str] = []
        seen: set[str] = set()

        for value in values:
            cleaned = str(value).strip()
            key = cleaned.casefold()

            if not cleaned or key in seen:
                continue

            seen.add(key)
            normalized.append(cleaned)

        return normalized


class ArchiveJobRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=1000)


class ScoreExplanationEvidenceResponse(BaseModel):
    requirement: str
    requirement_type: str
    match_status: str
    match_type: str
    evidence_quotes: list[str]
    evidence_strength: str
    confidence: str
    score_hint: float
    explanation: str


class MatchingFeedbackRequest(BaseModel):
    liked: bool | None = None
    rejected: bool | None = None
    hired: bool | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None

    @field_validator("hired")
    @classmethod
    def validate_hired_and_rejected(cls, hired: bool | None, info):
        rejected = info.data.get("rejected")

        if hired and rejected:
            raise ValueError("Feedback não pode marcar contratado e rejeitado ao mesmo tempo")

        return hired


class MatchingFeedbackResponse(BaseModel):
    job_id: UUID
    candidate_id: UUID
    liked: bool | None = None
    rejected: bool | None = None
    hired: bool | None = None
    comment: str | None = None
    feedback_by: UUID | None = None
    feedback_at: datetime | None = None


class CandidateScoreExplanationBreakdownItemResponse(BaseModel):
    score: float
    weight: float
    contribution: float


class CandidateScoreExplanationBreakdownResponse(BaseModel):
    priority: CandidateScoreExplanationBreakdownItemResponse | None = None
    complementary: CandidateScoreExplanationBreakdownItemResponse | None = None
    eliminatory: CandidateScoreExplanationBreakdownItemResponse | None = None
    experience: CandidateScoreExplanationBreakdownItemResponse | None = None
    seniority: CandidateScoreExplanationBreakdownItemResponse | None = None
    ai_adjustment: CandidateScoreExplanationBreakdownItemResponse | None = None


class SkillPartialMatchResponse(BaseModel):
    required: str
    candidate: str
    score: float
    reason: str
    source: str = "partial_match"


class CandidateScoreExplanationFactorSummaryItemResponse(BaseModel):
    factor_type: str
    factor_key: str
    factor_label: str
    impact_score: float
    direction: Literal["positive", "negative", "neutral"]


class CandidateScoreExplanationFactorSummaryResponse(BaseModel):
    positive: list[CandidateScoreExplanationFactorSummaryItemResponse] = Field(default_factory=list)
    negative: list[CandidateScoreExplanationFactorSummaryItemResponse] = Field(default_factory=list)
    contextual: list[CandidateScoreExplanationFactorSummaryItemResponse] = Field(default_factory=list)


class CandidateScoreExplanationDeltaChangeResponse(BaseModel):
    factor_type: str
    factor_key: str
    factor_label: str
    previous_impact_score: float
    current_impact_score: float
    impact_delta: float
    change_kind: Literal["added", "removed", "changed"]


class CandidateScoreExplanationDeltaResponse(BaseModel):
    previous_score: float | None = None
    current_score: float | None = None
    score_change: float | None = None
    change_reason: Literal[
        "candidate_analysis_changed",
        "job_requirements_changed",
        "score_model_changed",
        "manual_recompute_same_inputs",
    ] | None = None
    top_changes: list[CandidateScoreExplanationDeltaChangeResponse] = Field(default_factory=list)


class CandidateScoreExplanationResponse(BaseModel):
    job_id: UUID
    candidate_id: UUID
    analysis_id: UUID | None = None
    job_fit_score: float
    ranking_freshness_status: Literal["fresh", "stale"]
    score_model_version: str | None = None
    explainability_version: str | None = None
    computed_at: datetime | None = None
    recommendation: str
    engine_used: str
    ranking_summary_text: str
    breakdown: CandidateScoreExplanationBreakdownResponse = Field(default_factory=CandidateScoreExplanationBreakdownResponse)
    score_factors: CandidateScoreExplanationFactorSummaryResponse = Field(default_factory=CandidateScoreExplanationFactorSummaryResponse)
    delta: CandidateScoreExplanationDeltaResponse | None = None
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    high_score_reasons: list[str] = Field(default_factory=list)
    low_score_reasons: list[str] = Field(default_factory=list)
    overestimation_risks: list[str] = Field(default_factory=list)
    recommended_questions: list[str] = Field(default_factory=list)
    strongest_evidence: list[ScoreExplanationEvidenceResponse] = Field(default_factory=list)
    matched_equivalences: list[ScoreExplanationEvidenceResponse] = Field(default_factory=list)
    partial_matches: list[SkillPartialMatchResponse] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    data_confidence_score: float
    strengths: list[str] = Field(default_factory=list)
    feedback: MatchingFeedbackResponse | None = None


class JobQualityResponse(BaseModel):
    job_id: UUID | None = None
    quality_score: int = Field(ge=0, le=100)
    status: Literal["weak", "acceptable", "good"]
    can_publish: bool
    publication_blockers: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)


class BulkImportJobSkillRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    priority_level: Literal["priority", "complementary", "eliminatory"] = "complementary"
    minimum_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_years: Decimal | None = Field(default=None, ge=0, le=80)
    weight: Decimal = Field(default=Decimal("1.00"), ge=0, le=10)


class BulkImportJobItemRequest(APISchemaModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    requirements: str | None = None
    status: Literal["draft", "published", "paused", "closed", "cancelled"] = "draft"
    seniority_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_education_level: Literal["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"] | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] = Field(default_factory=list)
    work_model: Literal["remote", "hybrid", "onsite"] | None = None
    location: str | None = Field(default=None, max_length=255)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str = Field(default="BRL", min_length=3, max_length=10)
    job_area: str | None = None
    responsibilities: str | None = None
    experience_context: str | None = None
    behavioral_requirements: list[str] = Field(default_factory=list)
    priority: JOB_PRIORITY = "normal"
    skills: list[BulkImportJobSkillRequest] = Field(default_factory=list)

    @field_validator("job_area", mode="before")
    @classmethod
    def normalize_job_area_bulk_import(cls, value):
        return normalize_job_area_value(value)

    @field_validator("behavioral_requirements")
    @classmethod
    def normalize_bulk_behavioral_requirements(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()

        for value in values or []:
            cleaned = str(value).strip()
            key = cleaned.casefold()

            if not cleaned or key in seen:
                continue

            seen.add(key)
            normalized.append(cleaned)

        return normalized


class BulkImportOptionsRequest(BaseModel):
    dry_run: bool = False
    skip_duplicates: bool = True
    default_status: Literal["draft", "published", "paused", "closed", "cancelled"] = "draft"


class BulkImportJobsRequest(BaseModel):
    jobs: list[BulkImportJobItemRequest] = Field(default_factory=list, min_length=1)
    options: BulkImportOptionsRequest = Field(default_factory=BulkImportOptionsRequest)


class BulkImportJobResultResponse(BaseModel):
    title: str
    status: Literal["created", "skipped", "failed"]
    job_id: UUID | None = None
    quality_score: int | None = None
    quality_status: Literal["weak", "acceptable", "good"] | None = None
    resolved_skills: list[str] = Field(default_factory=list)
    unresolved_skills: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class BulkImportJobsResponse(BaseModel):
    total: int
    created: int
    skipped: int
    failed: int
    results: list[BulkImportJobResultResponse] = Field(default_factory=list)


class BulkUpdateMatchKeyRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    job_area: str | None = None
    location: str | None = Field(default=None, max_length=255)

    @field_validator("job_area", mode="before")
    @classmethod
    def normalize_job_area_match_key(cls, value):
        return normalize_job_area_value(value)


class BulkUpdateJobDataRequest(APISchemaModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, min_length=10)
    requirements: str | None = None
    status: Literal["draft", "published", "paused", "closed", "cancelled"] | None = None
    seniority_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_education_level: Literal["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"] | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] | None = None
    work_model: Literal["remote", "hybrid", "onsite"] | None = None
    location: str | None = Field(default=None, max_length=255)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str | None = Field(default=None, min_length=3, max_length=10)
    job_area: str | None = None
    responsibilities: str | None = None
    experience_context: str | None = None
    behavioral_requirements: list[str] | None = None
    priority: JOB_PRIORITY | None = None
    skills: list[BulkImportJobSkillRequest] | None = None

    @field_validator("job_area", mode="before")
    @classmethod
    def normalize_job_area_bulk_update(cls, value):
        return normalize_job_area_value(value)

    @field_validator("behavioral_requirements")
    @classmethod
    def normalize_bulk_update_behavioral_requirements(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None

        normalized: list[str] = []
        seen: set[str] = set()

        for value in values:
            cleaned = str(value).strip()
            key = cleaned.casefold()

            if not cleaned or key in seen:
                continue

            seen.add(key)
            normalized.append(cleaned)

        return normalized


class BulkUpdateJobItemRequest(BaseModel):
    job_id: UUID | None = None
    match_key: BulkUpdateMatchKeyRequest | None = None
    data: BulkUpdateJobDataRequest


class BulkUpdateJobsRequest(BaseModel):
    jobs: list[BulkUpdateJobItemRequest] = Field(default_factory=list, min_length=1)


class BulkUpdateJobResultResponse(BaseModel):
    job_id: UUID | None = None
    status: Literal["updated", "failed"]
    resolved_skills: list[str] = Field(default_factory=list)
    unresolved_skills: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class BulkUpdateJobsResponse(BaseModel):
    total: int
    updated: int
    failed: int
    results: list[BulkUpdateJobResultResponse] = Field(default_factory=list)


class AddCandidateToJobRequest(BaseModel):
    candidate_id: UUID
    source: Literal["manual", "pipeline", "ai_match", "import"] = "manual"


class RemoveCandidateFromJobResponse(BaseModel):
    success: bool
    message: str
