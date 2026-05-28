from __future__ import annotations

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionChecklistTemplateItemModel,
    PreAdmissionChecklistTemplateModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.database.models.user_model import UserModel


class SQLAlchemyPreAdmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _case_options():
        return selectinload(PreAdmissionCaseModel.checklist_items).selectinload(
            PreAdmissionChecklistItemModel.documents
        )

    @staticmethod
    def _case_overview_options():
        return selectinload(PreAdmissionCaseModel.checklist_items)

    @staticmethod
    def _template_options():
        return selectinload(PreAdmissionChecklistTemplateModel.items)

    @staticmethod
    def _admitted_at_expr():
        return sa.func.coalesce(PreAdmissionCaseModel.closed_at, PreAdmissionCaseModel.updated_at)

    @staticmethod
    def _admitted_candidates_filters(
        search: str | None = None,
        *,
        statuses: tuple[str, ...] = ("admitted", "dismissed"),
    ) -> list[sa.ColumnElement[bool]]:
        filters: list[sa.ColumnElement[bool]] = [
            PreAdmissionCaseModel.status.in_(statuses),
            CandidateModel.deleted_at.is_(None),
            JobModel.deleted_at.is_(None),
        ]
        search_term = (search or "").strip().lower()
        if search_term:
            like = f"%{search_term}%"
            filters.append(
                sa.or_(
                    sa.func.lower(sa.func.coalesce(CandidateModel.full_name, "")).like(like),
                    sa.func.lower(sa.func.coalesce(CandidateModel.email, "")).like(like),
                    sa.func.lower(sa.func.coalesce(JobModel.title, "")).like(like),
                )
            )
        return filters

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

    async def list_admitted_candidates(
        self,
        *,
        offset: int,
        limit: int,
        search: str | None = None,
        statuses: tuple[str, ...] = ("admitted", "dismissed"),
    ) -> tuple[list[dict], int]:
        filters = self._admitted_candidates_filters(search, statuses=statuses)
        admitted_at = self._admitted_at_expr()

        total = int(
            await self._session.scalar(
                sa.select(sa.func.count())
                .select_from(PreAdmissionCaseModel)
                .join(CandidateModel, CandidateModel.id == PreAdmissionCaseModel.candidate_id)
                .join(JobModel, JobModel.id == PreAdmissionCaseModel.job_id)
                .where(*filters)
            )
            or 0
        )
        rows = await self._session.execute(
            sa.select(
                PreAdmissionCaseModel.candidate_id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.email.label("candidate_email"),
                PreAdmissionCaseModel.job_id.label("job_id"),
                JobModel.title.label("job_title"),
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                PreAdmissionCaseModel.id.label("admission_case_id"),
                PreAdmissionCaseModel.status.label("admission_status"),
                admitted_at.label("admitted_at"),
                PreAdmissionCaseModel.dismissed_at.label("dismissed_at"),
                PreAdmissionCaseModel.updated_at.label("updated_at"),
                PreAdmissionCaseModel.start_date,
                PreAdmissionCaseModel.work_model,
            )
            .select_from(PreAdmissionCaseModel)
            .join(CandidateModel, CandidateModel.id == PreAdmissionCaseModel.candidate_id)
            .join(JobModel, JobModel.id == PreAdmissionCaseModel.job_id)
            .outerjoin(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == PreAdmissionCaseModel.candidate_id,
                    CandidateJobPipelineModel.job_id == PreAdmissionCaseModel.job_id,
                ),
            )
            .where(*filters)
            .order_by(admitted_at.desc(), PreAdmissionCaseModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [dict(row) for row in rows.mappings().all()], total

    async def admitted_candidates_summary(
        self,
        *,
        month_start: datetime,
        search: str | None = None,
    ) -> tuple[int, datetime | None]:
        filters = self._admitted_candidates_filters(search, statuses=("admitted",))
        admitted_at = self._admitted_at_expr()
        admitted_this_month = int(
            await self._session.scalar(
                sa.select(sa.func.count())
                .select_from(PreAdmissionCaseModel)
                .join(CandidateModel, CandidateModel.id == PreAdmissionCaseModel.candidate_id)
                .join(JobModel, JobModel.id == PreAdmissionCaseModel.job_id)
                .where(*filters, admitted_at >= month_start)
            )
            or 0
        )
        latest_admitted_at = await self._session.scalar(
            sa.select(sa.func.max(admitted_at))
            .select_from(PreAdmissionCaseModel)
            .join(CandidateModel, CandidateModel.id == PreAdmissionCaseModel.candidate_id)
            .join(JobModel, JobModel.id == PreAdmissionCaseModel.job_id)
            .where(*filters)
        )
        return admitted_this_month, latest_admitted_at

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

    async def list_checklist_templates(self) -> list[PreAdmissionChecklistTemplateModel]:
        stmt = (
            sa.select(PreAdmissionChecklistTemplateModel)
            .options(self._template_options())
            .order_by(
                PreAdmissionChecklistTemplateModel.is_default.desc(),
                PreAdmissionChecklistTemplateModel.is_active.desc(),
                PreAdmissionChecklistTemplateModel.updated_at.desc(),
                PreAdmissionChecklistTemplateModel.created_at.desc(),
            )
        )
        return list((await self._session.scalars(stmt)).unique().all())

    async def get_checklist_template(self, template_id: UUID) -> PreAdmissionChecklistTemplateModel | None:
        stmt = (
            sa.select(PreAdmissionChecklistTemplateModel)
            .options(self._template_options())
            .execution_options(populate_existing=True)
            .where(PreAdmissionChecklistTemplateModel.id == template_id)
        )
        return await self._session.scalar(stmt)

    async def get_active_checklist_template(self, template_id: UUID) -> PreAdmissionChecklistTemplateModel | None:
        stmt = (
            sa.select(PreAdmissionChecklistTemplateModel)
            .options(self._template_options())
            .execution_options(populate_existing=True)
            .where(
                PreAdmissionChecklistTemplateModel.id == template_id,
                PreAdmissionChecklistTemplateModel.is_active.is_(True),
            )
        )
        return await self._session.scalar(stmt)

    async def get_default_active_checklist_template(self) -> PreAdmissionChecklistTemplateModel | None:
        stmt = (
            sa.select(PreAdmissionChecklistTemplateModel)
            .options(self._template_options())
            .execution_options(populate_existing=True)
            .where(
                PreAdmissionChecklistTemplateModel.is_default.is_(True),
                PreAdmissionChecklistTemplateModel.is_active.is_(True),
            )
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_checklist_template_item(
        self,
        *,
        template_id: UUID,
        item_id: UUID,
    ) -> PreAdmissionChecklistTemplateItemModel | None:
        stmt = sa.select(PreAdmissionChecklistTemplateItemModel).where(
            PreAdmissionChecklistTemplateItemModel.template_id == template_id,
            PreAdmissionChecklistTemplateItemModel.id == item_id,
        )
        return await self._session.scalar(stmt)

    async def list_active_checklist_template_items(
        self,
        *,
        template_id: UUID,
    ) -> list[PreAdmissionChecklistTemplateItemModel]:
        stmt = (
            sa.select(PreAdmissionChecklistTemplateItemModel)
            .where(
                PreAdmissionChecklistTemplateItemModel.template_id == template_id,
                PreAdmissionChecklistTemplateItemModel.is_active.is_(True),
            )
            .order_by(
                PreAdmissionChecklistTemplateItemModel.display_order,
                PreAdmissionChecklistTemplateItemModel.created_at,
                PreAdmissionChecklistTemplateItemModel.id,
            )
        )
        return list((await self._session.scalars(stmt)).all())

    async def get_case(self, case_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .where(PreAdmissionCaseModel.id == case_id)
        )
        return await self._session.scalar(stmt)

    async def get_case_overview(self, case_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_overview_options())
            .where(PreAdmissionCaseModel.id == case_id)
        )
        return await self._session.scalar(stmt)

    async def get_candidate_case(self, *, candidate_id: UUID, case_id: UUID) -> PreAdmissionCaseModel | None:
        stmt = (
            sa.select(PreAdmissionCaseModel)
            .options(self._case_options())
            .execution_options(populate_existing=True)
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
            .execution_options(populate_existing=True)
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

    async def get_checklist_item_by_id(self, item_id: UUID) -> PreAdmissionChecklistItemModel | None:
        stmt = (
            sa.select(PreAdmissionChecklistItemModel)
            .options(selectinload(PreAdmissionChecklistItemModel.documents))
            .where(PreAdmissionChecklistItemModel.id == item_id)
        )
        return await self._session.scalar(stmt)

    async def get_active_pipeline_for_candidate(
        self,
        *,
        candidate_id: UUID,
    ) -> CandidateJobPipelineModel | None:
        stmt = (
            sa.select(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_active_pipeline_for_job_candidate(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobPipelineModel | None:
        stmt = (
            sa.select(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_latest_pipeline_for_job_candidate(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobPipelineModel | None:
        stmt = (
            sa.select(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
            )
            .order_by(
                CandidateJobPipelineModel.terminated_at.desc().nullslast(),
                CandidateJobPipelineModel.updated_at.desc(),
                CandidateJobPipelineModel.entered_at.desc(),
                CandidateJobPipelineModel.candidate_job_pipeline_id.desc(),
            )
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_candidate(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.get(CandidateModel, candidate_id)

    async def get_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.get(JobModel, job_id)

    async def get_user_names(self, user_ids: set[UUID]) -> dict[UUID, str]:
        if not user_ids:
            return {}
        rows = await self._session.execute(
            sa.select(UserModel.id, UserModel.full_name).where(UserModel.id.in_(user_ids))
        )
        return {row.id: row.full_name for row in rows}

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

    async def list_recent_events(
        self,
        *,
        case_id: UUID,
        limit: int = 10,
    ) -> list[PreAdmissionEventModel]:
        stmt = (
            sa.select(PreAdmissionEventModel)
            .where(PreAdmissionEventModel.case_id == case_id)
            .order_by(PreAdmissionEventModel.created_at.desc(), PreAdmissionEventModel.id.desc())
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())

    async def count_events(self, *, case_id: UUID) -> int:
        total = await self._session.scalar(
            sa.select(sa.func.count(PreAdmissionEventModel.id)).where(
                PreAdmissionEventModel.case_id == case_id
            )
        )
        return int(total or 0)

    async def list_events_page(
        self,
        *,
        case_id: UUID,
        offset: int,
        limit: int,
    ) -> list[PreAdmissionEventModel]:
        stmt = (
            sa.select(PreAdmissionEventModel)
            .where(PreAdmissionEventModel.case_id == case_id)
            .order_by(PreAdmissionEventModel.created_at.desc(), PreAdmissionEventModel.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())

    async def add_case(self, case: PreAdmissionCaseModel) -> None:
        self._session.add(case)
        await self._session.flush()
        await self._session.refresh(case, attribute_names=["checklist_items"])

    async def add_checklist_template(self, template: PreAdmissionChecklistTemplateModel) -> None:
        self._session.add(template)
        await self._session.flush()

    async def add_checklist_template_item(self, item: PreAdmissionChecklistTemplateItemModel) -> None:
        self._session.add(item)
        await self._session.flush()

    async def add_checklist_item(self, item: PreAdmissionChecklistItemModel) -> None:
        self._session.add(item)
        await self._session.flush()

    async def add_event(self, event: PreAdmissionEventModel) -> None:
        self._session.add(event)
        await self._session.flush()

    async def add_document(self, document: PreAdmissionDocumentModel) -> None:
        self._session.add(document)
        await self._session.flush()

    async def clear_default_checklist_templates(self, *, exclude_template_id: UUID | None = None) -> None:
        stmt = sa.update(PreAdmissionChecklistTemplateModel).values(is_default=False)
        if exclude_template_id is not None:
            stmt = stmt.where(PreAdmissionChecklistTemplateModel.id != exclude_template_id)
        await self._session.execute(stmt)

    async def flush(self) -> None:
        await self._session.flush()
