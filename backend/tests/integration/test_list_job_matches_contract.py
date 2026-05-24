"""Contract tests for SQLAlchemyPipelineRepository.list_job_matches.

Pins the board query behavior before the analysis subquery optimization.
All tests run on SQLite in-memory via the shared db_session fixture.
SQLite does not enforce FK constraints, so dummy UUIDs are used for
created_by / uploaded_by / ai_model_id / prompt_template_id fields.
"""
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DUMMY_USER = uuid4()  # FK placeholder — SQLite does not enforce FK constraints


def _now() -> datetime:
    return datetime.now(UTC)


async def _make_candidate(session: AsyncSession, suffix: str = "") -> CandidateModel:
    c = CandidateModel(
        full_name="Board Contract",
        email=f"board{suffix}@board-contract.com",
        created_by=_DUMMY_USER,
    )
    session.add(c)
    await session.flush()
    return c


async def _make_job(session: AsyncSession) -> JobModel:
    j = JobModel(
        title="Software Engineer",
        description="Build scalable backend systems for the team",
        created_by=_DUMMY_USER,
    )
    session.add(j)
    await session.flush()
    return j


async def _make_pipeline(
    session: AsyncSession,
    candidate_id,
    job_id,
    *,
    stage: str = "entry",
    relationship_status: str = "active",
    is_terminal: bool = False,
    current_analysis_id=None,
) -> CandidateJobPipelineModel:
    terminated_at = _now() if is_terminal else None
    link_status = relationship_status if is_terminal else "active"
    p = CandidateJobPipelineModel(
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_stage=stage,
        link_status=link_status,
        pipeline_status="terminal" if is_terminal else "active",
        relationship_status=relationship_status,
        is_terminal=is_terminal,
        terminated_at=terminated_at,
        entered_at=_now(),
        updated_at=_now(),
        current_analysis_id=current_analysis_id,
    )
    session.add(p)
    await session.flush()
    return p


async def _make_resume_with_analysis(
    session: AsyncSession,
    candidate_id,
    *,
    keywords: list | None = None,
    status: str = "completed",
    job_id=None,
    updated_at: datetime | None = None,
) -> tuple[ResumeModel, ResumeVersionModel, AnalysisModel]:
    resume = ResumeModel(
        candidate_id=candidate_id,
        title="CV",
        created_by=_DUMMY_USER,
    )
    session.add(resume)
    await session.flush()

    rv = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key="test/cv.pdf",
        original_file_name="cv.pdf",
        file_size_bytes=1024,
        file_hash_sha256="a" * 64,
        uploaded_by=_DUMMY_USER,
    )
    session.add(rv)
    await session.flush()

    analysis = AnalysisModel(
        resume_version_id=rv.id,
        job_id=job_id,
        ai_model_id=uuid4(),      # FK not enforced by SQLite
        prompt_template_id=uuid4(),  # FK not enforced by SQLite
        status=status,
        requested_by=_DUMMY_USER,
        created_at=updated_at or _now(),
        updated_at=updated_at or _now(),
        completed_at=updated_at if status == "completed" else None,
    )
    session.add(analysis)
    await session.flush()

    if keywords is not None:
        ar = AnalysisResultModel(
            analysis_id=analysis.id,
            keywords=keywords,
        )
        session.add(ar)
        await session.flush()

    return resume, rv, analysis


async def _make_score_version(session: AsyncSession) -> ScoreModelVersionModel:
    v = ScoreModelVersionModel(
        version=f"v-board-{uuid4().hex[:6]}",
        is_active=True,
        weights={"skill_match": 0.4},
        thresholds={"high": 70, "low": 55},
    )
    session.add(v)
    await session.flush()
    return v


async def _make_score(
    session: AsyncSession,
    candidate_id,
    job_id,
    version_id,
    *,
    final_score: float = 75.0,
    source_analysis_id=None,
) -> CandidateJobScoreModel:
    now = _now()
    s = CandidateJobScoreModel(
        candidate_id=candidate_id,
        job_id=job_id,
        version_id=version_id,
        source_analysis_id=source_analysis_id,
        source_analysis_created_at=now if source_analysis_id is not None else None,
        final_score=Decimal(str(final_score)),
        decision_suggestion="approved",
        breakdown={"job_fit_score": final_score},
        reason_codes=[],
        explanation_text="ok",
        freshness_status="fresh",
        computed_at=now,
        updated_at=now,
        recompute_reason="test",
        job_signature_hash="a" * 64,
        job_updated_at=now,
    )
    session.add(s)
    await session.flush()
    return s


# ---------------------------------------------------------------------------
# Contract tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_only_active_candidates_for_given_job(db_session: AsyncSession) -> None:
    """Candidates in other jobs do not appear on this job's board."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job_a = await _make_job(db_session)
    job_b = await _make_job(db_session)
    c1 = await _make_candidate(db_session, "1")
    c2 = await _make_candidate(db_session, "2")

    await _make_pipeline(db_session, c1.id, job_a.id)
    await _make_pipeline(db_session, c2.id, job_b.id)
    await db_session.commit()

    rows = await repo.list_job_matches(job_a.id)
    ids = {r["candidate_id"] for r in rows}

    assert len(rows) == 1
    assert c1.id in ids
    assert c2.id not in ids


@pytest.mark.asyncio
async def test_excludes_terminal_pipeline_entries(db_session: AsyncSession) -> None:
    """Hired/rejected candidates (is_terminal=True) are not shown on the board."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    active = await _make_candidate(db_session, "act")
    hired = await _make_candidate(db_session, "hrd")

    await _make_pipeline(db_session, active.id, job.id, stage="entry")
    await _make_pipeline(
        db_session, hired.id, job.id,
        stage="hired", relationship_status="hired", is_terminal=True,
    )
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)
    ids = {r["candidate_id"] for r in rows}

    assert active.id in ids
    assert hired.id not in ids


@pytest.mark.asyncio
async def test_stage_field_preserved(db_session: AsyncSession) -> None:
    """pipeline_stage is returned as the 'stage' key in the result dict."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "stg")

    await _make_pipeline(db_session, c.id, job.id, stage="hr_interview")
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["stage"] == "hr_interview"


@pytest.mark.asyncio
async def test_ai_status_from_current_analysis(db_session: AsyncSession) -> None:
    """ai_status reflects the status column of the pipeline's current_analysis_id."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "ai")

    _, _, analysis = await _make_resume_with_analysis(db_session, c.id, status="completed")
    await _make_pipeline(db_session, c.id, job.id, current_analysis_id=analysis.id)
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["ai_status"] == "completed"


@pytest.mark.asyncio
async def test_ai_status_none_without_analysis(db_session: AsyncSession) -> None:
    """ai_status is None when no analysis is linked to the pipeline entry."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "noai")

    await _make_pipeline(db_session, c.id, job.id)  # current_analysis_id = None
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["ai_status"] is None


@pytest.mark.asyncio
async def test_top_skills_from_current_analysis_id_not_latest_completed(
    db_session: AsyncSession,
) -> None:
    """top_skills must follow the pipeline's current_analysis_id, not latest completed."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "sk")
    older = _now() - timedelta(days=2)
    newer = _now()

    _, _, analysis_current = await _make_resume_with_analysis(
        db_session,
        c.id,
        job_id=job.id,
        keywords=["Python", "FastAPI", "PostgreSQL"],
        updated_at=older,
    )
    await _make_resume_with_analysis(
        db_session,
        c.id,
        job_id=job.id,
        keywords=["React", "Next.js", "Tailwind"],
        updated_at=newer,
    )
    await _make_pipeline(db_session, c.id, job.id, current_analysis_id=analysis_current.id)
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["top_skills"] == ["Python", "FastAPI", "PostgreSQL"]


@pytest.mark.asyncio
async def test_top_skills_do_not_leak_from_latest_completed_analysis_of_other_job(
    db_session: AsyncSession,
) -> None:
    """The board for job A must not use keywords from a newer analysis for job B."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job_a = await _make_job(db_session)
    job_b = await _make_job(db_session)
    c = await _make_candidate(db_session, "crossjob")
    older = _now() - timedelta(days=2)
    newer = _now()

    _, _, analysis_current = await _make_resume_with_analysis(
        db_session,
        c.id,
        job_id=job_a.id,
        keywords=["Python", "FastAPI", "PostgreSQL"],
        updated_at=older,
    )
    await _make_resume_with_analysis(
        db_session,
        c.id,
        job_id=job_b.id,
        keywords=["SAP", "ABAP", "HANA"],
        updated_at=newer,
    )
    await _make_pipeline(db_session, c.id, job_a.id, current_analysis_id=analysis_current.id)
    await db_session.commit()

    rows = await repo.list_job_matches(job_a.id)

    assert len(rows) == 1
    assert rows[0]["top_skills"] == ["Python", "FastAPI", "PostgreSQL"]


@pytest.mark.asyncio
async def test_job_fit_score_from_fresh_score(db_session: AsyncSession) -> None:
    """job_fit_score is returned when the fresh score belongs to current_analysis_id."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "sc")
    version = await _make_score_version(db_session)
    _, _, analysis = await _make_resume_with_analysis(db_session, c.id, job_id=job.id)

    await _make_pipeline(db_session, c.id, job.id, current_analysis_id=analysis.id)
    await _make_score(
        db_session,
        c.id,
        job.id,
        version.id,
        final_score=82.5,
        source_analysis_id=analysis.id,
    )
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["job_fit_score"] is not None
    assert float(rows[0]["job_fit_score"]) == pytest.approx(82.5)


@pytest.mark.asyncio
async def test_job_fit_score_ignores_fresh_score_from_non_current_analysis(
    db_session: AsyncSession,
) -> None:
    """Fresh scores must not appear when source_analysis_id differs from current_analysis_id."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "wrongscore")
    version = await _make_score_version(db_session)
    _, _, analysis_current = await _make_resume_with_analysis(db_session, c.id, job_id=job.id)
    _, _, analysis_other = await _make_resume_with_analysis(db_session, c.id, job_id=job.id)

    await _make_pipeline(db_session, c.id, job.id, current_analysis_id=analysis_current.id)
    await _make_score(
        db_session,
        c.id,
        job.id,
        version.id,
        final_score=91.0,
        source_analysis_id=analysis_other.id,
    )
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["job_fit_score"] is None


@pytest.mark.asyncio
async def test_job_fit_score_none_without_active_version(db_session: AsyncSession) -> None:
    """job_fit_score is None when no active ScoreModelVersion exists."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    c = await _make_candidate(db_session, "ns")

    await _make_pipeline(db_session, c.id, job.id)
    # No score version created → scalar subquery returns NULL → score join fails
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 1
    assert rows[0]["job_fit_score"] is None


@pytest.mark.asyncio
async def test_empty_result_for_job_with_no_candidates(db_session: AsyncSession) -> None:
    """Returns an empty list when the job has no active pipeline entries."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert rows == []


@pytest.mark.asyncio
async def test_multiple_candidates_all_returned(db_session: AsyncSession) -> None:
    """All active candidates for the job appear in the result."""
    repo = SQLAlchemyPipelineRepository(db_session)
    job = await _make_job(db_session)

    candidates = []
    for i in range(3):
        c = await _make_candidate(db_session, str(i))
        await _make_pipeline(db_session, c.id, job.id)
        candidates.append(c)
    await db_session.commit()

    rows = await repo.list_job_matches(job.id)

    assert len(rows) == 3
    assert {r["candidate_id"] for r in rows} == {c.id for c in candidates}
