from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import MatchingObservationModel
from src.infrastructure.database.models.job_model import JobModel


def _to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _clean_text_list(values: list[Any] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = str(value).strip()
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


@dataclass(slots=True)
class AggregatedItem:
    name: str
    count: int

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "count": self.count}


@dataclass(slots=True)
class JobNegativeFeedbackItem:
    job_id: UUID
    job_title: str
    negative_feedback_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "job_title": self.job_title,
            "negative_feedback_count": self.negative_feedback_count,
        }


@dataclass(slots=True)
class MatchingObservabilitySummary:
    total_observations: int
    adaptive_count: int
    legacy_count: int
    average_score: float
    average_confidence: float
    high_score_negative_feedback: int
    low_score_positive_feedback: int
    top_missing_skills: list[AggregatedItem]
    top_equivalences_used: list[AggregatedItem]
    jobs_with_most_negative_feedback: list[JobNegativeFeedbackItem]

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_observations": self.total_observations,
            "adaptive_count": self.adaptive_count,
            "legacy_count": self.legacy_count,
            "average_score": round(self.average_score, 2),
            "average_confidence": round(self.average_confidence, 2),
            "high_score_negative_feedback": self.high_score_negative_feedback,
            "low_score_positive_feedback": self.low_score_positive_feedback,
            "top_missing_skills": [item.to_dict() for item in self.top_missing_skills],
            "top_equivalences_used": [item.to_dict() for item in self.top_equivalences_used],
            "jobs_with_most_negative_feedback": [
                item.to_dict() for item in self.jobs_with_most_negative_feedback
            ],
        }


class MatchingObservabilityAdminService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_summary(self) -> MatchingObservabilitySummary:
        rows = (
            await self._session.execute(
                sa.select(MatchingObservationModel, JobModel.title.label("job_title"))
                .join(JobModel, JobModel.id == MatchingObservationModel.job_id)
                .order_by(MatchingObservationModel.observed_at.desc())
            )
        ).all()

        observations = [row[0] for row in rows]
        total = len(observations)

        adaptive_count = sum(1 for item in observations if item.engine_used == "adaptive")
        legacy_count = sum(1 for item in observations if item.engine_used == "legacy")

        average_score = (
            sum(_to_float(item.score) for item in observations) / total if total else 0.0
        )
        average_confidence = (
            sum(_to_float(item.confidence_score) for item in observations) / total if total else 0.0
        )

        high_score_negative_feedback = 0
        low_score_positive_feedback = 0
        missing_counter: Counter[str] = Counter()
        equivalence_counter: Counter[str] = Counter()
        negative_by_job: Counter[tuple[UUID, str]] = Counter()

        for observation, job_title in rows:
            score_value = _to_float(observation.score)
            liked = observation.liked
            rejected = observation.rejected
            hired = observation.hired

            is_negative_feedback = rejected is True or liked is False
            is_positive_feedback = liked is True or hired is True

            if score_value >= 75.0 and is_negative_feedback:
                high_score_negative_feedback += 1
            if score_value < 50.0 and is_positive_feedback:
                low_score_positive_feedback += 1

            if is_negative_feedback:
                negative_by_job[(observation.job_id, str(job_title or "Vaga sem título"))] += 1

            missing_counter.update(_clean_text_list(observation.missing_skills))
            equivalence_counter.update(_clean_text_list(observation.equivalences_used))

        top_missing_skills = [
            AggregatedItem(name=name, count=count)
            for name, count in missing_counter.most_common(10)
        ]
        top_equivalences_used = [
            AggregatedItem(name=name, count=count)
            for name, count in equivalence_counter.most_common(10)
        ]
        jobs_with_most_negative_feedback = [
            JobNegativeFeedbackItem(
                job_id=job_id,
                job_title=job_title,
                negative_feedback_count=count,
            )
            for (job_id, job_title), count in negative_by_job.most_common(10)
        ]

        return MatchingObservabilitySummary(
            total_observations=total,
            adaptive_count=adaptive_count,
            legacy_count=legacy_count,
            average_score=average_score,
            average_confidence=average_confidence,
            high_score_negative_feedback=high_score_negative_feedback,
            low_score_positive_feedback=low_score_positive_feedback,
            top_missing_skills=top_missing_skills,
            top_equivalences_used=top_equivalences_used,
            jobs_with_most_negative_feedback=jobs_with_most_negative_feedback,
        )
