from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from time import perf_counter
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import (
    _MINIMUM_DOMAIN_FIT_CAP_SCORE,
    _NO_REQUIREMENTS_SCORE_CAP,
    _PRIORITY_STRONG_COVERAGE_CAP_SCORE,
    _PRIORITY_STRONG_COVERAGE_CAP_THRESHOLD,
    _PRIORITY_THRESHOLD,
    _calculate_experience_score,
    _calculate_seniority_score,
    _canonical_component_weights,
    _job_has_structured_requirements,
    _priority_soft_penalty,
    _validate_education,
    _validate_experience,
)
from src.application.services.job_skill_priority_service import (
    is_complementary_skill,
    is_eliminatory_skill,
    is_priority_skill,
)
from src.application.services.match_confidence_service import (
    compute_match_confidence,
)
from src.application.services.strict_payload import (
    require_datetime,
    require_decimal,
    require_dict,
    require_key,
    require_list,
    require_non_empty_string,
    optional_dict,
    optional_list,
    optional_str,
)
from src.application.services.skill_requirements_service import validate_skill_requirements
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.observability.domain_events import DomainEvent, DomainEventType, publish_domain_event
from src.domain.services.deal_breaker_evaluator import evaluate_deal_breakers

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RankingJobNotFoundError(Exception):
    pass


class NoActiveScoreVersionError(Exception):
    pass


class NoPersistedScoresError(Exception):
    pass


class CandidateNotInActivePipelineError(Exception):
    pass


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CandidateRankingService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Write path: compute scores and persist them
    # ------------------------------------------------------------------

    async def compute_and_persist(self, job_id: UUID) -> list[dict]:
        """Persist a ranking snapshot into CandidateJobScore.final_score.

        Returns a list of score deltas.

        Raises RankingJobNotFoundError if the job does not exist.
        Raises NoActiveScoreVersionError if no active score model version exists.
        """
        job, version, threshold_high, threshold_low, job_skill_rows = await self._load_scoring_context(job_id)
        rows = await self._fetch_match_rows(job_id)
        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash - cannot compute ranking safely")
        
        score_deltas = []

        for row in rows:
            if not _has_canonical_skill_evidence(row):
                logger.info(
                    "ranking.skip_missing_skill_evidence",
                    candidate_id=str(row.get("candidate_id") or ""),
                    job_id=str(job_id),
                )
                continue
            started_perf = perf_counter()
            payload = self._build_score_payload(
                row=row,
                job=job,
                job_skill_rows=job_skill_rows,
                threshold_high=threshold_high,
                threshold_low=threshold_low,
                score_version=version.version,
            )
            persist_result = await self._persist_score(
                candidate_id=row["candidate_id"],
                job_id=job_id,
                version=version,
                payload=payload,
            )
            duration_ms = int((perf_counter() - started_perf) * 1000)
            await self._emit_recompute_observability(
                candidate_id=row["candidate_id"],
                job_id=job_id,
                payload=payload,
                version=version,
                persist_result=persist_result,
                duration_ms=duration_ms,
            )
            
            delta_val = persist_result["delta_summary"].get("delta") if persist_result.get("delta_summary") else None
            score_deltas.append({
                "candidate_id": row["candidate_id"],
                "previous_score": persist_result["previous_score"],
                "new_score": persist_result["new_score"],
                "delta": delta_val,
                "monotonicity_decision": persist_result.get("monotonicity_decision"),
            })

        return score_deltas

    async def assert_candidate_active_in_job(self, candidate_id: UUID, job_id: UUID) -> None:
        pipeline = await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        if pipeline is None:
            raise CandidateNotInActivePipelineError()

    async def compute_single_candidate(
        self,
        job_id: UUID,
        candidate_id: UUID,
        recompute_reason: str = "manual",
        actor_id: str | None = None,
    ) -> dict[str, Any] | None:
        job, version, threshold_high, threshold_low, job_skill_rows = await self._load_scoring_context(job_id)
        rows = await self._fetch_match_rows(job_id, candidate_id=candidate_id)
        if not rows:
            return None

        row = rows[0]
        if not _has_canonical_skill_evidence(row):
            return None
        started_perf = perf_counter()
        payload = self._build_score_payload(
            row=row,
            job=job,
            job_skill_rows=job_skill_rows,
            threshold_high=threshold_high,
            threshold_low=threshold_low,
            score_version=version.version,
        )
        # CRITICAL: Set freshness context - these are required for all scores
        payload["recompute_reason"] = recompute_reason
        payload["freshness_status"] = "fresh"
        payload["job_signature_hash"] = job.job_profile_hash  # REQUIRED for validation
        payload["job_updated_at"] = job.updated_at  # REQUIRED for validation

        # Validate that job has hash (if not, something is critically broken)
        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash - cannot compute score safely")
        persist_result = await self._persist_score(
            candidate_id=candidate_id,
            job_id=job_id,
            version=version,
            payload=payload,
        )
        duration_ms = int((perf_counter() - started_perf) * 1000)
        await self._emit_recompute_observability(
            candidate_id=candidate_id,
            job_id=job_id,
            payload=payload,
            version=version,
            persist_result=persist_result,
            duration_ms=duration_ms,
            actor_id=actor_id,
        )
        return {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "previous_score": persist_result["previous_score"],
            "job_fit_score": persist_result["new_score"],
            "delta": persist_result["delta_summary"].get("delta") if persist_result.get("delta_summary") else None,
            "monotonicity_decision": persist_result.get("monotonicity_decision"),
            "ranking_freshness_status": payload["freshness_status"],
            "computed_at": payload["computed_at"],
            "score_version": version.version,
            "source_analysis_id": payload["source_analysis_id"],
            "explainability_version": payload["explainability_version"],
            "score_factors": payload["factors"],
            "factor_summary": persist_result["factor_summary"],
        }

    async def mark_candidate_stale(self, job_id: UUID, candidate_id: UUID) -> None:
        version = await self._load_active_version()
        await self._session.execute(
            sa.update(CandidateJobScoreModel)
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.version_id == version.id,
            )
            .values(freshness_status="stale")
        )

    # ------------------------------------------------------------------
    # Read path: return persisted ranking (never recomputes)
    # ------------------------------------------------------------------

    async def get_ranking(
        self,
        job_id: UUID,
    ) -> dict[str, Any]:
        """Return the ranking for this job from persisted candidate_job_scores.

        Only scores computed with the currently active version are returned.
        Raises RankingJobNotFoundError / NoActiveScoreVersionError as needed.
        """
        await self._assert_job_exists(job_id)
        version = await self._load_active_version()
        threshold_high, threshold_low = _resolve_thresholds(version)

        rows = await self._fetch_persisted_scores(job_id, version.id)

        entries = []
        for row in rows:
            if not _has_valid_persisted_ranking_row(row):
                logger.info(
                    "ranking.skip_invalid_persisted_score",
                    candidate_id=str(row.get("candidate_id") or ""),
                    job_id=str(job_id),
                )
                continue
            rank = len(entries) + 1
            breakdown_raw = optional_dict(row, "breakdown")
            reason_tags_raw = optional_list(row, "reason_codes")
            score_factors_raw = optional_dict(row, "factor_summary_json")

            ranking_updated_at = require_datetime(row, "ranking_updated_at")
            match_updated_at = require_datetime(row, "match_updated_at")
            computed_at = require_datetime(row, "computed_at")
            job_updated_at = require_datetime(row, "job_updated_at")
            public_job_fit_score = Decimal(str(require_key(row, "final_score")))
            score_breakdown = _normalize_score_breakdown(
                breakdown_raw,
                public_job_fit_score=public_job_fit_score,
            )

            ranking_freshness_status, stale_reason = _resolve_freshness_status(
                ranking_updated_at=ranking_updated_at,
                match_updated_at=match_updated_at,
                persisted_status=require_key(row, "freshness_status"),
                score_job_signature_hash=require_key(row, "job_signature_hash"),
                job_signature_hash=require_key(row, "job_profile_hash"),
                score_computed_at=computed_at,
                job_updated_at=job_updated_at,
            )

            # Legacy persistence names stay inside candidate_job_scores. Public
            # contract leaves this mapper only with official ATS vocabulary.
            entries.append({
                "rank": rank,
                "candidate_id": require_key(row, "candidate_id"),
                "candidate_name": require_key(row, "candidate_name"),
                "stage": require_key(row, "stage"),
                "pipeline_status": require_key(row, "pipeline_status"),
                "score_breakdown": score_breakdown,
                "decision_suggestion": require_key(row, "decision_suggestion"),
                "reason_tags": _normalize_reason_codes(reason_tags_raw),
                "score_factors": _normalize_factor_summary(score_factors_raw),
                "ranking_summary_text": require_key(row, "explanation_text"),
                "job_fit_score": public_job_fit_score,
                "data_confidence_score": float(score_breakdown["confidence_score"]),
                "entered_at": row.get("entered_at"),
                "computed_at": computed_at,
                "ranking_freshness_status": ranking_freshness_status,
                "match_freshness_status": require_key(row, "match_freshness_status"),
                "recalculation_required": ranking_freshness_status != "fresh",
                "stale_reason": stale_reason,
                "score_computed_at": computed_at,
                "source_analysis_id": require_key(row, "source_analysis_id"),
                "source_analysis_created_at": require_key(row, "source_analysis_created_at"),
                "score_model_version": optional_str(row, "score_model_version", version.version) or version.version,
                "match_updated_at": match_updated_at,
                "ranking_updated_at": ranking_updated_at,
                "version": version.version,
                "ranking_version": version.version,
                "data_quality_status": require_key(row, "data_quality_status"),
            })

        # Get accurate stats directly from database (not from already-filtered entries)
        stats = await self._calculate_data_quality_stats(job_id)

        return {
            "job_id": job_id,
            "total_candidates": len(entries),
            "threshold_high": threshold_high,
            "threshold_low": threshold_low,
            "score_version": version.version,
            "candidates": entries,
            "data_quality_stats": stats,
        }

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _load_scoring_context(
        self,
        job_id: UUID,
    ) -> tuple[JobModel, ScoreModelVersionModel, Decimal, Decimal, list[Any]]:
        await self._assert_job_exists(job_id)
        job = await self._load_job_with_deal_breakers(job_id)
        version = await self._load_active_version()
        threshold_high, threshold_low = _resolve_thresholds(version)
        job_skill_rows = await self._load_job_skill_rows(job_id)
        return job, version, threshold_high, threshold_low, job_skill_rows

    async def _assert_job_exists(self, job_id: UUID) -> None:
        job = await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )
        if job is None:
            raise RankingJobNotFoundError

    async def _load_job_with_deal_breakers(self, job_id: UUID) -> JobModel:
        job = await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )
        if job is None:
            raise RankingJobNotFoundError
        return job

    async def _load_active_version(self) -> ScoreModelVersionModel:
        version = await self._session.scalar(
            sa.select(ScoreModelVersionModel).where(
                ScoreModelVersionModel.is_active.is_(True)
            )
        )
        if version is None:
            raise NoActiveScoreVersionError
        return version

    async def _fetch_match_rows(
        self,
        job_id: UUID,
        *,
        candidate_id: UUID | None = None,
    ) -> list[dict]:
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
                        # 1. Match com pipeline ativo vence (NULL por último)
                        sa.case(
                            (CandidateJobMatchModel.candidate_job_pipeline_id.isnot(None), 0),
                            else_=1,
                        ),
                        # 2. Mais recente
                        CandidateJobMatchModel.created_at.desc(),
                        # 3. Maior id como tiebreaker
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
        return [_enrich_match_row_for_deal_breakers(dict(row)) for row in result.mappings().all()]

    async def _load_job_skill_rows(self, job_id: UUID):
        result = await self._session.execute(
            sa.select(
                JobRequiredSkillModel,
                SkillModel.name.label("skill_name"),
            )
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
        )
        return result.all()

    async def _fetch_persisted_scores(
        self, job_id: UUID, version_id: UUID
    ) -> list[dict]:
        """Return persisted scores for this job + version, ordered by final_score DESC."""
        latest_match = (
            sa.select(
                CandidateJobMatchModel.candidate_id,
                CandidateJobMatchModel.job_id,
                CandidateJobMatchModel.freshness_status.label("match_freshness_status"),
                sa.func.coalesce(
                    CandidateJobMatchModel.updated_at,
                    CandidateJobMatchModel.created_at,
                ).label("match_updated_at"),
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
                        sa.func.coalesce(
                            CandidateJobMatchModel.updated_at,
                            CandidateJobMatchModel.created_at,
                        ).desc(),
                        CandidateJobMatchModel.id.desc(),
                    ),
                )
                .label("rn"),
            )
            .select_from(CandidateJobMatchModel)
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
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
        result = await self._session.execute(
            sa.select(
                CandidateJobScoreModel.candidate_id,
                CandidateJobScoreModel.final_score,
                CandidateJobScoreModel.decision_suggestion,
                CandidateJobScoreModel.breakdown,
                CandidateJobScoreModel.reason_codes,
                CandidateJobScoreModel.explanation_text,
                CandidateJobScoreModel.factor_summary_json,
                CandidateJobScoreModel.computed_at,
                CandidateJobScoreModel.updated_at.label("ranking_updated_at"),
                CandidateJobScoreModel.source_analysis_id,
                CandidateJobScoreModel.source_analysis_created_at,
                CandidateJobScoreModel.score_model_version,
                CandidateJobScoreModel.freshness_status,
                CandidateJobScoreModel.job_signature_hash,
                CandidateJobScoreModel.job_updated_at,
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.data_quality_status,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.entered_at,
                JobModel.job_profile_hash,
                latest_match.c.match_updated_at,
                latest_match.c.match_freshness_status,
            )
            .select_from(CandidateJobScoreModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
            .join(JobModel, JobModel.id == CandidateJobScoreModel.job_id)
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
                latest_match,
                sa.and_(
                    latest_match.c.candidate_id == CandidateJobScoreModel.candidate_id,
                    latest_match.c.job_id == CandidateJobScoreModel.job_id,
                    latest_match.c.rn == 1,
                ),
            )
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == version_id,
                CandidateJobScoreModel.final_score.isnot(None),
                self._json_shape_filter(CandidateJobScoreModel.breakdown, "object"),
                self._json_shape_filter(CandidateJobScoreModel.reason_codes, "array"),
                CandidateModel.deleted_at.is_(None),
                # Exclude invalid candidates based on data quality
                CandidateModel.data_quality_status.in_(["valid", "unknown"]),
            )
            .order_by(
                CandidateJobScoreModel.final_score.desc(),
                CandidateJobScoreModel.computed_at.desc(),
                CandidateJobScoreModel.candidate_id.asc(),
            )
        )
        return [dict(row) for row in result.mappings().all()]

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

    async def _load_latest_snapshot(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> dict[str, Any] | None:
        snapshot = await self._session.scalar(
            sa.select(CandidateJobScoreSnapshotModel)
            .where(
                CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
                CandidateJobScoreSnapshotModel.job_id == job_id,
            )
            .order_by(
                CandidateJobScoreSnapshotModel.computed_at.desc(),
                CandidateJobScoreSnapshotModel.id.desc(),
            )
            .limit(1)
        )
        if snapshot is None:
            return None

        result = await self._session.execute(
            sa.select(CandidateJobScoreFactorModel)
            .where(CandidateJobScoreFactorModel.snapshot_id == snapshot.id)
            .order_by(
                CandidateJobScoreFactorModel.display_order.asc(),
                CandidateJobScoreFactorModel.id.asc(),
            )
        )
        factors = [
            {
                "factor_type": row.factor_type,
                "factor_key": row.factor_key,
                "factor_label": row.factor_label,
                "impact_score": float(Decimal(str(row.impact_score)).quantize(Decimal("0.01"))),
                "normalized_weight": float(Decimal(str(row.normalized_weight)).quantize(Decimal("0.0001"))),
                "direction": row.direction,
                "evidence_json": dict(row.evidence_json or {}),
                "display_order": row.display_order,
            }
            for row in result.scalars().all()
        ]
        return {
            "id": snapshot.id,
            "candidate_id": snapshot.candidate_id,
            "job_id": snapshot.job_id,
            "version_id": snapshot.version_id,
            "ranking_version": snapshot.ranking_version,
            "source_analysis_id": snapshot.source_analysis_id,
            "source_analysis_created_at": snapshot.source_analysis_created_at,
            "job_signature_hash": snapshot.job_signature_hash,
            "score_model_version": snapshot.score_model_version,
            "explainability_version": snapshot.explainability_version,
            "input_hash": snapshot.input_hash,
            "final_score": Decimal(str(snapshot.final_score)),
            "freshness_status": snapshot.freshness_status,
            "computed_at": snapshot.computed_at,
            "factors": factors,
        }

    async def _insert_snapshot_and_factors(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        version: ScoreModelVersionModel,
        payload: dict[str, Any],
    ) -> CandidateJobScoreSnapshotModel:
        snapshot = CandidateJobScoreSnapshotModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            ranking_version=version.version,
            source_analysis_id=payload["source_analysis_id"],
            source_analysis_created_at=payload["source_analysis_created_at"],
            job_signature_hash=payload["job_signature_hash"],
            score_model_version=payload["score_model_version"],
            explainability_version=payload["explainability_version"],
            input_hash=payload["input_hash"],
            final_score=payload["final_score"],
            freshness_status=payload["freshness_status"],
            computed_at=payload["computed_at"],
        )
        self._session.add(snapshot)
        await self._session.flush()

        for factor in payload["factors"]:
            self._session.add(
                CandidateJobScoreFactorModel(
                    snapshot_id=snapshot.id,
                    factor_type=factor["factor_type"],
                    factor_key=factor["factor_key"],
                    factor_label=factor["factor_label"],
                    impact_score=Decimal(str(factor["impact_score"])),
                    normalized_weight=Decimal(str(factor["normalized_weight"])),
                    direction=factor["direction"],
                    evidence_json=factor["evidence_json"],
                    display_order=int(factor["display_order"]),
                )
            )
        await self._session.flush()
        return snapshot

    async def _persist_score(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        version: ScoreModelVersionModel,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        payload = dict(payload)
        payload.setdefault("score_model_version", version.version)
        payload.setdefault("explainability_version", _EXPLAINABILITY_VERSION)
        payload.setdefault("factors", [])
        if not isinstance(payload["factors"], list):
            raise ValueError("factors must be list")
        _validate_score_factors(payload["factors"])
        payload.setdefault("factor_summary_json", _summarize_score_factors(payload["factors"]))

        freshness_status = require_non_empty_string(payload, "freshness_status")
        if freshness_status not in {"fresh", "stale"}:
            raise ValueError("freshness_status must be 'fresh' or 'stale'")

        payload.setdefault("computed_at", datetime.now(UTC))
        payload.setdefault("updated_at", payload["computed_at"])
        require_datetime(payload, "computed_at")
        require_datetime(payload, "updated_at")
        require_datetime(payload, "job_updated_at")
        require_non_empty_string(payload, "job_signature_hash")
        require_non_empty_string(payload, "recompute_reason")
        payload["final_score"] = require_decimal(payload, "final_score")
        require_non_empty_string(payload, "decision_suggestion")
        require_dict(payload, "breakdown")
        require_list(payload, "reason_codes")
        if not payload.get("input_hash"):
            payload["input_hash"] = hashlib.sha256(
                "|".join(
                    [
                        str(candidate_id),
                        str(job_id),
                        str(payload.get("source_analysis_id") or ""),
                        str(payload.get("source_analysis_created_at") or ""),
                        str(payload.get("final_score") or ""),
                        str(payload.get("score_model_version") or ""),
                    ]
                ).encode("utf-8")
            ).hexdigest()
        existing = await self._session.scalar(
            sa.select(CandidateJobScoreModel).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == version.id,
            )
        )
        previous_score = (
            Decimal(str(existing.final_score))
            if existing is not None and existing.final_score is not None
            else None
        )
        if existing is not None and existing.final_score is None:
            raise ValueError("Persisted score row has null final_score")
        previous_snapshot = await self._load_latest_snapshot(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        payload["previous_score"] = previous_score
        current_analysis_created_at = _coerce_utc_datetime(
            existing.source_analysis_created_at if existing is not None else None
        )
        incoming_analysis_created_at = _coerce_utc_datetime(payload["source_analysis_created_at"])
        incoming_updated_at = _coerce_utc_datetime(payload["updated_at"])
        if (
            current_analysis_created_at is not None
            and incoming_analysis_created_at is not None
            and incoming_analysis_created_at < current_analysis_created_at
        ):
            return {
                "monotonicity_decision": "skipped_older_analysis",
                "previous_score": previous_score,
                "new_score": previous_score,
                "ranking_updated_at": existing.updated_at if existing is not None else None,
                "factor_summary": dict(existing.factor_summary_json or {}) if existing is not None else {"positive": [], "negative": [], "contextual": []},
                "delta_summary": dict(existing.delta_summary_json or {}) if existing is not None else _empty_delta_summary(current_score=previous_score),
            }

        factor_summary = dict(payload["factor_summary_json"] or {})
        delta_summary = _derive_delta_summary(
            previous_snapshot=previous_snapshot,
            payload=payload,
        )
        payload["delta_summary_json"] = delta_summary
        payload["explanation_text"] = _render_score_explanation(
            final_score=payload["final_score"],
            decision=payload["decision_suggestion"],
            factor_summary=factor_summary,
            delta_summary=delta_summary,
            breakdown=payload.get("breakdown"),
        )

        if self._session.bind is not None and self._session.bind.dialect.name == "postgresql":
            insert_stmt = (
                pg_insert(CandidateJobScoreModel)
                .values(
                    id=uuid4(),
                    candidate_id=candidate_id,
                    job_id=job_id,
                    version_id=version.id,
                    source_analysis_id=payload["source_analysis_id"],
                    source_analysis_created_at=incoming_analysis_created_at,
                    input_hash=payload["input_hash"],
                    score_model_version=payload["score_model_version"],
                    explainability_version=payload["explainability_version"],
                    final_score=payload["final_score"],
                    decision_suggestion=payload["decision_suggestion"],
                    breakdown=payload["breakdown"],
                    reason_codes=payload["reason_codes"],
                    explanation_text=payload["explanation_text"],
                    factor_summary_json=payload["factor_summary_json"],
                    delta_summary_json=payload["delta_summary_json"],
                    freshness_status=payload["freshness_status"],
                    computed_at=payload["computed_at"],
                    updated_at=payload["updated_at"],
                    previous_score=payload["previous_score"],
                    recompute_reason=payload["recompute_reason"],
                    job_signature_hash=payload["job_signature_hash"],
                    job_updated_at=payload["job_updated_at"],
                )
            )
            excluded = insert_stmt.excluded
            stmt = insert_stmt.on_conflict_do_update(
                constraint="uq_candidate_job_score_version",
                set_={
                    "source_analysis_id": payload["source_analysis_id"],
                    "source_analysis_created_at": incoming_analysis_created_at,
                    "input_hash": payload["input_hash"],
                    "score_model_version": payload["score_model_version"],
                    "explainability_version": payload["explainability_version"],
                    "final_score": payload["final_score"],
                    "decision_suggestion": payload["decision_suggestion"],
                    "breakdown": payload["breakdown"],
                    "reason_codes": payload["reason_codes"],
                    "explanation_text": payload["explanation_text"],
                    "factor_summary_json": payload["factor_summary_json"],
                    "delta_summary_json": payload["delta_summary_json"],
                    "freshness_status": payload["freshness_status"],
                    "computed_at": payload["computed_at"],
                    "updated_at": payload["updated_at"],
                    "previous_score": payload["previous_score"],
                    "recompute_reason": payload["recompute_reason"],
                    "job_signature_hash": payload["job_signature_hash"],
                    "job_updated_at": payload["job_updated_at"],
                },
                where=sa.or_(
                    CandidateJobScoreModel.source_analysis_created_at.is_(None),
                    excluded.source_analysis_created_at.is_(None),
                    excluded.source_analysis_created_at >= CandidateJobScoreModel.source_analysis_created_at,
                ),
            ).returning(
                CandidateJobScoreModel.final_score,
                CandidateJobScoreModel.updated_at,
            )
            result = await self._session.execute(stmt)
            returned_row = result.mappings().first()
            if returned_row is None:
                current = await self._session.scalar(
                    sa.select(CandidateJobScoreModel).where(
                        CandidateJobScoreModel.candidate_id == candidate_id,
                        CandidateJobScoreModel.job_id == job_id,
                        CandidateJobScoreModel.version_id == version.id,
                    )
                )
                current_score = (
                    Decimal(str(current.final_score))
                    if current is not None and current.final_score is not None
                    else previous_score
                )
                return {
                    "monotonicity_decision": "skipped_older_analysis",
                    "previous_score": previous_score,
                    "new_score": current_score,
                    "ranking_updated_at": current.updated_at if current is not None else None,
                    "factor_summary": dict(current.factor_summary_json or {}) if current is not None else {"positive": [], "negative": [], "contextual": []},
                    "delta_summary": dict(current.delta_summary_json or {}) if current is not None else _empty_delta_summary(current_score=current_score),
                }
            await self._insert_snapshot_and_factors(
                candidate_id=candidate_id,
                job_id=job_id,
                version=version,
                payload=payload,
            )
            return {
                "monotonicity_decision": "updated",
                "previous_score": previous_score,
                "new_score": Decimal(str(returned_row["final_score"])),
                "ranking_updated_at": _coerce_utc_datetime(returned_row["updated_at"]) or incoming_updated_at,
                "factor_summary": factor_summary,
                "delta_summary": delta_summary,
            }

        if existing is None:
            self._session.add(
                CandidateJobScoreModel(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    version_id=version.id,
                    source_analysis_id=payload["source_analysis_id"],
                    source_analysis_created_at=incoming_analysis_created_at,
                    input_hash=payload["input_hash"],
                    score_model_version=payload["score_model_version"],
                    explainability_version=payload["explainability_version"],
                    final_score=payload["final_score"],
                    decision_suggestion=payload["decision_suggestion"],
                    breakdown=payload["breakdown"],
                    reason_codes=payload["reason_codes"],
                    explanation_text=payload["explanation_text"],
                    factor_summary_json=payload["factor_summary_json"],
                    delta_summary_json=payload["delta_summary_json"],
                    freshness_status=payload["freshness_status"],
                    computed_at=payload["computed_at"],
                    updated_at=payload["updated_at"],
                    previous_score=payload["previous_score"],
                    recompute_reason=payload["recompute_reason"],
                    job_signature_hash=payload["job_signature_hash"],
                    job_updated_at=payload["job_updated_at"],
                )
            )
            await self._session.flush()
            await self._insert_snapshot_and_factors(
                candidate_id=candidate_id,
                job_id=job_id,
                version=version,
                payload=payload,
            )
            return {
                "monotonicity_decision": "updated",
                "previous_score": previous_score,
                "new_score": Decimal(str(payload["final_score"])),
                "ranking_updated_at": incoming_updated_at,
                "factor_summary": factor_summary,
                "delta_summary": delta_summary,
            }

        existing.source_analysis_id = payload["source_analysis_id"]
        existing.source_analysis_created_at = incoming_analysis_created_at
        existing.input_hash = payload["input_hash"]
        existing.score_model_version = payload["score_model_version"]
        existing.explainability_version = payload["explainability_version"]
        existing.final_score = payload["final_score"]
        existing.decision_suggestion = payload["decision_suggestion"]
        existing.breakdown = payload["breakdown"]
        existing.reason_codes = payload["reason_codes"]
        existing.explanation_text = payload["explanation_text"]
        existing.factor_summary_json = payload["factor_summary_json"]
        existing.delta_summary_json = payload["delta_summary_json"]
        existing.freshness_status = payload["freshness_status"]
        existing.computed_at = payload["computed_at"]
        existing.updated_at = payload["updated_at"]
        existing.previous_score = payload["previous_score"]
        existing.recompute_reason = payload["recompute_reason"]
        existing.job_signature_hash = payload["job_signature_hash"]
        existing.job_updated_at = payload["job_updated_at"]
        await self._session.flush()
        await self._insert_snapshot_and_factors(
            candidate_id=candidate_id,
            job_id=job_id,
            version=version,
            payload=payload,
        )
        return {
            "monotonicity_decision": "updated",
            "previous_score": previous_score,
            "new_score": Decimal(str(payload["final_score"])),
            "ranking_updated_at": incoming_updated_at,
            "factor_summary": factor_summary,
            "delta_summary": delta_summary,
        }

    def _build_score_payload(
        self,
        *,
        row: dict[str, Any],
        job: JobModel,
        job_skill_rows: list[Any],
        threshold_high: Decimal,
        threshold_low: Decimal,
        score_version: str,
    ) -> dict[str, Any]:
        bd = _compute_breakdown(
            row=row,
            job=job,
            job_skill_rows=job_skill_rows,
        )
        deal_breaker_missing_fields = _find_missing_deal_breaker_fields(job.deal_breakers, row)
        deal_breaker_violations = evaluate_deal_breakers(job.deal_breakers, row)
        if deal_breaker_missing_fields and not deal_breaker_violations and bd.get("validation_status") != "fail":
            row["validation_status"] = "unknown"
            bd["validation_status"] = "unknown"
            bd["validation_reason"] = _append_validation_reason(
                bd.get("validation_reason"),
                _format_missing_deal_breaker_evidence_reason(deal_breaker_missing_fields),
            )
        _apply_validation_guardrails(row, bd)
        _apply_deal_breaker_guardrails(bd, deal_breaker_violations)
        _apply_eliminatory_skill_guardrails(row=row, job=job, job_skill_rows=job_skill_rows, bd=bd)
        bd["final_score_after_cap"] = _to_decimal(bd["final_score"]).quantize(Decimal("0.01"))
        decision = _decide(bd["final_score"], threshold_high, threshold_low)
        if deal_breaker_missing_fields and not deal_breaker_violations and decision == "approved":
            decision = "review"
        matched = _coerce_list(row.get("matched_skills"))
        missing = _coerce_list(row.get("missing_skills"))
        factors = _build_score_factors(
            row=row,
            job=job,
            job_skill_rows=job_skill_rows,
            bd=bd,
            matched=matched,
            missing=missing,
            deal_breaker_violations=deal_breaker_violations,
        )
        reason_codes = _build_reason_codes(factors)
        factor_summary = _summarize_score_factors(factors)
        explanation = _render_score_explanation(
            final_score=bd["final_score"],
            decision=decision,
            factor_summary=factor_summary,
            delta_summary=None,
            breakdown=_serialize_breakdown(bd),
        )
        now = datetime.now(UTC)
        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash")
        if job.updated_at is None:
            raise ValueError(f"Job {job.id} missing updated_at")
        job_signature_hash = str(job.job_profile_hash)
        input_hash = _build_score_input_hash(
            row=row,
            score_version=score_version,
            job_signature_hash=job_signature_hash,
        )
        return {
            "source_analysis_id": row.get("source_analysis_id"),
            "source_analysis_created_at": row.get("source_analysis_created_at"),
            "job_signature_hash": job_signature_hash,
            "input_hash": input_hash,
            "score_model_version": score_version,
            "explainability_version": _EXPLAINABILITY_VERSION,
            "final_score": bd["final_score"],
            "decision_suggestion": decision,
            "breakdown": _serialize_breakdown(bd),
            "factors": factors,
            "factor_summary_json": factor_summary,
            "reason_codes": [{**rc, "impact": float(rc["impact"])} for rc in reason_codes],
            "explanation_text": explanation,
            "freshness_status": "fresh",
            "job_updated_at": job.updated_at,
            "recompute_reason": "bulk_recompute",
            "computed_at": now,
            "updated_at": now,
        }

    async def _emit_recompute_observability(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        payload: dict[str, Any],
        version: ScoreModelVersionModel,
        persist_result: dict[str, Any],
        duration_ms: int,
        actor_id: str | None = None,
    ) -> None:
        source_analysis_created_at = _coerce_utc_datetime(payload.get("source_analysis_created_at"))
        ranking_updated_at = _coerce_utc_datetime(persist_result.get("ranking_updated_at"))
        context = structlog.contextvars.get_contextvars()
        trace_id = context.get("correlation_id")
        request_id = context.get("request_id")
        base_payload = {
            "candidate_id": str(candidate_id),
            "job_id": str(job_id),
            "source_analysis_id": str(payload["source_analysis_id"]) if payload.get("source_analysis_id") else None,
            "source_analysis_created_at": (
                source_analysis_created_at.isoformat()
                if source_analysis_created_at is not None
                else None
            ),
            "previous_score": float(persist_result["previous_score"]) if persist_result.get("previous_score") is not None else None,
            "new_score": float(persist_result["new_score"]) if persist_result.get("new_score") is not None else None,
            "ranking_freshness_status": payload["freshness_status"],
            "score_model_version": version.version,
            "compute_duration_ms": duration_ms,
            "monotonicity_decision": persist_result["monotonicity_decision"],
            "ranking_updated_at": (
                ranking_updated_at.isoformat()
                if ranking_updated_at is not None
                else None
            ),
            "ranking_version": version.version,
            "ranking_version_id": str(version.id),
            "trace_id": trace_id,
            "request_id": request_id,
            "input_hash": payload.get("input_hash"),
            "actor_id": actor_id,
        }
        logger.info("ranking.recomputed", **base_payload)
        await publish_domain_event(
            DomainEvent(
                event_type=DomainEventType.RANKING_RECOMPUTED,
                entity_id=candidate_id,
                payload={
                    "event": "ranking_recomputed",
                    **base_payload,
                },
            ),
            session=self._session,
        )

    async def _get_filtered_candidates_count(self, job_id: UUID) -> int:
        """Count how many candidates were filtered due to data quality issues."""
        result = await self._session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.candidate_id))
            .select_from(CandidateJobScoreModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                # Count only the invalid ones (not valid and not unknown)
                ~CandidateModel.data_quality_status.in_(["valid", "unknown"]),
            )
        )
        return result or 0

    async def _calculate_data_quality_stats(self, job_id: UUID) -> dict[str, int]:
        """Calculate data quality statistics directly from database.

        Returns accurate counts by querying the bank independently from filtered ranking.
        Breakdown:
        - valid: Successfully classified with data
        - unknown: Not yet classified (legitimate pending state)
        - invalid: Explicitly marked as invalid (no_resume, empty_resume, parsing_failed, invalid_manual)
        - filtered: Invalid candidates excluded from ranking
        """
        result = await self._session.execute(
            sa.select(
                CandidateModel.data_quality_status,
                sa.func.count(CandidateJobScoreModel.candidate_id).label("count"),
            )
            .select_from(CandidateJobScoreModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
            )
            .group_by(CandidateModel.data_quality_status)
        )

        counts: dict[str, int] = {
            "valid": 0,
            "unknown": 0,
            "no_resume": 0,
            "empty_resume": 0,
            "parsing_failed": 0,
            "invalid_manual": 0,
        }

        for row in result.mappings().all():
            status = row.get("data_quality_status")
            if status is None:
                logger.warning(
                    "ranking.null_data_quality_status_in_stats",
                    row_count=row.get("count"),
                )
                status = "unknown"  # Explicit fallback with logging
            elif status not in counts:
                logger.error(
                    "ranking.invalid_data_quality_status_in_stats",
                    status=status,
                )
                status = "unknown"  # Fail-safe default

            if status in counts:
                counts[status] = row["count"]

        # Calculate derived counts
        total = sum(counts.values())
        valid = counts["valid"]
        unknown = counts["unknown"]
        invalid = sum(counts[k] for k in ["no_resume", "empty_resume", "parsing_failed", "invalid_manual"])

        # In ranking, only valid + unknown are shown
        filtered = invalid

        return {
            "total_candidates": total,
            "valid_candidates": valid,
            "unknown_candidates": unknown,
            "invalid_candidates": invalid,
            "filtered_candidates": filtered,
        }


# ---------------------------------------------------------------------------
# Pure scoring functions — no I/O, fully deterministic
# ---------------------------------------------------------------------------

_MISSING_SKILL_PENALTY = Decimal("3")
_MAX_PENALTY = Decimal("20")
_ELIMINATORY_MISSING_CAP = Decimal("49.00")
_EXPLAINABILITY_VERSION = "v1_structured_factors"
_SCORE_DELTA_CHANGE_THRESHOLD = Decimal("2.00")
_SCORE_DELTA_SUMMARY_LIMIT = 4
_SCORE_FACTOR_SUMMARY_LIMIT = 4
_ALLOWED_SCORE_FACTOR_TYPES = {
    "required_skill_match",
    "missing_required_skill",
    "complementary_skill_bonus",
    "adjacent_skill_match",
    "experience_match",
    "insufficient_experience",
    "seniority_match",
    "seniority_gap",
    "education_match",
    "deal_breaker_violation",
    "eligibility_cap",
    "data_confidence_penalty",
}


def _compute_breakdown(
    *,
    row: dict,
    job: JobModel,
    job_skill_rows: list[Any],
) -> dict[str, Any]:
    q = Decimal("0.01")
    priority_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if _is_skill_priority(row) and str(row.skill_name).strip()
    }
    complementary_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if _is_skill_complementary(row) and str(row.skill_name).strip()
    }
    eliminatory_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if _is_skill_eliminatory(row) and str(row.skill_name).strip()
    }
    matched_names = set(_coerce_list(row.get("matched_skills")))

    priority_total = len(priority_names)
    complementary_total = len(complementary_names)
    eliminatory_total = len(eliminatory_names)
    priority_matched = len((priority_names & matched_names) or set()) if priority_total else 0
    complementary_matched = len((complementary_names & matched_names) or set()) if complementary_total else 0
    eliminatory_matched = len((eliminatory_names & matched_names) or set()) if eliminatory_total else 0

    priority_score_fallback = (
        Decimal(priority_matched) / Decimal(priority_total) * Decimal("100")
        if priority_total > 0
        else Decimal("0")
    )
    complementary_score_fallback = (
        Decimal(complementary_matched) / Decimal(complementary_total) * Decimal("100")
        if complementary_total > 0
        else Decimal("0")
    )
    skill_match_score = (
        priority_score_fallback * Decimal("0.80") + complementary_score_fallback * Decimal("0.20")
        if priority_total or complementary_total
        else Decimal("0")
    )
    match_debug = row.get("skill_evidence_breakdown")
    if not isinstance(match_debug, dict):
        raise ValueError("skill_evidence_breakdown is required for canonical ranking")

    experience_detected_from_breakdown = (
        _to_decimal(match_debug.get("experience_detected"))
        if match_debug.get("experience_detected") is not None
        else None
    )
    candidate_years = (
        Decimal(str(row.get("total_experience_years")))
        if row.get("total_experience_years") is not None
        else experience_detected_from_breakdown
    )
    required_years = (
        Decimal(str(job.minimum_years_experience))
        if job.minimum_years_experience is not None
        else None
    )
    experience_match = _calculate_experience_score(candidate_years, required_years)
    seniority_match = _calculate_seniority_score(row.get("seniority_level"), job.seniority_level)
    education_result = _validate_education(row.get("education_level"), job.minimum_education_level)
    if job.minimum_education_level is None:
        education = Decimal("50")
    elif education_result.status == "fail":
        education = Decimal("0")
    elif education_result.status == "unknown":
        education = Decimal("50")
    else:
        education = Decimal("100")

    weights = _canonical_component_weights(
        total_priority=priority_total,
        total_complementary=complementary_total,
    )
    priority_score = _to_decimal(
        match_debug.get("priority_score_weighted"),
        default=priority_score_fallback,
    ).quantize(q)
    complementary_score = _to_decimal(
        match_debug.get("complementary_score_weighted"),
        default=complementary_score_fallback,
    ).quantize(q)
    complementary_score_raw = _to_decimal(
        match_debug.get("complementary_score_raw_weighted"),
        default=complementary_score,
    ).quantize(q)
    priority_component_impact = _to_decimal(
        match_debug.get("priority_component_impact"),
        default=(priority_score * weights["priority"]),
    ).quantize(q)
    complementary_component_impact = _to_decimal(
        match_debug.get("complementary_component_impact"),
        default=(complementary_score * weights["complementary"]),
    ).quantize(q)
    experience_component_impact = _to_decimal(
        match_debug.get("experience_component_impact"),
        default=(experience_match * weights["experience"]),
    ).quantize(q)
    seniority_component_impact = _to_decimal(
        match_debug.get("seniority_component_impact"),
        default=(seniority_match * weights["seniority"]),
    ).quantize(q)
    reconstructed = (
        priority_score * weights["priority"]
        + complementary_score * weights["complementary"]
        + experience_match * weights["experience"]
        + seniority_match * weights["seniority"]
    ).quantize(q)

    priority_strong_coverage = _to_decimal(
        match_debug.get("priority_strong_coverage"),
        default=priority_score,
    ).quantize(q)
    partial_matches = list(match_debug.get("partial_matches") or [])
    weak_evidence_priority_skills = [
        str(skill).strip()
        for skill in (
            match_debug.get("weak_evidence_priority_skills")
            or match_debug.get("weak_evidence_required_skills")
            or []
        )
        if str(skill).strip()
    ]
    has_structured_requirements = _job_has_structured_requirements(
        total_skills=len(job_skill_rows),
        seniority_level=job.seniority_level,
        minimum_years_experience=job.minimum_years_experience,
        minimum_education_level=job.minimum_education_level,
        deal_breakers=getattr(job, "deal_breakers", None),
    )
    has_domain_evidence = priority_matched > 0 or complementary_matched > 0 or bool(partial_matches)

    confidence_assessment = compute_match_confidence(
        final_score=reconstructed,
        structured_mandatory_skill_count=priority_total,
        structured_total_skill_count=priority_total + complementary_total + eliminatory_total,
        has_job_seniority=bool(job.seniority_level),
        has_job_min_experience=job.minimum_years_experience is not None,
        candidate_structured_skill_count=len(_coerce_list(row.get("candidate_skills"))),
        candidate_has_experience=row.get("total_experience_years") is not None,
        candidate_has_education=str(row.get("education_level") or "").strip().lower()
        not in {"", "none", "unknown", "undefined"},
    )

    final_score = reconstructed
    if not has_structured_requirements:
        final_score = min(final_score, _NO_REQUIREMENTS_SCORE_CAP).quantize(q)

    final_score_before_validation = final_score
    penalty = max(Decimal("0.00"), reconstructed - final_score_before_validation).quantize(q)
    validation_penalty = Decimal("0.00")

    validation_reasons: list[str] = [
        str(item).strip()
        for item in (match_debug.get("validation_reasons") or [])
        if str(item).strip()
    ]
    if weak_evidence_priority_skills:
        validation_reasons.append(
            "Evidência contextual fraca para skills essenciais: "
            + ", ".join(weak_evidence_priority_skills[:4])
        )

    validation_status = "pass"
    failed_rule: str | None = None
    failed_dimension: str | None = None
    eligibility_status = "PASS"
    cap_applied = final_score_before_validation < reconstructed
    cap_reason: str | None = None

    experience_result = _validate_experience(candidate_years, required_years)
    if education_result.status == "fail":
        validation_status = "fail"
        failed_rule = "minimum_education"
        failed_dimension = "education"
        eligibility_status = "FAIL"
        cap_reason = "minimum_education"
        validation_reasons.append(education_result.reason)
    elif education_result.status == "unknown":
        validation_status = "unknown"
        validation_reasons.append(education_result.reason)

    if experience_result.status == "fail":
        validation_status = "fail"
        failed_rule = "minimum_experience"
        failed_dimension = "experience"
        eligibility_status = "FAIL"
        cap_reason = "minimum_experience"
        validation_reasons.append(experience_result.reason)
    elif experience_result.status == "unknown" and validation_status != "fail":
        validation_status = "unknown"
        validation_reasons.append(experience_result.reason)

    missing_eliminatory_skills = list(
        match_debug.get("missing_eliminatory_skills") or sorted(eliminatory_names - matched_names)
    )
    if validation_status != "fail" and missing_eliminatory_skills:
        failed_rule = "missing_eliminatory_skills"
        failed_dimension = "skills"
        eligibility_status = "FAIL"
        cap_reason = "missing_eliminatory_skills"
        final_score = min(final_score, Decimal("24.00")).quantize(q)
        cap_applied = True
        validation_reasons.append(
            "Não atende critérios eliminatórios: "
            + ", ".join(missing_eliminatory_skills[:4])
        )

    if validation_status != "fail" and weak_evidence_priority_skills:
        eligibility_status = "REVIEW"

    if validation_status == "unknown":
        eligibility_status = "REVIEW"

    return {
        "skill_match_score": skill_match_score.quantize(q),
        "priority_score_weighted": priority_score,
        "complementary_score_weighted": complementary_score,
        "complementary_score_raw_weighted": complementary_score_raw,
        "experience_match_score": experience_match.quantize(q),
        "seniority_match_score": seniority_match.quantize(q),
        "education_score": education.quantize(q),
        "confidence_score": confidence_assessment.confidence_score.quantize(q),
        "priority_component_impact": priority_component_impact,
        "complementary_component_impact": complementary_component_impact,
        "experience_component_impact": experience_component_impact,
        "seniority_component_impact": seniority_component_impact,
        "penalty_score": penalty,
        "validation_penalty_score": validation_penalty,
        "deal_breaker_penalty_score": Decimal("0.00"),
        "final_score": final_score,
        "score_source": "candidate_job_match_evidence",
        "raw_score": reconstructed,
        "final_score_before_cap": final_score_before_validation,
        "final_score_after_cap": final_score,
        "cap_applied": cap_applied,
        "cap_reason": cap_reason,
        "validation_status": validation_status,
        "validation_reason": " | ".join(validation_reasons) if validation_reasons else None,
        "failed_rule": failed_rule,
        "failed_dimension": failed_dimension,
        "eligibility_status": eligibility_status,
        "missing_required_skills": list(match_debug.get("missing_required_skills") or []) or sorted(priority_names - matched_names),
        "matched_required_skills": list(match_debug.get("matched_required_skills") or []) or sorted(priority_names & matched_names),
        "priority_skills_matched": int(match_debug.get("priority_skills_matched", priority_matched)),
        "priority_skills_total": int(match_debug.get("priority_skills_total", priority_total)),
        "complementary_skills_matched": int(match_debug.get("complementary_skills_matched", complementary_matched)),
        "complementary_skills_total": int(match_debug.get("complementary_skills_total", complementary_total)),
        "eliminatory_skills_matched": int(match_debug.get("eliminatory_skills_matched", eliminatory_matched)),
        "eliminatory_skills_total": int(match_debug.get("eliminatory_skills_total", eliminatory_total)),
        "matched_priority_skills": list(match_debug.get("matched_priority_skills") or []) or sorted(priority_names & matched_names),
        "missing_priority_skills": list(match_debug.get("missing_priority_skills") or []) or sorted(priority_names - matched_names),
        "matched_complementary_skills": list(match_debug.get("matched_complementary_skills") or []) or sorted(complementary_names & matched_names),
        "missing_complementary_skills": list(match_debug.get("missing_complementary_skills") or []) or sorted(complementary_names - matched_names),
        "matched_eliminatory_skills": list(match_debug.get("matched_eliminatory_skills") or []) or sorted(eliminatory_names & matched_names),
        "missing_eliminatory_skills": missing_eliminatory_skills,
        "complementary_bonus_cap_slots": int(match_debug.get("complementary_bonus_cap_slots", min(complementary_total, 5))),
        "priority_strong_coverage": priority_strong_coverage,
        "education_detected": match_debug.get("education_detected", row.get("education_level")),
        "minimum_education_required": match_debug.get("minimum_education_required", job.minimum_education_level),
        "experience_detected": match_debug.get("experience_detected", float(candidate_years) if candidate_years is not None else None),
        "minimum_experience_required": match_debug.get("minimum_experience_required", float(required_years) if required_years is not None else None),
    }


def _apply_validation_guardrails(row: dict, bd: dict[str, Decimal]) -> None:
    q = Decimal("0.01")
    validation_status = bd.get("validation_status") or row.get("validation_status")

    if validation_status == "fail":
        capped_score = min(bd["final_score"], Decimal("39.00")).quantize(q)
        bd["validation_penalty_score"] = max(Decimal("0.00"), bd["final_score"] - capped_score).quantize(q)
        bd["final_score"] = capped_score
        return

    if validation_status == "unknown":
        bd["validation_penalty_score"] = Decimal("0.00").quantize(q)


def _apply_deal_breaker_guardrails(bd: dict[str, Decimal], violations: list[dict]) -> None:
    """Apply deal-breaker violations as hard rejections.

    If any deal-breaker is violated, score becomes 0 (hard rejection).
    """
    q = Decimal("0.01")
    if violations:
        bd["deal_breaker_penalty_score"] = bd["final_score"].quantize(q)
        bd["final_score"] = Decimal("0.00")


def _apply_eliminatory_skill_guardrails(
    *,
    row: dict[str, Any],
    job: JobModel,
    job_skill_rows: list[Any],
    bd: dict[str, Any],
) -> None:
    q = Decimal("0.01")
    raw_requirements = getattr(job, "skill_requirements", None)
    try:
        skill_requirements = validate_skill_requirements(raw_requirements or {})
    except ValueError:
        skill_requirements = {"eliminatory": []}

    critical_names = {
        str(skill).strip()
        for skill in skill_requirements.get("eliminatory", [])
        if str(skill).strip()
    }
    if not critical_names:
        return

    missing_from_breakdown = {
        str(skill).strip()
        for skill in (bd.get("missing_eliminatory_skills") or [])
        if str(skill).strip() in critical_names
    }
    missing_from_row = {
        str(skill).strip()
        for skill in _coerce_list(row.get("missing_skills"))
        if str(skill).strip() in critical_names
    }
    missing_critical = missing_from_breakdown | missing_from_row
    if not missing_critical:
        return

    before_cap = _to_decimal(bd.get("final_score"))
    after_cap = min(before_cap, _ELIMINATORY_MISSING_CAP).quantize(q)
    bd["final_score"] = after_cap
    bd["eligibility_status"] = "FAIL"
    if after_cap < before_cap:
        bd["cap_applied"] = True
        bd["cap_reason"] = "missing_eliminatory_skills"
        bd["failed_rule"] = "missing_eliminatory_skills"
        bd["failed_dimension"] = "skills"


def _decide(final_score: Decimal, threshold_high: Decimal, threshold_low: Decimal) -> str:
    if final_score >= threshold_high:
        return "approved"
    if final_score >= threshold_low:
        return "review"
    return "rejected_suggested"


# ---------------------------------------------------------------------------
# Structured explainability factors
# ---------------------------------------------------------------------------

def _build_score_factors(
    *,
    row: dict[str, Any],
    job: JobModel,
    job_skill_rows: list[Any],
    bd: dict[str, Any],
    matched: list[str],
    missing: list[str],
    deal_breaker_violations: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    priority_names = [
        str(item.skill_name).strip()
        for item in job_skill_rows
        if _is_skill_priority(item) and str(item.skill_name).strip()
    ]
    complementary_names = [
        str(item.skill_name).strip()
        for item in job_skill_rows
        if _is_skill_complementary(item) and str(item.skill_name).strip()
    ]
    priority_lookup = {name.casefold(): name for name in priority_names}
    matched_required = [skill for skill in matched if skill.casefold() in priority_lookup]
    missing_required = [skill for skill in missing if skill.casefold() in priority_lookup]

    breakdown = optional_dict(row, "skill_evidence_breakdown")
    partial_matches = breakdown.get("partial_matches", []) or []

    weights = _canonical_component_weights(
        total_priority=len(priority_names),
        total_complementary=len(complementary_names),
    )
    priority_slot_impact = (
        (Decimal("100") * weights["priority"]) / Decimal(str(len(priority_names)))
        if priority_names
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    factors: list[dict[str, Any]] = []
    display_order = 0

    def add_factor(
        *,
        factor_type: str,
        factor_key: str,
        factor_label: str,
        impact_score: Decimal,
        normalized_weight: Decimal,
        direction: str,
        evidence: dict[str, Any] | None = None,
    ) -> None:
        nonlocal display_order
        factors.append({
            "factor_type": factor_type,
            "factor_key": factor_key,
            "factor_label": factor_label,
            "impact_score": float(impact_score.quantize(Decimal("0.01"))),
            "normalized_weight": float(normalized_weight.quantize(Decimal("0.0001"))),
            "direction": direction,
            "evidence_json": evidence or {},
            "display_order": display_order,
        })
        display_order += 1

    if deal_breaker_violations:
        penalty = max(Decimal("0.00"), bd.get("deal_breaker_penalty_score", Decimal("0.00")))
        for violation in deal_breaker_violations:
            add_factor(
                factor_type="deal_breaker_violation",
                factor_key=str(violation.get("field") or "deal_breaker"),
                factor_label=str(violation.get("description") or violation.get("reason") or "Critério eliminatório violado"),
                impact_score=-penalty if penalty > 0 else Decimal("-100.00"),
                normalized_weight=Decimal("1.0"),
                direction="negative",
                evidence={"violation": dict(violation)},
            )

    if bd.get("cap_applied"):
        before_cap = _to_decimal(bd.get("final_score_before_cap"))
        after_cap = _to_decimal(bd.get("final_score_after_cap"))
        cap_penalty = max(Decimal("0.00"), before_cap - after_cap).quantize(Decimal("0.01"))
        cap_reason = str(bd.get("cap_reason") or "cap")
        factor_label = {
            "explicit_deal_breaker": "Critério eliminatório explícito aplicou cap",
            "minimum_education": "Educação abaixo do mínimo aplicou cap",
            "minimum_experience": "Experiência abaixo do mínimo aplicou cap",
            "minimum_domain_fit": "Aderência mínima ao domínio aplicou cap",
            "missing_critical_mandatory": "Skill essencial crítica ausente aplicou cap",
            "missing_eliminatory_skills": "Critério eliminatório de skill aplicou cap",
        }.get(cap_reason, "Regra de elegibilidade aplicou cap")
        add_factor(
            factor_type="eligibility_cap",
            factor_key=cap_reason,
            factor_label=factor_label,
            impact_score=-cap_penalty if cap_penalty > 0 else Decimal("-1.00"),
            normalized_weight=Decimal("1.0"),
            direction="negative",
            evidence={
                "cap_reason": cap_reason,
                "failed_rule": bd.get("failed_rule"),
                "failed_dimension": bd.get("failed_dimension"),
                "before_cap": float(before_cap),
                "after_cap": float(after_cap),
                "validation_reason": bd.get("validation_reason"),
            },
        )

    for skill in matched_required[:5]:
        add_factor(
            factor_type="required_skill_match",
            factor_key=skill.casefold(),
            factor_label=f"Skill essencial atendida: {skill}",
            impact_score=priority_slot_impact,
            normalized_weight=weights["priority"],
            direction="positive",
            evidence={"matched": True, "required_skill": skill},
        )

    partial_required_keys = {str(item.get("required") or "").casefold() for item in partial_matches}
    for skill in missing_required[:5]:
        if skill.casefold() in partial_required_keys:
            continue
        add_factor(
            factor_type="missing_required_skill",
            factor_key=skill.casefold(),
            factor_label=f"Skill essencial ausente: {skill}",
            impact_score=-priority_slot_impact,
            normalized_weight=weights["priority"],
            direction="negative",
            evidence={"matched": False, "required_skill": skill},
        )

    for partial in partial_matches[:5]:
        required = str(partial.get("required") or "").strip()
        candidate_skill = str(partial.get("candidate") or "").strip()
        partial_score = _to_decimal(partial.get("score"))
        if not required:
            continue
        add_factor(
            factor_type="adjacent_skill_match",
            factor_key=required.casefold(),
            factor_label=f"Experiência adjacente cobre parcialmente {required}",
            impact_score=(priority_slot_impact * partial_score).quantize(Decimal("0.01")),
            normalized_weight=weights["priority"],
            direction="neutral",
            evidence={
                "required_skill": required,
                "candidate_skill": candidate_skill,
                "partial_score": float(partial_score.quantize(Decimal("0.01"))),
                "reason": partial.get("reason"),
                "source": partial.get("source"),
            },
        )

    complementary_total = int(
        bd.get("complementary_skills_total")
        or len(complementary_names)
    )
    complementary_matched = int(bd.get("complementary_skills_matched") or 0)
    complementary_missing = len(bd.get("missing_complementary_skills") or [])
    complementary_bonus_cap_slots = int(
        bd.get("complementary_bonus_cap_slots")
        or min(complementary_total, 5)
    )
    complementary_bonus_impact = _to_decimal(
        bd.get("complementary_component_impact")
    )
    if complementary_total > 0:
        bonus_direction = "positive" if complementary_bonus_impact > Decimal("0") else "neutral"
        bonus_label = (
            f"Diferenciais: {complementary_matched}/{complementary_total} encontrados, bônus de {float(complementary_bonus_impact):.2f} pts"
            if complementary_bonus_impact > Decimal("0")
            else f"Diferenciais: {complementary_matched}/{complementary_total} encontrados, sem bônus aplicado"
        )
        add_factor(
            factor_type="complementary_skill_bonus",
            factor_key="complementary_skills",
            factor_label=bonus_label,
            impact_score=complementary_bonus_impact,
            normalized_weight=weights["complementary"],
            direction=bonus_direction,
            evidence={
                "matched_complementary_skills": list(bd.get("matched_complementary_skills") or []),
                "missing_complementary_skills": list(bd.get("missing_complementary_skills") or []),
                "complementary_skills_matched": complementary_matched,
                "complementary_skills_missing": complementary_missing,
                "complementary_skills_total": complementary_total,
                "complementary_bonus_cap_slots": complementary_bonus_cap_slots,
                "complementary_score_weighted": float(_to_decimal(bd.get("complementary_score_weighted")).quantize(Decimal("0.01"))),
                "complementary_score_raw_weighted": float(_to_decimal(bd.get("complementary_score_raw_weighted")).quantize(Decimal("0.01"))),
            },
        )

    experience_score = bd["experience_match_score"]
    experience_impact = ((experience_score - Decimal("50")) * Decimal("0.25")).quantize(Decimal("0.01"))
    years = row.get("total_experience_years")
    required_years = job.minimum_years_experience
    add_factor(
        factor_type="experience_match" if experience_score >= Decimal("70") else "insufficient_experience",
        factor_key="experience",
        factor_label=(
            "Experiência atende ou supera o esperado"
            if experience_score >= Decimal("70")
            else "Experiência abaixo do esperado"
        ),
        impact_score=experience_impact,
        normalized_weight=weights["experience"],
        direction="positive" if experience_score >= Decimal("70") else "negative",
        evidence={
            "years_found": float(_to_decimal(years, default=Decimal("0")).quantize(Decimal("0.01"))) if years is not None else 0.0,
            "years_required": float(_to_decimal(required_years, default=Decimal("0")).quantize(Decimal("0.01"))) if required_years is not None else 0.0,
        },
    )

    seniority_score = bd["seniority_match_score"]
    seniority_impact = ((seniority_score - Decimal("50")) * Decimal("0.15")).quantize(Decimal("0.01"))
    add_factor(
        factor_type="seniority_match" if seniority_score >= Decimal("70") else "seniority_gap",
        factor_key="seniority",
        factor_label=(
            "Senioridade alinhada à vaga"
            if seniority_score >= Decimal("70")
            else "Senioridade abaixo da desejada"
        ),
        impact_score=seniority_impact,
        normalized_weight=weights["seniority"],
        direction="positive" if seniority_score >= Decimal("70") else "negative",
        evidence={
            "candidate_seniority": row.get("seniority_level"),
            "job_seniority": job.seniority_level,
        },
    )

    education_score = bd["education_score"]
    if education_score >= Decimal("100"):
        add_factor(
            factor_type="education_match",
            factor_key="education",
            factor_label="Formação compatível com a vaga",
            impact_score=Decimal("5.00"),
            normalized_weight=Decimal("0.10"),
            direction="positive",
            evidence={
                "candidate_education": row.get("education_level"),
                "job_education": job.minimum_education_level,
            },
        )

    confidence_score = bd.get("confidence_score", Decimal("0.00"))
    if bd["final_score"] >= Decimal("70.00") and confidence_score < Decimal("50.00"):
        confidence_penalty = ((Decimal("50.00") - confidence_score) / Decimal("4")).quantize(Decimal("0.01"))
        add_factor(
            factor_type="data_confidence_penalty",
            factor_key="matching_confidence",
            factor_label="Baixa confiança dos dados usados no matching",
            impact_score=-confidence_penalty,
            normalized_weight=Decimal("0.05"),
            direction="negative",
            evidence={"confidence_score": float(confidence_score.quantize(Decimal("0.01")))},
        )

    _validate_score_factors(factors)
    return factors


def _build_reason_codes(factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    codes: list[dict[str, Any]] = []
    for factor in factors:
        factor_type = str(factor.get("factor_type") or "")
        factor_key = str(factor.get("factor_key") or "")
        factor_label = str(factor.get("factor_label") or "")
        impact = float(factor.get("impact_score") or 0.0)

        reason_type = {
            "required_skill_match": "skill_match",
            "missing_required_skill": "missing_skill",
            "complementary_skill_bonus": "desirable_skills",
            "adjacent_skill_match": "adjacent_skill",
            "experience_match": "experience",
            "insufficient_experience": "experience",
            "seniority_match": "seniority",
            "seniority_gap": "seniority",
            "education_match": "education",
            "deal_breaker_violation": "deal_breaker",
            "data_confidence_penalty": "confidence_alert",
        }.get(factor_type, factor_type)

        codes.append({
            "type": reason_type,
            "field": factor_key,
            "impact": impact,
            "description": factor_label,
        })
    return codes


def _validate_score_factors(factors: list[dict[str, Any]]) -> None:
    for factor in factors:
        factor_type = str(factor.get("factor_type") or "")
        direction = str(factor.get("direction") or "")
        if factor_type not in _ALLOWED_SCORE_FACTOR_TYPES:
            logger.error("ranking.invalid_factor_type", factor_type=factor_type, factor=factor)
            raise ValueError(f"Unsupported factor_type: {factor_type}")
        if direction not in {"positive", "negative", "neutral"}:
            logger.error("ranking.invalid_factor_direction", direction=direction, factor=factor)
            raise ValueError(f"Unsupported factor direction: {direction}")


def _summarize_score_factors(factors: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {
        "positive": [],
        "negative": [],
        "contextual": [],
    }
    for factor in sorted(
        factors,
        key=lambda item: abs(float(item.get("impact_score") or 0.0)),
        reverse=True,
    ):
        direction = str(factor.get("direction") or "neutral")
        bucket = "contextual"
        if direction == "positive":
            bucket = "positive"
        elif direction == "negative":
            bucket = "negative"

        if len(grouped[bucket]) >= _SCORE_FACTOR_SUMMARY_LIMIT:
            continue
        grouped[bucket].append({
            "factor_type": str(factor.get("factor_type") or ""),
            "factor_key": str(factor.get("factor_key") or ""),
            "factor_label": str(factor.get("factor_label") or ""),
            "impact_score": float(factor.get("impact_score") or 0.0),
            "direction": direction,
        })
    return grouped


def _empty_delta_summary(
    *,
    current_score: Decimal | None,
) -> dict[str, Any]:
    return {
        "previous_score": None,
        "current_score": float(current_score.quantize(Decimal("0.01"))) if current_score is not None else None,
        "score_change": None,
        "change_reason": None,
        "top_changes": [],
    }


def _derive_delta_summary(
    *,
    previous_snapshot: dict[str, Any] | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    current_score = _to_decimal(payload["final_score"]).quantize(Decimal("0.01"))
    if previous_snapshot is None:
        return _empty_delta_summary(current_score=current_score)

    previous_score = _to_decimal(previous_snapshot.get("final_score")).quantize(Decimal("0.01"))
    score_change = (current_score - previous_score).quantize(Decimal("0.01"))
    previous_factors = {
        (str(item.get("factor_type") or ""), str(item.get("factor_key") or "")): item
        for item in previous_snapshot.get("factors", [])
    }
    current_factors = {
        (str(item.get("factor_type") or ""), str(item.get("factor_key") or "")): item
        for item in payload.get("factors", [])
    }
    all_keys = set(previous_factors) | set(current_factors)
    top_changes: list[dict[str, Any]] = []

    for factor_key in all_keys:
        previous_factor = previous_factors.get(factor_key)
        current_factor = current_factors.get(factor_key)
        previous_impact = _to_decimal(previous_factor.get("impact_score")) if previous_factor else Decimal("0.00")
        current_impact = _to_decimal(current_factor.get("impact_score")) if current_factor else Decimal("0.00")
        impact_delta = (current_impact - previous_impact).quantize(Decimal("0.01"))
        if abs(impact_delta) < _SCORE_DELTA_CHANGE_THRESHOLD:
            continue
        base_factor = current_factor or previous_factor or {}
        top_changes.append({
            "factor_type": str(base_factor.get("factor_type") or ""),
            "factor_key": str(base_factor.get("factor_key") or ""),
            "factor_label": str(base_factor.get("factor_label") or ""),
            "previous_impact_score": float(previous_impact),
            "current_impact_score": float(current_impact),
            "impact_delta": float(impact_delta),
            "change_kind": (
                "added"
                if previous_factor is None
                else "removed"
                if current_factor is None
                else "changed"
            ),
        })

    top_changes.sort(key=lambda item: abs(float(item["impact_delta"])), reverse=True)
    top_changes = top_changes[:_SCORE_DELTA_SUMMARY_LIMIT]

    previous_input_hash = str(previous_snapshot.get("input_hash") or "")
    current_input_hash = str(payload.get("input_hash") or "")
    previous_job_signature_hash = str(previous_snapshot.get("job_signature_hash") or "")
    current_job_signature_hash = str(payload.get("job_signature_hash") or "")
    previous_ranking_version = str(previous_snapshot.get("ranking_version") or "")
    current_ranking_version = str(payload.get("score_model_version") or "")
    previous_analysis_id = str(previous_snapshot.get("source_analysis_id") or "")
    current_analysis_id = str(payload.get("source_analysis_id") or "")
    previous_analysis_created_at = str(previous_snapshot.get("source_analysis_created_at") or "")
    current_analysis_created_at = str(payload.get("source_analysis_created_at") or "")

    if previous_ranking_version and current_ranking_version and previous_ranking_version != current_ranking_version:
        change_reason = "score_model_changed"
    elif previous_job_signature_hash and current_job_signature_hash and previous_job_signature_hash != current_job_signature_hash:
        change_reason = "job_requirements_changed"
    elif (
        previous_analysis_id != current_analysis_id
        or previous_analysis_created_at != current_analysis_created_at
    ):
        change_reason = "candidate_analysis_changed"
    elif previous_input_hash == current_input_hash:
        change_reason = "manual_recompute_same_inputs"
    else:
        change_reason = "candidate_analysis_changed"

    return {
        "previous_score": float(previous_score),
        "current_score": float(current_score),
        "score_change": float(score_change),
        "change_reason": change_reason,
        "top_changes": top_changes,
    }


def _render_score_explanation(
    *,
    final_score: Decimal | float | int,
    decision: str,
    factor_summary: dict[str, list[dict[str, Any]]],
    delta_summary: dict[str, Any] | None,
    breakdown: dict[str, Any] | None = None,
) -> str:
    score = float(_to_decimal(final_score).quantize(Decimal("0.01")))
    positives = [item["factor_label"] for item in factor_summary.get("positive", [])[:2]]
    negatives = [item["factor_label"] for item in factor_summary.get("negative", [])[:2]]

    parts = [f"Aderência à vaga em {score:.1f}/100."]
    if breakdown:
        priority_matched = int(breakdown.get("priority_skills_matched") or 0)
        priority_total = int(breakdown.get("priority_skills_total") or 0)
        priority_missing = len(breakdown.get("missing_priority_skills") or breakdown.get("missing_required_skills") or [])
        priority_impact = float(_to_decimal(breakdown.get("priority_component_impact")).quantize(Decimal("0.01")))
        complementary_matched = int(breakdown.get("complementary_skills_matched") or 0)
        complementary_total = int(breakdown.get("complementary_skills_total") or 0)
        complementary_missing = len(breakdown.get("missing_complementary_skills") or [])
        complementary_impact = float(_to_decimal(breakdown.get("complementary_component_impact")).quantize(Decimal("0.01")))
        complementary_bonus_cap_slots = int(breakdown.get("complementary_bonus_cap_slots") or 0)
        eliminatory_missing = list(breakdown.get("missing_eliminatory_skills") or [])
        priority_missing_label = "ausente" if priority_missing == 1 else "ausentes"
        complementary_missing_label = "ausente" if complementary_missing == 1 else "ausentes"
        parts.append(
            f"Essenciais: {priority_matched}/{priority_total} atendidas, {priority_missing} {priority_missing_label}, impacto {priority_impact:.1f} pts."
        )
        if complementary_total > 0:
            parts.append(
                f"Diferenciais: {complementary_matched}/{complementary_total} encontrados, {complementary_missing} {complementary_missing_label}, bônus {complementary_impact:.1f} pts"
                f"{f' (cap em {complementary_bonus_cap_slots} skills).' if complementary_bonus_cap_slots > 0 else '.'}"
            )
        else:
            parts.append("Diferenciais: não aplicáveis para esta vaga.")

        has_deal_breaker_violation = any(
            item.get("factor_type") == "deal_breaker_violation"
            for item in factor_summary.get("negative", [])
        )
        if has_deal_breaker_violation:
            parts.append("Critérios eliminatórios: houve bloqueio ativo no ranking.")
        elif eliminatory_missing:
            parts.append(
                "Critérios eliminatórios: ausência em "
                + ", ".join(eliminatory_missing[:4])
                + "."
            )
        else:
            parts.append("Critérios eliminatórios: nenhum bloqueio ativo.")
    if positives:
        parts.append(f"Pontos fortes: {', '.join(positives)}.")
    if negatives:
        parts.append(f"Principais impactos negativos: {', '.join(negatives)}.")

    if delta_summary and delta_summary.get("score_change") not in {None, 0, 0.0}:
        delta_value = float(delta_summary["score_change"])
        if abs(delta_value) >= 5:
            direction = "subiu" if delta_value > 0 else "caiu"
            parts.append(
                f"O score {direction} {abs(delta_value):.0f} pontos desde o snapshot anterior."
            )

    decision_text = {
        "approved": "Perfil recomendado para avançar.",
        "review": "Perfil pede revisão adicional.",
        "rejected_suggested": "Perfil abaixo do threshold recomendado.",
    }.get(decision)
    if decision_text:
        parts.append(decision_text)
    return " ".join(parts)



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (ValueError, TypeError) as exc:
        logger.warning(
            "ranking.decimal_conversion_failed",
            value=str(value)[:100],
            error=str(exc),
            using_default=str(default),
        )
        return default


def _is_skill_priority(item: Any) -> bool:
    try:
        if not hasattr(item, "JobRequiredSkillModel"):
            logger.warning(
                "job_skill_row_missing_relation",
                item_type=type(item).__name__,
            )
            return False

        link = item.JobRequiredSkillModel
        if not hasattr(link, "priority_level"):
            return False

        return is_priority_skill(link.priority_level)
    except Exception as exc:
        logger.error(
            "job_skill_priority_check_failed",
            error=str(exc),
            error_type=type(exc).__name__,
        )
        return False


def _is_skill_complementary(item: Any) -> bool:
    try:
        if not hasattr(item, "JobRequiredSkillModel"):
            return False
        return is_complementary_skill(item.JobRequiredSkillModel.priority_level)
    except Exception:
        return False


def _is_skill_eliminatory(item: Any) -> bool:
    try:
        if not hasattr(item, "JobRequiredSkillModel"):
            return False
        return is_eliminatory_skill(item.JobRequiredSkillModel.priority_level)
    except Exception:
        return False


def _skill_priority_label(item: Any) -> str:
    if _is_skill_eliminatory(item):
        return "eliminatory"
    if _is_skill_priority(item):
        return "priority"
    return "complementary"


def _resolve_thresholds(version: ScoreModelVersionModel) -> tuple[Decimal, Decimal]:
    thresholds = {k: Decimal(str(v)) for k, v in version.thresholds.items()}
    high = thresholds.get("high", Decimal("70"))
    low = thresholds.get("low", Decimal("55"))
    return high, low


def _coerce_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _resolve_freshness_status(
    *,
    ranking_updated_at: datetime | None,
    match_updated_at: datetime | None,
    persisted_status: str | None,
    score_job_signature_hash: str | None = None,
    job_signature_hash: str | None = None,
    score_computed_at: datetime | None = None,
    job_updated_at: datetime | None = None,
) -> tuple[str, str | None]:
    if persisted_status != "fresh":
        return ("stale", "Registro persistido não está fresh. Recompute necessário.")
    if score_job_signature_hash is None or not str(score_job_signature_hash).strip():
        return ("stale", "Score sem job_signature_hash válido. Recompute necessário.")
    if job_signature_hash is None or not str(job_signature_hash).strip():
        return ("stale", "Vaga sem job_profile_hash válido. Recompute necessário.")
    if score_job_signature_hash != job_signature_hash:
        return ("stale", "Score computado com outra assinatura de vaga. Recompute necessário.")
    if job_updated_at is None:
        return ("stale", "Vaga sem updated_at. Recompute necessário.")
    if score_computed_at is None:
        return ("stale", "Score sem computed_at. Recompute necessário.")
    if score_computed_at < job_updated_at:
        return ("stale", "Vaga foi modificada após o score. Recompute necessário.")
    if ranking_updated_at is None or match_updated_at is None:
        return ("stale", "Faltam timestamps do ranking ou match. Recompute necessário.")
    if ranking_updated_at < match_updated_at:
        return ("stale", "Match mais recente que ranking. Recompute necessário.")
    return ("fresh", None)


def _build_score_input_hash(
    *,
    row: dict[str, Any],
    score_version: str,
    job_signature_hash: str,
) -> str:
    raw = "|".join([
        str(row.get("candidate_id") or ""),
        str(row.get("source_analysis_id") or ""),
        str(row.get("source_analysis_created_at") or ""),
        str(row.get("resume_version_id") or ""),
        ",".join(_coerce_list(row.get("matched_skills"))),
        ",".join(_coerce_list(row.get("missing_skills"))),
        str(row.get("total_experience_years") or ""),
        str(row.get("seniority_level") or ""),
        job_signature_hash,
        score_version,
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_job_signature_hash(*, job: JobModel, job_skill_rows: list[Any]) -> str:
    raw = "|".join([
        str(job.title or ""),
        str(job.description or ""),
        str(job.requirements or ""),
        str(job.seniority_level or ""),
        str(job.minimum_education_level or ""),
        str(job.minimum_years_experience or ""),
        str(job.deal_breakers or []),
        "|".join(
            sorted(
                [
                    ":".join(
                        [
                            str(item.skill_name or ""),
                            _skill_priority_label(item),
                            str(getattr(item.JobRequiredSkillModel, "minimum_level", None) or ""),
                            str(getattr(item.JobRequiredSkillModel, "minimum_years", None) or ""),
                            str(getattr(item.JobRequiredSkillModel, "weight", None) or ""),
                        ]
                    )
                    for item in job_skill_rows
                    if str(item.skill_name or "").strip()
                ]
            )
        ),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _default_score_breakdown(*, public_job_fit_score: Any | None = None) -> dict[str, Any]:
    """Return a safe default score breakdown for malformed data."""
    zero = Decimal("0.00")
    job_fit_score = zero
    if public_job_fit_score is not None:
        job_fit_score = _to_decimal(public_job_fit_score).quantize(Decimal("0.01"))
    return {
        "skill_match_score": zero,
        "experience_match_score": zero,
        "seniority_match_score": zero,
        "education_score": zero,
        "confidence_score": zero,
        "penalty_score": zero,
        "validation_penalty_score": zero,
        "job_fit_score": job_fit_score,
    }


def _normalize_score_breakdown(
    raw: Any,
    *,
    public_job_fit_score: Any | None = None,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        logger.warning("ranking.invalid_score_breakdown_type", type=type(raw).__name__)
        return _default_score_breakdown(public_job_fit_score=public_job_fit_score)

    breakdown = dict(raw)
    if public_job_fit_score is not None and breakdown.get("job_fit_score") is None:
        breakdown["job_fit_score"] = public_job_fit_score

    q = Decimal("0.01")
    defaults = _default_score_breakdown(public_job_fit_score=public_job_fit_score)
    normalized: dict[str, Any] = {
        "skill_match_score": _to_decimal(
            breakdown.get("skill_match_score", defaults["skill_match_score"]),
        ).quantize(q),
        "experience_match_score": _to_decimal(
            breakdown.get("experience_match_score", defaults["experience_match_score"]),
        ).quantize(q),
        "seniority_match_score": _to_decimal(
            breakdown.get("seniority_match_score", defaults["seniority_match_score"]),
        ).quantize(q),
        "education_score": _to_decimal(
            breakdown.get("education_score", defaults["education_score"]),
        ).quantize(q),
        "confidence_score": _to_decimal(
            breakdown.get("confidence_score", defaults["confidence_score"]),
        ).quantize(q),
        "penalty_score": _to_decimal(
            breakdown.get("penalty_score", defaults["penalty_score"]),
        ).quantize(q),
        "validation_penalty_score": _to_decimal(
            breakdown.get("validation_penalty_score", defaults["validation_penalty_score"]),
        ).quantize(q),
        "job_fit_score": _to_decimal(
            breakdown.get("job_fit_score", defaults["job_fit_score"]),
        ).quantize(q),
    }
    decimal_keys = (
        "raw_score",
        "priority_score_weighted",
        "complementary_score_weighted",
        "complementary_score_raw_weighted",
        "priority_component_impact",
        "complementary_component_impact",
        "experience_component_impact",
        "seniority_component_impact",
        "deal_breaker_penalty_score",
    )
    for key in decimal_keys:
        if breakdown.get(key) is not None:
            normalized[key] = _to_decimal(breakdown.get(key)).quantize(q)

    forbidden_public_keys = {
        "final_score",
        "final_score_before_cap",
        "final_score_after_cap",
    }
    for key, value in breakdown.items():
        if key in normalized or key in forbidden_public_keys:
            continue
        normalized[key] = value

    return normalized


def _serialize_breakdown(raw: dict[str, Any]) -> dict[str, Any]:
    serialized: dict[str, Any] = {}
    for key, value in raw.items():
        if isinstance(value, Decimal):
            serialized[key] = float(value)
        else:
            serialized[key] = value
    if serialized.get("job_fit_score") is None and raw.get("final_score") is not None:
        serialized["job_fit_score"] = float(_to_decimal(raw.get("final_score")).quantize(Decimal("0.01")))
    return serialized


def _normalize_reason_codes(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        normalized_item = dict(item)
        normalized_item["type"] = str(item.get("type") or "")
        normalized_item["field"] = str(item.get("field") or "")
        normalized_item["impact"] = float(item.get("impact") or 0)
        normalized_item["description"] = str(item.get("description") or "")
        normalized.append(normalized_item)
    return normalized


def _normalize_factor_summary(raw: Any) -> dict[str, list[dict[str, Any]]]:
    default = {"positive": [], "negative": [], "contextual": []}
    if not isinstance(raw, dict):
        return default

    normalized = dict(default)
    for key in ("positive", "negative", "contextual"):
        value = raw.get(key)
        if isinstance(value, list):
            normalized[key] = [dict(item) for item in value if isinstance(item, dict)]
    return normalized

def _eligibility_sort_rank(value: Any) -> int:
    normalized = str(value).strip().upper()
    if normalized == "PASS":
        return 0
    if normalized == "REVIEW":
        return 1
    if normalized == "FAIL":
        return 2
    return 3


def _coerce_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if str(v).strip()]
    return []


def _has_canonical_skill_evidence(row: dict[str, Any]) -> bool:
    evidence = row.get("skill_evidence_breakdown")
    if not isinstance(evidence, dict):
        return False
    return evidence.get("priority_score_weighted") is not None


def _has_valid_persisted_ranking_row(row: dict[str, Any]) -> bool:
    if row.get("final_score") is None:
        return False
    if not isinstance(row.get("breakdown"), dict):
        return False
    if not isinstance(row.get("reason_codes"), list):
        return False
    if row.get("computed_at") is None:
        return False
    if row.get("match_updated_at") is None:
        return False
    return True


def _enrich_match_row_for_deal_breakers(row: dict[str, Any]) -> dict[str, Any]:
    analysis_fields = _extract_analysis_result_fields(row.get("analysis_extracted_data"))
    profile_fields = _extract_candidate_profile_fields(row.get("candidate_profile_raw_response_json"))

    row["location_city"] = _first_non_empty_string(
        row.get("location_city"),
        analysis_fields.get("location_city"),
        analysis_fields.get("location"),
        profile_fields.get("location_city"),
        profile_fields.get("location"),
    )
    row["internal_notes"] = _first_non_empty_string(row.get("internal_notes"))
    row["work_model"] = _first_non_empty_string(
        analysis_fields.get("work_model"),
        profile_fields.get("work_model"),
    )
    row["languages"] = _normalize_languages(
        analysis_fields.get("languages")
        if analysis_fields.get("languages") is not None
        else profile_fields.get("languages")
    )
    row["availability"] = _first_non_empty_string(
        analysis_fields.get("availability"),
        profile_fields.get("availability"),
    )
    return row


def _extract_analysis_result_fields(raw: Any) -> dict[str, Any]:
    return raw if isinstance(raw, dict) else {}


def _extract_candidate_profile_fields(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    analysis_fields = raw.get("analysis_result_fields")
    if isinstance(analysis_fields, dict):
        return analysis_fields
    return raw


def _first_non_empty_string(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _normalize_languages(raw: Any) -> list[str]:
    values = raw if isinstance(raw, list) else [raw] if raw is not None else []
    languages: list[str] = []
    for item in values:
        if isinstance(item, dict):
            text = item.get("language") or item.get("name") or item.get("value")
        else:
            text = item
        if text is None:
            continue
        normalized = str(text).strip()
        if normalized and normalized not in languages:
            languages.append(normalized)
    return languages


def _find_missing_deal_breaker_fields(
    deal_breakers: list[dict[str, Any]] | None,
    row: dict[str, Any],
) -> list[str]:
    if not deal_breakers:
        return []

    missing: list[str] = []
    seen: set[str] = set()
    for deal_breaker in deal_breakers:
        if not deal_breaker.get("is_active", True):
            continue

        field = str(deal_breaker.get("field") or "").strip()
        missing_key: str | None = None
        if field == "location" and not _first_non_empty_string(row.get("location_city")):
            missing_key = "location_city"
        elif field == "work_model" and not _first_non_empty_string(row.get("work_model")):
            missing_key = "work_model"
        elif field == "education_level" and not _first_non_empty_string(row.get("education_level")):
            missing_key = "education_level"
        elif field == "experience_years" and row.get("total_experience_years") is None:
            missing_key = "total_experience_years"
        elif field == "language" and not _normalize_languages(row.get("languages")):
            missing_key = "languages"
        elif field == "availability" and not _first_non_empty_string(row.get("availability")):
            missing_key = "availability"
        elif field == "custom_text":
            has_searchable_text = any(
                _first_non_empty_string(row.get(key))
                for key in ("candidate_name", "location_city", "internal_notes")
            )
            if not has_searchable_text:
                missing_key = "custom_text_context"

        if missing_key is not None and missing_key not in seen:
            seen.add(missing_key)
            missing.append(missing_key)

    return missing


def _format_missing_deal_breaker_evidence_reason(fields: list[str]) -> str:
    return "Evidência ausente para deal-breaker: " + ", ".join(fields)


def _append_validation_reason(existing: Any, new_reason: str) -> str:
    reasons = [str(existing).strip()] if isinstance(existing, str) and str(existing).strip() else []
    if new_reason and new_reason not in reasons:
        reasons.append(new_reason)
    return " | ".join(reasons)
