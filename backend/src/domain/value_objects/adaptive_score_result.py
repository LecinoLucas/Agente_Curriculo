from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _clean_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_float(value: Any, default: float = 0.0, minimum: float = 0.0, maximum: float = 100.0) -> float:
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
class AdaptiveScoreResult:
    match_score: float
    confidence_score: float
    recommendation: str
    score_breakdown: dict[str, Any]
    strengths: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    risk_points: list[str] = field(default_factory=list)
    critical_coverage: float = 0.0
    desirable_coverage: float = 0.0
    area: str = ""
    target_level: str = ""
    detected_level: str = ""

    def __post_init__(self) -> None:
        self.match_score = round(_normalize_float(self.match_score), 2)
        self.confidence_score = round(_normalize_float(self.confidence_score), 2)
        self.recommendation = _clean_str(self.recommendation, "reject")
        self.score_breakdown = self.score_breakdown or {}
        self.strengths = _normalize_list(self.strengths)
        self.gaps = _normalize_list(self.gaps)
        self.risk_points = _normalize_list(self.risk_points)
        self.critical_coverage = round(_normalize_float(self.critical_coverage, minimum=0.0, maximum=1.0), 4)
        self.desirable_coverage = round(_normalize_float(self.desirable_coverage, minimum=0.0, maximum=1.0), 4)
        self.area = _clean_str(self.area)
        self.target_level = _clean_str(self.target_level)
        self.detected_level = _clean_str(self.detected_level)

    def to_dict(self) -> dict[str, Any]:
        return {
            "match_score": self.match_score,
            "confidence_score": self.confidence_score,
            "recommendation": self.recommendation,
            "score_breakdown": self.score_breakdown,
            "strengths": list(self.strengths),
            "gaps": list(self.gaps),
            "risk_points": list(self.risk_points),
            "critical_coverage": self.critical_coverage,
            "desirable_coverage": self.desirable_coverage,
            "area": self.area,
            "target_level": self.target_level,
            "detected_level": self.detected_level,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AdaptiveScoreResult":
        return cls(
            match_score=data.get("match_score", 0.0),
            confidence_score=data.get("confidence_score", 0.0),
            recommendation=data.get("recommendation", "reject"),
            score_breakdown=data.get("score_breakdown") or {},
            strengths=data.get("strengths") or [],
            gaps=data.get("gaps") or [],
            risk_points=data.get("risk_points") or [],
            critical_coverage=data.get("critical_coverage", 0.0),
            desirable_coverage=data.get("desirable_coverage", 0.0),
            area=data.get("area", ""),
            target_level=data.get("target_level", ""),
            detected_level=data.get("detected_level", ""),
        )
