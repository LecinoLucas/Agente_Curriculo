from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel


class CandidateRankingContextLoader:
    def __init__(
        self,
        session: AsyncSession,
        *,
        ranking_job_not_found_error: type[Exception],
        no_active_score_version_error: type[Exception],
        resolve_thresholds: Callable[[ScoreModelVersionModel], tuple[Decimal, Decimal]],
        enrich_match_row: Callable[[dict[str, Any]], dict[str, Any]],
    ) -> None:
        self._session = session
        self._ranking_job_not_found_error = ranking_job_not_found_error
        self._no_active_score_version_error = no_active_score_version_error
        self._resolve_thresholds = resolve_thresholds
        self._enrich_match_row = enrich_match_row

    async def load_scoring_context(
        self,
        job_id: UUID,
    ) -> tuple[JobModel, ScoreModelVersionModel, Decimal, Decimal, list[Any]]:
        await self.assert_job_exists(job_id)
        job = await self.load_job_with_deal_breakers(job_id)
        version = await self.load_active_version()
        threshold_high, threshold_low = self._resolve_thresholds(version)
        job_skill_rows = await self.load_job_skill_rows(job_id)
        return job, version, threshold_high, threshold_low, job_skill_rows

    async def assert_job_exists(self, job_id: UUID) -> None:
        job = await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )
        if job is None:
            raise self._ranking_job_not_found_error

    async def load_job_with_deal_breakers(self, job_id: UUID) -> JobModel:
        job = await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )
        if job is None:
            raise self._ranking_job_not_found_error
        return job

    async def load_active_version(self) -> ScoreModelVersionModel:
        version = await self._session.scalar(
            sa.select(ScoreModelVersionModel).where(
                ScoreModelVersionModel.is_active.is_(True)
            )
        )
        if version is None:
            raise self._no_active_score_version_error
        return version

    async def fetch_match_rows(
        self,
        job_id: UUID,
        *,
        candidate_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        latest_match = (
            sa.select(
                CandidateJobMatchModel.candidate_id,
                CandidateJobMatchModel.job_id,
                CandidateJobMatchModel.resume_version_id,
                CandidateJobMatchModel.recommendation,
                CandidateJobMatchModel.eligibility_status,
                CandidateJobMatchModel.matched_skills_json,
                CandidateJobMatchModel.missing_skills_json,
                CandidateJobMatchModel.skill_evidence_breakdown,
                CandidateProfileAnalysisModel.seniority_level,
                CandidateProfileAnalysisModel.experience_years,
                CandidateProfileAnalysisModel.education_level,
                CandidateProfileAnalysisModel.skills_json,
                CandidateProfileAnalysisModel.strengths_json,
                CandidateProfileAnalysisModel.weaknesses_json,
                CandidateProfileAnalysisModel.raw_response_json.label("candidate_profile_raw_response_json"),
                sa.func.row_number()
                .over(
                    partition_by=(
                        CandidateJobMatchModel.candidate_id,
                        CandidateJobMatchModel.job_id,
                    ),
                    order_by=(
                        sa.case(
                            (CandidateJobMatchModel.candidate_job_pipeline_id.isnot(None), 0),
                            else_=1,
                        ),
                        CandidateJobMatchModel.created_at.desc(),
                        CandidateJobMatchModel.id.desc(),
                    ),
                )
                .label("rn"),
            )
            .select_from(CandidateJobMatchModel)
            .join(
                JobModel,
                JobModel.id == CandidateJobMatchModel.job_id,
            )
            .join(
                CandidateProfileAnalysisModel,
                CandidateProfileAnalysisModel.id == CandidateJobMatchModel.candidate_profile_analysis_id,
            )
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .where(CandidateJobMatchModel.job_id == job_id)
            .where(
                CandidateJobMatchModel.freshness_status == "fresh",
                CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
                JobProfileAnalysisModel.is_active.is_(True),
                self._json_shape_filter(CandidateJobMatchModel.skill_evidence_breakdown, "object"),
                self._json_key_exists_filter(
                    CandidateJobMatchModel.skill_evidence_breakdown,
                    "priority_score_weighted",
                ),
            )
            .subquery("latest_match")
        )

        query = (
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.entered_at,
                CandidateModel.location_city,
                CandidateModel.internal_notes,
                latest_match.c.matched_skills_json.label("matched_skills"),
                latest_match.c.missing_skills_json.label("missing_skills"),
                latest_match.c.skill_evidence_breakdown,
                sa.case(
                    (latest_match.c.eligibility_status == "FAIL", "fail"),
                    (latest_match.c.eligibility_status == "REVIEW", "unknown"),
                    (latest_match.c.recommendation == "review_manually", "unknown"),
                    else_="pass",
                ).label("validation_status"),
                sa.literal(None).label("rejection_reasons"),
                CandidateJobPipelineModel.current_analysis_id.label("source_analysis_id"),
                AnalysisModel.created_at.label("source_analysis_created_at"),
                AnalysisResultModel.extracted_data.label("analysis_extracted_data"),
                latest_match.c.resume_version_id,
                latest_match.c.experience_years.label("total_experience_years"),
                latest_match.c.skills_json.label("candidate_skills"),
                latest_match.c.strengths_json.label("strengths"),
                latest_match.c.weaknesses_json.label("weaknesses"),
                latest_match.c.seniority_level,
                latest_match.c.education_level,
                latest_match.c.eligibility_status,
                latest_match.c.candidate_profile_raw_response_json,
            )
            .select_from(CandidateJobPipelineModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .outerjoin(
                AnalysisModel,
                AnalysisModel.id == CandidateJobPipelineModel.current_analysis_id,
            )
            .outerjoin(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == AnalysisModel.id,
            )
            .join(
                latest_match,
                sa.and_(
                    latest_match.c.candidate_id == CandidateJobPipelineModel.candidate_id,
                    latest_match.c.job_id == CandidateJobPipelineModel.job_id,
                    latest_match.c.rn == 1,
                ),
            )
            .where(
                CandidateJobPipelineModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        if candidate_id is not None:
            query = query.where(CandidateJobPipelineModel.candidate_id == candidate_id)

        result = await self._session.execute(query)
        return [self._enrich_match_row(dict(row)) for row in result.mappings().all()]

    async def load_job_skill_rows(self, job_id: UUID) -> list[Any]:
        result = await self._session.execute(
            sa.select(
                JobRequiredSkillModel,
                SkillModel.name.label("skill_name"),
            )
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
        )
        return result.all()

    def _json_shape_filter(self, column: Any, expected_type: str) -> Any:
        conditions = [column.isnot(None)]
        if self._session.bind is not None and self._session.bind.dialect.name == "postgresql":
            conditions.append(sa.func.jsonb_typeof(column) == expected_type)
        else:
            conditions.append(sa.cast(column, sa.String).notin_(("null", "{}", "[]")))
        return sa.and_(*conditions)

    def _json_key_exists_filter(self, column: Any, key: str) -> Any:
        if self._session.bind is not None and self._session.bind.dialect.name == "postgresql":
            return sa.and_(
                column.op("?")(key),
                sa.func.nullif(column.op("->>")(key), "").isnot(None),
            )
        return column.isnot(None)
