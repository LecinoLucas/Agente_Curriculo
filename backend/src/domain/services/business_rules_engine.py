"""
BusinessRulesEngine

Orquestra regras de negócio corporativas para:
  1. Scoring de currículo
  2. Classificação de nível
  3. Compatibilidade com vaga
  4. Versionamento de análises

Objetivo: centralizar consistência + auditabilidade em um único ponto.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Any, Optional

from src.domain.services.analysis_versioning import (
    AnalysisVersioningService,
    ScoreDelta,
    VersioningContext,
)
from src.domain.services.job_compatibility_calculator import (
    CompatibilityInput,
    CompatibilityResult,
    JobCompatibilityCalculator,
)
from src.domain.services.score_calculator import (
    ExtractedResumeData,
    ScoreBreakdown,
    ScoreCalculator,
)
from src.domain.services.seniority_classifier import (
    SeniorityClassifier,
    SeniorityInput,
    SeniorityResult,
)


class AnalysisLevel(StrEnum):
    ELITE = "elite"
    STRONG = "strong"
    SOLID = "solid"
    DEVELOPING = "developing"
    RISK = "risk"


@dataclass(frozen=True)
class AuditSnapshot:
    flow: str
    ruleset_version: str
    input_checksum: str
    decision_trace: list[str]
    details: dict[str, Any]


@dataclass(frozen=True)
class ResumeRulesResult:
    breakdown: ScoreBreakdown
    seniority: SeniorityResult
    analysis_level: AnalysisLevel
    audit: AuditSnapshot


@dataclass(frozen=True)
class CompatibilityRulesResult:
    compatibility: CompatibilityResult
    audit: AuditSnapshot


@dataclass(frozen=True)
class VersioningRulesResult:
    delta: ScoreDelta
    should_alert: bool
    audit: AuditSnapshot


class BusinessRulesEngine:
    """
    Façade de regras corporativas.

    Cada método retorna resultado + snapshot de auditoria para armazenamento
    em trilha de decisão (audit logs / eventos de negócio).
    """

    RULESET_VERSION = "2026.04.v1"

    def __init__(
        self,
        score_calculator: Optional[ScoreCalculator] = None,
        seniority_classifier: Optional[SeniorityClassifier] = None,
        compatibility_calculator: Optional[JobCompatibilityCalculator] = None,
    ) -> None:
        self._score_calculator = score_calculator or ScoreCalculator()
        self._seniority_classifier = seniority_classifier or SeniorityClassifier()
        self._compatibility_calculator = compatibility_calculator or JobCompatibilityCalculator()

    def evaluate_resume(
        self,
        extracted_data: ExtractedResumeData,
        seniority_input: SeniorityInput,
    ) -> ResumeRulesResult:
        breakdown = self._score_calculator.calculate(extracted_data)
        seniority = self._seniority_classifier.classify(seniority_input)
        analysis_level = self._classify_analysis_level(float(breakdown.overall.value))

        trace = [
            f"overall_score={float(breakdown.overall.value):.2f}",
            f"overall_label={breakdown.overall.label}",
            f"seniority={seniority.level.value}",
            f"seniority_confidence={seniority.confidence}",
            f"analysis_level={analysis_level.value}",
        ]

        audit = self._build_audit_snapshot(
            flow="resume_rules",
            input_payload={
                "extracted_data": asdict(extracted_data),
                "seniority_input": asdict(seniority_input),
            },
            decision_trace=trace,
            details={
                "score_breakdown": breakdown.to_dict(),
                "seniority": asdict(seniority),
                "analysis_level": analysis_level.value,
            },
        )

        return ResumeRulesResult(
            breakdown=breakdown,
            seniority=seniority,
            analysis_level=analysis_level,
            audit=audit,
        )

    def evaluate_compatibility(self, input_data: CompatibilityInput) -> CompatibilityRulesResult:
        compatibility = self._compatibility_calculator.calculate(input_data)

        trace = [
            f"match_score={float(compatibility.match_score.value):.2f}",
            f"mandatory_coverage={compatibility.mandatory_skills_coverage:.2f}",
            f"recommendation={compatibility.recommendation}",
            f"missing_mandatory={len(compatibility.missing_mandatory_skills)}",
        ]

        audit = self._build_audit_snapshot(
            flow="job_compatibility_rules",
            input_payload=self._compatibility_input_to_dict(input_data),
            decision_trace=trace,
            details={
                "match_score": float(compatibility.match_score.value),
                "recommendation": compatibility.recommendation,
                "mandatory_coverage": compatibility.mandatory_skills_coverage,
                "score_breakdown": {
                    "mandatory_skills": float(compatibility.mandatory_skills_score.value),
                    "optional_skills": float(compatibility.optional_skills_score.value),
                    "seniority": float(compatibility.seniority_score.value),
                    "experience": float(compatibility.experience_score.value),
                    "education": float(compatibility.education_score.value),
                },
                "missing_mandatory_skills": compatibility.missing_mandatory_skills,
            },
        )

        return CompatibilityRulesResult(compatibility=compatibility, audit=audit)

    def evaluate_versioning(
        self,
        previous_scores: dict[str, Decimal],
        new_scores: dict[str, Decimal],
        context: Optional[VersioningContext] = None,
    ) -> VersioningRulesResult:
        delta = AnalysisVersioningService.calculate_delta(previous_scores, new_scores)
        should_alert = AnalysisVersioningService.should_alert_on_delta(delta)

        trace = [
            f"delta_overall={float(delta.overall):.2f}",
            f"delta_direction={delta.direction}",
            f"is_significant={delta.is_significant}",
            f"should_alert={should_alert}",
        ]

        audit = self._build_audit_snapshot(
            flow="analysis_versioning_rules",
            input_payload={
                "previous_scores": {k: str(v) for k, v in previous_scores.items()},
                "new_scores": {k: str(v) for k, v in new_scores.items()},
                "context": asdict(context) if context else None,
            },
            decision_trace=trace,
            details={
                "delta": delta.to_dict(),
                "should_alert": should_alert,
            },
        )

        return VersioningRulesResult(delta=delta, should_alert=should_alert, audit=audit)

    @staticmethod
    def _classify_analysis_level(overall_score: float) -> AnalysisLevel:
        if overall_score >= 85:
            return AnalysisLevel.ELITE
        if overall_score >= 70:
            return AnalysisLevel.STRONG
        if overall_score >= 55:
            return AnalysisLevel.SOLID
        if overall_score >= 40:
            return AnalysisLevel.DEVELOPING
        return AnalysisLevel.RISK

    def _build_audit_snapshot(
        self,
        flow: str,
        input_payload: dict[str, Any],
        decision_trace: list[str],
        details: dict[str, Any],
    ) -> AuditSnapshot:
        serialized = json.dumps(input_payload, sort_keys=True, ensure_ascii=True, default=str)
        checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        return AuditSnapshot(
            flow=flow,
            ruleset_version=self.RULESET_VERSION,
            input_checksum=checksum,
            decision_trace=decision_trace,
            details=details,
        )

    @staticmethod
    def _compatibility_input_to_dict(input_data: CompatibilityInput) -> dict[str, Any]:
        return {
            "candidate_seniority": input_data.candidate_seniority.value,
            "candidate_experience_years": input_data.candidate_experience_years,
            "candidate_education_level": input_data.candidate_education_level,
            "job_seniority": input_data.job_seniority.value if input_data.job_seniority else None,
            "job_min_experience_years": input_data.job_min_experience_years,
            "job_min_education_level": input_data.job_min_education_level,
            "required_skills_count": len(input_data.required_skills),
            "candidate_skills_count": len(input_data.candidate_skills.entries),
        }
