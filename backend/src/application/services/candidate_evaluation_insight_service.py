from __future__ import annotations

from dataclasses import replace
from typing import Any

from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_evaluation_insight import (
    CandidateEvaluationInsight,
    InsightEvidence,
    ScoreDriver,
)
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.evidence_mapping import EvidenceMapping, RequirementMatch
from src.domain.value_objects.job_profile import JobProfile

_STRENGTH_RANK: dict[str, int] = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "very_high": 4,
}

_CONFIDENCE_RANK: dict[str, int] = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "very_high": 4,
}


def _clean_str(value: object, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_text(value: object) -> str:
    return " ".join(_clean_str(value).lower().split())


def _dedupe(values: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean_str(value)
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        unique.append(text)
    return unique


class CandidateEvaluationInsightService:
    """
    Camada explicativa determinística baseada em evidências estruturadas já calculadas.
    Não altera score/ranking, apenas expõe motivos auditáveis.
    """

    def build(
        self,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        evidence_mapping: EvidenceMapping,
        adaptive_result: AdaptiveScoreResult,
    ) -> CandidateEvaluationInsight:
        sorted_matches = sorted(
            evidence_mapping.requirement_matches,
            key=self._match_sort_key,
            reverse=True,
        )
        top_matches = sorted_matches[:5]
        matched = [
            match.requirement
            for match in evidence_mapping.requirement_matches
            if match.match_status in {"meets", "exceeds"}
        ]
        partially_matched = [
            match.requirement
            for match in evidence_mapping.requirement_matches
            if match.match_status == "partially_meets"
        ]
        critical_missing = _dedupe(
            [
                *evidence_mapping.unmapped_critical_requirements,
                *[
                    match.requirement
                    for match in evidence_mapping.requirement_matches
                    if match.requirement_type == "critical"
                    and match.match_status in {"not_evidenced", "unclear"}
                ],
            ]
        )
        equivalent_matches = [self._to_insight_evidence(match) for match in sorted_matches if match.match_type == "equivalent"]
        inferred_matches = [self._to_insight_evidence(match) for match in sorted_matches if match.match_type == "inferred"]

        why_high = self._build_why_high(adaptive_result, top_matches, equivalent_matches)
        why_low = self._build_why_low(
            adaptive_result=adaptive_result,
            evidence_mapping=evidence_mapping,
            critical_missing=critical_missing,
            inferred_count=len(inferred_matches),
        )

        score_drivers = self._build_score_drivers(adaptive_result, top_matches, critical_missing, inferred_matches)
        possible_overestimation = self._build_possible_overestimation(
            adaptive_result=adaptive_result,
            evidence_mapping=evidence_mapping,
            critical_missing=critical_missing,
            inferred_matches=inferred_matches,
            equivalent_matches=equivalent_matches,
        )
        possible_underestimation = self._build_possible_underestimation(
            adaptive_result=adaptive_result,
            equivalent_matches=equivalent_matches,
        )

        risk_points = _dedupe([*adaptive_result.risk_points, *evidence_mapping.risk_points])
        recommended_questions = self._build_interview_questions(
            candidate_profile=candidate_profile,
            matched=matched,
            critical_missing=critical_missing,
            equivalent_matches=equivalent_matches,
            inferred_matches=inferred_matches,
            risk_points=risk_points,
        )
        human_review_notes = self._build_human_notes(
            adaptive_result=adaptive_result,
            evidence_mapping=evidence_mapping,
            critical_missing=critical_missing,
            possible_overestimation=possible_overestimation,
            possible_underestimation=possible_underestimation,
        )

        return CandidateEvaluationInsight(
            why_score_is_high=why_high,
            why_score_is_low=why_low,
            top_evidence=[self._to_insight_evidence(match) for match in top_matches],
            matched_requirements=matched,
            partially_matched_requirements=partially_matched,
            missing_critical_requirements=critical_missing,
            equivalent_matches=equivalent_matches,
            inferred_matches=inferred_matches,
            score_drivers=score_drivers,
            possible_overestimation=possible_overestimation,
            possible_underestimation=possible_underestimation,
            risk_points=risk_points,
            recommended_interview_questions=recommended_questions,
            human_review_notes=human_review_notes,
        )

    @staticmethod
    def attach_comparison_context(
        adaptive_result: AdaptiveScoreResult,
        *,
        legacy_match_score: float,
        adaptive_match_score: float,
        delta: float,
    ) -> AdaptiveScoreResult:
        score_breakdown = dict(adaptive_result.score_breakdown or {})
        comparison_context: dict[str, Any] = dict(score_breakdown.get("_comparison") or {})
        comparison_context["legacy_match_score"] = float(legacy_match_score)
        comparison_context["adaptive_match_score"] = float(adaptive_match_score)
        comparison_context["delta"] = float(delta)
        score_breakdown["_comparison"] = comparison_context
        return replace(adaptive_result, score_breakdown=score_breakdown)

    def _build_why_high(
        self,
        adaptive_result: AdaptiveScoreResult,
        top_matches: list[RequirementMatch],
        equivalent_matches: list[InsightEvidence],
    ) -> list[str]:
        reasons: list[str] = []
        if adaptive_result.match_score >= 75:
            reasons.append(f"Score adaptativo alto ({adaptive_result.match_score:.2f}) com cobertura técnica consistente.")
        if adaptive_result.critical_coverage >= 0.70:
            reasons.append(f"Cobertura de requisitos críticos em {adaptive_result.critical_coverage * 100:.1f}%.")
        if top_matches:
            top_names = ", ".join(match.requirement for match in top_matches[:3])
            reasons.append(f"Principais evidências mapeadas em: {top_names}.")
        if equivalent_matches:
            reasons.append(f"{len(equivalent_matches)} requisito(s) atendido(s) por equivalência profissional auditável.")
        if adaptive_result.strengths:
            reasons.append(f"Forças detectadas: {', '.join(adaptive_result.strengths[:3])}.")
        return _dedupe(reasons)

    def _build_why_low(
        self,
        *,
        adaptive_result: AdaptiveScoreResult,
        evidence_mapping: EvidenceMapping,
        critical_missing: list[str],
        inferred_count: int,
    ) -> list[str]:
        reasons: list[str] = []
        if adaptive_result.match_score < 65:
            reasons.append(f"Score adaptativo baixo ({adaptive_result.match_score:.2f}).")
        if critical_missing:
            reasons.append(f"Requisitos críticos sem evidência: {', '.join(critical_missing[:4])}.")
        if adaptive_result.confidence_score < 60:
            reasons.append(
                f"Confiança baixa ({adaptive_result.confidence_score:.2f}) por qualidade/volume de evidências insuficientes."
            )
        if evidence_mapping.confidence == "low":
            reasons.append("Mapeamento de evidências com confiança baixa.")
        if inferred_count >= 3:
            reasons.append("Alta dependência de inferências aumenta incerteza da avaliação.")
        if adaptive_result.gaps:
            reasons.append(f"Lacunas detectadas: {', '.join(adaptive_result.gaps[:3])}.")
        return _dedupe(reasons)

    def _build_score_drivers(
        self,
        adaptive_result: AdaptiveScoreResult,
        top_matches: list[RequirementMatch],
        critical_missing: list[str],
        inferred_matches: list[InsightEvidence],
    ) -> list[ScoreDriver]:
        drivers: list[ScoreDriver] = []
        for match in top_matches[:3]:
            drivers.append(
                ScoreDriver(
                    driver=match.requirement,
                    impact="positive",
                    weight=match.score_hint,
                    reason=f"{match.match_type} / {match.evidence_strength}",
                )
            )
        if critical_missing:
            drivers.append(
                ScoreDriver(
                    driver="critical_missing_requirements",
                    impact="negative",
                    weight=min(100.0, 20.0 + (len(critical_missing) * 10.0)),
                    reason="Requisitos críticos não evidenciados.",
                )
            )
        if inferred_matches:
            drivers.append(
                ScoreDriver(
                    driver="inferred_matches",
                    impact="uncertainty",
                    weight=min(100.0, len(inferred_matches) * 15.0),
                    reason="Parte do match veio de inferência controlada.",
                )
            )
        drivers.append(
            ScoreDriver(
                driver="adaptive_confidence",
                impact="negative" if adaptive_result.confidence_score < 60 else "positive",
                weight=adaptive_result.confidence_score,
                reason="Nível de confiança do scorer adaptativo.",
            )
        )
        return drivers

    def _build_possible_overestimation(
        self,
        *,
        adaptive_result: AdaptiveScoreResult,
        evidence_mapping: EvidenceMapping,
        critical_missing: list[str],
        inferred_matches: list[InsightEvidence],
        equivalent_matches: list[InsightEvidence],
    ) -> list[str]:
        warnings: list[str] = []
        direct_count = sum(1 for match in evidence_mapping.requirement_matches if match.match_type == "direct")
        inferred_or_equivalent = len(inferred_matches) + len(equivalent_matches)

        if adaptive_result.match_score >= 75 and critical_missing:
            warnings.append("Score alto mesmo com requisitos críticos ausentes.")
        if inferred_or_equivalent > direct_count and adaptive_result.match_score >= 70:
            warnings.append("Score depende mais de equivalências/inferências do que de evidência direta.")
        if adaptive_result.confidence_score < 60 and adaptive_result.match_score >= 70:
            warnings.append("Score alto com confiança baixa: revisar robustez das evidências.")
        return _dedupe(warnings)

    def _build_possible_underestimation(
        self,
        *,
        adaptive_result: AdaptiveScoreResult,
        equivalent_matches: list[InsightEvidence],
    ) -> list[str]:
        warnings: list[str] = []
        if equivalent_matches and adaptive_result.match_score >= 65:
            warnings.append("Experiência equivalente encontrada pode ser subestimada por scoring rígido por palavra exata.")

        comparison = adaptive_result.score_breakdown.get("_comparison") or {}
        try:
            legacy = float(comparison.get("legacy_match_score", 0.0))
            adaptive = float(comparison.get("adaptive_match_score", adaptive_result.match_score))
            delta = float(comparison.get("delta", abs(adaptive - legacy)))
        except (TypeError, ValueError):
            legacy = 0.0
            adaptive = adaptive_result.match_score
            delta = 0.0

        if adaptive > legacy and delta >= 20 and equivalent_matches:
            warnings.append(
                f"Delta alto entre legado e adaptativo ({delta:.2f}) puxado por equivalências reconhecidas."
            )
        return _dedupe(warnings)

    def _build_interview_questions(
        self,
        *,
        candidate_profile: CandidateProfile,
        matched: list[str],
        critical_missing: list[str],
        equivalent_matches: list[InsightEvidence],
        inferred_matches: list[InsightEvidence],
        risk_points: list[str],
    ) -> list[str]:
        questions: list[str] = []

        if not candidate_profile.business_impact_evidence:
            questions.append("Descreva uma decisão orientada por dados que gerou impacto mensurável no negócio.")
        if not candidate_profile.leadership_evidence:
            questions.append("Conte um caso de influência técnica sem autoridade formal sobre o time.")
        if equivalent_matches:
            names = ", ".join(item.requirement for item in equivalent_matches[:2])
            questions.append(f"Você pode detalhar experiência real nos requisitos mapeados por equivalência: {names}?")
        if inferred_matches:
            names = ", ".join(item.requirement for item in inferred_matches[:2])
            questions.append(f"Quais evidências práticas confirmam os requisitos inferidos: {names}?")
        for requirement in critical_missing[:2]:
            questions.append(f"Apresente um caso prático recente envolvendo o requisito crítico '{requirement}'.")
        for strong_match in matched[:2]:
            questions.append(f"Traga um exemplo técnico completo para validar profundidade em '{strong_match}'.")
        if any("leadership_gap" in _normalize_text(point) for point in risk_points):
            questions.append("Como você estruturou influência técnica em contextos com baixa autoridade formal?")

        return _dedupe(questions)

    def _build_human_notes(
        self,
        *,
        adaptive_result: AdaptiveScoreResult,
        evidence_mapping: EvidenceMapping,
        critical_missing: list[str],
        possible_overestimation: list[str],
        possible_underestimation: list[str],
    ) -> list[str]:
        notes: list[str] = [
            "Insight gerado de forma determinística a partir de EvidenceMapping e AdaptiveScoreResult.",
            "Nenhum ajuste no score final foi aplicado por esta camada explicativa.",
        ]
        if adaptive_result.confidence_score < 60 or evidence_mapping.confidence == "low":
            notes.append("Recomendado revisar evidências manualmente devido à baixa confiança.")
        if critical_missing:
            notes.append("Há requisito crítico sem evidência explícita; validar durante entrevista.")
        notes.extend(possible_overestimation[:2])
        notes.extend(possible_underestimation[:2])
        return _dedupe(notes)

    def _to_insight_evidence(self, match: RequirementMatch) -> InsightEvidence:
        return InsightEvidence(
            requirement=match.requirement,
            requirement_type=match.requirement_type,
            match_status=match.match_status,
            match_type=match.match_type,
            evidence_quotes=list(match.evidence_quotes),
            evidence_strength=match.evidence_strength,
            confidence=match.confidence,
            score_hint=match.score_hint,
            explanation=match.explanation,
        )

    def _match_sort_key(self, match: RequirementMatch) -> tuple[int, int, int, float]:
        return (
            _STRENGTH_RANK.get(match.evidence_strength, 0),
            _CONFIDENCE_RANK.get(match.confidence, 0),
            1 if match.match_type == "direct" else 0,
            float(match.score_hint),
        )
