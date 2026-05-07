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
from src.application.services.job_profiler_service import (
    JobProfilerService,
    build_job_profile_hash,
    job_skill_from_row,
)
from src.application.services.matching_observability_service import (
    MatchingObservabilityService,
)
from src.application.services.match_confidence_service import (
    compute_match_confidence,
)
from src.application.services.resume_profiler_service import ResumeProfilerService
from src.application.services.skill_normalizer_service import (
    candidate_satisfies_job_requirement,
)
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_evaluation_insight import CandidateEvaluationInsight
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.job_profile import JobProfile
from src.infrastructure.ai.factory import AIServiceFactory, UnsupportedAIProviderError
from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
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


def _education_rank(value: object) -> int:
    normalized = _clean_str(value).lower()
    if not normalized:
        return 0
    if normalized in {"doctorate", "phd", "doutorado"}:
        return 5
    if normalized in {"master", "mba", "mestrado", "pos_graduacao", "pos-graduação"}:
        return 4
    if normalized in {"bachelor", "graduation", "graduacao", "graduação"}:
        return 3
    if normalized in {"associate", "tecnologo", "tecnólogo", "technical"}:
        return 2
    if normalized in {"high_school", "ensino_medio", "ensino médio"}:
        return 1
    return 0


def _candidate_skill_set_from_analysis_result(result: AnalysisResultModel) -> set[str]:
    extracted = result.extracted_data if isinstance(result.extracted_data, dict) else {}
    raw_skills = extracted.get("skills") if isinstance(extracted, dict) else []
    skill_names: set[str] = {
        _clean_str(keyword).casefold()
        for keyword in (result.keywords or [])
        if _clean_str(keyword)
    }
    if isinstance(raw_skills, list):
        for item in raw_skills:
            if not isinstance(item, dict):
                continue
            name = _clean_str(item.get("name"))
            if name:
                skill_names.add(name.casefold())
    return skill_names


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
        if await self._should_skip_profiler_ai(job=job, result=result):
            logger.info(
                "matching_engine_profiler_ai_skipped",
                analysis_id=str(analysis.id),
                job_id=str(job.id),
            )
            ai_service = None

        job_profile = await self._ensure_job_profile(job, ai_service)
        candidate_profile = await self._ensure_candidate_profile(
            candidate=candidate,
            resume_version=resume_version,
            analysis=analysis,
            analysis_result=result,
            ai_service=ai_service,
        )
        persisted_job_skills = await self._repository.list_active_job_skill_rows(job.id)
        structured_mandatory_skill_count = sum(
            1
            for row in persisted_job_skills
            if bool(getattr(row.JobRequiredSkillModel, "is_mandatory", False))
            and _clean_str(getattr(row, "skill_name", ""))
        )
        structured_total_skill_count = sum(
            1 for row in persisted_job_skills if _clean_str(getattr(row, "skill_name", ""))
        )
        used_job_skill_fallback = structured_total_skill_count == 0 and bool(
            job_profile.critical_requirements or job_profile.desirable_requirements
        )
        try:
            raw_match_score = float(result.overall_score or 0.0)
        except (TypeError, ValueError):
            raw_match_score = 0.0
        confidence_assessment = compute_match_confidence(
            match_score=raw_match_score,
            structured_mandatory_skill_count=structured_mandatory_skill_count,
            structured_total_skill_count=structured_total_skill_count,
            has_job_seniority=bool(_clean_str(job.seniority_level)),
            has_job_min_experience=job.minimum_years_experience is not None,
            candidate_structured_skill_count=candidate_profile.total_skills_evidenced,
            candidate_has_experience=(
                candidate_profile.estimated_experience_years > 0
                or candidate_profile.total_experiences > 0
            ),
            candidate_has_education=bool(candidate_profile.education),
            used_job_skill_fallback=used_job_skill_fallback,
        )
        adaptive_result = self._build_detached_adaptive_result(
            result,
            job_profile,
            candidate_profile,
            confidence_score=float(confidence_assessment.confidence_score),
            low_confidence_alert=confidence_assessment.low_confidence_alert,
        )
        evaluation_insight = CandidateEvaluationInsight()

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
            bonus_signals=[],
            evaluation_insight=evaluation_insight,
        )

        logger.info(
            "matching_engine_adaptive_result",
            analysis_id=str(analysis.id),
            job_id=str(job.id),
            score_final=float(result_payload.score_final),
            confidence_score=float(result_payload.confidence_score),
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

        skill_rows = await self._repository.list_active_job_skill_rows(job.id)
        linked_skills = [job_skill_from_row(row) for row in skill_rows]
        preferred_model = await self._repository.find_preferred_ai_model()
        provider = preferred_model.provider if preferred_model is not None else "deterministic"
        model_id = preferred_model.model_id if preferred_model is not None else "deterministic"
        prompt_version = "job_profiler_v1"
        signature_hash = build_job_profile_hash(
            title=job.title,
            description=job.description,
            requirements=job.requirements,
            seniority_level=job.seniority_level,
            minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
            minimum_education_level=job.minimum_education_level,
            job_area=job.job_area,
            responsibilities=job.responsibilities,
            experience_context=job.experience_context,
            behavioral_requirements=tuple(job.behavioral_requirements or ()),
            priority=job.priority,
            linked_skills=tuple(linked_skills),
        )
        cached_analysis = await self._repository.find_job_profile_analysis_by_signature(
            job_id=job.id,
            provider=provider,
            model_id=model_id,
            prompt_version=prompt_version,
            job_signature_hash=signature_hash,
        )
        if cached_analysis is None:
            latest_analysis = await self._repository.find_latest_job_profile_analysis_for_job(job.id)
            if latest_analysis is not None and latest_analysis.job_signature_hash == signature_hash:
                cached_analysis = latest_analysis
        if cached_analysis is not None:
            profile = await self._job_profile_from_cached_analysis(cached_analysis, job)
            job.job_profile_json = profile.to_dict()
            job.job_profile_hash = profile.description_hash
            self._session.add(job)
            await self._session.flush()
            return profile

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
            linked_skills=linked_skills,
        )

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

        cached_analysis = await self._repository.find_latest_candidate_profile_analysis_for_resume(
            resume_version.id
        )
        if cached_analysis is not None:
            profile = self._candidate_profile_from_cached_analysis(
                cached_analysis=cached_analysis,
                candidate=candidate,
                analysis=analysis,
                analysis_result=analysis_result,
                resume_version=resume_version,
            )
            resume_version.candidate_profile_json = profile.to_dict()
            resume_version.candidate_profile_hash = profile.resume_hash
            self._session.add(resume_version)
            await self._session.flush()
            return profile

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
            raise ValueError(
                f"Failed to generate candidate profile for resume {resume_version.id}. "
                f"No cached profile available and AI profiler did not succeed."
            )

        resume_version.candidate_profile_json = profile.to_dict()
        resume_version.candidate_profile_hash = profile.resume_hash
        self._session.add(resume_version)
        await self._session.flush()
        return profile

    async def _should_skip_profiler_ai(
        self,
        *,
        job: JobModel,
        result: AnalysisResultModel,
    ) -> bool:
        job_min_education = _education_rank(job.minimum_education_level)
        candidate_education = _education_rank(result.highest_education_level)
        if job_min_education and candidate_education and candidate_education < job_min_education:
            return True

        if (
            job.minimum_years_experience is not None
            and result.total_experience_years is not None
            and float(result.total_experience_years) < float(job.minimum_years_experience)
        ):
            return True

        skill_rows = await self._repository.list_active_job_skill_rows(job.id)
        mandatory_skills = {
            _clean_str(getattr(row, "skill_name", "")).casefold()
            for row in skill_rows
            if bool(getattr(row.JobRequiredSkillModel, "is_mandatory", False))
            and _clean_str(getattr(row, "skill_name", ""))
        }
        if mandatory_skills:
            candidate_skills = _candidate_skill_set_from_analysis_result(result)
            has_overlap = any(
                candidate_satisfies_job_requirement(candidate_skill, mandatory_skill)
                for mandatory_skill in mandatory_skills
                for candidate_skill in candidate_skills
            )
            if not has_overlap:
                return True

        return False

    async def _job_profile_from_cached_analysis(
        self,
        cached_analysis: JobProfileAnalysisModel,
        job: JobModel,
    ) -> JobProfile:
        raw_profile = cached_analysis.raw_response_json or {}
        if isinstance(raw_profile, dict) and raw_profile.get("description_hash"):
            return JobProfile.from_dict(raw_profile)
        raise ValueError(f"Cached job profile analysis lacks description_hash for job {job.id}")

    def _candidate_profile_from_cached_analysis(
        self,
        *,
        cached_analysis: CandidateProfileAnalysisModel,
        candidate: CandidateModel,
        analysis: AnalysisModel,
        analysis_result: AnalysisResultModel,
        resume_version: ResumeVersionModel,
    ) -> CandidateProfile:
        raw_profile = cached_analysis.raw_response_json or {}
        if isinstance(raw_profile, dict):
            nested_profile = raw_profile.get("candidate_profile")
            if isinstance(nested_profile, dict) and nested_profile.get("resume_hash"):
                return CandidateProfile.from_dict(nested_profile)

        raise ValueError(f"Cached candidate profile analysis lacks resume_hash for candidate {candidate.id}")

    @staticmethod
    def _build_detached_adaptive_result(
        result: AnalysisResultModel,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        *,
        confidence_score: float,
        low_confidence_alert: bool = False,
    ) -> AdaptiveScoreResult:
        try:
            raw_score = float(result.overall_score or 0.0)
        except (TypeError, ValueError):
            raw_score = 0.0

        recommendation = "reject"
        if raw_score >= 82:
            recommendation = "strong_match"
        elif raw_score >= 65:
            recommendation = "interview"
        elif raw_score >= 45:
            recommendation = "maybe"

        return AdaptiveScoreResult(
            match_score=raw_score,
            confidence_score=confidence_score,
            recommendation=recommendation,
            score_breakdown={"dimensions": {}},
            strengths=[],
            gaps=[],
            risk_points=["low_confidence_data_quality"] if low_confidence_alert else [],
            critical_coverage=0.0,
            desirable_coverage=0.0,
            area=job_profile.area,
            target_level=job_profile.target_level,
            detected_level=candidate_profile.detected_level,
        )

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
