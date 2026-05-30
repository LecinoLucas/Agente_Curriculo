from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
)
from src.interface.api.dependencies import get_db, require_roles
from src.interface.api.schemas.rh_dashboard_schemas import (
    RhDashboardPendingAction,
    RhDashboardResponse,
    RhDashboardSummary,
)

router = APIRouter(prefix="/rh", tags=["rh"])

_LOCAL_TZ = ZoneInfo("America/Sao_Paulo")
_ACTIVE_INTERVIEW_STATUSES = ("scheduled", "rescheduled")
_ACTIVE_PRE_ADMISSION_STATUSES = (
    "draft",
    "offer_preparing",
    "offer_sent",
    "offer_accepted",
    "documents_pending",
    "documents_received",
    "ready_for_admission",
)


def _day_bounds(now: datetime) -> tuple[datetime, datetime]:
    local_now = now.astimezone(_LOCAL_TZ)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(UTC), local_end.astimezone(UTC)


def _month_start(now: datetime) -> datetime:
    local_now = now.astimezone(_LOCAL_TZ)
    return local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)


async def _count(db: AsyncSession, stmt) -> int:
    value = await db.scalar(stmt)
    return int(value or 0)


def _pipeline_candidate_job_stmt(*columns):
    return (
        sa.select(*columns)
        .select_from(CandidateJobPipelineModel)
        .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
        .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
        .where(
            CandidateJobPipelineModel.relationship_status == "active",
            CandidateJobPipelineModel.is_terminal.is_(False),
            CandidateJobPipelineModel.pipeline_status == "active",
            CandidateModel.deleted_at.is_(None),
            CandidateModel.archived_at.is_(None),
            JobModel.deleted_at.is_(None),
            JobModel.archived_at.is_(None),
        )
    )


def _pipeline_href(job_id, candidate_id) -> str:
    return f"/pipeline/{job_id}?candidateId={candidate_id}"


def _format_time(value: datetime) -> str:
    return value.astimezone(_LOCAL_TZ).strftime("%H:%M")


async def _load_summary(db: AsyncSession, today_start: datetime, today_end: datetime, month_start: datetime) -> RhDashboardSummary:
    submitted_decision_exists = (
        sa.select(sa.literal(1))
        .select_from(CandidateJobHiringDecisionModel)
        .where(
            CandidateJobHiringDecisionModel.candidate_id == CandidateJobPipelineModel.candidate_id,
            CandidateJobHiringDecisionModel.job_id == CandidateJobPipelineModel.job_id,
            CandidateJobHiringDecisionModel.decision_status == "submitted",
        )
        .exists()
    )

    return RhDashboardSummary(
        new_candidates=await _count(
            db,
            sa.select(sa.func.count(CandidateModel.id)).where(
                CandidateModel.created_at >= today_start,
                CandidateModel.created_at < today_end,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            ),
        ),
        interviews_today=await _count(
            db,
            sa.select(sa.func.count(InterviewScheduleModel.id)).where(
                InterviewScheduleModel.status.in_(_ACTIVE_INTERVIEW_STATUSES),
                InterviewScheduleModel.scheduled_start >= today_start,
                InterviewScheduleModel.scheduled_start < today_end,
            ),
        ),
        pending_decisions=await _count(
            db,
            _pipeline_candidate_job_stmt(sa.func.count())
            .where(CandidateJobPipelineModel.pipeline_stage.in_(("final", "offer")))
            .where(sa.not_(submitted_decision_exists)),
        ),
        pending_pre_admissions=await _count(
            db,
            sa.select(sa.func.count(PreAdmissionCaseModel.id)).where(
                PreAdmissionCaseModel.status.in_(_ACTIVE_PRE_ADMISSION_STATUSES),
            ),
        ),
        admitted_this_month=await _count(
            db,
            sa.select(sa.func.count(PreAdmissionCaseModel.id)).where(
                PreAdmissionCaseModel.status == "admitted",
                PreAdmissionCaseModel.updated_at >= month_start,
            ),
        ),
    )


async def _interview_today_actions(
    db: AsyncSession,
    today_start: datetime,
    today_end: datetime,
    limit: int,
) -> list[RhDashboardPendingAction]:
    rows = (
        await db.execute(
            sa.select(
                InterviewScheduleModel.candidate_id,
                InterviewScheduleModel.job_id,
                InterviewScheduleModel.scheduled_start,
                CandidateModel.full_name,
                JobModel.title,
            )
            .join(CandidateModel, CandidateModel.id == InterviewScheduleModel.candidate_id)
            .outerjoin(JobModel, JobModel.id == InterviewScheduleModel.job_id)
            .where(
                InterviewScheduleModel.status.in_(_ACTIVE_INTERVIEW_STATUSES),
                InterviewScheduleModel.scheduled_start >= today_start,
                InterviewScheduleModel.scheduled_start < today_end,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
            .order_by(InterviewScheduleModel.scheduled_start.asc())
            .limit(limit)
        )
    ).all()

    return [
        RhDashboardPendingAction(
            type="interview_today",
            candidate_id=row.candidate_id,
            candidate_name=row.full_name,
            job_id=row.job_id,
            job_title=row.title,
            label=f"Entrevista hoje às {_format_time(row.scheduled_start)}",
            action_label="Abrir Agenda",
            href="/agenda",
        )
        for row in rows
    ]


async def _schedule_interview_actions(
    db: AsyncSession,
    now: datetime,
    limit: int,
) -> list[RhDashboardPendingAction]:
    interview_exists = (
        sa.select(sa.literal(1))
        .select_from(InterviewScheduleModel)
        .where(
            InterviewScheduleModel.candidate_id == CandidateJobPipelineModel.candidate_id,
            InterviewScheduleModel.job_id == CandidateJobPipelineModel.job_id,
            InterviewScheduleModel.status.in_(_ACTIVE_INTERVIEW_STATUSES),
            InterviewScheduleModel.scheduled_start >= now,
        )
        .exists()
    )
    rows = (
        await db.execute(
            _pipeline_candidate_job_stmt(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateModel.full_name,
                JobModel.title,
            )
            .where(CandidateJobPipelineModel.pipeline_stage.in_(("screening", "hr_interview")))
            .where(sa.not_(interview_exists))
            .order_by(CandidateJobPipelineModel.updated_at.asc())
            .limit(limit)
        )
    ).all()

    return [
        RhDashboardPendingAction(
            type="schedule_interview",
            candidate_id=row.candidate_id,
            candidate_name=row.full_name,
            job_id=row.job_id,
            job_title=row.title,
            label="Marcar entrevista",
            action_label="Abrir Candidaturas",
            href="/candidaturas",
        )
        for row in rows
    ]


async def _decision_actions(db: AsyncSession, limit: int) -> list[RhDashboardPendingAction]:
    submitted_decision_exists = (
        sa.select(sa.literal(1))
        .select_from(CandidateJobHiringDecisionModel)
        .where(
            CandidateJobHiringDecisionModel.candidate_id == CandidateJobPipelineModel.candidate_id,
            CandidateJobHiringDecisionModel.job_id == CandidateJobPipelineModel.job_id,
            CandidateJobHiringDecisionModel.decision_status == "submitted",
        )
        .exists()
    )
    rows = (
        await db.execute(
            _pipeline_candidate_job_stmt(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateModel.full_name,
                JobModel.title,
            )
            .where(CandidateJobPipelineModel.pipeline_stage.in_(("final", "offer")))
            .where(sa.not_(submitted_decision_exists))
            .order_by(CandidateJobPipelineModel.updated_at.asc())
            .limit(limit)
        )
    ).all()

    return [
        RhDashboardPendingAction(
            type="register_decision",
            candidate_id=row.candidate_id,
            candidate_name=row.full_name,
            job_id=row.job_id,
            job_title=row.title,
            label="Registrar decisão",
            action_label="Abrir Pipeline",
            href=_pipeline_href(row.job_id, row.candidate_id),
        )
        for row in rows
    ]


async def _start_pre_admission_actions(db: AsyncSession, limit: int) -> list[RhDashboardPendingAction]:
    pre_admission_exists = (
        sa.select(sa.literal(1))
        .select_from(PreAdmissionCaseModel)
        .where(
            PreAdmissionCaseModel.candidate_id == CandidateJobPipelineModel.candidate_id,
            PreAdmissionCaseModel.job_id == CandidateJobPipelineModel.job_id,
            PreAdmissionCaseModel.status.in_(_ACTIVE_PRE_ADMISSION_STATUSES),
        )
        .exists()
    )
    rows = (
        await db.execute(
            _pipeline_candidate_job_stmt(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateModel.full_name,
                JobModel.title,
            )
            .where(CandidateJobPipelineModel.pipeline_stage == "hired")
            .where(sa.not_(pre_admission_exists))
            .order_by(CandidateJobPipelineModel.updated_at.asc())
            .limit(limit)
        )
    ).all()

    return [
        RhDashboardPendingAction(
            type="start_pre_admission",
            candidate_id=row.candidate_id,
            candidate_name=row.full_name,
            job_id=row.job_id,
            job_title=row.title,
            label="Iniciar pré-admissão",
            action_label="Abrir Pipeline",
            href=_pipeline_href(row.job_id, row.candidate_id),
        )
        for row in rows
    ]


async def _document_pending_actions(db: AsyncSession, limit: int) -> list[RhDashboardPendingAction]:
    rows = (
        await db.execute(
            sa.select(
                PreAdmissionCaseModel.id,
                PreAdmissionCaseModel.candidate_id,
                PreAdmissionCaseModel.job_id,
                CandidateModel.full_name,
                JobModel.title,
            )
            .join(CandidateModel, CandidateModel.id == PreAdmissionCaseModel.candidate_id)
            .join(JobModel, JobModel.id == PreAdmissionCaseModel.job_id)
            .join(PreAdmissionChecklistItemModel, PreAdmissionChecklistItemModel.case_id == PreAdmissionCaseModel.id)
            .where(
                PreAdmissionCaseModel.status.in_(("documents_pending", "documents_received")),
                PreAdmissionChecklistItemModel.status.in_(("pending", "rejected")),
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
            .group_by(
                PreAdmissionCaseModel.id,
                PreAdmissionCaseModel.candidate_id,
                PreAdmissionCaseModel.job_id,
                CandidateModel.full_name,
                JobModel.title,
            )
            .order_by(PreAdmissionCaseModel.updated_at.asc())
            .limit(limit)
        )
    ).all()

    return [
        RhDashboardPendingAction(
            type="document_pending",
            candidate_id=row.candidate_id,
            candidate_name=row.full_name,
            job_id=row.job_id,
            job_title=row.title,
            label="Documento pendente",
            action_label="Abrir Pré-admissão",
            href=f"/admissao/{row.id}",
        )
        for row in rows
    ]


async def _load_pending_actions(
    db: AsyncSession,
    now: datetime,
    today_start: datetime,
    today_end: datetime,
) -> list[RhDashboardPendingAction]:
    actions: list[RhDashboardPendingAction] = []
    loaders = (
        lambda remaining: _interview_today_actions(db, today_start, today_end, remaining),
        lambda remaining: _schedule_interview_actions(db, now, remaining),
        lambda remaining: _decision_actions(db, remaining),
        lambda remaining: _start_pre_admission_actions(db, remaining),
        lambda remaining: _document_pending_actions(db, remaining),
    )

    for loader in loaders:
        remaining = 12 - len(actions)
        if remaining <= 0:
            break
        actions.extend(await loader(min(remaining, 4)))
    return actions[:12]


@router.get(
    "/dashboard",
    response_model=RhDashboardResponse,
    dependencies=[
        Depends(
            require_roles(
                UserRole.ADMIN,
                UserRole.HR,
                UserRole.RECRUITER,
                UserRole.VIEWER,
            )
        )
    ],
)
async def get_rh_dashboard(db: AsyncSession = Depends(get_db)) -> RhDashboardResponse:
    now = datetime.now(UTC)
    today_start, today_end = _day_bounds(now)
    month_start = _month_start(now)

    summary = await _load_summary(db, today_start, today_end, month_start)
    pending_actions = await _load_pending_actions(db, now, today_start, today_end)
    return RhDashboardResponse(summary=summary, pending_actions=pending_actions)
