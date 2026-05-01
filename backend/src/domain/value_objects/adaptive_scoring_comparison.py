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


def _normalize_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return bool(value)


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
class AdaptiveScoringComparisonResult:
    legacy_match_score: float
    adaptive_match_score: float
    delta: float
    legacy_recommendation: str
    adaptive_recommendation: str
    explanation: str
    major_differences: list[str] = field(default_factory=list)
    confidence_score: float = 0.0
    should_review_manually: bool = False

    def __post_init__(self) -> None:
        self.legacy_match_score = round(_normalize_float(self.legacy_match_score), 2)
        self.adaptive_match_score = round(_normalize_float(self.adaptive_match_score), 2)
        self.delta = round(_normalize_float(self.delta), 2)
        self.legacy_recommendation = _clean_str(self.legacy_recommendation)
        self.adaptive_recommendation = _clean_str(self.adaptive_recommendation)
        self.explanation = _clean_str(self.explanation)
        self.major_differences = _normalize_list(self.major_differences)
        self.confidence_score = round(_normalize_float(self.confidence_score), 2)
        self.should_review_manually = _normalize_bool(self.should_review_manually)

    def to_dict(self) -> dict[str, Any]:
        return {
            "legacy_match_score": self.legacy_match_score,
            "adaptive_match_score": self.adaptive_match_score,
            "delta": self.delta,
            "legacy_recommendation": self.legacy_recommendation,
            "adaptive_recommendation": self.adaptive_recommendation,
            "explanation": self.explanation,
            "major_differences": list(self.major_differences),
            "confidence_score": self.confidence_score,
            "should_review_manually": self.should_review_manually,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AdaptiveScoringComparisonResult":
        return cls(
            legacy_match_score=data.get("legacy_match_score", 0.0),
            adaptive_match_score=data.get("adaptive_match_score", 0.0),
            delta=data.get("delta", 0.0),
            legacy_recommendation=data.get("legacy_recommendation", ""),
            adaptive_recommendation=data.get("adaptive_recommendation", ""),
            explanation=data.get("explanation", ""),
            major_differences=data.get("major_differences") or [],
            confidence_score=data.get("confidence_score", 0.0),
            should_review_manually=data.get("should_review_manually", False),
        )
