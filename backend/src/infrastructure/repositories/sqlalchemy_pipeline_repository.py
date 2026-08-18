from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

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
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.operational_master_model import OperationalUnitModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
)
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
            sa.cast(
                table.c.candidate_job_pipeline_id,
                sa.String,
            ).label("candidate_job_pipeline_id"),
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
        payload["resume_version_id"] = _parse_uuid(
            payload.get("resume_version_id"),
            required=False,
        )
        payload["current_analysis_id"] = _parse_uuid(
            payload.get("current_analysis_id"),
            required=False,
        )
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

    async def get_pre_admission_gate_snapshot(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> dict[str, object]:
        case = await self._session.scalar(
            sa.select(PreAdmissionCaseModel)
            .where(
                PreAdmissionCaseModel.candidate_id == candidate_id,
                PreAdmissionCaseModel.job_id == job_id,
                PreAdmissionCaseModel.status.not_in(("cancelled", "offer_declined")),
            )
            .order_by(PreAdmissionCaseModel.created_at.desc())
            .limit(1)
        )
        if case is None:
            return {
                "has_case": False,
                "case_id": None,
                "case_status": None,
                "total_items": 0,
                "unresolved_required_count": 0,
                "unresolved_required_titles": [],
            }

        unresolved_required_rows = await self._session.execute(
            sa.select(PreAdmissionChecklistItemModel.title)
            .where(
                PreAdmissionChecklistItemModel.case_id == case.id,
                PreAdmissionChecklistItemModel.required.is_(True),
                PreAdmissionChecklistItemModel.status.not_in(("approved", "waived")),
            )
            .order_by(PreAdmissionChecklistItemModel.created_at.asc())
        )
        unresolved_required_titles = [
            title for title in unresolved_required_rows.scalars().all() if title
        ]
        total_items = int(
            await self._session.scalar(
                sa.select(sa.func.count())
                .select_from(PreAdmissionChecklistItemModel)
                .where(PreAdmissionChecklistItemModel.case_id == case.id)
            )
            or 0
        )

        return {
            "has_case": True,
            "case_id": case.id,
            "case_status": case.status,
            "total_items": total_items,
            "unresolved_required_count": len(unresolved_required_titles),
            "unresolved_required_titles": unresolved_required_titles[:5],
        }

    async def find_latest_behavioral_assignment(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID,
        pipeline_id: UUID | None = None,
    ) -> BehavioralAssessmentAssignmentModel | None:
        conditions = [
            BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            BehavioralAssessmentAssignmentModel.job_id == job_id,
            BehavioralAssessmentAssignmentModel.template_id == template_id,
        ]
        if pipeline_id is not None:
            conditions.append(BehavioralAssessmentAssignmentModel.pipeline_id == pipeline_id)
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAssignmentModel)
            .where(*conditions)
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

    async def find_any_entry(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobPipelineModel | None:
        table = self._entry_table()
        result = await self._session.execute(
            self._entry_select().where(
                table.c.candidate_id == candidate_id,
                table.c.job_id == job_id,
            )
        )
        return self._build_entry_namespace(result.mappings().first())

    async def find_active_entry(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobPipelineModel | None:
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

    async def find_active_pipeline_id(self, candidate_id: UUID, job_id: UUID) -> UUID | None:
        return await self._session.scalar(
            sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )

    async def find_active_entry_by_candidate(
        self,
        candidate_id: UUID,
    ) -> CandidateJobPipelineModel | None:
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

    async def find_entry(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobPipelineModel | None:
        return await self.find_any_entry(candidate_id, job_id)

    async def save_entry(self, entry: CandidateJobPipelineModel) -> CandidateJobPipelineModel:
        self._session.add(entry)
        await self._session.flush()
        await self._session.refresh(entry)
        return entry

    async def list_job_matches(
        self,
        job_id: UUID,
        *,
        entered_from: datetime | None = None,
        entered_to: datetime | None = None,
        updated_from: datetime | None = None,
        updated_to: datetime | None = None,
        operational_unit_id: UUID | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        # Non-correlated scalar — runs once, resolved before the main query.
        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )

        # ── CTE 1: latest behavioral assignment per pipeline cycle ─────────
        # ROW_NUMBER() OVER(PARTITION BY pipeline_id ORDER BY created_at DESC)
        # gives rn=1 to the most-recently created assignment.
        # Filters to this job upfront so the window only ranges over relevant rows.
        behavioral_ranked_cte = (
            sa.select(
                BehavioralAssessmentAssignmentModel.id.label("assignment_id"),
                BehavioralAssessmentAssignmentModel.pipeline_id,
                BehavioralAssessmentAssignmentModel.status.label("behavioral_assessment_status"),
                BehavioralAssessmentAssignmentModel.submitted_at.label("behavioral_submitted_at"),
                sa.func.row_number()
                .over(
                    partition_by=BehavioralAssessmentAssignmentModel.pipeline_id,
                    order_by=[
                        BehavioralAssessmentAssignmentModel.created_at.desc(),
                        BehavioralAssessmentAssignmentModel.id.desc(),
                    ],
                )
                .label("rn"),
            )
            .where(BehavioralAssessmentAssignmentModel.job_id == job_id)
            .cte("behavioral_ranked")
        )

        latest_behavioral_cte = (
            sa.select(behavioral_ranked_cte)
            .where(behavioral_ranked_cte.c.rn == 1)
            .cte("latest_behavioral")
        )

        # ── CTE 2: latest AI evaluation per latest behavioral assignment ───
        # Joins to latest_behavioral so we only rank evaluations for assignments
        # that are already "latest" — avoids scanning the whole AI eval table.
        behavioral_ai_ranked_cte = (
            sa.select(
                BehavioralAssessmentAIEvaluationModel.assignment_id,
                BehavioralAssessmentAIEvaluationModel.status.label("behavioral_ai_evaluation_status"),
                sa.func.row_number()
                .over(
                    partition_by=BehavioralAssessmentAIEvaluationModel.assignment_id,
                    order_by=[
                        BehavioralAssessmentAIEvaluationModel.completed_at.desc().nullslast(),
                        BehavioralAssessmentAIEvaluationModel.created_at.desc(),
                    ],
                )
                .label("rn"),
            )
            .join(
                latest_behavioral_cte,
                BehavioralAssessmentAIEvaluationModel.assignment_id
                == latest_behavioral_cte.c.assignment_id,
            )
            .cte("behavioral_ai_ranked")
        )

        latest_behavioral_ai_cte = (
            sa.select(behavioral_ai_ranked_cte)
            .where(behavioral_ai_ranked_cte.c.rn == 1)
            .cte("latest_behavioral_ai")
        )

        # ── CTE 3: latest interview status per pipeline cycle ─────────────
        interview_ranked_cte = (
            sa.select(
                InterviewScheduleModel.pipeline_id,
                InterviewScheduleModel.status.label("interview_status"),
                sa.func.row_number()
                .over(
                    partition_by=InterviewScheduleModel.pipeline_id,
                    order_by=[
                        InterviewScheduleModel.scheduled_start.desc().nullslast(),
                        InterviewScheduleModel.updated_at.desc(),
                    ],
                )
                .label("rn"),
            )
            .where(InterviewScheduleModel.job_id == job_id)
            .cte("interview_ranked")
        )

        latest_interview_cte = (
            sa.select(interview_ranked_cte)
            .where(interview_ranked_cte.c.rn == 1)
            .cte("latest_interview")
        )

        # ── CTE 4: soonest upcoming interview per pipeline cycle ──────────
        # Only considers scheduled/rescheduled rows, sorted ASC to find next.
        next_interview_ranked_cte = (
            sa.select(
                InterviewScheduleModel.pipeline_id,
                InterviewScheduleModel.scheduled_start.label("interview_scheduled_start"),
                sa.func.row_number()
                .over(
                    partition_by=InterviewScheduleModel.pipeline_id,
                    order_by=[
                        InterviewScheduleModel.scheduled_start.asc(),
                        InterviewScheduleModel.updated_at.desc(),
                    ],
                )
                .label("rn"),
            )
            .where(
                InterviewScheduleModel.job_id == job_id,
                InterviewScheduleModel.status.in_(("scheduled", "rescheduled")),
            )
            .cte("next_interview_ranked")
        )

        next_interview_cte = (
            sa.select(next_interview_ranked_cte)
            .where(next_interview_ranked_cte.c.rn == 1)
            .cte("next_interview")
        )

        # ── CTE 5: latest scorecard per pipeline cycle ────────────────────
        scorecard_ranked_cte = (
            sa.select(
                InterviewScorecardModel.pipeline_id,
                InterviewScorecardModel.status.label("interview_scorecard_status"),
                sa.func.row_number()
                .over(
                    partition_by=InterviewScorecardModel.pipeline_id,
                    order_by=[
                        InterviewScorecardModel.submitted_at.desc().nullslast(),
                        InterviewScorecardModel.updated_at.desc(),
                        InterviewScorecardModel.created_at.desc(),
                    ],
                )
                .label("rn"),
            )
            .where(InterviewScorecardModel.job_id == job_id)
            .cte("scorecard_ranked")
        )

        latest_scorecard_cte = (
            sa.select(scorecard_ranked_cte)
            .where(scorecard_ranked_cte.c.rn == 1)
            .cte("latest_scorecard")
        )

        # ── Main query — drives from active pipeline rows for this job ────
        # Five LEFT JOINs to pre-computed CTEs replace seven correlated
        # scalar subqueries that previously executed once per candidate row.
        conditions = [
            CandidateJobPipelineModel.job_id == job_id,
            CandidateModel.deleted_at.is_(None),
            sa.or_(
                sa.and_(
                    CandidateJobPipelineModel.relationship_status == "active",
                    CandidateJobPipelineModel.pipeline_status == "active",
                    CandidateJobPipelineModel.is_terminal.is_(False),
                    CandidateJobPipelineModel.terminated_at.is_(None),
                ),
                sa.and_(
                    CandidateJobPipelineModel.pipeline_stage == "admitted",
                    CandidateJobPipelineModel.relationship_status == "hired",
                    CandidateJobPipelineModel.pipeline_status == "terminal",
                    CandidateJobPipelineModel.is_terminal.is_(True),
                ),
            ),
        ]
        if entered_from is not None:
            conditions.append(CandidateJobPipelineModel.entered_at >= entered_from)
        if entered_to is not None:
            conditions.append(CandidateJobPipelineModel.entered_at <= entered_to)
        if updated_from is not None:
            conditions.append(CandidateJobPipelineModel.updated_at >= updated_from)
        if updated_to is not None:
            conditions.append(CandidateJobPipelineModel.updated_at <= updated_to)
        if operational_unit_id is not None:
            conditions.append(CandidateJobPipelineModel.operational_unit_id == operational_unit_id)

        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidateJobPipelineModel.job_id,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status.label("status"),
                CandidateJobPipelineModel.entered_at,
                CandidateJobPipelineModel.updated_at,
                AnalysisResultModel.keywords.label("top_skills"),
                AnalysisModel.status.label("ai_status"),
                CandidateJobScoreModel.final_score.label("job_fit_score"),
                JobModel.requires_behavioral_assessment,
                JobModel.requires_behavioral_ai_evaluation,
                JobModel.requires_interview,
                JobModel.requires_scorecard,
                latest_behavioral_cte.c.behavioral_assessment_status,
                latest_behavioral_cte.c.behavioral_submitted_at,
                latest_behavioral_ai_cte.c.behavioral_ai_evaluation_status,
                latest_interview_cte.c.interview_status,
                next_interview_cte.c.interview_scheduled_start,
                latest_scorecard_cte.c.interview_scorecard_status,
                sa.func.coalesce(
                    OperationalUnitModel.public_name, OperationalUnitModel.name
                ).label("unit_name"),
                CandidateJobPipelineModel.operational_unit_id,
            )
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .outerjoin(
                AnalysisModel,
                sa.and_(
                    AnalysisModel.id == CandidateJobPipelineModel.current_analysis_id,
                    AnalysisModel.job_id == CandidateJobPipelineModel.job_id,
                ),
            )
            .outerjoin(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == AnalysisModel.id,
            )
            .outerjoin(
                CandidateJobScoreModel,
                sa.and_(
                    CandidateJobScoreModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                    CandidateJobScoreModel.job_id == CandidateJobPipelineModel.job_id,
                    CandidateJobScoreModel.version_id == active_score_version,
                    CandidateJobScoreModel.source_analysis_id
                    == CandidateJobPipelineModel.current_analysis_id,
                    CandidateJobScoreModel.freshness_status == "fresh",
                ),
            )
            .outerjoin(
                latest_behavioral_cte,
                latest_behavioral_cte.c.pipeline_id
                == CandidateJobPipelineModel.candidate_job_pipeline_id,
            )
            .outerjoin(
                latest_behavioral_ai_cte,
                latest_behavioral_ai_cte.c.assignment_id == latest_behavioral_cte.c.assignment_id,
            )
            .outerjoin(
                latest_interview_cte,
                latest_interview_cte.c.pipeline_id
                == CandidateJobPipelineModel.candidate_job_pipeline_id,
            )
            .outerjoin(
                next_interview_cte,
                next_interview_cte.c.pipeline_id
                == CandidateJobPipelineModel.candidate_job_pipeline_id,
            )
            .outerjoin(
                latest_scorecard_cte,
                latest_scorecard_cte.c.pipeline_id
                == CandidateJobPipelineModel.candidate_job_pipeline_id,
            )
            .outerjoin(
                OperationalUnitModel,
                sa.and_(
                    OperationalUnitModel.id == CandidateJobPipelineModel.operational_unit_id,
                    OperationalUnitModel.is_active.is_(True),
                ),
            )
            .where(
                *conditions,
            )
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(limit)
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
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
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
        application_id: UUID | None = None,
        operational_unit_id: UUID | None = None,
    ) -> dict:
        pipeline_status = "terminal" if status in _TERMINAL_LINK_STATUSES else "active"
        relationship_values = _relationship_update_values(
            link_status=status,
            updated_at=updated_at,
        )
        pipeline_key = uuid4()
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
                application_id=application_id,
                operational_unit_id=operational_unit_id,
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
        resume_version_id: UUID | None = None,
        operational_unit_id: UUID | None = None,
    ) -> dict | None:
        update_values = {
            "candidate_job_pipeline_id": uuid4(),
            "pipeline_stage": stage,
            "link_status": status,
            "pipeline_status": "active",
            "relationship_status": "active",
            "is_terminal": False,
            "terminated_at": None,
            "termination_reason": None,
            "current_analysis_id": None,
            "source": "manual",
            "entered_at": updated_at,
            "last_moved_by": moved_by,
            "updated_at": updated_at,
        }
        if resume_version_id is not None:
            update_values["resume_version_id"] = resume_version_id
        if operational_unit_id is not None:
            update_values["operational_unit_id"] = operational_unit_id
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
            .values(**update_values)
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
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
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
            .limit(100)
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
                JobModel.job_area,
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


    # ------------------------------------------------------------------
    # Gate evaluator read-only helpers
    # ------------------------------------------------------------------

    async def find_latest_interview_for_gate(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        interview_types: tuple[str, ...],
        pipeline_id: UUID | None,
    ) -> InterviewScheduleModel | None:
        """Latest non-cancelled interview matching candidate+job+any of the given types."""
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(InterviewScheduleModel)
            .where(
                InterviewScheduleModel.candidate_id == candidate_id,
                InterviewScheduleModel.job_id == job_id,
                InterviewScheduleModel.pipeline_id == pipeline_id,
                InterviewScheduleModel.interview_type.in_(interview_types),
            )
            .order_by(
                InterviewScheduleModel.scheduled_start.desc().nullslast(),
                InterviewScheduleModel.updated_at.desc(),
                InterviewScheduleModel.created_at.desc(),
            )
            .limit(1)
        )

    async def find_scorecard_for_interview(
        self,
        *,
        interview_id: UUID,
    ) -> InterviewScorecardModel | None:
        return await self._session.scalar(
            sa.select(InterviewScorecardModel)
            .where(InterviewScorecardModel.interview_id == interview_id)
            .order_by(
                InterviewScorecardModel.submitted_at.desc().nullslast(),
                InterviewScorecardModel.updated_at.desc(),
                InterviewScorecardModel.created_at.desc(),
            )
            .limit(1)
        )

    async def find_latest_submitted_scorecard(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> InterviewScorecardModel | None:
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(InterviewScorecardModel)
            .where(
                InterviewScorecardModel.candidate_id == candidate_id,
                InterviewScorecardModel.job_id == job_id,
                InterviewScorecardModel.pipeline_id == pipeline_id,
                InterviewScorecardModel.status == "submitted",
            )
            .order_by(
                InterviewScorecardModel.submitted_at.desc().nullslast(),
                InterviewScorecardModel.updated_at.desc(),
                InterviewScorecardModel.created_at.desc(),
            )
            .limit(1)
        )

    async def find_active_hiring_decision(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> CandidateJobHiringDecisionModel | None:
        """Latest hiring decision that has not been superseded for candidate+job."""
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(CandidateJobHiringDecisionModel)
            .where(
                CandidateJobHiringDecisionModel.candidate_id == candidate_id,
                CandidateJobHiringDecisionModel.job_id == job_id,
                CandidateJobHiringDecisionModel.pipeline_id == pipeline_id,
                CandidateJobHiringDecisionModel.decision_status != "superseded",
            )
            .order_by(
                CandidateJobHiringDecisionModel.created_at.desc(),
                CandidateJobHiringDecisionModel.id.desc(),
            )
            .limit(1)
        )

    async def find_behavioral_assignment(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        pipeline_id: UUID | None,
    ) -> BehavioralAssessmentAssignmentModel | None:
        """Latest behavioral assignment for candidate+job (any template)."""
        if pipeline_id is None:
            return None
        return await self._session.scalar(
            sa.select(BehavioralAssessmentAssignmentModel)
            .where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.pipeline_id == pipeline_id,
            )
            .order_by(
                BehavioralAssessmentAssignmentModel.created_at.desc(),
                BehavioralAssessmentAssignmentModel.id.desc(),
            )
            .limit(1)
        )


def _candidate_job_pipeline_key(*, candidate_id: UUID, job_id: UUID) -> UUID:
    return uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
