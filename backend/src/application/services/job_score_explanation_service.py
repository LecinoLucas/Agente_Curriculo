from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.canonical_match_explanation_service import (
    MatchExplanationResult,
    build_match_explanation,
)
from src.application.services.match_confidence_service import (
    compute_match_confidence,
)
from src.application.services.matching_observability_service import (
    MatchingObservabilityService,
)
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import SQLAlchemyAnalysisRepository
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository


class CandidateNotLinkedToJobError(Exception):
    """Raised when candidate is not linked to the job."""


class CandidateScoreExplanationNotReadyError(Exception):
    """Raised when the canonical score explanation cannot be built yet."""


@dataclass(slots=True)
class JobScoreExplanationPayload:
    job_id: UUID
    candidate_id: UUID
    analysis_id: UUID
    score: float
    final_score: float
    recommendation: str
    engine_used: str
    explanation: str
    breakdown: dict[str, Any]
    highlights: list[str]
    risks: list[str]
    high_score_reasons: list[str]
    low_score_reasons: list[str]
    overestimation_risks: list[str]
    recommended_questions: list[str]
    strongest_evidence: list[dict[str, Any]]
    matched_equivalences: list[dict[str, Any]]
    gaps: list[str]
    confidence_score: float
    strengths: list[str]
    feedback: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "candidate_id": self.candidate_id,
            "analysis_id": self.analysis_id,
            "score": self.score,
            "final_score": self.final_score,
            "recommendation": self.recommendation,
            "engine_used": self.engine_used,
            "explanation": self.explanation,
            "breakdown": dict(self.breakdown),
            "highlights": list(self.highlights),
            "risks": list(self.risks),
            "high_score_reasons": list(self.high_score_reasons),
            "low_score_reasons": list(self.low_score_reasons),
            "overestimation_risks": list(self.overestimation_risks),
            "recommended_questions": list(self.recommended_questions),
            "strongest_evidence": list(self.strongest_evidence),
            "matched_equivalences": list(self.matched_equivalences),
            "gaps": list(self.gaps),
            "confidence_score": self.confidence_score,
            "strengths": list(self.strengths),
            "feedback": dict(self.feedback) if self.feedback else None,
        }


class JobScoreExplanationService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._analysis_repo = SQLAlchemyAnalysisRepository(session)
        self._observability_service = MatchingObservabilityService(session)
        self._pipeline_repo = SQLAlchemyPipelineRepository(session)

    async def get(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        role: UserRole,
    ) -> JobScoreExplanationPayload:
        active_entry = await self._pipeline_repo.find_active_entry(candidate_id, job_id)
        if active_entry is None:
            raise CandidateNotLinkedToJobError(
                f"Candidate {candidate_id} is not linked to job {job_id}"
            )

        persisted_match = await self._analysis_repo.find_candidate_job_match_for_candidate_job(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        if persisted_match is None:
            raise CandidateScoreExplanationNotReadyError(
                "O score contextual desta vaga ainda não foi persistido."
            )

        analysis = await self._analysis_repo.find_latest_completed_for_version(
            persisted_match.resume_version_id,
            job_id,
        )
        if analysis is None:
            raise CandidateScoreExplanationNotReadyError(
                "Não há análise concluída para explicar este score."
            )

        result = await self._analysis_repo.find_result(analysis.id)
        if result is None:
            raise CandidateScoreExplanationNotReadyError(
                "O resultado da análise ainda não está disponível."
            )

        job = await self._analysis_repo.find_active_job(job_id)
        if job is None:
            raise CandidateScoreExplanationNotReadyError(
                "A vaga não está disponível para explicar este score."
            )

        job_skill_rows = await self._analysis_repo.list_active_job_skill_rows(job_id)
        structured_job_skill_rows = list(job_skill_rows)
        used_job_skill_fallback = False
        if not job_skill_rows:
            job_profile_analysis = await self._session.get(
                JobProfileAnalysisModel,
                persisted_match.job_profile_analysis_id,
            )
            if job_profile_analysis is not None:
                job_skill_rows = self._fallback_skill_rows(job_profile_analysis)
                used_job_skill_fallback = bool(job_skill_rows)

        candidate_profile_analysis = await self._session.get(
            CandidateProfileAnalysisModel,
            persisted_match.candidate_profile_analysis_id,
        )

        explanation = build_match_explanation(
            job=job,
            analysis_result=result,
            job_skill_rows=job_skill_rows,
            final_score=persisted_match.match_score,
            recommendation=persisted_match.recommendation,
            matched_skills=list(persisted_match.matched_skills_json or []),
            missing_skills=list(persisted_match.missing_skills_json or []),
        )
        confidence_assessment = compute_match_confidence(
            match_score=persisted_match.match_score,
            structured_mandatory_skill_count=sum(
                1
                for row in structured_job_skill_rows
                if getattr(row.JobRequiredSkillModel, "is_mandatory", False)
                and str(row.skill_name).strip()
            ),
            structured_total_skill_count=sum(
                1 for row in structured_job_skill_rows if str(row.skill_name).strip()
            ),
            has_job_seniority=bool(getattr(job, "seniority_level", None)),
            has_job_min_experience=getattr(job, "minimum_years_experience", None) is not None,
            candidate_structured_skill_count=sum(
                1
                for skill in ((candidate_profile_analysis.skills_json or []) if candidate_profile_analysis else [])
                if str(skill).strip()
            ),
            candidate_has_experience=bool(
                candidate_profile_analysis is not None
                and candidate_profile_analysis.experience_years is not None
            ),
            candidate_has_education=bool(
                candidate_profile_analysis is not None
                and str(candidate_profile_analysis.education_level or "").strip().lower()
                not in {"", "none", "unknown", "undefined"}
            ),
            used_job_skill_fallback=used_job_skill_fallback,
        )
        combined_risks = list(explanation.risks)
        for item in confidence_assessment.overestimation_risks:
            if item not in combined_risks:
                combined_risks.append(item)

        payload = JobScoreExplanationPayload(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis.id,
            score=float(explanation.final_score),
            final_score=float(explanation.final_score),
            recommendation=explanation.recommendation,
            engine_used="canonical",
            explanation=explanation.explanation,
            breakdown=explanation.to_dict()["breakdown"],
            highlights=list(explanation.highlights),
            risks=combined_risks,
            high_score_reasons=list(explanation.highlights),
            low_score_reasons=combined_risks,
            overestimation_risks=list(confidence_assessment.overestimation_risks),
            recommended_questions=[],
            strongest_evidence=[],
            matched_equivalences=[],
            gaps=list(explanation.missing_skills),
            confidence_score=float(confidence_assessment.confidence_score),
            strengths=list(explanation.matched_skills),
        )

        await self._observability_service.record_snapshot(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis.id,
            engine_used=payload.engine_used,
            score=payload.final_score,
            confidence_score=payload.confidence_score,
            matched_skills=list(explanation.matched_skills),
            missing_skills=list(explanation.missing_skills),
            equivalences_used=[],
            source="ui",
        )
        feedback_payload = await self._observability_service.get_feedback(
            job_id=job_id,
            candidate_id=candidate_id,
        )
        payload.feedback = (
            feedback_payload.to_dict() if feedback_payload is not None else None
        )
        return self._filter_for_role(payload, role)

    def _filter_for_role(
        self,
        payload: JobScoreExplanationPayload,
        role: UserRole,
    ) -> JobScoreExplanationPayload:
        if role in {UserRole.ADMIN, UserRole.RECRUITER}:
            return payload

        return JobScoreExplanationPayload(
            job_id=payload.job_id,
            candidate_id=payload.candidate_id,
            analysis_id=payload.analysis_id,
            score=payload.score,
            final_score=payload.final_score,
            recommendation=payload.recommendation,
            engine_used=payload.engine_used,
            explanation=self._build_viewer_summary(payload),
            breakdown={},
            highlights=[],
            risks=[],
            high_score_reasons=[],
            low_score_reasons=[],
            overestimation_risks=[],
            recommended_questions=[],
            strongest_evidence=[],
            matched_equivalences=[],
            gaps=[],
            confidence_score=payload.confidence_score,
            strengths=[],
            feedback=None,
        )

    @staticmethod
    def _build_viewer_summary(payload: JobScoreExplanationPayload) -> str:
        score_label = f"{payload.final_score:.2f}"
        return (
            f"Score {score_label} calculado pelo motor canônico com recommendation "
            f"{payload.recommendation}. Consulte recrutador ou admin para o detalhamento."
        )

    @staticmethod
    def _fallback_skill_rows(job_profile_analysis: JobProfileAnalysisModel) -> list[SimpleNamespace]:
        rows: list[SimpleNamespace] = []
        for skill_name in job_profile_analysis.required_skills_json or []:
            rows.append(
                SimpleNamespace(
                    skill_name=skill_name,
                    skill_aliases=[],
                    JobRequiredSkillModel=SimpleNamespace(is_mandatory=True),
                )
            )
        for skill_name in job_profile_analysis.nice_to_have_skills_json or []:
            rows.append(
                SimpleNamespace(
                    skill_name=skill_name,
                    skill_aliases=[],
                    JobRequiredSkillModel=SimpleNamespace(is_mandatory=False),
                )
            )
        return rows
