from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import MatchingObservationModel


def _to_decimal(value: Decimal | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0")
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0")


def _clean_list(values: list[str] | None) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = str(value).strip()
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        deduped.append(text)
    return deduped


@dataclass(slots=True)
class MatchingFeedbackPayload:
    job_id: UUID
    candidate_id: UUID
    liked: bool | None
    rejected: bool | None
    hired: bool | None
    comment: str | None
    feedback_by: UUID | None
    feedback_at: datetime | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "candidate_id": self.candidate_id,
            "liked": self.liked,
            "rejected": self.rejected,
            "hired": self.hired,
            "comment": self.comment,
            "feedback_by": self.feedback_by,
            "feedback_at": self.feedback_at,
        }


class MatchingObservabilityService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
            SQLAlchemyPipelineRepository,
        )
        self._pipeline_repo = SQLAlchemyPipelineRepository(session)

    async def record_snapshot(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        analysis_id: UUID,
        engine_used: str,
        score: Decimal | float | int | None,
        confidence_score: Decimal | float | int | None,
        matched_skills: list[str] | None,
        missing_skills: list[str] | None,
        equivalences_used: list[str] | None,
        source: str = "ui",
    ) -> MatchingObservationModel:
        now = datetime.now(UTC)
        observation = MatchingObservationModel(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=analysis_id,
            created_at=now,
        )
        observation.analysis_id = analysis_id
        observation.engine_used = (engine_used or "unknown").strip() or "unknown"
        observation.score = _to_decimal(score)
        observation.confidence_score = _to_decimal(confidence_score)
        observation.matched_skills = _clean_list(matched_skills)
        observation.missing_skills = _clean_list(missing_skills)
        observation.equivalences_used = _clean_list(equivalences_used)
        observation.source = (source or "ui").strip() or "ui"
        observation.observed_at = now
        observation.updated_at = now

        self._session.add(observation)
        await self._session.flush()
        return observation

    async def save_feedback(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        analysis_id: UUID | None,
        liked: bool | None,
        rejected: bool | None,
        hired: bool | None,
        comment: str | None,
        feedback_by: UUID,
    ) -> MatchingObservationModel:
        entry = await self._pipeline_repo.find_active_entry(candidate_id, job_id)
        if entry is None:
            raise ValueError(f"Candidate {candidate_id} is not linked to job {job_id}")

        observation = await self._latest_ui_snapshot(job_id, candidate_id)
        now = datetime.now(UTC)

        if observation is None:
            observation = MatchingObservationModel(
                job_id=job_id,
                candidate_id=candidate_id,
                analysis_id=analysis_id,
                created_at=now,
            )
            observation.source = "ui"

        if analysis_id is not None:
            observation.analysis_id = analysis_id
        observation.liked = liked
        observation.rejected = rejected
        observation.hired = hired
        observation.feedback_comment = (comment or "").strip() or None
        observation.feedback_by = feedback_by
        observation.feedback_at = now
        observation.updated_at = now

        self._session.add(observation)
        await self._session.flush()
        return observation

    async def get_feedback(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
    ) -> MatchingFeedbackPayload | None:
        observation = await self._latest_feedback(job_id, candidate_id)
        return self.feedback_payload(observation)

    @staticmethod
    def feedback_payload(observation: MatchingObservationModel | None) -> MatchingFeedbackPayload | None:
        if observation is None:
            return None
        if (
            observation.liked is None
            and observation.rejected is None
            and observation.hired is None
            and not observation.feedback_comment
            and observation.feedback_by is None
            and observation.feedback_at is None
        ):
            return None
        return MatchingFeedbackPayload(
            job_id=observation.job_id,
            candidate_id=observation.candidate_id,
            liked=observation.liked,
            rejected=observation.rejected,
            hired=observation.hired,
            comment=observation.feedback_comment,
            feedback_by=observation.feedback_by,
            feedback_at=observation.feedback_at,
        )

    async def _latest_ui_snapshot(self, job_id: UUID, candidate_id: UUID) -> MatchingObservationModel | None:
        return await self._session.scalar(
            sa.select(MatchingObservationModel).where(
                MatchingObservationModel.job_id == job_id,
                MatchingObservationModel.candidate_id == candidate_id,
                MatchingObservationModel.source == "ui",
            )
            .order_by(
                MatchingObservationModel.observed_at.desc(),
                MatchingObservationModel.created_at.desc(),
            )
            .limit(1)
        )

    async def _latest_feedback(self, job_id: UUID, candidate_id: UUID) -> MatchingObservationModel | None:
        return await self._session.scalar(
            sa.select(MatchingObservationModel).where(
                MatchingObservationModel.job_id == job_id,
                MatchingObservationModel.candidate_id == candidate_id,
                sa.or_(
                    MatchingObservationModel.liked.is_not(None),
                    MatchingObservationModel.rejected.is_not(None),
                    MatchingObservationModel.hired.is_not(None),
                    MatchingObservationModel.feedback_comment.is_not(None),
                    MatchingObservationModel.feedback_by.is_not(None),
                    MatchingObservationModel.feedback_at.is_not(None),
                ),
            )
            .order_by(
                MatchingObservationModel.feedback_at.desc().nulls_last(),
                MatchingObservationModel.observed_at.desc(),
                MatchingObservationModel.created_at.desc(),
            )
            .limit(1)
        )
