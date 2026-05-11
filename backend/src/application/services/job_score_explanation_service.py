from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_ranking_service import (
    _empty_delta_summary,
    _render_score_explanation,
    _summarize_score_factors,
)
from src.application.services.matching_observability_service import (
    MatchingObservabilityService,
)
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
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
    analysis_id: UUID | None
    job_fit_score: float
    ranking_freshness_status: str
    score_model_version: str | None
    explainability_version: str | None
    computed_at: Any | None
    recommendation: str
    engine_used: str
    ranking_summary_text: str
    breakdown: dict[str, Any]
    score_factors: dict[str, Any]
    delta: dict[str, Any] | None
    highlights: list[str]
    risks: list[str]
    high_score_reasons: list[str]
    low_score_reasons: list[str]
    overestimation_risks: list[str]
    recommended_questions: list[str]
    strongest_evidence: list[dict[str, Any]]
    matched_equivalences: list[dict[str, Any]]
    gaps: list[str]
    data_confidence_score: float
    strengths: list[str]
    partial_matches: list[dict[str, Any]] | None = None
    feedback: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "candidate_id": self.candidate_id,
            "analysis_id": self.analysis_id,
            "job_fit_score": self.job_fit_score,
            "ranking_freshness_status": self.ranking_freshness_status,
            "score_model_version": self.score_model_version,
            "explainability_version": self.explainability_version,
            "computed_at": self.computed_at,
            "recommendation": self.recommendation,
            "engine_used": self.engine_used,
            "ranking_summary_text": self.ranking_summary_text,
            "breakdown": dict(self.breakdown),
            "score_factors": dict(self.score_factors),
            "delta": dict(self.delta) if self.delta else None,
            "highlights": list(self.highlights),
            "risks": list(self.risks),
            "high_score_reasons": list(self.high_score_reasons),
            "low_score_reasons": list(self.low_score_reasons),
            "overestimation_risks": list(self.overestimation_risks),
            "recommended_questions": list(self.recommended_questions),
            "strongest_evidence": list(self.strongest_evidence),
            "matched_equivalences": list(self.matched_equivalences),
            "gaps": list(self.gaps),
            "data_confidence_score": self.data_confidence_score,
            "strengths": list(self.strengths),
            "partial_matches": list(self.partial_matches) if self.partial_matches else [],
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
        analysis_id = await self._resolve_analysis_id(job_id=job_id, persisted_match=persisted_match)

        persisted_payload = await self._build_persisted_payload(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis_id,
            persisted_match=persisted_match,
        )
        if persisted_payload is not None:
            await self._observability_service.record_snapshot(
                job_id=job_id,
                candidate_id=candidate_id,
                analysis_id=persisted_payload.analysis_id,
                engine_used=persisted_payload.engine_used,
                score=persisted_payload.job_fit_score,
                confidence_score=persisted_payload.data_confidence_score,
                matched_skills=list(getattr(persisted_match, "matched_skills_json", None) or []),
                missing_skills=list(getattr(persisted_match, "missing_skills_json", None) or []),
                equivalences_used=list(persisted_payload.partial_matches or []),
                source="ui",
            )
            feedback_payload = await self._observability_service.get_feedback(
                job_id=job_id,
                candidate_id=candidate_id,
            )
            persisted_payload.feedback = (
                feedback_payload.to_dict() if feedback_payload is not None else None
            )
            return self._filter_for_role(persisted_payload, role)
        raise CandidateScoreExplanationNotReadyError(
            "O score oficial desta vaga ainda não foi persistido."
        )

    async def _resolve_analysis_id(
        self,
        *,
        job_id: UUID,
        persisted_match: Any | None,
    ) -> UUID | None:
        if persisted_match is None:
            return None

        resume_version_id = getattr(persisted_match, "resume_version_id", None)
        if resume_version_id is None:
            return None

        analysis = await self._analysis_repo.find_latest_completed_for_version(
            resume_version_id,
            job_id,
        )
        if analysis is None:
            return None

        return analysis.id

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
            job_fit_score=payload.job_fit_score,
            ranking_freshness_status=payload.ranking_freshness_status,
            score_model_version=payload.score_model_version,
            explainability_version=payload.explainability_version,
            computed_at=payload.computed_at,
            recommendation=payload.recommendation,
            engine_used=payload.engine_used,
            ranking_summary_text=self._build_viewer_summary(payload),
            breakdown={},
            score_factors={"positive": [], "negative": [], "contextual": []},
            delta=None,
            highlights=[],
            risks=[],
            high_score_reasons=[],
            low_score_reasons=[],
            overestimation_risks=[],
            recommended_questions=[],
            strongest_evidence=[],
            matched_equivalences=[],
            gaps=[],
            data_confidence_score=payload.data_confidence_score,
            strengths=[],
            partial_matches=[],
            feedback=None,
        )

    async def _build_persisted_payload(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        analysis_id: UUID | None,
        persisted_match: Any | None,
    ) -> JobScoreExplanationPayload | None:
        version = await self._session.scalar(
            sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
        )
        if version is None:
            return None

        score_head = await self._session.scalar(
            sa.select(CandidateJobScoreModel).where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.version_id == version.id,
            )
        )
        if score_head is None:
            return None

        score_head_payload = self._build_payload_from_score_head(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis_id,
            version=version,
            score_head=score_head,
            persisted_match=persisted_match,
            factors=[],
        )

        snapshot = await self._session.scalar(
            sa.select(CandidateJobScoreSnapshotModel)
            .where(
                CandidateJobScoreSnapshotModel.job_id == job_id,
                CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
                CandidateJobScoreSnapshotModel.version_id == version.id,
            )
            .order_by(
                CandidateJobScoreSnapshotModel.computed_at.desc(),
                CandidateJobScoreSnapshotModel.id.desc(),
            )
            .limit(1)
        )
        if snapshot is None:
            return score_head_payload

        snapshot_factors = (
            await self._session.execute(
                sa.select(CandidateJobScoreFactorModel)
                .where(CandidateJobScoreFactorModel.snapshot_id == snapshot.id)
                .order_by(
                    CandidateJobScoreFactorModel.display_order.asc(),
                    CandidateJobScoreFactorModel.id.asc(),
                )
            )
        ).scalars().all()
        if not snapshot_factors:
            return score_head_payload

        factors = [
            {
                "factor_type": factor.factor_type,
                "factor_key": factor.factor_key,
                "factor_label": factor.factor_label,
                "impact_score": float(Decimal(str(factor.impact_score)).quantize(Decimal("0.01"))),
                "normalized_weight": float(Decimal(str(factor.normalized_weight)).quantize(Decimal("0.0001"))),
                "direction": factor.direction,
                "evidence_json": dict(factor.evidence_json or {}),
                "display_order": factor.display_order,
            }
            for factor in snapshot_factors
        ]
        return self._build_payload_from_score_head(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis_id,
            version=version,
            score_head=score_head,
            persisted_match=persisted_match,
            factors=factors,
        )

    @staticmethod
    def _build_viewer_summary(payload: JobScoreExplanationPayload) -> str:
        score_label = f"{payload.job_fit_score:.2f}"
        return (
            f"Aderência à Vaga {score_label} calculada pelo motor canônico com recommendation "
            f"{payload.recommendation}. Consulte recrutador ou admin para o detalhamento."
        )

    @staticmethod
    def _build_persisted_breakdown(raw: dict[str, Any] | None) -> dict[str, Any]:
        breakdown = raw or {}

        def _item(key: str) -> dict[str, float] | None:
            value = breakdown.get(key)
            if value is None:
                return None
            score = float(JobScoreExplanationService._coerce_decimal(value).quantize(Decimal("0.01")))
            return {
                "score": score,
                "weight": 1.0,
                "contribution": score,
            }

        return {
            "priority": _item("priority_component_impact"),
            "complementary": _item("complementary_component_impact"),
            "eliminatory": _item("deal_breaker_penalty_score"),
            "experience": _item("experience_match_score"),
            "seniority": _item("seniority_match_score"),
            "ai_adjustment": _item("confidence_score"),
        }

    @staticmethod
    def _extract_partial_matches_from_factors(
        factors: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        partials: list[dict[str, Any]] = []
        for factor in factors:
            if factor.get("factor_type") != "adjacent_skill_match":
                continue
            evidence = dict(factor.get("evidence_json") or {})
            required_skill = str(evidence.get("required_skill") or factor.get("factor_key") or "").strip()
            candidate_skill = str(evidence.get("candidate_skill") or "").strip()
            if not required_skill:
                continue
            partials.append(
                {
                    "required": required_skill,
                    "candidate": candidate_skill,
                    "score": float(JobScoreExplanationService._coerce_decimal(evidence.get("partial_score")).quantize(Decimal("0.01"))),
                    "reason": str(evidence.get("reason") or factor.get("factor_label") or "").strip(),
                    "source": str(evidence.get("source") or "partial_match"),
                }
            )
        return partials

    @staticmethod
    def _partial_score_to_match_type(score_hint: float) -> str:
        if score_hint >= 0.8:
            return "strong_equivalence"
        if score_hint >= 0.5:
            return "partial_equivalence"
        if score_hint > 0:
            return "weak_equivalence"
        return "none"

    @classmethod
    def _normalize_matched_equivalence(
        cls,
        item: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not item:
            return None

        requirement = str(
            item.get("requirement")
            or item.get("required_skill")
            or item.get("required")
            or ""
        ).strip()
        if not requirement:
            return None

        matched_skill = str(
            item.get("matched_skill")
            or item.get("candidate_skill")
            or item.get("candidate")
            or ""
        ).strip()

        raw_score_hint = item.get("score_hint")
        if raw_score_hint is None:
            raw_score_hint = item.get("score")
        if raw_score_hint is None:
            raw_score_hint = item.get("partial_score")
        score_hint = float(cls._coerce_decimal(raw_score_hint).quantize(Decimal("0.01")))

        match_type = str(item.get("match_type") or "").strip() or cls._partial_score_to_match_type(
            score_hint
        )
        if match_type == "none" and matched_skill:
            match_type = "weak_equivalence"

        match_status = str(item.get("match_status") or "").strip()
        if not match_status:
            match_status = "matched" if match_type == "strong_equivalence" else "partial"

        evidence_strength = str(item.get("evidence_strength") or item.get("strength") or "").strip()
        if not evidence_strength:
            evidence_strength = {
                "strong_equivalence": "strong",
                "partial_equivalence": "medium",
                "weak_equivalence": "weak",
                "none": "weak",
            }.get(match_type, "medium")

        confidence = str(item.get("confidence") or "").strip()
        if not confidence:
            confidence = "medium" if match_type in {"strong_equivalence", "partial_equivalence"} else "low"

        evidence_quotes = item.get("evidence_quotes")
        if not isinstance(evidence_quotes, list):
            evidence_quotes = []

        explanation = str(
            item.get("explanation")
            or item.get("reason")
            or ""
        ).strip()
        if not explanation:
            explanation = (
                f"{matched_skill or 'Skill relacionada'} cobre parcialmente {requirement}"
                if matched_skill
                else f"Nenhuma equivalência válida encontrada para {requirement}"
            )

        return {
            "requirement": requirement,
            "requirement_type": str(item.get("requirement_type") or "required_skill"),
            "match_status": match_status,
            "match_type": match_type,
            "evidence_quotes": [str(quote).strip() for quote in evidence_quotes if str(quote).strip()],
            "evidence_strength": evidence_strength,
            "confidence": confidence,
            "score_hint": score_hint,
            "explanation": explanation,
        }

    @classmethod
    def _build_matched_equivalences(
        cls,
        partial_matches: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for partial_match in partial_matches:
            normalized_item = cls._normalize_matched_equivalence(dict(partial_match or {}))
            if normalized_item is not None:
                normalized.append(normalized_item)
        return normalized

    @staticmethod
    def _extract_gap_labels(factors: list[dict[str, Any]]) -> list[str]:
        gaps: list[str] = []
        for factor in factors:
            if factor.get("factor_type") != "missing_required_skill":
                continue
            evidence = dict(factor.get("evidence_json") or {})
            required_skill = str(evidence.get("required_skill") or factor.get("factor_key") or "").strip()
            if required_skill:
                gaps.append(required_skill)
        return gaps

    @staticmethod
    def _coerce_decimal(value: Any) -> Decimal:
        if value is None:
            return Decimal("0")
        return Decimal(str(value))

    def _build_payload_from_score_head(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        analysis_id: UUID | None,
        version: ScoreModelVersionModel,
        score_head: CandidateJobScoreModel,
        persisted_match: Any | None,
        factors: list[dict[str, Any]],
    ) -> JobScoreExplanationPayload:
        factor_summary = dict(score_head.factor_summary_json or {}) or _summarize_score_factors(factors)
        delta_summary = dict(score_head.delta_summary_json or {}) or _empty_delta_summary(
            current_score=Decimal(str(score_head.final_score))
        )
        partial_matches = self._extract_partial_matches_from_factors(factors)
        matched_equivalences = self._build_matched_equivalences(partial_matches)
        positive_labels = [item["factor_label"] for item in factor_summary.get("positive", [])]
        negative_labels = [item["factor_label"] for item in factor_summary.get("negative", [])]
        gaps = self._extract_gap_labels(factors) or list(getattr(persisted_match, "missing_skills_json", None) or [])
        confidence_risks = [
            item["factor_label"]
            for item in factor_summary.get("negative", [])
            if item.get("factor_type") == "data_confidence_penalty"
        ]
        ranking_summary_text = str(score_head.explanation_text or "").strip() or _render_score_explanation(
            final_score=Decimal(str(score_head.final_score)),
            decision=score_head.decision_suggestion,
            factor_summary=factor_summary,
            delta_summary=delta_summary,
        )
        return JobScoreExplanationPayload(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=score_head.source_analysis_id or analysis_id,
            job_fit_score=float(Decimal(str(score_head.final_score))),
            ranking_freshness_status=score_head.freshness_status,
            score_model_version=score_head.score_model_version or version.version,
            explainability_version=score_head.explainability_version,
            computed_at=score_head.computed_at,
            recommendation=str(
                getattr(persisted_match, "recommendation", None) or score_head.decision_suggestion
            ),
            engine_used="canonical",
            ranking_summary_text=ranking_summary_text,
            breakdown=self._build_persisted_breakdown(score_head.breakdown),
            score_factors=factor_summary,
            delta=delta_summary,
            highlights=positive_labels,
            risks=negative_labels,
            high_score_reasons=positive_labels,
            low_score_reasons=negative_labels,
            overestimation_risks=confidence_risks,
            recommended_questions=[],
            strongest_evidence=[],
            matched_equivalences=matched_equivalences,
            gaps=gaps,
            data_confidence_score=float(
                self._coerce_decimal(
                    (score_head.breakdown or {}).get("confidence_score")
                ).quantize(Decimal("0.01"))
            ),
            strengths=positive_labels,
            partial_matches=partial_matches,
        )
