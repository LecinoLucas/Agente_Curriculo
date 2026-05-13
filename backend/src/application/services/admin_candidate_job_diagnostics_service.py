from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)


@dataclass(frozen=True)
class CandidateJobFlowDiagnosticsResult:
    candidate_id: UUID
    job_id: UUID
    active_pipeline_exists: bool
    current_analysis_id_exists: bool
    current_analysis_exists: bool
    current_analysis_status: str | None
    active_job_profile_exists: bool
    match_exists: bool
    match_points_to_active_job_profile: bool
    score_exists: bool
    score_source_analysis_matches_current: bool
    candidate_in_ranking: bool
    reason_code: str

    def as_dict(self) -> dict[str, object]:
        return {
            "candidate_id": self.candidate_id,
            "job_id": self.job_id,
            "active_pipeline_exists": self.active_pipeline_exists,
            "current_analysis_id_exists": self.current_analysis_id_exists,
            "current_analysis_exists": self.current_analysis_exists,
            "current_analysis_status": self.current_analysis_status,
            "active_job_profile_exists": self.active_job_profile_exists,
            "match_exists": self.match_exists,
            "match_points_to_active_job_profile": self.match_points_to_active_job_profile,
            "score_exists": self.score_exists,
            "score_source_analysis_matches_current": self.score_source_analysis_matches_current,
            "candidate_in_ranking": self.candidate_in_ranking,
            "reason_code": self.reason_code,
        }


@dataclass(frozen=True)
class CandidateJobFlowRepairResult:
    candidate_id: UUID
    job_id: UUID
    repaired: bool
    actions: list[str]
    before: CandidateJobFlowDiagnosticsResult
    after: CandidateJobFlowDiagnosticsResult

    def as_dict(self) -> dict[str, object]:
        return {
            "candidate_id": self.candidate_id,
            "job_id": self.job_id,
            "repaired": self.repaired,
            "actions": self.actions,
            "before": self.before.as_dict(),
            "after": self.after.as_dict(),
        }


class AdminCandidateJobDiagnosticsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def candidate_job_flow(self, *, candidate_id: UUID, job_id: UUID) -> CandidateJobFlowDiagnosticsResult:
        active_pipeline = await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        active_pipeline_exists = active_pipeline is not None
        current_analysis_id = active_pipeline.current_analysis_id if active_pipeline is not None else None
        current_analysis_id_exists = current_analysis_id is not None

        analysis = None
        if current_analysis_id is not None:
            analysis = await self._session.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == current_analysis_id)
            )
        current_analysis_exists = analysis is not None
        current_analysis_status = str(analysis.status) if analysis is not None else None

        active_job_profile_exists = bool(
            await self._session.scalar(
                sa.select(sa.literal(True)).where(
                    JobProfileAnalysisModel.job_id == job_id,
                    JobProfileAnalysisModel.is_active.is_(True),
                )
            )
        )

        latest_match_row = (
            await self._session.execute(
                sa.select(
                    CandidateJobMatchModel.id,
                    JobProfileAnalysisModel.is_active.label("job_profile_is_active"),
                )
                .join(
                    JobProfileAnalysisModel,
                    JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
                )
                .where(
                    CandidateJobMatchModel.candidate_id == candidate_id,
                    CandidateJobMatchModel.job_id == job_id,
                )
                .order_by(
                    sa.func.coalesce(
                        CandidateJobMatchModel.updated_at,
                        CandidateJobMatchModel.created_at,
                    ).desc(),
                    CandidateJobMatchModel.id.desc(),
                )
                .limit(1)
            )
        ).mappings().first()
        match_exists = latest_match_row is not None
        match_points_to_active_job_profile = bool(
            latest_match_row and latest_match_row["job_profile_is_active"] is True
        )

        active_version_id = await self._session.scalar(
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
        )

        latest_score_row = None
        if active_version_id is not None:
            latest_score_row = (
                await self._session.execute(
                    sa.select(
                        CandidateJobScoreModel.id,
                        CandidateJobScoreModel.source_analysis_id,
                    ).where(
                        CandidateJobScoreModel.candidate_id == candidate_id,
                        CandidateJobScoreModel.job_id == job_id,
                        CandidateJobScoreModel.version_id == active_version_id,
                        CandidateJobScoreModel.final_score.isnot(None),
                    )
                    .order_by(
                        CandidateJobScoreModel.computed_at.desc(),
                        CandidateJobScoreModel.updated_at.desc(),
                        CandidateJobScoreModel.id.desc(),
                    )
                    .limit(1)
                )
            ).mappings().first()
        score_exists = latest_score_row is not None
        score_source_analysis_matches_current = bool(
            score_exists
            and current_analysis_id is not None
            and latest_score_row["source_analysis_id"] is not None
            and str(latest_score_row["source_analysis_id"]) == str(current_analysis_id)
        )

        candidate_in_ranking = await self._candidate_in_ranking(
            candidate_id=candidate_id,
            job_id=job_id,
            active_version_id=active_version_id,
        )

        reason_code = self._resolve_reason_code(
            active_pipeline_exists=active_pipeline_exists,
            current_analysis_id_exists=current_analysis_id_exists,
            current_analysis_status=current_analysis_status,
            active_job_profile_exists=active_job_profile_exists,
            match_exists=match_exists,
            match_points_to_active_job_profile=match_points_to_active_job_profile,
            score_exists=score_exists,
            score_source_analysis_matches_current=score_source_analysis_matches_current,
            candidate_in_ranking=candidate_in_ranking,
        )

        return CandidateJobFlowDiagnosticsResult(
            candidate_id=candidate_id,
            job_id=job_id,
            active_pipeline_exists=active_pipeline_exists,
            current_analysis_id_exists=current_analysis_id_exists,
            current_analysis_exists=current_analysis_exists,
            current_analysis_status=current_analysis_status,
            active_job_profile_exists=active_job_profile_exists,
            match_exists=match_exists,
            match_points_to_active_job_profile=match_points_to_active_job_profile,
            score_exists=score_exists,
            score_source_analysis_matches_current=score_source_analysis_matches_current,
            candidate_in_ranking=candidate_in_ranking,
            reason_code=reason_code,
        )

    async def _candidate_in_ranking(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        active_version_id: UUID | None,
    ) -> bool:
        if active_version_id is None:
            return False

        ranking_candidate = await self._session.scalar(
            sa.select(CandidateJobScoreModel.candidate_id)
            .select_from(CandidateJobScoreModel)
            .join(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == CandidateJobScoreModel.candidate_id,
                    CandidateJobPipelineModel.job_id == CandidateJobScoreModel.job_id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                    CandidateJobPipelineModel.relationship_status == "active",
                    CandidateJobPipelineModel.is_terminal.is_(False),
                    CandidateJobPipelineModel.terminated_at.is_(None),
                ),
            )
            .join(
                CandidateJobMatchModel,
                sa.and_(
                    CandidateJobMatchModel.candidate_id == CandidateJobScoreModel.candidate_id,
                    CandidateJobMatchModel.job_id == CandidateJobScoreModel.job_id,
                    CandidateJobMatchModel.freshness_status == "fresh",
                ),
            )
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .join(JobModel, JobModel.id == CandidateJobScoreModel.job_id)
            .where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == active_version_id,
                CandidateJobScoreModel.final_score.isnot(None),
                CandidateJobScoreModel.source_analysis_id == CandidateJobPipelineModel.current_analysis_id,
                CandidateJobScoreModel.freshness_status == "fresh",
                CandidateJobScoreModel.job_signature_hash == JobModel.job_profile_hash,
                CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .limit(1)
        )
        return ranking_candidate is not None

    def _resolve_reason_code(
        self,
        *,
        active_pipeline_exists: bool,
        current_analysis_id_exists: bool,
        current_analysis_status: str | None,
        active_job_profile_exists: bool,
        match_exists: bool,
        match_points_to_active_job_profile: bool,
        score_exists: bool,
        score_source_analysis_matches_current: bool,
        candidate_in_ranking: bool,
    ) -> str:
        if not active_pipeline_exists:
            return "missing_active_pipeline"
        if not current_analysis_id_exists:
            return "missing_current_analysis"
        if current_analysis_status != "completed":
            return "analysis_not_completed"
        if not active_job_profile_exists:
            return "missing_active_job_profile"
        if match_exists and not match_points_to_active_job_profile:
            return "match_points_to_inactive_job_profile"
        if not score_exists:
            return "completed_analysis_missing_score"
        if not score_source_analysis_matches_current:
            return "score_source_analysis_mismatch"
        if not candidate_in_ranking:
            return "ranking_score_unavailable"
        return "flow_consistent"

    async def repair_candidate_job_flow(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobFlowRepairResult:
        before = await self.candidate_job_flow(candidate_id=candidate_id, job_id=job_id)
        actions: list[str] = []

        active_pipeline = await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        if active_pipeline is None or active_pipeline.current_analysis_id is None:
            after = await self.candidate_job_flow(candidate_id=candidate_id, job_id=job_id)
            return CandidateJobFlowRepairResult(
                candidate_id=candidate_id,
                job_id=job_id,
                repaired=False,
                actions=actions,
                before=before,
                after=after,
            )

        inactive_match_ids = (
            sa.select(CandidateJobMatchModel.id)
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .where(
                CandidateJobMatchModel.candidate_id == candidate_id,
                CandidateJobMatchModel.job_id == job_id,
                CandidateJobMatchModel.freshness_status == "fresh",
                JobProfileAnalysisModel.is_active.is_(False),
            )
        )
        stale_match_result = await self._session.execute(
            sa.update(CandidateJobMatchModel)
            .where(CandidateJobMatchModel.id.in_(inactive_match_ids))
            .values(freshness_status="stale")
        )
        if int(stale_match_result.rowcount or 0) > 0:
            actions.append("stale_inactive_profile_matches")

        active_version_id = await self._session.scalar(
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
        )
        if active_version_id is not None:
            stale_score_result = await self._session.execute(
                sa.update(CandidateJobScoreModel)
                .where(
                    CandidateJobScoreModel.candidate_id == candidate_id,
                    CandidateJobScoreModel.job_id == job_id,
                    CandidateJobScoreModel.version_id == active_version_id,
                    CandidateJobScoreModel.freshness_status == "fresh",
                    CandidateJobScoreModel.final_score.isnot(None),
                    sa.or_(
                        CandidateJobScoreModel.source_analysis_id.is_(None),
                        CandidateJobScoreModel.source_analysis_id != active_pipeline.current_analysis_id,
                    ),
                )
                .values(freshness_status="stale")
            )
            if int(stale_score_result.rowcount or 0) > 0:
                actions.append("stale_mismatched_scores")

        analysis = await self._session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == active_pipeline.current_analysis_id)
        )
        if analysis is not None and str(analysis.status) == "completed":
            try:
                from src.application.services.analysis_service import AnalysisService
                from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
                    SQLAlchemyAnalysisRepository,
                )

                await AnalysisService(SQLAlchemyAnalysisRepository(self._session)).match_completed_analysis_to_job(
                    analysis_id=active_pipeline.current_analysis_id,
                    job_id=job_id,
                    force_recompute=False,
                )
                actions.append("recomputed_from_completed_analysis")
            except Exception:
                from src.application.services.candidate_ranking_service import CandidateRankingService

                ranking_result = await CandidateRankingService(self._session).compute_single_candidate(
                    job_id=job_id,
                    candidate_id=candidate_id,
                    recompute_reason="admin_repair_flow",
                )
                if ranking_result is not None:
                    actions.append("recomputed_ranking_only")
                else:
                    actions.append("recompute_skipped_no_context")

        after = await self.candidate_job_flow(candidate_id=candidate_id, job_id=job_id)
        repaired = after.reason_code == "flow_consistent" or after.reason_code != before.reason_code
        return CandidateJobFlowRepairResult(
            candidate_id=candidate_id,
            job_id=job_id,
            repaired=repaired,
            actions=actions,
            before=before,
            after=after,
        )
