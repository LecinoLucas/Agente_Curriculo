from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.scoring_comparison_admin_service import (
    ScoringComparisonAdminService,
)
from src.application.services.matching_observability_service import (
    MatchingObservabilityService,
)
from src.domain.entities.user import UserRole
from src.infrastructure.repositories.sqlalchemy_analysis_repository import SQLAlchemyAnalysisRepository


def _to_float(value: Decimal | float | int | None, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


@dataclass(slots=True)
class JobScoreExplanationPayload:
    job_id: UUID
    candidate_id: UUID
    analysis_id: UUID
    score: float
    engine_used: str
    explanation: str
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
            "engine_used": self.engine_used,
            "explanation": self.explanation,
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
        self._comparison_service = ScoringComparisonAdminService(session)
        self._analysis_repo = SQLAlchemyAnalysisRepository(session)
        self._observability_service = MatchingObservabilityService(session)

    async def get(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        role: UserRole,
    ) -> JobScoreExplanationPayload:
        comparison = await self._comparison_service.compare(job_id, candidate_id)
        persisted_match = await self._analysis_repo.find_job_match(comparison.analysis_id, job_id)

        engine_used = "legacy"
        score = comparison.legacy_match_score
        explanation = comparison.explanation

        if persisted_match is not None:
            if persisted_match.weights_source == "adaptive_engine":
                engine_used = "adaptive"
            score = _to_float(persisted_match.match_score, score)
            explanation = (persisted_match.match_summary or "").strip() or explanation
        elif comparison.confidence_score >= 50:
            engine_used = "adaptive"
            score = comparison.adaptive_match_score

        payload = JobScoreExplanationPayload(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=comparison.analysis_id,
            score=score,
            engine_used=engine_used,
            explanation=explanation,
            high_score_reasons=list(comparison.evaluation_insight.why_score_is_high),
            low_score_reasons=list(comparison.evaluation_insight.why_score_is_low),
            overestimation_risks=list(comparison.evaluation_insight.possible_overestimation),
            recommended_questions=list(comparison.evaluation_insight.recommended_interview_questions),
            strongest_evidence=[item.to_dict() for item in comparison.evaluation_insight.top_evidence],
            matched_equivalences=[item.to_dict() for item in comparison.evaluation_insight.equivalent_matches],
            gaps=list(comparison.gaps),
            confidence_score=comparison.confidence_score,
            strengths=list(comparison.strengths),
        )
        await self._observability_service.record_snapshot(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=comparison.analysis_id,
            engine_used=engine_used,
            score=score,
            confidence_score=comparison.confidence_score,
            matched_skills=list(persisted_match.matched_skills or []) if persisted_match is not None else list(comparison.strengths),
            missing_skills=list(persisted_match.missing_skills or []) if persisted_match is not None else list(comparison.gaps),
            equivalences_used=[
                item.requirement
                for item in comparison.evaluation_insight.equivalent_matches
                if item.requirement
            ],
            source="ui",
        )
        feedback_payload = await self._observability_service.get_feedback(
            job_id=job_id,
            candidate_id=candidate_id,
        )
        payload.feedback = feedback_payload.to_dict() if feedback_payload is not None else None
        return self._filter_for_role(payload, role)

    def _filter_for_role(
        self,
        payload: JobScoreExplanationPayload,
        role: UserRole,
    ) -> JobScoreExplanationPayload:
        if role == UserRole.ADMIN:
            return payload

        if role == UserRole.RECRUITER:
            return JobScoreExplanationPayload(
                job_id=payload.job_id,
                candidate_id=payload.candidate_id,
                analysis_id=payload.analysis_id,
                score=payload.score,
                engine_used=payload.engine_used,
                explanation=payload.explanation,
                high_score_reasons=list(payload.high_score_reasons),
                low_score_reasons=list(payload.low_score_reasons),
                overestimation_risks=[],
                recommended_questions=list(payload.recommended_questions),
                strongest_evidence=list(payload.strongest_evidence),
                matched_equivalences=list(payload.matched_equivalences),
                gaps=list(payload.gaps),
                confidence_score=payload.confidence_score,
                strengths=list(payload.strengths),
                feedback=dict(payload.feedback) if payload.feedback else None,
            )

        return JobScoreExplanationPayload(
            job_id=payload.job_id,
            candidate_id=payload.candidate_id,
            analysis_id=payload.analysis_id,
            score=payload.score,
            engine_used=payload.engine_used,
            explanation=self._build_viewer_summary(payload),
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
        score_label = f"{payload.score:.2f}"
        confidence_label = f"{payload.confidence_score:.2f}"
        return (
            f"Score {score_label} calculado pelo motor {payload.engine_used} "
            f"com confiança {confidence_label}. Consulte recrutador ou admin para detalhes auditáveis."
        )
