from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5, uuid4

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
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

    async def find_active_candidate(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def find_any_entry(self, candidate_id: UUID, job_id: UUID) -> CandidateJobPipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
            )
        )

    async def find_active_entry(self, candidate_id: UUID, job_id: UUID) -> CandidateJobPipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )

    async def find_active_entry_by_candidate(self, candidate_id: UUID) -> CandidateJobPipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )

    async def find_entry(self, candidate_id: UUID, job_id: UUID) -> CandidateJobPipelineModel | None:
        return await self.find_any_entry(candidate_id, job_id)

    async def save_entry(self, entry: CandidateJobPipelineModel) -> CandidateJobPipelineModel:
        self._session.add(entry)
        await self._session.flush()
        await self._session.refresh(entry)
        return entry

    async def list_job_matches(self, job_id: UUID) -> list[dict]:
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

        latest_any = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.status.label("ai_status"),
                sa.func.row_number()
                .over(
                    partition_by=ResumeModel.candidate_id,
                    order_by=AnalysisModel.created_at.desc(),
                )
                .label("rn"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(ResumeModel.deleted_at.is_(None))
            .subquery()
        )

        latest_ai_status = (
            sa.select(latest_any.c.candidate_id, latest_any.c.ai_status)
            .where(latest_any.c.rn == 1)
            .subquery()
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
                latest_ai_status.c.ai_status,
            )
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .join(
                latest_keywords,
                latest_keywords.c.candidate_id == CandidateJobPipelineModel.candidate_id,
                isouter=True,
            )
            .join(
                latest_ai_status,
                latest_ai_status.c.candidate_id == CandidateJobPipelineModel.candidate_id,
                isouter=True,
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
            await self._session.refresh(transition)
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
        await self._session.refresh(transition)
        return transition

    async def create_entry(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        stage: str,
        status: str,
        moved_by: UUID | None,
        updated_at: datetime,
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
                source="manual",
                entered_at=updated_at,
                last_moved_by=moved_by,
                created_at=updated_at,
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
        return dict(row) if row else {}

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
        current = await self.find_any_entry(candidate_id, job_id)

        if current is None:
            pipeline_key = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=job_id)
            self._session.add(
                CandidateJobPipelineModel(
                    candidate_job_pipeline_id=pipeline_key,
                    candidate_id=candidate_id,
                    job_id=job_id,
                    resume_version_id=resume_version_id,
                    pipeline_stage="entry",
                    link_status="active",
                    pipeline_status="active",
                    relationship_status="active",
                    is_terminal=False,
                    terminated_at=None,
                    termination_reason=None,
                    source="ai_match",
                    current_analysis_id=analysis_id,
                    entered_at=now,
                    created_at=now,
                    updated_at=now,
                )
            )
            await self._session.flush()

            self._session.add(
                CandidateJobPipelineEventModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    event_type="match_registered",
                    from_stage=None,
                    to_stage="entry",
                    actor_id=None,
                    idempotency_key=f"pipeline:{pipeline_key}:match_registered:null:entry:null",
                    metadata_payload={"trigger": "auto_match", "analysis_id": str(analysis_id)},
                    created_at=now,
                )
            )
            await self._session.flush()
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
