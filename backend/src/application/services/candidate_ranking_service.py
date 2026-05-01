from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
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
        """Compute multi-factor scores for every pipeline candidate in this job
        and upsert results into candidate_job_scores.

        Returns the number of candidates scored.

        Raises RankingJobNotFoundError if the job does not exist.
        Raises NoActiveScoreVersionError if no active score model version exists.
        """
        await self._assert_job_exists(job_id)
        job = await self._load_job_with_deal_breakers(job_id)
        version = await self._load_active_version()

        weights = {k: Decimal(str(v)) for k, v in version.weights.items()}
        thresholds = {k: Decimal(str(v)) for k, v in version.thresholds.items()}
        threshold_high = thresholds.get("high", Decimal("70"))
        threshold_low = thresholds.get("low", Decimal("45"))

        rows = await self._fetch_match_rows(job_id)
        now = datetime.now(UTC)
        count = 0

        for row in rows:
            bd = _compute_breakdown(row, weights)
            _apply_validation_guardrails(row, bd)
            deal_breaker_violations = evaluate_deal_breakers(job.deal_breakers, row)
            _apply_deal_breaker_guardrails(bd, deal_breaker_violations)
            decision = _decide(bd["final_score"], threshold_high, threshold_low)
            matched = _coerce_list(row.get("matched_skills"))
            missing = _coerce_list(row.get("missing_skills"))
            reason_codes = _build_reason_codes(row, bd, matched, missing, deal_breaker_violations)
            explanation = _build_explanation(row, bd, decision, matched, missing)

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

    async def get_ranking(self, job_id: UUID) -> dict[str, Any]:
        """Return the ranking for this job from persisted candidate_job_scores.

        Only scores computed with the currently active version are returned.
        Raises RankingJobNotFoundError / NoActiveScoreVersionError as needed.
        """
        await self._assert_job_exists(job_id)
        version = await self._load_active_version()

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
            "threshold_high": Decimal(str(version.thresholds.get("high", 70))),
            "threshold_low": Decimal(str(version.thresholds.get("low", 45))),
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
        """Return one row per candidate in the pipeline for this job.

        Uses row_number() to select the most recent completed analysis per candidate.
        Candidates without a completed analysis are included with NULL scores so they
        appear in the ranking with final_score=0.
        """
        latest_raw = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                ResumeJobMatchModel.skills_match_score,
                ResumeJobMatchModel.experience_match_score,
                ResumeJobMatchModel.seniority_match_score,
                ResumeJobMatchModel.matched_skills,
                ResumeJobMatchModel.missing_skills,
                ResumeJobMatchModel.validation_status,
                ResumeJobMatchModel.rejection_reasons,
                AnalysisResultModel.overall_score,
                AnalysisResultModel.education_score,
                AnalysisResultModel.total_experience_years,
                AnalysisResultModel.strengths,
                AnalysisResultModel.weaknesses,
                AnalysisResultModel.seniority_level,
                sa.func.row_number()
                .over(
                    partition_by=ResumeModel.candidate_id,
                    order_by=AnalysisModel.updated_at.desc(),
                )
                .label("rn"),
            )
            .select_from(ResumeJobMatchModel)
            .join(AnalysisModel, AnalysisModel.id == ResumeJobMatchModel.analysis_id)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .outerjoin(AnalysisResultModel, AnalysisResultModel.analysis_id == AnalysisModel.id)
            .where(
                ResumeJobMatchModel.job_id == job_id,
                AnalysisModel.status == "completed",
                ResumeModel.deleted_at.is_(None),
            )
            .subquery("latest_raw")
        )

        best_match = (
            sa.select(latest_raw).where(latest_raw.c.rn == 1).subquery("best_match")
        )

        result = await self._session.execute(
            sa.select(
                CandidatePipelineModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidatePipelineModel.stage,
                CandidatePipelineModel.status.label("pipeline_status"),
                CandidatePipelineModel.entered_at,
                best_match.c.skills_match_score,
                best_match.c.experience_match_score,
                best_match.c.seniority_match_score,
                best_match.c.matched_skills,
                best_match.c.missing_skills,
                best_match.c.validation_status,
                best_match.c.rejection_reasons,
                best_match.c.overall_score,
                best_match.c.education_score,
                best_match.c.total_experience_years,
                best_match.c.strengths,
                best_match.c.weaknesses,
                best_match.c.seniority_level,
            )
            .select_from(CandidatePipelineModel)
            .join(CandidateModel, CandidateModel.id == CandidatePipelineModel.candidate_id)
            .outerjoin(
                best_match,
                best_match.c.candidate_id == CandidatePipelineModel.candidate_id,
            )
            .where(
                CandidatePipelineModel.job_id == job_id,
                CandidateModel.deleted_at.is_(None),
                sa.or_(
                    CandidatePipelineModel.status.is_(None),
                    CandidatePipelineModel.status != "transferred",
                ),
            )
        )
        return [dict(row) for row in result.mappings().all()]

    async def _fetch_persisted_scores(
        self, job_id: UUID, version_id: UUID
    ) -> list[dict]:
        """Return persisted scores for this job + version, ordered by final_score DESC.

        Source of truth for candidate-job links: CandidateJobLinkModel.
        Pipeline stage information is enrichment only (optional outer join).
        """
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
                CandidatePipelineModel.stage,
                CandidatePipelineModel.status.label("pipeline_status"),
                CandidatePipelineModel.entered_at,
            )
            .select_from(CandidateJobScoreModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobScoreModel.candidate_id)
            # Source of truth: must have official candidate-job link
            .join(
                CandidateJobLinkModel,
                sa.and_(
                    CandidateJobLinkModel.candidate_id == CandidateJobScoreModel.candidate_id,
                    CandidateJobLinkModel.job_id == CandidateJobScoreModel.job_id,
                    CandidateJobLinkModel.deleted_at.is_(None),
                ),
            )
            # Enrichment: pipeline stage (optional)
            .join(
                CandidatePipelineModel,
                sa.and_(
                    CandidatePipelineModel.candidate_id == CandidateJobScoreModel.candidate_id,
                    CandidatePipelineModel.job_id == CandidateJobScoreModel.job_id,
                ),
                isouter=True,
            )
            .where(
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == version_id,
                CandidateModel.deleted_at.is_(None),
                # Exclude invalid candidates based on data quality
                CandidateModel.data_quality_status.in_(["valid", "unknown"]),
                # If pipeline entry exists, exclude "transferred" status
                sa.or_(
                    CandidatePipelineModel.status.is_(None),
                    CandidatePipelineModel.status != "transferred",
                ),
            )
            .order_by(CandidateJobScoreModel.final_score.desc())
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


def _compute_breakdown(row: dict, weights: dict[str, Decimal]) -> dict[str, Decimal]:
    skill_match      = _to_decimal(row.get("skills_match_score"))
    experience_match = _to_decimal(row.get("experience_match_score"))
    seniority_match  = _to_decimal(row.get("seniority_match_score"))
    education        = _to_decimal(row.get("education_score"))
    ai_confidence    = _to_decimal(row.get("overall_score"))

    missing = _coerce_list(row.get("missing_skills"))
    penalty = min(Decimal(len(missing)) * _MISSING_SKILL_PENALTY, _MAX_PENALTY)

    weighted = (
        skill_match      * weights.get("skill_match",      Decimal("0.40"))
        + experience_match * weights.get("experience_match", Decimal("0.25"))
        + seniority_match  * weights.get("seniority_match",  Decimal("0.15"))
        + education        * weights.get("education",        Decimal("0.10"))
        + ai_confidence    * weights.get("ai_confidence",    Decimal("0.10"))
    )
    final = max(Decimal("0"), min(Decimal("100"), weighted - penalty))
    q = Decimal("0.01")

    return {
        "skill_match_score":      skill_match.quantize(q),
        "experience_match_score": experience_match.quantize(q),
        "seniority_match_score":  seniority_match.quantize(q),
        "education_score":        education.quantize(q),
        "ai_confidence_score":    ai_confidence.quantize(q),
        "penalty_score":          penalty.quantize(q),
        "validation_penalty_score": Decimal("0.00"),
        "deal_breaker_penalty_score": Decimal("0.00"),
        "final_score":            final.quantize(q),
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

    # Per-skill impact is approximated as the skill_match contribution divided
    # evenly across matched skills, capped to avoid inflating single-skill matches.
    n_matched = len(matched) or 1
    per_skill_contribution = float(
        bd["skill_match_score"] * Decimal("0.40") / Decimal(str(n_matched))
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

    return codes


def _build_explanation(
    row: dict,
    bd: dict[str, Decimal],
    decision: str,
    matched: list[str],
    missing: list[str],
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

    return (
        f"{name} obteve score {score:.1f}/100. "
        f"{matched_part}"
        f"{missing_part}"
        f"{validation_part}"
        f"Perfil: {seniority}, {years_str}. "
        f"{decision_label}."
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _normalize_score_breakdown(raw: Any) -> dict[str, Decimal]:
    breakdown = raw if isinstance(raw, dict) else {}
    q = Decimal("0.01")

    return {
        "skill_match_score": _to_decimal(breakdown.get("skill_match_score")).quantize(q),
        "experience_match_score": _to_decimal(breakdown.get("experience_match_score")).quantize(q),
        "seniority_match_score": _to_decimal(breakdown.get("seniority_match_score")).quantize(q),
        "education_score": _to_decimal(breakdown.get("education_score")).quantize(q),
        "ai_confidence_score": _to_decimal(breakdown.get("ai_confidence_score")).quantize(q),
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


def _coerce_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if str(v).strip()]
    return []
