from __future__ import annotations

import hashlib
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_ranking_explanation_builder import (
    _default_factor_summary,
)
from src.application.services.strict_payload import (
    require_datetime,
    require_decimal,
    require_dict,
    require_list,
    require_non_empty_string,
)
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    JobProfileAnalysisModel,
)


class CandidateRankingScoreStore:
    def __init__(
        self,
        session: AsyncSession,
        *,
        explainability_version: str,
        validate_score_factors: Callable[[list[dict[str, Any]]], None],
        summarize_score_factors: Callable[[list[dict[str, Any]]], dict[str, list[dict[str, Any]]]],
        derive_delta_summary: Callable[..., dict[str, Any]],
        render_score_explanation: Callable[..., str],
        empty_delta_summary: Callable[..., dict[str, Any]],
        coerce_utc_datetime: Callable[[datetime | None], datetime | None],
        logger: Any,
    ) -> None:
        self._session = session
        self._explainability_version = explainability_version
        self._validate_score_factors = validate_score_factors
        self._summarize_score_factors = summarize_score_factors
        self._derive_delta_summary = derive_delta_summary
        self._render_score_explanation = render_score_explanation
        self._empty_delta_summary = empty_delta_summary
        self._coerce_utc_datetime = coerce_utc_datetime
        self._logger = logger

    async def mark_candidate_stale(self, job_id: UUID, candidate_id: UUID, version_id: UUID) -> None:
        await self._session.execute(
            sa.update(CandidateJobScoreModel)
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.version_id == version_id,
            )
            .values(freshness_status="stale")
        )

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

    async def fetch_persisted_scores(self, job_id: UUID, version_id: UUID) -> list[dict[str, Any]]:
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
                CandidateModel.data_quality_status.in_(["valid", "unknown"]),
            )
            .order_by(
                CandidateJobScoreModel.final_score.desc(),
                CandidateJobScoreModel.computed_at.desc(),
                CandidateJobScoreModel.candidate_id.asc(),
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def calculate_data_quality_stats(self, job_id: UUID) -> dict[str, int]:
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
                self._logger.warning(
                    "ranking.null_data_quality_status_in_stats",
                    row_count=row.get("count"),
                )
                status = "unknown"
            elif status not in counts:
                self._logger.error(
                    "ranking.invalid_data_quality_status_in_stats",
                    status=status,
                )
                status = "unknown"
            if status in counts:
                counts[status] = row["count"]

        total = sum(counts.values())
        valid = counts["valid"]
        unknown = counts["unknown"]
        invalid = sum(counts[k] for k in ["no_resume", "empty_resume", "parsing_failed", "invalid_manual"])
        filtered = invalid
        return {
            "total_candidates": total,
            "valid_candidates": valid,
            "unknown_candidates": unknown,
            "invalid_candidates": invalid,
            "filtered_candidates": filtered,
        }

    async def load_latest_snapshot(
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

    async def persist_score(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        version: ScoreModelVersionModel,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        payload = dict(payload)
        payload.setdefault("score_model_version", version.version)
        payload.setdefault("explainability_version", self._explainability_version)
        payload.setdefault("factors", [])
        if not isinstance(payload["factors"], list):
            raise ValueError("factors must be list")
        self._validate_score_factors(payload["factors"])
        payload.setdefault("factor_summary_json", self._summarize_score_factors(payload["factors"]))

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

        previous_snapshot = await self.load_latest_snapshot(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        payload["previous_score"] = previous_score
        current_analysis_created_at = self._coerce_utc_datetime(
            existing.source_analysis_created_at if existing is not None else None
        )
        incoming_analysis_created_at = self._coerce_utc_datetime(payload["source_analysis_created_at"])
        incoming_updated_at = self._coerce_utc_datetime(payload["updated_at"])
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
                "factor_summary": (
                    dict(existing.factor_summary_json or {})
                    if existing is not None
                    else _default_factor_summary()
                ),
                "delta_summary": (
                    dict(existing.delta_summary_json or {})
                    if existing is not None
                    else self._empty_delta_summary(current_score=previous_score)
                ),
            }

        factor_summary = dict(payload["factor_summary_json"] or {})
        delta_summary = self._derive_delta_summary(
            previous_snapshot=previous_snapshot,
            payload=payload,
        )
        payload["delta_summary_json"] = delta_summary
        payload["explanation_text"] = self._render_score_explanation(
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
                    "factor_summary": (
                        dict(current.factor_summary_json or {})
                        if current is not None
                        else _default_factor_summary()
                    ),
                    "delta_summary": (
                        dict(current.delta_summary_json or {})
                        if current is not None
                        else self._empty_delta_summary(current_score=current_score)
                    ),
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
                "ranking_updated_at": self._coerce_utc_datetime(returned_row["updated_at"]) or incoming_updated_at,
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
