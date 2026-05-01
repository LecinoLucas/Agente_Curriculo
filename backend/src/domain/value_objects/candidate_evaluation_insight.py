from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _clean_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []

    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean_str(value)
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(text)
    return deduped


def _normalize_float(value: Any, default: float = 0.0, minimum: float = 0.0, maximum: float = 100.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


@dataclass
class InsightEvidence:
    requirement: str
    requirement_type: str
    match_status: str
    match_type: str
    evidence_quotes: list[str] = field(default_factory=list)
    evidence_strength: str = "none"
    confidence: str = "low"
    score_hint: float = 0.0
    explanation: str = ""

    def __post_init__(self) -> None:
        self.requirement = _clean_str(self.requirement)
        self.requirement_type = _clean_str(self.requirement_type, "capability")
        self.match_status = _clean_str(self.match_status, "unclear")
        self.match_type = _clean_str(self.match_type, "absent")
        self.evidence_quotes = _normalize_list(self.evidence_quotes)
        self.evidence_strength = _clean_str(self.evidence_strength, "none")
        self.confidence = _clean_str(self.confidence, "low")
        self.score_hint = round(_normalize_float(self.score_hint), 2)
        self.explanation = _clean_str(self.explanation)

    def to_dict(self) -> dict[str, Any]:
        return {
            "requirement": self.requirement,
            "requirement_type": self.requirement_type,
            "match_status": self.match_status,
            "match_type": self.match_type,
            "evidence_quotes": list(self.evidence_quotes),
            "evidence_strength": self.evidence_strength,
            "confidence": self.confidence,
            "score_hint": self.score_hint,
            "explanation": self.explanation,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "InsightEvidence":
        return cls(
            requirement=data.get("requirement", ""),
            requirement_type=data.get("requirement_type", "capability"),
            match_status=data.get("match_status", "unclear"),
            match_type=data.get("match_type", "absent"),
            evidence_quotes=data.get("evidence_quotes") or [],
            evidence_strength=data.get("evidence_strength", "none"),
            confidence=data.get("confidence", "low"),
            score_hint=data.get("score_hint", 0.0),
            explanation=data.get("explanation", ""),
        )


@dataclass
class ScoreDriver:
    driver: str
    impact: str
    weight: float
    reason: str

    def __post_init__(self) -> None:
        self.driver = _clean_str(self.driver)
        self.impact = _clean_str(self.impact, "neutral")
        self.weight = round(_normalize_float(self.weight), 2)
        self.reason = _clean_str(self.reason)

    def to_dict(self) -> dict[str, Any]:
        return {
            "driver": self.driver,
            "impact": self.impact,
            "weight": self.weight,
            "reason": self.reason,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ScoreDriver":
        return cls(
            driver=data.get("driver", ""),
            impact=data.get("impact", "neutral"),
            weight=data.get("weight", 0.0),
            reason=data.get("reason", ""),
        )


@dataclass
class CandidateEvaluationInsight:
    why_score_is_high: list[str] = field(default_factory=list)
    why_score_is_low: list[str] = field(default_factory=list)
    top_evidence: list[InsightEvidence] = field(default_factory=list)
    matched_requirements: list[str] = field(default_factory=list)
    partially_matched_requirements: list[str] = field(default_factory=list)
    missing_critical_requirements: list[str] = field(default_factory=list)
    equivalent_matches: list[InsightEvidence] = field(default_factory=list)
    inferred_matches: list[InsightEvidence] = field(default_factory=list)
    score_drivers: list[ScoreDriver] = field(default_factory=list)
    possible_overestimation: list[str] = field(default_factory=list)
    possible_underestimation: list[str] = field(default_factory=list)
    risk_points: list[str] = field(default_factory=list)
    recommended_interview_questions: list[str] = field(default_factory=list)
    human_review_notes: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.why_score_is_high = _normalize_list(self.why_score_is_high)
        self.why_score_is_low = _normalize_list(self.why_score_is_low)
        self.top_evidence = [
            item if isinstance(item, InsightEvidence) else InsightEvidence.from_dict(item)
            for item in (self.top_evidence or [])
        ]
        self.matched_requirements = _normalize_list(self.matched_requirements)
        self.partially_matched_requirements = _normalize_list(self.partially_matched_requirements)
        self.missing_critical_requirements = _normalize_list(self.missing_critical_requirements)
        self.equivalent_matches = [
            item if isinstance(item, InsightEvidence) else InsightEvidence.from_dict(item)
            for item in (self.equivalent_matches or [])
        ]
        self.inferred_matches = [
            item if isinstance(item, InsightEvidence) else InsightEvidence.from_dict(item)
            for item in (self.inferred_matches or [])
        ]
        self.score_drivers = [
            item if isinstance(item, ScoreDriver) else ScoreDriver.from_dict(item)
            for item in (self.score_drivers or [])
        ]
        self.possible_overestimation = _normalize_list(self.possible_overestimation)
        self.possible_underestimation = _normalize_list(self.possible_underestimation)
        self.risk_points = _normalize_list(self.risk_points)
        self.recommended_interview_questions = _normalize_list(self.recommended_interview_questions)
        self.human_review_notes = _normalize_list(self.human_review_notes)

    def to_dict(self) -> dict[str, Any]:
        return {
            "why_score_is_high": list(self.why_score_is_high),
            "why_score_is_low": list(self.why_score_is_low),
            "top_evidence": [item.to_dict() for item in self.top_evidence],
            "matched_requirements": list(self.matched_requirements),
            "partially_matched_requirements": list(self.partially_matched_requirements),
            "missing_critical_requirements": list(self.missing_critical_requirements),
            "equivalent_matches": [item.to_dict() for item in self.equivalent_matches],
            "inferred_matches": [item.to_dict() for item in self.inferred_matches],
            "score_drivers": [item.to_dict() for item in self.score_drivers],
            "possible_overestimation": list(self.possible_overestimation),
            "possible_underestimation": list(self.possible_underestimation),
            "risk_points": list(self.risk_points),
            "recommended_interview_questions": list(self.recommended_interview_questions),
            "human_review_notes": list(self.human_review_notes),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CandidateEvaluationInsight":
        return cls(
            why_score_is_high=data.get("why_score_is_high") or [],
            why_score_is_low=data.get("why_score_is_low") or [],
            top_evidence=[
                InsightEvidence.from_dict(item)
                for item in (data.get("top_evidence") or [])
            ],
            matched_requirements=data.get("matched_requirements") or [],
            partially_matched_requirements=data.get("partially_matched_requirements") or [],
            missing_critical_requirements=data.get("missing_critical_requirements") or [],
            equivalent_matches=[
                InsightEvidence.from_dict(item)
                for item in (data.get("equivalent_matches") or [])
            ],
            inferred_matches=[
                InsightEvidence.from_dict(item)
                for item in (data.get("inferred_matches") or [])
            ],
            score_drivers=[
                ScoreDriver.from_dict(item)
                for item in (data.get("score_drivers") or [])
            ],
            possible_overestimation=data.get("possible_overestimation") or [],
            possible_underestimation=data.get("possible_underestimation") or [],
            risk_points=data.get("risk_points") or [],
            recommended_interview_questions=data.get("recommended_interview_questions") or [],
            human_review_notes=data.get("human_review_notes") or [],
        )
