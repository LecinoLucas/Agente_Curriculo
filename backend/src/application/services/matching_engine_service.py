from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
import structlog

from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.application.services.candidate_evaluation_insight_service import (
    CandidateEvaluationInsightService,
)
from src.application.services.evidence_matcher_service import EvidenceMatcherService
from src.application.services.job_profiler_service import JobProfilerService
from src.application.services.job_profiler_service import job_skill_from_row
from src.application.services.matching_observability_service import (
    MatchingObservabilityService,
)
from src.application.services.resume_profiler_service import ResumeProfilerService
from src.application.services.scoring_comparison_admin_service import (
    ScoringComparisonAdminService,
)
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_evaluation_insight import CandidateEvaluationInsight
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.evidence_mapping import EvidenceMapping
from src.domain.value_objects.job_profile import JobProfile
from src.infrastructure.ai.factory import AIServiceFactory, UnsupportedAIProviderError
from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)

logger = structlog.get_logger(__name__)


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _clean_str(value: object, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


@dataclass(slots=True)
class MatchingEngineResult:
    score_final: Decimal
    confidence_score: Decimal
    technical_competencies: Decimal
    practical_experience: Decimal
    role_fit: Decimal
    seniority_alignment: Decimal
    education: Decimal
    leadership_evidence: Decimal
    behavioral_indicators: list[str]
    risk_points: list[str]
    strengths: list[str]
    gaps: list[str]
    recommendation: str
    explanation: str
    engine_used: str
    score_breakdown: dict[str, Any]
    matched_requirements: list[str]
    missing_requirements: list[str]
    bonus_signals: list[str]
    evaluation_insight: CandidateEvaluationInsight


class MatchingEngineService:
    def __init__(self, repository: SQLAlchemyAnalysisRepository) -> None:
        self._repository = repository
        self._session = repository.session
        self._adaptive_scorer = AdaptiveScorerService()
        self._insight_service = CandidateEvaluationInsightService()
        self._fallback_builder = ScoringComparisonAdminService(self._session)
        self._observability_service = MatchingObservabilityService(self._session)

    async def match_details_to_job(
        self,
        analysis: AnalysisModel,
        result: AnalysisResultModel,
        job_id: UUID,
    ) -> MatchingEngineResult:
        job = await self._repository.find_active_job(job_id)
        if job is None:
            raise ValueError("Job not found for adaptive matching")

        candidate, resume_version = await self._load_candidate_context(analysis.resume_version_id)
        ai_service = await self._resolve_ai_service()

        job_profile = await self._ensure_job_profile(job, ai_service)
        candidate_profile = await self._ensure_candidate_profile(
            candidate=candidate,
            resume_version=resume_version,
            analysis=analysis,
            analysis_result=result,
            ai_service=ai_service,
        )
        evidence_mapping = await self._ensure_evidence_mapping(job_profile, candidate_profile, ai_service)
        adaptive_result = self._adaptive_scorer.score(job_profile, candidate_profile, evidence_mapping)
        evaluation_insight = self._insight_service.build(
            job_profile=job_profile,
            candidate_profile=candidate_profile,
            evidence_mapping=evidence_mapping,
            adaptive_result=adaptive_result,
        )

        dimensions = adaptive_result.score_breakdown.get("dimensions") or {}
        behavioral_indicators = [
            capability.name
            for capability in candidate_profile.capabilities
            if _clean_str(capability.name)
        ]
        explanation = self._build_explanation(adaptive_result, evaluation_insight)

        result_payload = MatchingEngineResult(
            score_final=_decimal(adaptive_result.match_score),
            confidence_score=_decimal(adaptive_result.confidence_score),
            technical_competencies=_decimal(self._dimension_score(dimensions, "technical_competencies")),
            practical_experience=_decimal(self._dimension_score(dimensions, "practical_experience")),
            role_fit=_decimal(self._dimension_score(dimensions, "role_fit")),
            seniority_alignment=_decimal(self._dimension_score(dimensions, "seniority_alignment")),
            education=_decimal(self._dimension_score(dimensions, "education")),
            leadership_evidence=_decimal(self._dimension_score(dimensions, "leadership_evidence")),
            behavioral_indicators=behavioral_indicators,
            risk_points=list(adaptive_result.risk_points),
            strengths=list(adaptive_result.strengths),
            gaps=list(adaptive_result.gaps),
            recommendation=adaptive_result.recommendation,
            explanation=explanation,
            engine_used="adaptive",
            score_breakdown=dict(adaptive_result.score_breakdown or {}),
            matched_requirements=list(evaluation_insight.matched_requirements),
            missing_requirements=list(evaluation_insight.missing_critical_requirements),
            bonus_signals=list(evidence_mapping.candidate_extra_strengths),
            evaluation_insight=evaluation_insight,
        )

        logger.info(
            "matching_engine_adaptive_result",
            analysis_id=str(analysis.id),
            job_id=str(job.id),
            score_final=float(result_payload.score_final),
            recommendation=result_payload.recommendation,
            candidate_profile_hash=candidate_profile.resume_hash,
            job_profile_hash=job_profile.description_hash,
        )
        await self._record_engine_observation(
            candidate_id=candidate.id,
            analysis_id=analysis.id,
            job_id=job.id,
            result_payload=result_payload,
            equivalences_used=[
                item.requirement
                for item in evaluation_insight.equivalent_matches
                if _clean_str(item.requirement)
            ],
        )
        return result_payload

    async def _load_candidate_context(self, resume_version_id: UUID) -> tuple[CandidateModel, ResumeVersionModel]:
        row = await self._session.execute(
            sa.select(CandidateModel, ResumeVersionModel)
            .join(ResumeModel, ResumeModel.candidate_id == CandidateModel.id)
            .join(ResumeVersionModel, ResumeVersionModel.resume_id == ResumeModel.id)
            .where(
                ResumeVersionModel.id == resume_version_id,
                CandidateModel.deleted_at.is_(None),
                ResumeModel.deleted_at.is_(None),
            )
        )
        result = row.first()
        if result is None:
            raise ValueError("Resume version context not found for adaptive matching")
        return result[0], result[1]

    async def _resolve_ai_service(self):
        ai_model = await self._repository.find_preferred_ai_model()
        if ai_model is None:
            return None
        try:
            return AIServiceFactory.create(ai_model.provider, ai_model.model_id)
        except UnsupportedAIProviderError:
            logger.warning(
                "matching_engine_ai_provider_unsupported",
                provider=ai_model.provider,
                model_id=ai_model.model_id,
            )
            return None

    async def _ensure_job_profile(self, job: JobModel, ai_service) -> JobProfile:
        if isinstance(job.job_profile_json, dict) and job.job_profile_json:
            return JobProfile.from_dict(job.job_profile_json)

        skill_rows = await self._fallback_builder._job_repo.list_required_skill_rows(job.id)
        try:
            profile = await JobProfilerService(ai_service=ai_service).generate_profile(
                job.description,
                title=job.title,
                requirements=job.requirements,
                seniority_level=job.seniority_level,
                minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
                minimum_education_level=job.minimum_education_level,
                job_area=job.job_area,
                responsibilities=job.responsibilities,
                experience_context=job.experience_context,
                behavioral_requirements=list(job.behavioral_requirements or []),
                priority=job.priority,
                linked_skills=[job_skill_from_row(row) for row in skill_rows],
            )
        except Exception as exc:
            logger.warning(
                "matching_engine_job_profile_ai_failed",
                job_id=str(job.id),
                error=str(exc),
            )
            profile = await self._fallback_builder._build_job_profile(job)

        job.job_profile_json = profile.to_dict()
        job.job_profile_hash = profile.description_hash
        self._session.add(job)
        await self._session.flush()
        return profile

    async def _ensure_candidate_profile(
        self,
        *,
        candidate: CandidateModel,
        resume_version: ResumeVersionModel,
        analysis: AnalysisModel,
        analysis_result: AnalysisResultModel,
        ai_service,
    ) -> CandidateProfile:
        if isinstance(resume_version.candidate_profile_json, dict) and resume_version.candidate_profile_json:
            return CandidateProfile.from_dict(resume_version.candidate_profile_json)

        profile: CandidateProfile | None = None
        if ai_service is not None and _clean_str(resume_version.extracted_text):
            try:
                profile = await ResumeProfilerService(ai_service=ai_service).generate_profile(
                    resume_version.extracted_text or ""
                )
            except Exception as exc:
                logger.warning(
                    "matching_engine_candidate_profile_ai_failed",
                    analysis_id=str(analysis.id),
                    candidate_id=str(candidate.id),
                    error=str(exc),
                )

        if profile is None:
            latest_summary = {
                "analysis_id": analysis.id,
                "status": "completed",
                "seniority_level": analysis_result.seniority_level,
                "total_experience_years": analysis_result.total_experience_years,
            }
            profile = self._fallback_builder._build_candidate_profile(
                candidate=candidate,
                latest_summary=latest_summary,
                analysis_result=analysis_result,
                resume_version=resume_version,
            )

        resume_version.candidate_profile_json = profile.to_dict()
        resume_version.candidate_profile_hash = profile.resume_hash
        self._session.add(resume_version)
        await self._session.flush()
        return profile

    async def _ensure_evidence_mapping(
        self,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        ai_service,
    ) -> EvidenceMapping:
        if ai_service is not None:
            try:
                return await EvidenceMatcherService(ai_service=ai_service).generate_mapping(
                    job_profile, candidate_profile
                )
            except Exception as exc:
                logger.warning(
                    "matching_engine_evidence_mapping_ai_failed",
                    job_profile_hash=job_profile.description_hash,
                    candidate_profile_hash=candidate_profile.resume_hash,
                    error=str(exc),
                )

        return self._fallback_builder._build_evidence_mapping(job_profile, candidate_profile)

    @staticmethod
    def _dimension_score(dimensions: dict[str, Any], key: str) -> float:
        value = dimensions.get(key) or {}
        try:
            return float(value.get("score", 0.0))
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _build_explanation(
        adaptive_result: AdaptiveScoreResult,
        evaluation_insight: CandidateEvaluationInsight,
    ) -> str:
        parts = [f"Motor adaptativo calculou score {adaptive_result.match_score:.2f}."]
        if evaluation_insight.why_score_is_high:
            parts.append(f"Motivos positivos: {'; '.join(evaluation_insight.why_score_is_high[:2])}.")
        if evaluation_insight.why_score_is_low:
            parts.append(f"Pontos de atenção: {'; '.join(evaluation_insight.why_score_is_low[:2])}.")
        return " ".join(parts)

    async def _record_engine_observation(
        self,
        *,
        candidate_id: UUID,
        analysis_id: UUID,
        job_id: UUID,
        result_payload: MatchingEngineResult,
        equivalences_used: list[str],
    ) -> None:
        try:
            await self._observability_service.record_snapshot(
                job_id=job_id,
                candidate_id=candidate_id,
                analysis_id=analysis_id,
                engine_used=result_payload.engine_used,
                score=result_payload.score_final,
                confidence_score=result_payload.confidence_score,
                matched_skills=list(result_payload.matched_requirements),
                missing_skills=list(result_payload.missing_requirements),
                equivalences_used=equivalences_used,
                source="engine",
            )
        except Exception as exc:
            logger.warning(
                "matching_engine_observation_failed",
                analysis_id=str(analysis_id),
                job_id=str(job_id),
                candidate_id=str(candidate_id),
                error=str(exc),
            )
