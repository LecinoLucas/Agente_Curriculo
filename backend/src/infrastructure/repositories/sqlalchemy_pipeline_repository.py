from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import NAMESPACE_URL, UUID, uuid5, uuid4

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
)
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from src.infrastructure.database.models.user_model import UserModel


logger = structlog.get_logger(__name__)

_TERMINAL_LINK_STATUSES: frozenset[str] = frozenset({"hired", "rejected", "removed", "transferred"})
_PIPELINE_VISIBLE_JOB_STATUSES: tuple[str, ...] = ("published", "paused")
_PIPELINE_TRANSFER_TARGET_STATUSES: tuple[str, ...] = ("published",)


def _relationship_status_from_link_status(link_status: str) -> str:
    if link_status == "removed":
        return "withdrawn"
    if link_status == "transferred":
        return "archived"
    return link_status


def _relationship_update_values(
    *,
    link_status: str,
    updated_at: datetime,
    termination_reason: str | None = None,
) -> dict:
    relationship_status = _relationship_status_from_link_status(link_status)
    is_terminal = relationship_status != "active"
    return {
        "relationship_status": relationship_status,
        "is_terminal": is_terminal,
        "terminated_at": updated_at if is_terminal else None,
        "termination_reason": termination_reason if is_terminal else None,
    }


class SQLAlchemyPipelineRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _entry_table():
        return CandidateJobPipelineModel.__table__

    @classmethod
    def _entry_select(cls):
        table = cls._entry_table()
        return sa.select(
            sa.cast(table.c.candidate_job_pipeline_id, sa.String).label("candidate_job_pipeline_id"),
            sa.cast(table.c.candidate_id, sa.String).label("candidate_id"),
            sa.cast(table.c.job_id, sa.String).label("job_id"),
            table.c.pipeline_stage.label("pipeline_stage"),
            table.c.link_status.label("link_status"),
            table.c.pipeline_status.label("pipeline_status"),
            table.c.relationship_status.label("relationship_status"),
            table.c.is_terminal.label("is_terminal"),
            table.c.terminated_at.label("terminated_at"),
            table.c.termination_reason.label("termination_reason"),
            sa.cast(table.c.resume_version_id, sa.String).label("resume_version_id"),
            sa.cast(table.c.current_analysis_id, sa.String).label("current_analysis_id"),
            table.c.entered_at.label("entered_at"),
            table.c.updated_at.label("updated_at"),
            sa.cast(table.c.last_moved_by, sa.String).label("last_moved_by"),
        )

    @staticmethod
    def _build_entry_namespace(row: dict | None) -> SimpleNamespace | None:
        if row is None:
            return None
        payload = dict(row)
        def _parse_uuid(value: object, *, required: bool) -> UUID | None:
            if value is None:
                if required:
                    raise ValueError("UUID obrigatório ausente na entrada do pipeline.")
                return None
            if isinstance(value, UUID):
                return value
            try:
                if isinstance(value, bytes):
                    return UUID(bytes=value)
                return UUID(str(value))
            except (TypeError, ValueError):
                if required:
                    raise
                return None

        payload["candidate_id"] = _parse_uuid(payload.get("candidate_id"), required=True)
        payload["job_id"] = _parse_uuid(payload.get("job_id"), required=True)
        payload["candidate_job_pipeline_id"] = _parse_uuid(
            payload.get("candidate_job_pipeline_id"),
            required=False,
        ) or _candidate_job_pipeline_key(
            candidate_id=payload["candidate_id"],
            job_id=payload["job_id"],
        )
        payload["resume_version_id"] = _parse_uuid(payload.get("resume_version_id"), required=False)
        payload["current_analysis_id"] = _parse_uuid(payload.get("current_analysis_id"), required=False)
        payload["last_moved_by"] = _parse_uuid(payload.get("last_moved_by"), required=False)
        return SimpleNamespace(**payload)

    def _is_postgresql(self) -> bool:
        """Check if the database is PostgreSQL (for UPSERT syntax)."""
        # Check the actual database dialect from the session's connection
        dialect_name = self._session.bind.dialect.name
        return dialect_name == "postgresql"

    async def find_active_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )

    async def find_available_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
                JobModel.status.in_(_PIPELINE_VISIBLE_JOB_STATUSES),
            )
        )

    async def find_active_candidate(self, candidate_id: UUID) -> UUID | None:
        return await self._session.scalar(
            sa.select(CandidateModel.id).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def find_latest_behavioral_assignment(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
    ) -> BehavioralAssessmentAssignmentModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAssignmentModel)
            .where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.template_id == template_id,
            )
            .order_by(
                BehavioralAssessmentAssignmentModel.created_at.desc(),
                BehavioralAssessmentAssignmentModel.id.desc(),
            )
            .limit(1)
        )

    async def find_latest_behavioral_ai_evaluation(
        self,
        *,
        assignment_id: UUID,
    ) -> BehavioralAssessmentAIEvaluationModel | None:
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAIEvaluationModel)
            .where(BehavioralAssessmentAIEvaluationModel.assignment_id == assignment_id)
            .order_by(
                BehavioralAssessmentAIEvaluationModel.completed_at.desc().nullslast(),
                BehavioralAssessmentAIEvaluationModel.created_at.desc(),
            )
            .limit(1)
        )

    async def find_any_entry(self, candidate_id: UUID, job_id: UUID) -> CandidateJobPipelineModel | None:
        table = self._entry_table()
        result = await self._session.execute(
            self._entry_select().where(
                table.c.candidate_id == candidate_id,
                table.c.job_id == job_id,
            )
        )
        return self._build_entry_namespace(result.mappings().first())

    async def find_active_entry(self, candidate_id: UUID, job_id: UUID) -> CandidateJobPipelineModel | None:
        table = self._entry_table()
        result = await self._session.execute(
            self._entry_select().where(
                table.c.candidate_id == candidate_id,
                table.c.job_id == job_id,
                table.c.relationship_status == "active",
                table.c.is_terminal.is_(False),
                table.c.terminated_at.is_(None),
            )
        )
        return self._build_entry_namespace(result.mappings().first())

    async def find_active_entry_by_candidate(self, candidate_id: UUID) -> CandidateJobPipelineModel | None:
        table = self._entry_table()
        result = await self._session.execute(
            self._entry_select().where(
                table.c.candidate_id == candidate_id,
                table.c.relationship_status == "active",
                table.c.is_terminal.is_(False),
                table.c.terminated_at.is_(None),
            )
        )
        return self._build_entry_namespace(result.mappings().first())

    async def find_entry(self, candidate_id: UUID, job_id: UUID) -> CandidateJobPipelineModel | None:
        return await self.find_any_entry(candidate_id, job_id)

    async def save_entry(self, entry: CandidateJobPipelineModel) -> CandidateJobPipelineModel:
        self._session.add(entry)
        await self._session.flush()
        await self._session.refresh(entry)
        return entry

    async def list_job_matches(self, job_id: UUID) -> list[dict]:
        # Scope the analysis scan to only the candidates active in this job.
        # Avoids a full scan of all completed analyses (can be very large)
        # when the job has few active candidates.
        _active_candidates_for_job = (
            sa.select(CandidateJobPipelineModel.candidate_id)
            .where(
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
            )
        )

        latest_completed = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.id.label("analysis_id"),
                sa.func.row_number()
                .over(
                    partition_by=ResumeModel.candidate_id,
                    order_by=AnalysisModel.updated_at.desc(),
                )
                .label("rn"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.status == "completed",
                ResumeModel.deleted_at.is_(None),
                ResumeModel.candidate_id.in_(_active_candidates_for_job),
            )
            .subquery()
        )

        latest_keywords = (
            sa.select(
                latest_completed.c.candidate_id,
                AnalysisResultModel.keywords.label("top_skills"),
            )
            .join(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == latest_completed.c.analysis_id,
                isouter=True,
            )
            .where(latest_completed.c.rn == 1)
            .subquery()
        )

        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )

        latest_behavioral_assignment_id = (
            sa.select(BehavioralAssessmentAssignmentModel.id)
            .where(
                BehavioralAssessmentAssignmentModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == CandidateJobPipelineModel.job_id,
            )
            .order_by(
                BehavioralAssessmentAssignmentModel.created_at.desc(),
                BehavioralAssessmentAssignmentModel.id.desc(),
            )
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        behavioral_assessment_status = (
            sa.select(BehavioralAssessmentAssignmentModel.status)
            .where(BehavioralAssessmentAssignmentModel.id == latest_behavioral_assignment_id)
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        behavioral_submitted_at = (
            sa.select(BehavioralAssessmentAssignmentModel.submitted_at)
            .where(BehavioralAssessmentAssignmentModel.id == latest_behavioral_assignment_id)
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        behavioral_ai_evaluation_status = (
            sa.select(BehavioralAssessmentAIEvaluationModel.status)
            .where(BehavioralAssessmentAIEvaluationModel.assignment_id == latest_behavioral_assignment_id)
            .order_by(
                BehavioralAssessmentAIEvaluationModel.completed_at.desc().nullslast(),
                BehavioralAssessmentAIEvaluationModel.created_at.desc(),
            )
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        latest_interview_status = (
            sa.select(InterviewScheduleModel.status)
            .where(
                InterviewScheduleModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                InterviewScheduleModel.job_id == CandidateJobPipelineModel.job_id,
            )
            .order_by(
                InterviewScheduleModel.scheduled_start.desc().nullslast(),
                InterviewScheduleModel.updated_at.desc(),
            )
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        latest_interview_start = (
            sa.select(InterviewScheduleModel.scheduled_start)
            .where(
                InterviewScheduleModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                InterviewScheduleModel.job_id == CandidateJobPipelineModel.job_id,
                InterviewScheduleModel.status.in_(("scheduled", "rescheduled")),
            )
            .order_by(
                InterviewScheduleModel.scheduled_start.asc(),
                InterviewScheduleModel.updated_at.desc(),
            )
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        latest_scorecard_status = (
            sa.select(InterviewScorecardModel.status)
            .where(
                InterviewScorecardModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                InterviewScorecardModel.job_id == CandidateJobPipelineModel.job_id,
            )
            .order_by(
                InterviewScorecardModel.submitted_at.desc().nullslast(),
                InterviewScorecardModel.updated_at.desc(),
                InterviewScorecardModel.created_at.desc(),
            )
            .limit(1)
            .correlate(CandidateJobPipelineModel)
            .scalar_subquery()
        )

        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.entered_at,
                CandidateJobPipelineModel.updated_at,
                latest_keywords.c.top_skills,
                AnalysisModel.status.label("ai_status"),
                CandidateJobScoreModel.final_score.label("job_fit_score"),
                JobModel.requires_behavioral_assessment,
                JobModel.requires_behavioral_ai_evaluation,
                JobModel.requires_interview,
                JobModel.requires_scorecard,
                behavioral_assessment_status.label("behavioral_assessment_status"),
                behavioral_submitted_at.label("behavioral_submitted_at"),
                behavioral_ai_evaluation_status.label("behavioral_ai_evaluation_status"),
                latest_interview_status.label("interview_status"),
                latest_interview_start.label("interview_scheduled_start"),
                latest_scorecard_status.label("interview_scorecard_status"),
            )
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .join(
                latest_keywords,
                latest_keywords.c.candidate_id == CandidateJobPipelineModel.candidate_id,
                isouter=True,
            )
            .outerjoin(
                AnalysisModel,
                AnalysisModel.id == CandidateJobPipelineModel.current_analysis_id,
            )
            .outerjoin(
                CandidateJobScoreModel,
                sa.and_(
                    CandidateJobScoreModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                    CandidateJobScoreModel.job_id == CandidateJobPipelineModel.job_id,
                    CandidateJobScoreModel.version_id == active_score_version,
                    CandidateJobScoreModel.freshness_status == "fresh",
                ),
            )
            .where(
                CandidateJobPipelineModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .order_by(CandidateJobPipelineModel.updated_at.desc())
        )
        return [dict(row) for row in result.mappings().all()]

    async def _resolve_candidate_id_from_analysis(self, analysis_id: UUID) -> UUID | None:
        return await self._session.scalar(
            sa.select(ResumeModel.candidate_id)
            .join(ResumeVersionModel, ResumeVersionModel.resume_id == ResumeModel.id)
            .join(AnalysisModel, AnalysisModel.resume_version_id == ResumeVersionModel.id)
            .where(
                AnalysisModel.id == analysis_id,
                AnalysisModel.status == "completed",
                ResumeModel.deleted_at.is_(None),
            )
        )

    async def _resolve_resume_version_id_from_analysis(self, analysis_id: UUID) -> UUID | None:
        return await self._session.scalar(
            sa.select(AnalysisModel.resume_version_id).where(AnalysisModel.id == analysis_id)
        )

    async def update_entry_stage_if_current(
        self,
        candidate_id: UUID,
        job_id: UUID,
        expected_stage: str,
        new_stage: str,
        new_status: str,
        last_moved_by: UUID,
        updated_at: datetime,
        termination_reason: str | None = None,
    ) -> dict | None:
        pipeline_status = "terminal" if new_status in _TERMINAL_LINK_STATUSES else "active"
        relationship_values = _relationship_update_values(
            link_status=new_status,
            updated_at=updated_at,
            termination_reason=termination_reason,
        )
        result = await self._session.execute(
            sa.update(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_stage == expected_stage,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .values(
                pipeline_stage=new_stage,
                link_status=new_status,
                pipeline_status=pipeline_status,
                **relationship_values,
                last_moved_by=last_moved_by,
                updated_at=updated_at,
            )
            .returning(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def save_transition(
        self, transition: CandidateJobPipelineEventModel
    ) -> CandidateJobPipelineEventModel:
        if transition.idempotency_key is None:
            # Event without idempotency_key: insert normally
            self._session.add(transition)
            await self._session.flush()
            return transition

        # Check for existing event first (works on all databases)
        existing = await self._session.scalar(
            sa.select(CandidateJobPipelineEventModel).where(
                CandidateJobPipelineEventModel.idempotency_key == transition.idempotency_key
            )
        )
        if existing is not None:
            logger.info(
                "pipeline_event.idempotent_skip",
                idempotency_key=transition.idempotency_key,
            )
            return existing

        # Try to insert if not already present
        if self._is_postgresql():
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = (
                pg_insert(CandidateJobPipelineEventModel)
                .values(
                    id=transition.id or uuid4(),
                    candidate_id=transition.candidate_id,
                    job_id=transition.job_id,
                    event_type=transition.event_type,
                    from_stage=transition.from_stage,
                    to_stage=transition.to_stage,
                    from_job_id=transition.from_job_id,
                    to_job_id=transition.to_job_id,
                    actor_id=transition.actor_id,
                    idempotency_key=transition.idempotency_key,
                    metadata_payload=transition.metadata_payload,
                    created_at=transition.created_at,
                )
                .on_conflict_do_nothing(
                    index_elements=["idempotency_key"],
                    index_where=CandidateJobPipelineEventModel.idempotency_key.isnot(None),
                )
                .returning(CandidateJobPipelineEventModel)
            )
            result = await self._session.scalars(stmt)
            row = result.first()
            if row is None:
                # Conflict: return existing event (which we already checked above)
                return existing

            return row

        # SQLite and others: add normally if not already present
        self._session.add(transition)
        await self._session.flush()
        return transition

    async def count_pipeline_events_matching(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        event_type: str,
        from_stage: str | None,
        to_stage: str | None,
        actor_id: UUID | None,
    ) -> int:
        """R08: how many events already exist with this exact prefix.

        Used by the service layer to compute the next ``sequence`` value for
        the idempotency_key when the same transition repeats legitimately
        (e.g. A→B→A→B). Returns 0 when no event matches, so the first event
        keeps the legacy idempotency_key format (backwards-compat with rows
        written before R08).
        """
        stmt = sa.select(sa.func.count()).select_from(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id,
            CandidateJobPipelineEventModel.job_id == job_id,
            CandidateJobPipelineEventModel.event_type == event_type,
        )
        if from_stage is None:
            stmt = stmt.where(CandidateJobPipelineEventModel.from_stage.is_(None))
        else:
            stmt = stmt.where(CandidateJobPipelineEventModel.from_stage == from_stage)
        if to_stage is None:
            stmt = stmt.where(CandidateJobPipelineEventModel.to_stage.is_(None))
        else:
            stmt = stmt.where(CandidateJobPipelineEventModel.to_stage == to_stage)
        if actor_id is None:
            stmt = stmt.where(CandidateJobPipelineEventModel.actor_id.is_(None))
        else:
            stmt = stmt.where(CandidateJobPipelineEventModel.actor_id == actor_id)
        result = await self._session.execute(stmt)
        return int(result.scalar_one() or 0)

    async def create_entry(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        stage: str,
        status: str,
        moved_by: UUID | None,
        updated_at: datetime,
        resume_version_id: UUID | None = None,
        current_analysis_id: UUID | None = None,
        source: str = "manual",
    ) -> dict:
        pipeline_status = "terminal" if status in _TERMINAL_LINK_STATUSES else "active"
        relationship_values = _relationship_update_values(
            link_status=status,
            updated_at=updated_at,
        )
        pipeline_key = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=job_id)
        result = await self._session.execute(
            sa.insert(CandidateJobPipelineModel)
            .values(
                candidate_job_pipeline_id=pipeline_key,
                candidate_id=candidate_id,
                job_id=job_id,
                pipeline_stage=stage,
                link_status=status,
                pipeline_status=pipeline_status,
                relationship_status=relationship_values["relationship_status"],
                is_terminal=relationship_values["is_terminal"],
                terminated_at=relationship_values["terminated_at"],
                termination_reason=relationship_values["termination_reason"],
                source=source,
                resume_version_id=resume_version_id,
                current_analysis_id=current_analysis_id,
                entered_at=updated_at,
                last_moved_by=moved_by,
                created_at=updated_at,
                updated_at=updated_at,
            )
            .returning(
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.current_analysis_id,
                CandidateJobPipelineModel.resume_version_id,
                CandidateJobPipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    async def attach_analysis_to_entry(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        resume_version_id: UUID,
        analysis_id: UUID,
        updated_at: datetime,
    ) -> dict | None:
        result = await self._session.execute(
            sa.update(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .values(
                resume_version_id=resume_version_id,
                current_analysis_id=analysis_id,
                updated_at=updated_at,
            )
            .returning(
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.current_analysis_id,
                CandidateJobPipelineModel.resume_version_id,
                CandidateJobPipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def reactivate_entry(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        stage: str,
        status: str,
        moved_by: UUID | None,
        updated_at: datetime,
    ) -> dict | None:
        result = await self._session.execute(
            sa.update(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                sa.or_(
                    CandidateJobPipelineModel.relationship_status != "active",
                    CandidateJobPipelineModel.is_terminal.is_(True),
                    CandidateJobPipelineModel.terminated_at.is_not(None),
                ),
            )
            .values(
                pipeline_stage=stage,
                link_status=status,
                pipeline_status="active",
                relationship_status="active",
                is_terminal=False,
                terminated_at=None,
                termination_reason=None,
                source="manual",
                entered_at=updated_at,
                last_moved_by=moved_by,
                updated_at=updated_at,
            )
            .returning(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def update_entry_status(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        new_status: str,
        last_moved_by: UUID | None,
        updated_at: datetime,
        termination_reason: str | None = None,
    ) -> dict | None:
        pipeline_status = "terminal" if new_status in _TERMINAL_LINK_STATUSES else "active"
        relationship_values = _relationship_update_values(
            link_status=new_status,
            updated_at=updated_at,
            termination_reason=termination_reason,
        )
        result = await self._session.execute(
            sa.update(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
            )
            .values(
                link_status=new_status,
                pipeline_status=pipeline_status,
                **relationship_values,
                last_moved_by=last_moved_by,
                updated_at=updated_at,
            )
            .returning(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def deactivate_active_entries_for_candidate(
        self,
        *,
        candidate_id: UUID,
        last_moved_by: UUID | None,
        updated_at: datetime,
    ) -> int:
        result = await self._session.execute(
            sa.update(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .values(
                pipeline_status="terminal",
                link_status="transferred",
                relationship_status="archived",
                is_terminal=True,
                terminated_at=updated_at,
                termination_reason="candidate_transferred",
                last_moved_by=last_moved_by,
                updated_at=updated_at,
            )
        )
        return int(result.rowcount or 0)

    async def upsert_and_record_transition(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> None:
        candidate_id = await self._resolve_candidate_id_from_analysis(analysis_id)
        if candidate_id is None:
            return

        resume_version_id = await self._resolve_resume_version_id_from_analysis(analysis_id)
        now = datetime.now(UTC)
        current = await self.find_active_entry(candidate_id, job_id)
        if current is None:
            return

        if current.candidate_job_pipeline_id is None:
            current.candidate_job_pipeline_id = _candidate_job_pipeline_key(
                candidate_id=candidate_id,
                job_id=job_id,
            )
        current.current_analysis_id = analysis_id
        current.resume_version_id = resume_version_id
        current.updated_at = now
        await self._session.flush()

    async def find_entry_with_details(self, candidate_id: UUID, job_id: UUID) -> dict | None:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.entered_at,
                CandidateJobPipelineModel.updated_at,
                CandidateModel.full_name.label("candidate_name"),
                JobModel.title.label("job_title"),
            )
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def list_transitions(self, candidate_id: UUID, job_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineEventModel.id,
                CandidateJobPipelineEventModel.candidate_id,
                CandidateJobPipelineEventModel.job_id,
                CandidateJobPipelineEventModel.from_stage,
                CandidateJobPipelineEventModel.to_stage,
                CandidateJobPipelineEventModel.actor_id.label("moved_by"),
                UserModel.full_name.label("moved_by_name"),
                CandidateJobPipelineEventModel.created_at.label("moved_at"),
                CandidateJobPipelineEventModel.metadata_payload,
                CandidateJobPipelineEventModel.event_type,
                CandidateJobPipelineEventModel.from_job_id,
                CandidateJobPipelineEventModel.to_job_id,
            )
            .join(
                UserModel,
                UserModel.id == CandidateJobPipelineEventModel.actor_id,
                isouter=True,
            )
            .where(
                CandidateJobPipelineEventModel.candidate_id == candidate_id,
                CandidateJobPipelineEventModel.job_id == job_id,
            )
            .order_by(CandidateJobPipelineEventModel.created_at.asc())
        )
        rows: list[dict] = []
        for row in result.mappings().all():
            payload = dict(row.get("metadata_payload") or {})
            item = dict(row)
            item["trigger"] = payload.get("trigger", "system")
            item["notes"] = payload.get("notes")
            item["reason"] = payload.get("reason")
            rows.append(item)
        return rows

    async def list_pipeline_jobs(self, *, include_closed: bool = False) -> list[dict]:
        query = (
            sa.select(
                JobModel.id.label("job_id"),
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                JobModel.seniority_level,
                JobModel.work_model,
                JobModel.location,
                JobModel.deal_breakers,
                JobModel.created_at,
            )
            .where(JobModel.deleted_at.is_(None))
            .order_by(JobModel.created_at.desc())
        )

        if not include_closed:
            query = query.where(JobModel.status == "published")

        result = await self._session.execute(query)
        return [dict(row) for row in result.mappings().all()]

    async def list_pipeline_stage_counts(self) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                sa.func.count(CandidateJobPipelineModel.candidate_id).label("cnt"),
                sa.func.max(CandidateJobPipelineModel.updated_at).label("latest"),
            )
            .where(
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
            .group_by(CandidateJobPipelineModel.job_id, CandidateJobPipelineModel.pipeline_stage)
        )
        return [dict(row) for row in result.mappings().all()]


def _candidate_job_pipeline_key(*, candidate_id: UUID, job_id: UUID) -> UUID:
    return uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
