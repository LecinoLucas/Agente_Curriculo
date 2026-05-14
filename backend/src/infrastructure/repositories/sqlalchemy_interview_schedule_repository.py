from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel

AGENDA_TIMEZONE = "America/Recife"


class SQLAlchemyInterviewScheduleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _to_int(value: object | None) -> int:
        return int(value or 0)

    def _build_filters(
        self,
        *,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        candidate_id: Optional[UUID] = None,
        job_id: Optional[UUID] = None,
        interviewer: Optional[str] = None,
        search: Optional[str] = None,
    ) -> list:
        filters: list = []

        if date_from:
            filters.append(InterviewScheduleModel.scheduled_start >= date_from)

        if date_to:
            filters.append(InterviewScheduleModel.scheduled_start <= date_to)

        if status:
            filters.append(InterviewScheduleModel.status == status)

        if candidate_id:
            filters.append(InterviewScheduleModel.candidate_id == candidate_id)

        if job_id:
            filters.append(InterviewScheduleModel.job_id == job_id)

        if interviewer:
            normalized = f"%{interviewer.strip().lower()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(sa.func.coalesce(InterviewScheduleModel.interviewer_name, "")).like(normalized),
                    sa.func.lower(sa.func.coalesce(InterviewScheduleModel.interviewer_email, "")).like(normalized),
                )
            )

        if search:
            normalized = f"%{search.strip().lower()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(CandidateModel.full_name).like(normalized),
                    sa.func.lower(sa.func.coalesce(JobModel.title, "")).like(normalized),
                    sa.func.lower(sa.func.coalesce(InterviewScheduleModel.interviewer_name, "")).like(normalized),
                    sa.func.lower(sa.func.coalesce(InterviewScheduleModel.interviewer_email, "")).like(normalized),
                    sa.func.lower(InterviewScheduleModel.title).like(normalized),
                )
            )

        return filters

    async def find_active_pipeline_id(self, candidate_id: UUID, job_id: UUID) -> UUID | None:
        result = await self._session.execute(
            sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.link_status == "active",
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    def _build_detail_select(self) -> sa.Select:
        return (
            sa.select(
                InterviewScheduleModel.id,
                InterviewScheduleModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                InterviewScheduleModel.job_id,
                JobModel.title.label("job_title"),
                InterviewScheduleModel.title,
                InterviewScheduleModel.description,
                InterviewScheduleModel.public_notes,
                InterviewScheduleModel.internal_notes,
                InterviewScheduleModel.scheduled_start,
                InterviewScheduleModel.scheduled_end,
                InterviewScheduleModel.timezone,
                InterviewScheduleModel.interview_type,
                InterviewScheduleModel.interview_format,
                InterviewScheduleModel.status,
                InterviewScheduleModel.location,
                InterviewScheduleModel.meeting_url,
                InterviewScheduleModel.interviewer_name,
                InterviewScheduleModel.interviewer_email,
                InterviewScheduleModel.cancel_reason,
                InterviewScheduleModel.created_at,
                InterviewScheduleModel.updated_at,
                InterviewScheduleModel.cancelled_at,
                InterviewScheduleModel.calendar_provider,
                InterviewScheduleModel.calendar_sync_status,
                InterviewScheduleModel.calendar_sync_error,
                InterviewScheduleModel.calendar_synced_at,
                InterviewScheduleModel.meeting_provider,
                InterviewScheduleModel.external_calendar_html_link,
                InterviewScheduleModel.external_calendar_event_id,
            )
            .join(CandidateModel, InterviewScheduleModel.candidate_id == CandidateModel.id)
            .outerjoin(JobModel, InterviewScheduleModel.job_id == JobModel.id)
        )

    async def list_schedules(
        self,
        page: int,
        page_size: int,
        *,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        candidate_id: Optional[UUID] = None,
        job_id: Optional[UUID] = None,
        interviewer: Optional[str] = None,
        search: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        filters = self._build_filters(
            date_from=date_from,
            date_to=date_to,
            status=status,
            candidate_id=candidate_id,
            job_id=job_id,
            interviewer=interviewer,
            search=search,
        )

        # Count total
        total = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count()).select_from(InterviewScheduleModel).where(*filters)
                )
            )
            or 0
        )

        # Fetch paginated results with joins
        offset = (page - 1) * page_size
        stmt = (
            self._build_detail_select()
            .where(*filters)
            .order_by(InterviewScheduleModel.scheduled_start.asc())
            .offset(offset)
            .limit(page_size)
        )

        result = await self._session.execute(stmt)
        rows = result.mappings().all()
        items = [dict(row) for row in rows]

        return items, total

    async def get_kpis(
        self,
        *,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        job_id: Optional[UUID] = None,
        interviewer: Optional[str] = None,
    ) -> dict:
        filters = self._build_filters(
            date_from=date_from,
            date_to=date_to,
            status=status,
            job_id=job_id,
            interviewer=interviewer,
            search=search,
        )

        # KPIs aggregation
        # Calculate today's range in America/Recife timezone, then convert to UTC for comparison
        local_tz = ZoneInfo(AGENDA_TIMEZONE)
        now_local = datetime.now(local_tz)
        today_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end_local = today_start_local.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Convert to UTC for database comparison
        today_start = today_start_local.astimezone(timezone.utc)
        today_end = today_end_local.astimezone(timezone.utc)
        now = datetime.now(timezone.utc)

        kpi_stmt = sa.select(
            sa.func.count(InterviewScheduleModel.id).label("total_scheduled"),
            sa.func.sum(
                sa.case(
                    (
                        sa.and_(
                            InterviewScheduleModel.scheduled_start >= today_start,
                            InterviewScheduleModel.scheduled_start <= today_end,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("today_count"),
            sa.func.sum(
                sa.case(
                    (
                        sa.and_(
                            InterviewScheduleModel.scheduled_start > now,
                            InterviewScheduleModel.status == "scheduled",
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("upcoming_count"),
            sa.func.sum(
                sa.case(
                    (InterviewScheduleModel.status == "completed", 1),
                    else_=0,
                )
            ).label("completed_count"),
            sa.func.sum(
                sa.case(
                    (InterviewScheduleModel.status == "cancelled", 1),
                    else_=0,
                )
            ).label("cancelled_count"),
        ).where(*filters)

        kpi_result = (await self._session.execute(kpi_stmt)).mappings().one()

        # Count unique interviewers: email first, fallback to name
        unique_interviewers_stmt = (
            sa.select(
                sa.func.count(sa.func.distinct(InterviewScheduleModel.interviewer_email)).label("email_count"),
                sa.func.count(
                    sa.distinct(
                        sa.case(
                            (InterviewScheduleModel.interviewer_email.is_(None), InterviewScheduleModel.interviewer_name),
                        )
                    )
                ).label("name_count"),
            )
            .where(*filters)
            .where(
                sa.or_(
                    InterviewScheduleModel.interviewer_email.isnot(None),
                    InterviewScheduleModel.interviewer_name.isnot(None),
                )
            )
        )

        unique_result = (await self._session.execute(unique_interviewers_stmt)).mappings().one()

        # Calculate unique interviewers: distinct emails + names that don't have emails
        unique_interviewers = self._to_int(unique_result["email_count"]) + self._to_int(unique_result["name_count"])

        return {
            "total_scheduled": self._to_int(kpi_result["total_scheduled"]),
            "today_count": self._to_int(kpi_result["today_count"]),
            "upcoming_count": self._to_int(kpi_result["upcoming_count"]),
            "completed_count": self._to_int(kpi_result["completed_count"]),
            "cancelled_count": self._to_int(kpi_result["cancelled_count"]),
            "unique_interviewers_count": unique_interviewers,
        }

    async def get_by_id(self, schedule_id: UUID) -> Optional[InterviewScheduleModel]:
        """Buscar entrevista por ID com joins para candidate_name e job_title."""
        return await self._session.scalar(
            sa.select(InterviewScheduleModel).where(InterviewScheduleModel.id == schedule_id)
        )

    async def get_detail_by_id(self, schedule_id: UUID) -> Optional[dict]:
        result = await self._session.execute(
            self._build_detail_select().where(InterviewScheduleModel.id == schedule_id)
        )
        row = result.mappings().first()
        return dict(row) if row is not None else None

    async def has_submitted_scorecard(self, schedule_id: UUID) -> bool:
        return bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .where(
                    InterviewScorecardModel.interview_id == schedule_id,
                    InterviewScorecardModel.status == "submitted",
                )
                .limit(1)
            )
        )

    async def find_conflicting_schedule(
        self,
        *,
        candidate_id: UUID,
        scheduled_start: datetime,
        scheduled_end: datetime,
        interviewer_email: Optional[str] = None,
        interviewer_name: Optional[str] = None,
        exclude_schedule_id: Optional[UUID] = None,
    ) -> tuple[InterviewScheduleModel, Literal["candidate", "interviewer"]] | None:
        base_filters = [
            InterviewScheduleModel.status != "cancelled",
            InterviewScheduleModel.scheduled_start < scheduled_end,
            InterviewScheduleModel.scheduled_end > scheduled_start,
        ]

        if exclude_schedule_id:
            base_filters.append(InterviewScheduleModel.id != exclude_schedule_id)

        normalized_email = interviewer_email.strip().lower() if interviewer_email and interviewer_email.strip() else None
        normalized_name = interviewer_name.strip().lower() if interviewer_name and interviewer_name.strip() else None

        interviewer_filter = None
        if normalized_email:
            interviewer_filter = (
                sa.func.lower(sa.func.trim(sa.func.coalesce(InterviewScheduleModel.interviewer_email, "")))
                == normalized_email
            )
        elif normalized_name:
            interviewer_filter = (
                sa.func.lower(sa.func.trim(sa.func.coalesce(InterviewScheduleModel.interviewer_name, "")))
                == normalized_name
            )

        if interviewer_filter is not None:
            interviewer_conflict = await self._session.scalar(
                sa.select(InterviewScheduleModel)
                .where(*base_filters, interviewer_filter)
                .order_by(InterviewScheduleModel.scheduled_start.asc())
                .limit(1)
            )
            if interviewer_conflict is not None:
                return interviewer_conflict, "interviewer"

        candidate_conflict = await self._session.scalar(
            sa.select(InterviewScheduleModel)
            .where(*base_filters, InterviewScheduleModel.candidate_id == candidate_id)
            .order_by(InterviewScheduleModel.scheduled_start.asc())
            .limit(1)
        )
        if candidate_conflict is not None:
            return candidate_conflict, "candidate"

        return None

    async def create(self, schedule: InterviewScheduleModel) -> InterviewScheduleModel:
        """Criar nova entrevista."""
        self._session.add(schedule)
        await self._session.flush()
        await self._session.refresh(schedule)
        return schedule

    async def update(self, schedule: InterviewScheduleModel) -> InterviewScheduleModel:
        """Atualizar entrevista existente."""
        schedule.updated_at = datetime.now(timezone.utc)
        self._session.add(schedule)
        await self._session.flush()
        await self._session.refresh(schedule)
        return schedule

    async def cancel(self, schedule_id: UUID, cancel_reason: str) -> Optional[InterviewScheduleModel]:
        """Cancelar entrevista (soft delete via status)."""
        schedule = await self.get_by_id(schedule_id)
        if not schedule:
            return None

        schedule.status = "cancelled"
        schedule.cancel_reason = cancel_reason
        schedule.cancelled_at = datetime.now(timezone.utc)
        schedule.updated_at = datetime.now(timezone.utc)

        self._session.add(schedule)
        await self._session.flush()
        await self._session.refresh(schedule)
        return schedule
