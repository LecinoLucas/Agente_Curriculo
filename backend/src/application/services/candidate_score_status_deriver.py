from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


@dataclass(frozen=True)
class CandidateScoreStatusResult:
    score_status: str
    analysis_status: str | None
    current_analysis_id: UUID | None
    match_score: float | None
    warnings: list[str] = field(default_factory=list)
    next_action: str = "none"


def derive_candidate_score_status(
    *,
    active_job_id: UUID | None,
    pipeline_current_analysis_id: UUID | None,
    latest_analysis_id: UUID | None,
    latest_analysis_status: str | None,
    latest_analysis_job_id: UUID | None,
    has_fresh_score: bool,
    match_score: float | None,
) -> CandidateScoreStatusResult:
    """
    Derive canonical score_status from pipeline + analysis + score.

    An analysis is valid ONLY when BOTH conditions are true:
    - latest_analysis_id == pipeline_current_analysis_id
    - latest_analysis_job_id == active_job_id

    Rules (precedence order):
    1. No active pipeline → no_active_job
    2. Active pipeline, no current_analysis_id → waiting_analysis
    3. Analysis is pending/processing/retry_scheduled → analysis_processing
    4. Analysis is failed/cancelled → analysis_failed
    5. Analysis is completed + has_fresh_score + valid analysis → score_ready
    6. Analysis is completed + has_fresh_score + invalid analysis → score_stale
    7. Analysis is completed + no fresh score → analysis_processing (ranker running)
    8. Anything else → needs_repair

    Warnings:
    - analysis_from_different_job: latest_analysis_job_id != active_job_id
    - analysis_not_current_pipeline: latest_analysis_id != pipeline_current_analysis_id
    """
    warnings: list[str] = []

    if active_job_id is None:
        return CandidateScoreStatusResult(
            score_status="no_active_job",
            analysis_status=None,
            current_analysis_id=None,
            match_score=None,
            warnings=[],
            next_action="none",
        )

    if pipeline_current_analysis_id is None:
        return CandidateScoreStatusResult(
            score_status="waiting_analysis",
            analysis_status=None,
            current_analysis_id=None,
            match_score=None,
            warnings=[],
            next_action="request_analysis",
        )

    if latest_analysis_status in {"pending", "processing", "retry_scheduled"}:
        return CandidateScoreStatusResult(
            score_status="analysis_processing",
            analysis_status=latest_analysis_status,
            current_analysis_id=pipeline_current_analysis_id,
            match_score=None,
            warnings=[],
            next_action="wait_analysis",
        )

    if latest_analysis_status in {"failed", "cancelled"}:
        return CandidateScoreStatusResult(
            score_status="analysis_failed",
            analysis_status=latest_analysis_status,
            current_analysis_id=pipeline_current_analysis_id,
            match_score=None,
            warnings=[],
            next_action="request_analysis",
        )

    if latest_analysis_status == "completed":
        analysis_is_current_pipeline = (
            latest_analysis_id is not None
            and str(latest_analysis_id) == str(pipeline_current_analysis_id)
        )
        analysis_is_for_active_job = (
            latest_analysis_job_id is not None
            and str(latest_analysis_job_id) == str(active_job_id)
        )
        analysis_is_valid = analysis_is_current_pipeline and analysis_is_for_active_job

        if not analysis_is_current_pipeline:
            warnings.append("analysis_not_current_pipeline")
        if not analysis_is_for_active_job:
            warnings.append("analysis_from_different_job")

        if has_fresh_score and analysis_is_valid:
            return CandidateScoreStatusResult(
                score_status="score_ready",
                analysis_status="completed",
                current_analysis_id=pipeline_current_analysis_id,
                match_score=match_score,
                warnings=warnings,
                next_action="review_candidate",
            )

        if has_fresh_score and not analysis_is_valid:
            return CandidateScoreStatusResult(
                score_status="score_stale",
                analysis_status="completed",
                current_analysis_id=pipeline_current_analysis_id,
                match_score=match_score,
                warnings=warnings,
                next_action="wait_analysis",
            )

        return CandidateScoreStatusResult(
            score_status="analysis_processing",
            analysis_status="completed",
            current_analysis_id=pipeline_current_analysis_id,
            match_score=None,
            warnings=warnings,
            next_action="wait_analysis",
        )

    return CandidateScoreStatusResult(
        score_status="needs_repair",
        analysis_status=latest_analysis_status,
        current_analysis_id=pipeline_current_analysis_id,
        match_score=None,
        warnings=["unknown_analysis_status"],
        next_action="run_repair",
    )
