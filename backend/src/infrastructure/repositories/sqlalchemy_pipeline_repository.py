from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
)
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import (
    CandidatePipelineModel,
    PipelineStageTransitionModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel


class SQLAlchemyPipelineRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Lookups (existing — unchanged)
    # ------------------------------------------------------------------

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
                JobModel.status.in_(["published", "paused"]),
            )
        )

    async def find_active_candidate(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def find_entry(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidatePipelineModel | None:
        return await self._session.scalar(
            sa.select(CandidatePipelineModel).where(
                CandidatePipelineModel.candidate_id == candidate_id,
                CandidatePipelineModel.job_id == job_id,
            )
        )

    async def save_entry(self, entry: CandidatePipelineModel) -> CandidatePipelineModel:
        self._session.add(entry)
        await self._session.flush()
        await self._session.refresh(entry)
        return entry

    async def list_job_matches(self, job_id: UUID) -> list[dict]:
        # Latest *completed* analysis per candidate — used only for top_skills/keywords.
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

        # Latest analysis of *any* status per candidate — used to surface ai_status on the card.
        # Kept separate from latest_completed so a pending/processing/failed analysis
        # is visible even when no completed one exists yet.
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
            sa.select(
                latest_any.c.candidate_id,
                latest_any.c.ai_status,
            )
            .where(latest_any.c.rn == 1)
            .subquery()
        )

        result = await self._session.execute(
            sa.select(
                CandidatePipelineModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidatePipelineModel.job_id,
                CandidatePipelineModel.stage,
                CandidatePipelineModel.match_score,
                CandidatePipelineModel.entered_at,
                CandidatePipelineModel.updated_at,
                latest_keywords.c.top_skills,
                latest_ai_status.c.ai_status,
            )
            .join(CandidateModel, CandidateModel.id == CandidatePipelineModel.candidate_id)
            # Validate official candidate-job link exists (source of truth)
            .join(
                CandidateJobLinkModel,
                sa.and_(
                    CandidateJobLinkModel.candidate_id == CandidatePipelineModel.candidate_id,
                    CandidateJobLinkModel.job_id == CandidatePipelineModel.job_id,
                    CandidateJobLinkModel.deleted_at.is_(None),
                ),
            )
            .join(
                latest_keywords,
                latest_keywords.c.candidate_id == CandidatePipelineModel.candidate_id,
                isouter=True,
            )
            .join(
                latest_ai_status,
                latest_ai_status.c.candidate_id == CandidatePipelineModel.candidate_id,
                isouter=True,
            )
            .where(
                CandidatePipelineModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                sa.or_(
                    CandidatePipelineModel.status.is_(None),
                    CandidatePipelineModel.status != "transferred",
                ),
            )
            .order_by(
                CandidatePipelineModel.match_score.desc().nulls_last(),
                CandidatePipelineModel.updated_at.desc(),
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def upsert_from_analysis_match(
        self,
        analysis_id: UUID,
        job_id: UUID,
        match_score: Decimal,
    ) -> None:
        candidate_id = await self._resolve_candidate_id_from_analysis(analysis_id)
        if candidate_id is None:
            return

        # CRITICAL: Ensure official candidate-job link exists BEFORE creating pipeline entry
        # This prevents inconsistency where pipeline exists but candidate_job_links doesn't
        link = await self._session.scalar(
            sa.select(CandidateJobLinkModel).where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.job_id == job_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
        )
        if not link:
            # Create official link if it doesn't exist (source of truth)
            now_link = datetime.now(UTC)
            self._session.add(
                CandidateJobLinkModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    status="active",
                    source="ai_match",
                    created_at=now_link,
                    updated_at=now_link,
                )
            )
            await self._session.flush()

        current = await self.find_entry(candidate_id, job_id)
        now = datetime.now(UTC)
        if current is None:
            self._session.add(
                CandidatePipelineModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    stage="entry",
                    match_score=match_score,
                    created_at=now,
                    updated_at=now,
                )
            )
            await self._session.flush()
            return

        current.match_score = match_score
        current.updated_at = now
        await self._session.flush()

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

    # ------------------------------------------------------------------
    # New: transition recording
    # ------------------------------------------------------------------

    async def update_entry_stage_if_current(
        self,
        candidate_id: UUID,
        job_id: UUID,
        expected_stage: str,
        new_stage: str,
        new_status: str,
        last_moved_by: UUID,
        updated_at: datetime,
    ) -> dict | None:
        """Atomically updates the pipeline entry stage only if it still matches expected_stage.

        Uses a conditional UPDATE (WHERE stage = expected_stage) so that concurrent
        requests targeting the same entry cannot both succeed — if another request
        already changed the stage, this UPDATE matches zero rows and returns None.
        The caller must treat None as a concurrent-modification conflict (HTTP 409).
        """
        result = await self._session.execute(
            sa.update(CandidatePipelineModel)
            .where(
                CandidatePipelineModel.candidate_id == candidate_id,
                CandidatePipelineModel.job_id == job_id,
                CandidatePipelineModel.stage == expected_stage,
            )
            .values(
                stage=new_stage,
                status=new_status,
                last_moved_by=last_moved_by,
                updated_at=updated_at,
            )
            .returning(
                CandidatePipelineModel.candidate_id,
                CandidatePipelineModel.job_id,
                CandidatePipelineModel.stage,
                CandidatePipelineModel.status,
                CandidatePipelineModel.match_score,
                CandidatePipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def save_transition(
        self, transition: PipelineStageTransitionModel
    ) -> PipelineStageTransitionModel:
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
        # CRITICAL: Ensure official candidate-job link exists BEFORE creating pipeline entry
        # This prevents inconsistency where pipeline exists but candidate_job_links doesn't
        link = await self._session.scalar(
            sa.select(CandidateJobLinkModel).where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.job_id == job_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
        )
        if not link:
            # Create official link if it doesn't exist (source of truth)
            now_link = datetime.now(UTC)
            self._session.add(
                CandidateJobLinkModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    status="active",
                    source="manual",
                    created_at=now_link,
                    updated_at=now_link,
                )
            )
            await self._session.flush()

        result = await self._session.execute(
            sa.insert(CandidatePipelineModel)
            .values(
                candidate_id=candidate_id,
                job_id=job_id,
                stage=stage,
                status=status,
                entered_at=updated_at,
                last_moved_by=moved_by,
                created_at=updated_at,
                updated_at=updated_at,
            )
            .returning(
                CandidatePipelineModel.candidate_id,
                CandidatePipelineModel.job_id,
                CandidatePipelineModel.stage,
                CandidatePipelineModel.status,
                CandidatePipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else {}

    async def update_entry_status(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        new_status: str,
        last_moved_by: UUID | None,
        updated_at: datetime,
    ) -> dict | None:
        result = await self._session.execute(
            sa.update(CandidatePipelineModel)
            .where(
                CandidatePipelineModel.candidate_id == candidate_id,
                CandidatePipelineModel.job_id == job_id,
            )
            .values(
                status=new_status,
                last_moved_by=last_moved_by,
                updated_at=updated_at,
            )
            .returning(
                CandidatePipelineModel.candidate_id,
                CandidatePipelineModel.job_id,
                CandidatePipelineModel.stage,
                CandidatePipelineModel.status,
                CandidatePipelineModel.updated_at,
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def upsert_and_record_transition(
        self,
        analysis_id: UUID,
        job_id: UUID,
        match_score: Decimal,
    ) -> None:
        """Creates or updates the pipeline entry from a match result.

        When the entry is new, also records a StageTransition with
        trigger='auto_match'. On updates (score refresh), no transition is
        recorded because the stage did not change.

        CRITICAL: Ensures CandidateJobLinkModel exists BEFORE creating pipeline entry
        to maintain consistency (candidate_job_links is source of truth).
        """
        candidate_id = await self._resolve_candidate_id_from_analysis(analysis_id)
        if candidate_id is None:
            return

        # CRITICAL: Ensure official candidate-job link exists BEFORE pipeline entry
        link = await self._session.scalar(
            sa.select(CandidateJobLinkModel).where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.job_id == job_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
        )
        now = datetime.now(UTC)
        if not link:
            # Create official link if it doesn't exist (source of truth)
            self._session.add(
                CandidateJobLinkModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    status="active",
                    source="ai_match",
                    created_at=now,
                    updated_at=now,
                )
            )
            await self._session.flush()

        current = await self.find_entry(candidate_id, job_id)

        if current is None:
            self._session.add(
                CandidatePipelineModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    stage="entry",
                    match_score=match_score,
                    entered_at=now,
                    created_at=now,
                    updated_at=now,
                )
            )
            await self._session.flush()

            self._session.add(
                PipelineStageTransitionModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    from_stage=None,
                    to_stage="entry",
                    moved_by=None,
                    moved_at=now,
                    trigger="auto_match",
                )
            )
            await self._session.flush()
        else:
            current.match_score = match_score
            current.updated_at = now
            await self._session.flush()

    # ------------------------------------------------------------------
    # New: rich entry lookup (for history endpoint)
    # ------------------------------------------------------------------

    async def find_entry_with_details(
        self, candidate_id: UUID, job_id: UUID
    ) -> dict | None:
        result = await self._session.execute(
            sa.select(
                CandidatePipelineModel.candidate_id,
                CandidatePipelineModel.job_id,
                CandidatePipelineModel.stage,
                CandidatePipelineModel.match_score,
                CandidatePipelineModel.entered_at,
                CandidatePipelineModel.updated_at,
                CandidateModel.full_name.label("candidate_name"),
                JobModel.title.label("job_title"),
            )
            .join(CandidateModel, CandidateModel.id == CandidatePipelineModel.candidate_id)
            .join(JobModel, JobModel.id == CandidatePipelineModel.job_id)
            .where(
                CandidatePipelineModel.candidate_id == candidate_id,
                CandidatePipelineModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
        )
        row = result.mappings().first()
        return dict(row) if row else None

    async def list_transitions(
        self, candidate_id: UUID, job_id: UUID
    ) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                PipelineStageTransitionModel.id,
                PipelineStageTransitionModel.candidate_id,
                PipelineStageTransitionModel.job_id,
                PipelineStageTransitionModel.from_stage,
                PipelineStageTransitionModel.to_stage,
                PipelineStageTransitionModel.moved_by,
                UserModel.full_name.label("moved_by_name"),
                PipelineStageTransitionModel.moved_at,
                PipelineStageTransitionModel.trigger,
                PipelineStageTransitionModel.notes,
                PipelineStageTransitionModel.reason,
            )
            .join(
                UserModel,
                UserModel.id == PipelineStageTransitionModel.moved_by,
                isouter=True,
            )
            .where(
                PipelineStageTransitionModel.candidate_id == candidate_id,
                PipelineStageTransitionModel.job_id == job_id,
            )
            .order_by(PipelineStageTransitionModel.moved_at.asc())
        )
        return [dict(row) for row in result.mappings().all()]

    # ------------------------------------------------------------------
    # New: jobs list for pipeline view
    # ------------------------------------------------------------------

    async def list_active_jobs(self) -> list[dict]:
        """Returns published and paused jobs ordered by creation date."""
        result = await self._session.execute(
            sa.select(
                JobModel.id.label("job_id"),
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                JobModel.created_at,
            )
            .where(
                JobModel.deleted_at.is_(None),
                JobModel.status.in_(["published", "paused"]),
            )
            .order_by(JobModel.created_at.desc())
        )
        return [dict(row) for row in result.mappings().all()]

    async def list_pipeline_stage_counts(self) -> list[dict]:
        """Returns candidate counts grouped by (job_id, stage) for all pipeline entries."""
        result = await self._session.execute(
            sa.select(
                CandidatePipelineModel.job_id,
                CandidatePipelineModel.stage,
                sa.func.count(CandidatePipelineModel.candidate_id).label("cnt"),
                sa.func.max(CandidatePipelineModel.updated_at).label("latest"),
            )
            .where(
                sa.or_(
                    CandidatePipelineModel.status.is_(None),
                    CandidatePipelineModel.status != "transferred",
                )
            )
            .group_by(CandidatePipelineModel.job_id, CandidatePipelineModel.stage)
        )
        return [dict(row) for row in result.mappings().all()]
