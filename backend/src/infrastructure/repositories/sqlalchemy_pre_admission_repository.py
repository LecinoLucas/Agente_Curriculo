from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)


class SQLAlchemyPreAdmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _case_options():
        return selectinload(PreAdmissionCaseModel.checklist_items).selectinload(
            PreAdmissionChecklistItemModel.documents
        )

    async def get_hire_decision(self, *, candidate_id: UUID, job_id: UUID) -> CandidateJobHiringDecisionModel | None:
        stmt = (
            sa.select(CandidateJobHiringDecisionModel)
            .where(
                CandidateJobHiringDecisionModel.candidate_id == candidate_id,
                CandidateJobHiringDecisionModel.job_id == job_id,
                CandidateJobHiringDecisionModel.decision_status == "submitted",
                CandidateJobHiringDecisionModel.decision_outcome == "hire",
            )
            .order_by(CandidateJobHiringDecisionModel.submitted_at.desc().nullslast(), CandidateJobHiringDecisionModel.created_at.desc())
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_latest_decision(self, *, candidate_id: UUID, job_id: UUID) -> CandidateJobHiringDecisionModel | None:
        stmt = (
            sa.select(CandidateJobHiringDecisionModel)
            .where(
                CandidateJobHiringDecisionModel.candidate_id == candidate_id,
                CandidateJobHiringDecisionModel.job_id == job_id,
                CandidateJobHiringDecisionModel.decision_status == "submitted",
            )
            .order_by(CandidateJobHiringDecisionModel.submitted_at.desc().nullslast(), CandidateJobHiringDecisionModel.created_at.desc())
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_active_case(self, *, candidate_id: UUID, job_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .where(
                PreAdmissionCaseModel.candidate_id == candidate_id,
                PreAdmissionCaseModel.job_id == job_id,
                PreAdmissionCaseModel.status.not_in(["admitted", "cancelled", "offer_declined"]),
            )
            .order_by(PreAdmissionCaseModel.created_at.desc())
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_case_by_decision(self, *, decision_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .where(PreAdmissionCaseModel.hiring_decision_id == decision_id)
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_case(self, case_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .where(PreAdmissionCaseModel.id == case_id)
        )
        return await self._session.scalar(stmt)

    async def get_candidate_case(self, *, candidate_id: UUID, case_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .where(
                PreAdmissionCaseModel.id == case_id,
                PreAdmissionCaseModel.candidate_id == candidate_id,
            )
        )
        return await self._session.scalar(stmt)

    async def get_candidate_pre_admission_case(self, *, candidate_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .where(
                PreAdmissionCaseModel.candidate_id == candidate_id,
                PreAdmissionCaseModel.status.not_in(["cancelled"]),
            )
            .order_by(PreAdmissionCaseModel.created_at.desc())
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_checklist_item(self, *, case_id: UUID, item_id: UUID) -> PreAdmissionChecklistItemModel | None:
        stmt = sa.select(PreAdmissionChecklistItemModel).where(
            PreAdmissionChecklistItemModel.case_id == case_id,
            PreAdmissionChecklistItemModel.id == item_id,
        )
        return await self._session.scalar(stmt)

    async def list_documents(self, *, case_id: UUID) -> list[PreAdmissionDocumentModel]:
        stmt = (
            sa.select(PreAdmissionDocumentModel)
            .where(PreAdmissionDocumentModel.case_id == case_id)
            .order_by(PreAdmissionDocumentModel.uploaded_at.desc(), PreAdmissionDocumentModel.created_at.desc())
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_document(self, document_id: UUID) -> PreAdmissionDocumentModel | None:
        return await self._session.get(PreAdmissionDocumentModel, document_id)

    async def get_candidate_document(self, *, candidate_id: UUID, document_id: UUID) -> PreAdmissionDocumentModel | None:
        stmt = sa.select(PreAdmissionDocumentModel).where(
            PreAdmissionDocumentModel.id == document_id,
            PreAdmissionDocumentModel.candidate_id == candidate_id,
        )
        return await self._session.scalar(stmt)

    async def active_document_for_item(self, *, case_id: UUID, item_id: UUID) -> PreAdmissionDocumentModel | None:
        stmt = (
            sa.select(PreAdmissionDocumentModel)
            .where(
                PreAdmissionDocumentModel.case_id == case_id,
                PreAdmissionDocumentModel.checklist_item_id == item_id,
                PreAdmissionDocumentModel.status.in_(["uploaded", "approved", "rejected"]),
            )
            .order_by(PreAdmissionDocumentModel.uploaded_at.desc(), PreAdmissionDocumentModel.created_at.desc())
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def list_events(self, *, case_id: UUID) -> list[PreAdmissionEventModel]:
        stmt = (
            sa.select(PreAdmissionEventModel)
            .where(PreAdmissionEventModel.case_id == case_id)
            .order_by(PreAdmissionEventModel.created_at.asc(), PreAdmissionEventModel.id.asc())
        )
        return list((await self._session.scalars(stmt)).all())

    async def add_case(self, case: PreAdmissionCaseModel) -> None:
        self._session.add(case)
        await self._session.flush()
        await self._session.refresh(case, attribute_names=["checklist_items"])

    async def add_checklist_item(self, item: PreAdmissionChecklistItemModel) -> None:
        self._session.add(item)
        await self._session.flush()

    async def add_event(self, event: PreAdmissionEventModel) -> None:
        self._session.add(event)
        await self._session.flush()

    async def add_document(self, document: PreAdmissionDocumentModel) -> None:
        self._session.add(document)
        await self._session.flush()

    async def flush(self) -> None:
        await self._session.flush()
