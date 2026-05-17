from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_salary_expectation import has_salary_expectation
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel


class CandidateProfileNotFoundError(Exception):
    pass


@dataclass(slots=True)
class CandidateProfileCompletionState:
    has_resume: bool
    missing_fields: list[str]


class CandidateProfileCompletionService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_completion_state(self, candidate_id: UUID) -> CandidateProfileCompletionState:
        candidate = await self._get_candidate_row(candidate_id)
        if candidate is None:
            raise CandidateProfileNotFoundError

        has_resume = await self._has_resume(candidate_id)
        return CandidateProfileCompletionState(
            has_resume=has_resume,
            missing_fields=self.find_missing_fields(candidate, has_resume=has_resume),
        )

    @staticmethod
    def find_missing_fields(candidate: Mapping[str, Any], *, has_resume: bool) -> list[str]:
        missing_fields: list[str] = []
        if not candidate.get("full_name") or not str(candidate["full_name"]).strip():
            missing_fields.append("full_name")
        if not candidate.get("email") or not str(candidate["email"]).strip():
            missing_fields.append("email")
        if not candidate.get("phone") or not str(candidate["phone"]).strip():
            missing_fields.append("phone")
        if not candidate.get("cpf") or not str(candidate["cpf"]).strip():
            missing_fields.append("cpf")
        if not has_salary_expectation(candidate.get("salary_expectation")):
            missing_fields.append("salary_expectation")
        if not has_resume:
            missing_fields.append("resume")
        if candidate.get("lgpd_consent_at") is None:
            missing_fields.append("lgpd_consent")
        return missing_fields

    async def _get_candidate_row(self, candidate_id: UUID) -> dict[str, Any] | None:
        row = await self._db.execute(
            sa.select(
                CandidateModel.id,
                CandidateModel.full_name,
                CandidateModel.email,
                CandidateModel.phone,
                CandidateModel.cpf,
                CandidateModel.salary_expectation,
                CandidateModel.lgpd_consent_at,
            ).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def _has_resume(self, candidate_id: UUID) -> bool:
        return bool(
            await self._db.scalar(
                sa.select(
                    sa.exists().where(
                        ResumeModel.candidate_id == candidate_id,
                        ResumeModel.deleted_at.is_(None),
                    )
                )
            )
        )
