from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import (
    AnalysisService,
    _calculate_experience_score,
    _calculate_seniority_score,
    _canonical_component_weights,
    _job_has_structured_requirements,
    _validate_education,
)
from src.application.services.match_confidence_service import (
    compute_match_confidence,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.domain.services.deal_breaker_evaluator import evaluate_deal_breakers

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RankingJobNotFoundError(Exception):
    pass


class NoActiveScoreVersionError(Exception):
    pass


class NoPersistedScoresError(Exception):
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

    async def compute_and_persist(self, job_id: UUID) -> int:
        """Persist a ranking snapshot using canonical match_score as source of truth.

        Returns the number of candidates scored.

        Raises RankingJobNotFoundError if the job does not exist.
        Raises NoActiveScoreVersionError if no active score model version exists.
        """
        await self._assert_job_exists(job_id)
        job = await self._load_job_with_deal_breakers(job_id)
        version = await self._load_active_version()
        threshold_high, threshold_low = _resolve_thresholds(version)
        job_skill_rows = await self._load_job_skill_rows(job_id)
        rows = await self._fetch_match_rows(job_id)
        rows = await self._reprocess_outdated_matches_if_needed(
            job_id=job_id,
            job=job,
            job_skill_rows=job_skill_rows,
            rows=rows,
        )
        now = datetime.now(UTC)
        count = 0

        for row in rows:
            outdated = _is_outdated_match_row(
                row=row,
                job=job,
                job_skill_rows=job_skill_rows,
            )
            bd = _compute_breakdown(
                row=row,
                job=job,
                job_skill_rows=job_skill_rows,
                outdated=outdated,
            )
            deal_breaker_violations = evaluate_deal_breakers(job.deal_breakers, row)
            decision = _decide(bd["final_score"], threshold_high, threshold_low)
            matched = _coerce_list(row.get("matched_skills"))
            missing = _coerce_list(row.get("missing_skills"))
            reason_codes = _build_reason_codes(
                row,
                bd,
                matched,
                missing,
                deal_breaker_violations,
                outdated=outdated,
            )
            explanation = _build_explanation(
                row,
                bd,
                decision,
                matched,
                missing,
                outdated=outdated,
            )

            # Serialize Decimal values for JSONB storage
            serialized_bd = {k: float(v) for k, v in bd.items()}
            serialized_codes = [
                {**rc, "impact": float(rc["impact"])} for rc in reason_codes
            ]

            stmt = (
                pg_insert(CandidateJobScoreModel)
                .values(
                    id=uuid4(),
                    candidate_id=row["candidate_id"],
                    job_id=job_id,
                    version_id=version.id,
                    final_score=bd["final_score"],
                    decision_suggestion=decision,
                    breakdown=serialized_bd,
                    reason_codes=serialized_codes,
                    explanation_text=explanation,
                    computed_at=now,
                )
                .on_conflict_do_update(
                    constraint="uq_candidate_job_score_version",
                    set_={
                        "final_score": bd["final_score"],
                        "decision_suggestion": decision,
                        "breakdown": serialized_bd,
                        "reason_codes": serialized_codes,
                        "explanation_text": explanation,
                        "computed_at": now,
                    },
                )
            )
            await self._session.execute(stmt)
            count += 1

        return count

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
        for rank, row in enumerate(rows, start=1):
            breakdown_raw: dict = row["breakdown"]
            reason_codes_raw: list = row["reason_codes"]

            # data_quality_status should never be None due to server_default="unknown"
            # But as defensive programming, fall back to "unknown" if missing
            dq_status = row.get("data_quality_status", "unknown")

            entries.append({
                "rank": rank,
                "candidate_id": row["candidate_id"],
                "candidate_name": row["candidate_name"],
                "stage": row["stage"],
                "pipeline_status": row["pipeline_status"],
                # Persisted JSON may come from older scoring versions. Fill in
                # missing fields so the API stays backward compatible.
                "score_breakdown": _normalize_score_breakdown(breakdown_raw),
                "decision_suggestion": row["decision_suggestion"],
                "reason_codes": _normalize_reason_codes(reason_codes_raw),
                "explanation_text": row["explanation_text"],
                "final_score": Decimal(str(row["final_score"])),
                "entered_at": row.get("entered_at"),
                "computed_at": row["computed_at"],
                "version": version.version,
                "data_quality_status": dq_status,
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

    async def _fetch_match_rows(self, job_id: UUID) -> list[dict]:
        latest_match = (
            sa.select(
                CandidateJobMatchModel.candidate_id,
                CandidateJobMatchModel.job_id,
                CandidateJobMatchModel.resume_version_id,
                CandidateJobMatchModel.match_score,
                CandidateJobMatchModel.recommendation,
                CandidateJobMatchModel.matched_skills_json,
                CandidateJobMatchModel.missing_skills_json,
                CandidateProfileAnalysisModel.seniority_level,
                CandidateProfileAnalysisModel.experience_years,
                CandidateProfileAnalysisModel.education_level,
                CandidateProfileAnalysisModel.skills_json,
                CandidateProfileAnalysisModel.strengths_json,
                CandidateProfileAnalysisModel.weaknesses_json,
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
                CandidateProfileAnalysisModel,
                CandidateProfileAnalysisModel.id == CandidateJobMatchModel.candidate_profile_analysis_id,
            )
            .where(CandidateJobMatchModel.job_id == job_id)
            .subquery("latest_match")
        )

        result = await self._session.execute(
            # CandidateJobMatch currently stores final recommendation; derive validation
            # state from that canonical signal for ranking guardrails.
            # - `not_match` => hard fail
            # - `review_manually` => unknown evidence
            # - otherwise => pass
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.entered_at,
                latest_match.c.match_score.label("skills_match_score"),
                latest_match.c.match_score.label("experience_match_score"),
                latest_match.c.match_score.label("seniority_match_score"),
                latest_match.c.matched_skills_json.label("matched_skills"),
                latest_match.c.missing_skills_json.label("missing_skills"),
                sa.case(
                    (latest_match.c.recommendation == "not_match", "fail"),
                    (latest_match.c.recommendation == "review_manually", "unknown"),
                    else_="pass",
                ).label("validation_status"),
                sa.literal(None).label("rejection_reasons"),
                latest_match.c.match_score.label("overall_score"),
                latest_match.c.match_score.label("education_score"),
                latest_match.c.experience_years.label("total_experience_years"),
                latest_match.c.skills_json.label("candidate_skills"),
                latest_match.c.strengths_json.label("strengths"),
                latest_match.c.weaknesses_json.label("weaknesses"),
                latest_match.c.seniority_level,
            )
            .select_from(CandidateJobPipelineModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .outerjoin(
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
                CandidateJobPipelineModel.link_status == "active",
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def _load_job_skill_rows(self, job_id: UUID):
        result = await self._session.execute(
            sa.select(
                JobRequiredSkillModel,
                SkillModel.name.label("skill_name"),
                SkillModel.aliases.label("skill_aliases"),
            )
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
        )
        return result.all()

    async def _reprocess_outdated_matches_if_needed(
        self,
        *,
        job_id: UUID,
        job: JobModel,
        job_skill_rows: list[Any],
        rows: list[dict],
    ) -> list[dict]:
        outdated_rows = [
            row
            for row in rows
            if _is_outdated_match_row(row=row, job=job, job_skill_rows=job_skill_rows)
        ]
        if not outdated_rows:
            return rows

        repo = SQLAlchemyAnalysisRepository(self._session)
        analysis_service = AnalysisService(repo)
        reprocessed = False

        for row in outdated_rows:
            resume_version_id = row.get("resume_version_id")
            if resume_version_id is None:
                continue
            analysis = await repo.find_latest_completed_for_version(resume_version_id, job_id)
            if analysis is None:
                continue
            await analysis_service.match_completed_analysis_to_job(analysis.id, job_id)
            reprocessed = True

        if reprocessed:
            return await self._fetch_match_rows(job_id)
        return rows

    async def _fetch_persisted_scores(
        self, job_id: UUID, version_id: UUID
    ) -> list[dict]:
        """Return persisted scores for this job + version, ordered by final_score DESC."""
        latest_shadow_match = (
            sa.select(
                CandidateJobMatchModel.candidate_id,
                CandidateJobMatchModel.job_id,
                CandidateJobMatchModel.eligibility_status,
                CandidateJobMatchModel.strict_score,
                CandidateJobMatchModel.balanced_score,
                CandidateJobMatchModel.skill_evidence_breakdown,
                CandidateJobMatchModel.created_at.label("shadow_created_at"),
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
            .where(CandidateJobMatchModel.score_version == "v2_skill_evidence_shadow")
            .subquery("latest_shadow_match")
        )

        result = await self._session.execute(
            sa.select(
                CandidateJobScoreModel.candidate_id,
                CandidateJobScoreModel.final_score,
                CandidateJobScoreModel.decision_suggestion,
                CandidateJobScoreModel.breakdown,
                CandidateJobScoreModel.reason_codes,
                CandidateJobScoreModel.explanation_text,
                CandidateJobScoreModel.computed_at,
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.data_quality_status,
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.entered_at,
                latest_shadow_match.c.eligibility_status,
                latest_shadow_match.c.strict_score,
                latest_shadow_match.c.balanced_score,
                latest_shadow_match.c.skill_evidence_breakdown,
                latest_shadow_match.c.shadow_created_at,
            )
            .select_from(CandidateJobScoreModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
            .join(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == CandidateJobScoreModel.candidate_id,
                    CandidateJobPipelineModel.job_id == CandidateJobScoreModel.job_id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                    CandidateJobPipelineModel.link_status == "active",
                ),
            )
            .outerjoin(
                latest_shadow_match,
                sa.and_(
                    latest_shadow_match.c.candidate_id == CandidateJobScoreModel.candidate_id,
                    latest_shadow_match.c.job_id == CandidateJobScoreModel.job_id,
                    latest_shadow_match.c.rn == 1,
                ),
            )
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == version_id,
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
            status = row["data_quality_status"] or "unknown"  # Defensive: treat NULL as unknown
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


def _compute_breakdown(
    *,
    row: dict,
    job: JobModel,
    job_skill_rows: list[Any],
    outdated: bool,
) -> dict[str, Decimal]:
    q = Decimal("0.01")
    mandatory_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if getattr(row.JobRequiredSkillModel, "is_mandatory", False) and str(row.skill_name).strip()
    }
    optional_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if not getattr(row.JobRequiredSkillModel, "is_mandatory", False) and str(row.skill_name).strip()
    }
    matched_names = set(_coerce_list(row.get("matched_skills")))
    missing_names = set(_coerce_list(row.get("missing_skills")))

    mandatory_total = len(mandatory_names)
    optional_total = len(optional_names)
    mandatory_matched = len((mandatory_names & matched_names) or set()) if mandatory_total else 0
    optional_matched = len((optional_names & matched_names) or set()) if optional_total else 0

    mandatory_score = (
        Decimal(mandatory_matched) / Decimal(mandatory_total) * Decimal("100")
        if mandatory_total > 0
        else Decimal("0")
    )
    optional_score = (
        Decimal(optional_matched) / Decimal(optional_total) * Decimal("100")
        if optional_total > 0
        else Decimal("0")
    )
    skill_match_score = (
        mandatory_score * Decimal("0.75") + optional_score * Decimal("0.25")
        if mandatory_total or optional_total
        else Decimal("0")
    )

    candidate_years = (
        Decimal(str(row.get("total_experience_years")))
        if row.get("total_experience_years") is not None
        else None
    )
    required_years = (
        Decimal(str(job.minimum_years_experience))
        if job.minimum_years_experience is not None
        else None
    )
    experience_match = _calculate_experience_score(candidate_years, required_years)
    seniority_match = _calculate_seniority_score(
        row.get("seniority_level"),
        job.seniority_level,
    )
    education_result = _validate_education(
        row.get("education_level"),
        job.minimum_education_level,
    )
    if job.minimum_education_level is None:
        education = Decimal("50")
    elif education_result.status == "fail":
        education = Decimal("0")
    elif education_result.status == "unknown":
        education = Decimal("50")
    else:
        education = Decimal("100")

    weights = _canonical_component_weights(
        total_mandatory=mandatory_total,
        total_optional=optional_total,
    )
    reconstructed = (
        mandatory_score * weights["mandatory"]
        + optional_score * weights["optional"]
        + experience_match * weights["experience"]
        + seniority_match * weights["seniority"]
    ).quantize(q)
    confidence_assessment = compute_match_confidence(
        match_score=row.get("overall_score"),
        structured_mandatory_skill_count=mandatory_total,
        structured_total_skill_count=mandatory_total + optional_total,
        has_job_seniority=bool(job.seniority_level),
        has_job_min_experience=job.minimum_years_experience is not None,
        candidate_structured_skill_count=len(_coerce_list(row.get("candidate_skills"))),
        candidate_has_experience=row.get("total_experience_years") is not None,
        candidate_has_education=str(row.get("education_level") or "").strip().lower()
        not in {"", "none", "unknown", "undefined"},
        used_job_skill_fallback=False,
    )

    source_score = _to_decimal(row.get("overall_score")).quantize(q)
    final_score = min(source_score, Decimal("44.00")).quantize(q) if outdated else source_score
    penalty = max(Decimal("0.00"), reconstructed - final_score).quantize(q)
    validation_penalty = Decimal("0.00")
    if row.get("validation_status") in {"fail", "unknown"}:
        validation_penalty = penalty

    return {
        "skill_match_score": skill_match_score.quantize(q),
        "experience_match_score": experience_match.quantize(q),
        "seniority_match_score": seniority_match.quantize(q),
        "education_score": education.quantize(q),
        "confidence_score": confidence_assessment.confidence_score.quantize(q),
        "ai_confidence_score": confidence_assessment.confidence_score.quantize(q),
        "penalty_score": penalty,
        "validation_penalty_score": validation_penalty,
        "deal_breaker_penalty_score": Decimal("0.00"),
        "final_score": final_score,
    }


def _apply_validation_guardrails(row: dict, bd: dict[str, Decimal]) -> None:
    q = Decimal("0.01")
    validation_status = row.get("validation_status")

    if validation_status == "fail":
        bd["validation_penalty_score"] = bd["final_score"].quantize(q)
        bd["final_score"] = Decimal("0.00")
        return

    if validation_status == "unknown":
        penalty = (bd["final_score"] * Decimal("0.10")).quantize(q)
        bd["validation_penalty_score"] = penalty
        bd["final_score"] = max(Decimal("0.00"), bd["final_score"] - penalty).quantize(q)


def _apply_deal_breaker_guardrails(bd: dict[str, Decimal], violations: list[dict]) -> None:
    """Apply deal-breaker violations as hard rejections.

    If any deal-breaker is violated, score becomes 0 (hard rejection).
    """
    q = Decimal("0.01")
    if violations:
        bd["deal_breaker_penalty_score"] = bd["final_score"].quantize(q)
        bd["final_score"] = Decimal("0.00")


def _decide(final_score: Decimal, threshold_high: Decimal, threshold_low: Decimal) -> str:
    if final_score >= threshold_high:
        return "approved"
    if final_score >= threshold_low:
        return "review"
    return "rejected_suggested"


# ---------------------------------------------------------------------------
# Structured reason_codes — filterable, auditable, impact-quantified
# ---------------------------------------------------------------------------

def _build_reason_codes(
    row: dict,
    bd: dict[str, Decimal],
    matched: list[str],
    missing: list[str],
    deal_breaker_violations: list[dict[str, Any]] | None = None,
    *,
    outdated: bool = False,
) -> list[dict[str, Any]]:
    """Return structured reason codes with explicit type, field, impact, and description.

    Each code is filterable by type and carries a numeric impact in score-point
    units so the frontend can sort/group by contribution. Positive = favorable,
    negative = penalizing.
    """
    codes: list[dict[str, Any]] = []

    # Add deal-breaker violations first (highest priority)
    if deal_breaker_violations:
        codes.extend(deal_breaker_violations)
    if outdated:
        codes.append({
            "type": "outdated_score",
            "field": "candidate_job_match",
            "impact": -float(max(Decimal("0.00"), _to_decimal(row.get("overall_score")) - bd["final_score"])),
            "description": "Score legado rebaixado para respeitar a regra atual de vaga sem requisitos estruturados",
        })

    # Per-skill impact is approximated as the skill_match contribution divided
    # evenly across matched skills.
    n_matched = len(matched) or 1
    per_skill_contribution = float(
        bd["skill_match_score"] / Decimal(str(n_matched))
    )

    for skill in matched[:5]:
        codes.append({
            "type": "skill_match",
            "field": skill.lower(),
            "impact": round(per_skill_contribution, 2),
            "description": f"Alta aderência em {skill}",
        })

    for skill in missing[:5]:
        codes.append({
            "type": "missing_skill",
            "field": skill.lower(),
            "impact": -float(_MISSING_SKILL_PENALTY),
            "description": f"Skill ausente: {skill}",
        })

    validation_status = row.get("validation_status")
    rejection_reasons = _coerce_list(row.get("rejection_reasons"))
    if validation_status == "fail":
        codes.append({
            "type": "validation",
            "field": "hard_reject",
            "impact": -float(bd["validation_penalty_score"]),
            "description": (
                rejection_reasons[0]
                if rejection_reasons
                else "Candidato reprovado nas validações obrigatórias"
            ),
        })
    elif validation_status == "unknown":
        codes.append({
            "type": "validation",
            "field": "manual_review",
            "impact": -float(bd["validation_penalty_score"]),
            "description": (
                rejection_reasons[0]
                if rejection_reasons
                else "Evidências insuficientes; revisão manual necessária"
            ),
        })

    seniority_score = bd["seniority_match_score"]
    seniority_impact = round(float((seniority_score - Decimal("50")) * Decimal("0.15")), 2)
    if seniority_score >= 80:
        codes.append({
            "type": "seniority",
            "field": row.get("seniority_level") or "seniority",
            "impact": seniority_impact,
            "description": "Nível de senioridade compatível com a vaga",
        })
    elif seniority_score >= 50:
        codes.append({
            "type": "seniority",
            "field": row.get("seniority_level") or "seniority",
            "impact": seniority_impact,
            "description": "Senioridade parcialmente compatível",
        })
    else:
        codes.append({
            "type": "seniority",
            "field": row.get("seniority_level") or "seniority",
            "impact": seniority_impact,
            "description": "Baixo fit para o nível de senioridade exigido",
        })

    experience_score = bd["experience_match_score"]
    experience_impact = round(float((experience_score - Decimal("50")) * Decimal("0.25")), 2)
    years = row.get("total_experience_years")
    years_label = f" ({float(years):.0f} anos)" if years else ""
    if experience_score >= 70:
        codes.append({
            "type": "experience",
            "field": "total_experience_years",
            "impact": experience_impact,
            "description": f"Experiência profissional relevante{years_label}",
        })
    elif experience_score >= 40:
        codes.append({
            "type": "experience",
            "field": "total_experience_years",
            "impact": experience_impact,
            "description": f"Experiência parcialmente compatível{years_label}",
        })
    else:
        codes.append({
            "type": "experience",
            "field": "total_experience_years",
            "impact": experience_impact,
            "description": f"Experiência insuficiente para o cargo{years_label}",
        })

    for strength in _coerce_list(row.get("strengths"))[:1]:
        codes.append({
            "type": "strength",
            "field": "profile",
            "impact": 2.0,
            "description": f"Ponto forte: {strength}",
        })

    for weakness in _coerce_list(row.get("weaknesses"))[:1]:
        codes.append({
            "type": "weakness",
            "field": "profile",
            "impact": -2.0,
            "description": f"Ponto de atenção: {weakness}",
        })

    confidence_score = bd.get("confidence_score", Decimal("0.00"))
    if bd["final_score"] >= Decimal("70.00") and confidence_score < Decimal("50.00"):
        codes.append({
            "type": "confidence_alert",
            "field": "matching_confidence",
            "impact": 0.0,
            "description": "Score alto com baixa confiança dos dados; revisar vaga e profile antes de decidir.",
        })

    return codes


def _build_explanation(
    row: dict,
    bd: dict[str, Decimal],
    decision: str,
    matched: list[str],
    missing: list[str],
    *,
    outdated: bool = False,
) -> str:
    name = row["candidate_name"]
    score = float(bd["final_score"])
    seniority = row.get("seniority_level") or "não identificado"
    years = row.get("total_experience_years")
    years_str = f"{float(years):.0f} anos de experiência" if years else "experiência não quantificada"

    decision_label = {
        "approved": "Candidato fortemente recomendado para avançar no processo",
        "review": "Candidato requer avaliação adicional pelo recrutador",
        "rejected_suggested": "Perfil abaixo do threshold mínimo para esta vaga",
    }[decision]

    matched_part = f"Habilidades compatíveis: {', '.join(matched[:3])}. " if matched else ""
    missing_part = f"Gaps identificados: {', '.join(missing[:3])}. " if missing else ""
    validation_status = row.get("validation_status")
    rejection_reasons = _coerce_list(row.get("rejection_reasons"))
    validation_part = ""
    if validation_status == "fail":
        validation_part = (
            f"Reprovado por validação obrigatória: "
            f"{rejection_reasons[0] if rejection_reasons else 'sem detalhe adicional'}. "
        )
    elif validation_status == "unknown":
        validation_part = (
            f"Requer revisão manual: "
            f"{rejection_reasons[0] if rejection_reasons else 'evidência insuficiente'}. "
        )

    outdated_part = ""
    if outdated:
        outdated_part = (
            "Score legado identificado como inconsistente com a regra atual e limitado no ranking. "
        )
    confidence_part = ""
    confidence_score = bd.get("confidence_score", Decimal("0.00"))
    if bd["final_score"] >= Decimal("70.00") and confidence_score < Decimal("50.00"):
        confidence_part = (
            "O score ficou alto, mas a confiança dos dados usados no matching está baixa. "
        )

    return (
        f"{name} obteve score {score:.1f}/100. "
        f"{matched_part}"
        f"{missing_part}"
        f"{validation_part}"
        f"{outdated_part}"
        f"{confidence_part}"
        f"Perfil: {seniority}, {years_str}. "
        f"{decision_label}."
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    return Decimal(str(value))


def _resolve_thresholds(version: ScoreModelVersionModel) -> tuple[Decimal, Decimal]:
    thresholds = {k: Decimal(str(v)) for k, v in version.thresholds.items()}
    high = thresholds.get("high", Decimal("70"))
    low = thresholds.get("low", Decimal("55"))
    return high, low


def _is_outdated_match_row(
    *,
    row: dict,
    job: JobModel,
    job_skill_rows: list[Any],
) -> bool:
    has_structured_requirements = _job_has_structured_requirements(
        total_skills=len(job_skill_rows),
        seniority_level=job.seniority_level,
        minimum_years_experience=job.minimum_years_experience,
        minimum_education_level=job.minimum_education_level,
        deal_breakers=job.deal_breakers,
    )
    if has_structured_requirements:
        return False
    return _to_decimal(row.get("overall_score")) > Decimal("44.00")


def _normalize_score_breakdown(raw: Any) -> dict[str, Decimal]:
    breakdown = raw if isinstance(raw, dict) else {}
    q = Decimal("0.01")

    return {
        "skill_match_score": _to_decimal(breakdown.get("skill_match_score")).quantize(q),
        "experience_match_score": _to_decimal(breakdown.get("experience_match_score")).quantize(q),
        "seniority_match_score": _to_decimal(breakdown.get("seniority_match_score")).quantize(q),
        "education_score": _to_decimal(breakdown.get("education_score")).quantize(q),
        "confidence_score": _to_decimal(
            breakdown.get("confidence_score", breakdown.get("ai_confidence_score"))
        ).quantize(q),
        "ai_confidence_score": _to_decimal(
            breakdown.get("ai_confidence_score", breakdown.get("confidence_score"))
        ).quantize(q),
        "penalty_score": _to_decimal(breakdown.get("penalty_score")).quantize(q),
        "validation_penalty_score": _to_decimal(breakdown.get("validation_penalty_score")).quantize(q),
        "final_score": _to_decimal(breakdown.get("final_score")).quantize(q),
    }


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


def _extract_shadow_core_score(raw: Any) -> Decimal | None:
    if not isinstance(raw, dict):
        return None

    fit_score = raw.get("fit_score")
    if isinstance(fit_score, dict) and fit_score.get("core_score") is not None:
        return _to_decimal(fit_score.get("core_score"))

    eligibility = raw.get("eligibility")
    if isinstance(eligibility, dict) and eligibility.get("core_score") is not None:
        return _to_decimal(eligibility.get("core_score"))

    return None


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
