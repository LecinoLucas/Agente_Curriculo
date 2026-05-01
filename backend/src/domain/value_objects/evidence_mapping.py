"""
EvidenceMapping — mapeamento estruturado de evidências entre JobProfile e CandidateProfile.

Esta camada não calcula score final. Ela apenas organiza evidências, lacunas e sinais
de risco para uso posterior pelo AdaptiveScorer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

VALID_REQUIREMENT_TYPES: frozenset[str] = frozenset(
    {"critical", "desirable", "responsibility", "capability", "tool"}
)
VALID_MATCH_STATUSES: frozenset[str] = frozenset(
    {"meets", "partially_meets", "not_evidenced", "exceeds", "unclear"}
)
VALID_MATCH_TYPES: frozenset[str] = frozenset({"direct", "equivalent", "inferred", "absent"})
VALID_EVIDENCE_STRENGTHS: frozenset[str] = frozenset({"very_high", "high", "medium", "low", "none"})
VALID_CONFIDENCE: frozenset[str] = frozenset({"very_high", "high", "medium", "low"})


def _clean_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_enum(value: Any, valid: frozenset[str], default: str) -> str:
    candidate = _clean_str(value, default)
    return candidate if candidate in valid else default


def _normalize_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


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


@dataclass
class RequirementMatch:
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
        self.requirement_type = _normalize_enum(self.requirement_type, VALID_REQUIREMENT_TYPES, "capability")
        self.match_status = _normalize_enum(self.match_status, VALID_MATCH_STATUSES, "unclear")
        self.match_type = _normalize_enum(self.match_type, VALID_MATCH_TYPES, "absent")
        self.evidence_quotes = _normalize_list(self.evidence_quotes)
        self.evidence_strength = _normalize_enum(self.evidence_strength, VALID_EVIDENCE_STRENGTHS, "none")
        self.confidence = _normalize_enum(self.confidence, VALID_CONFIDENCE, "low")
        self.score_hint = _normalize_float(self.score_hint, 0.0, 0.0, 100.0)
        self.explanation = _clean_str(self.explanation)

        # Safety guard: sem evidência real, não deixamos quotes inventadas nem score implícito.
        if self.match_status in {"not_evidenced", "unclear"} or self.match_type == "absent":
            self.evidence_quotes = []
            self.evidence_strength = "none"
            self.score_hint = 0.0

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
    def from_dict(cls, data: dict[str, Any]) -> "RequirementMatch":
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
class EvidenceMapping:
    job_profile_hash: str
    candidate_profile_hash: str
    requirement_matches: list[RequirementMatch]
    overall_evidence_strength: str
    confidence: str
    unmapped_critical_requirements: list[str] = field(default_factory=list)
    candidate_extra_strengths: list[str] = field(default_factory=list)
    risk_points: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.job_profile_hash = _clean_str(self.job_profile_hash)
        self.candidate_profile_hash = _clean_str(self.candidate_profile_hash)
        self.requirement_matches = [
            match if isinstance(match, RequirementMatch) else RequirementMatch.from_dict(match)
            for match in (self.requirement_matches or [])
        ]
        self.overall_evidence_strength = _normalize_enum(
            self.overall_evidence_strength,
            VALID_EVIDENCE_STRENGTHS,
            "none",
        )
        self.confidence = _normalize_enum(self.confidence, VALID_CONFIDENCE, "low")
        self.unmapped_critical_requirements = _normalize_list(self.unmapped_critical_requirements)
        self.candidate_extra_strengths = _normalize_list(self.candidate_extra_strengths)
        self.risk_points = _normalize_list(self.risk_points)

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_profile_hash": self.job_profile_hash,
            "candidate_profile_hash": self.candidate_profile_hash,
            "requirement_matches": [match.to_dict() for match in self.requirement_matches],
            "overall_evidence_strength": self.overall_evidence_strength,
            "confidence": self.confidence,
            "unmapped_critical_requirements": list(self.unmapped_critical_requirements),
            "candidate_extra_strengths": list(self.candidate_extra_strengths),
            "risk_points": list(self.risk_points),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EvidenceMapping":
        return cls(
            job_profile_hash=data.get("job_profile_hash", ""),
            candidate_profile_hash=data.get("candidate_profile_hash", ""),
            requirement_matches=[
                RequirementMatch.from_dict(match)
                for match in (data.get("requirement_matches") or [])
            ],
            overall_evidence_strength=data.get("overall_evidence_strength", "none"),
            confidence=data.get("confidence", "low"),
            unmapped_critical_requirements=data.get("unmapped_critical_requirements") or [],
            candidate_extra_strengths=data.get("candidate_extra_strengths") or [],
            risk_points=data.get("risk_points") or [],
        )
