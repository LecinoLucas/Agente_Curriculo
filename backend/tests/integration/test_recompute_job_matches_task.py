"""Tests for recompute_job_matches_task.

Verifies that:
- Editing a job enqueues recompute_job_matches_task (not a live AI call).
- The task never calls an AI/LLM provider.
- The task never creates a new Analysis record.
- The task never alters pipeline.current_analysis_id.
- Candidates with a completed analysis have their match recalculated.
- Candidates without a completed analysis are skipped (no AI triggered).
- No tokens are registered (AIUsageLog is not created by the task).
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    JobProfileAnalysisModel,
)
from src.interface.workers.matching_tasks import (
    _do_recompute_job_matches,
    _get_or_create_job_profile_analysis_no_llm,
    _recompute_job_matches_async,
)
from tests.conftest import TestSessionFactory

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


class FakeCeleryEngine:
    async def dispose(self) -> None:
        return None


async def fake_create_celery_async_sessionmaker():
    return FakeCeleryEngine(), TestSessionFactory


def _patch_celery_sessionmaker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        fake_create_celery_async_sessionmaker,
    )


# ---------------------------------------------------------------------------
# Test 1: Editing a job enqueues recompute_job_matches_task (not sync AI call)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_edit_job_enqueues_recompute_task(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """PATCH /jobs/:id should enqueue recompute_job_matches_task, not call AI directly."""
    recruiter = await _create_active_user(
        db_session,
        f"enqueue-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, _candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Enqueue Test Job",
    )

    enqueued: list[str] = []

    async def fake_enqueue(jid):
        enqueued.append(str(jid))

    monkeypatch.setattr(
        "src.application.services.job_service.enqueue_job_match_recompute",
        fake_enqueue,
        raising=False,
    )

    response = await client.patch(
        f"/api/v1/jobs/{job_id}",
        headers=headers,
        json={"title": "Enqueue Test Job — Updated"},
    )

    assert response.status_code == 200
    assert str(job_id) in enqueued, "recompute_job_matches_task was not enqueued after job update"


# ---------------------------------------------------------------------------
# Test 2: Task does not call AI provider
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recompute_task_does_not_call_ai_provider(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_recompute_job_matches_async must never invoke any AI/LLM service."""
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"no-ai-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="No AI User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job_id, _candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="No AI Task Job",
    )

    _patch_celery_sessionmaker(monkeypatch)

    ai_calls: list[str] = []

    # Patch AIServiceFactory to track if it's ever called
    with patch(
        "src.application.services.analysis_service.AIServiceFactory"
    ) as mock_factory:
        mock_factory.create.side_effect = lambda *a, **kw: ai_calls.append(str(a)) or MagicMock()

        await _recompute_job_matches_async(str(job_id))

    assert ai_calls == [], f"AI provider was called unexpectedly: {ai_calls}"


# ---------------------------------------------------------------------------
# Test 3: Task does not create a new Analysis record
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recompute_task_does_not_create_analysis(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """recompute_job_matches_task must not insert any AnalysisModel row."""
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"no-analysis-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="No Analysis User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job_id, _candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="No New Analysis Job",
    )

    count_before = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )

    _patch_celery_sessionmaker(monkeypatch)
    await _recompute_job_matches_async(str(job_id))

    count_after = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id))
    )

    assert count_after == count_before, (
        f"Task created {count_after - count_before} new Analysis record(s)"
    )


# ---------------------------------------------------------------------------
# Test 4: Task does not alter current_analysis_id on pipeline entry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recompute_task_does_not_alter_current_analysis_id(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """recompute_job_matches_task must not change pipeline.current_analysis_id."""
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"no-analysis-id-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="Analysis ID User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="No Analysis ID Change Job",
    )

    pipeline_before = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline_before is not None
    original_analysis_id = pipeline_before.current_analysis_id

    _patch_celery_sessionmaker(monkeypatch)
    await _recompute_job_matches_async(str(job_id))

    await db_session.refresh(pipeline_before)
    assert pipeline_before.current_analysis_id == original_analysis_id, (
        "Task altered pipeline.current_analysis_id"
    )


# ---------------------------------------------------------------------------
# Test 5: Task updates CandidateJobMatch for candidate with completed analysis
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recompute_task_updates_match_for_completed_analysis(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Candidate with completed analysis must have a CandidateJobMatch after task runs."""
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"has-match-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="Has Match User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Has Match Job",
    )

    # Delete existing match so task must recreate it
    await db_session.execute(
        sa.delete(CandidateJobMatchModel).where(
            CandidateJobMatchModel.job_id == job_id,
            CandidateJobMatchModel.candidate_id == candidate_id,
        )
    )
    await db_session.commit()

    _patch_celery_sessionmaker(monkeypatch)
    result = await _recompute_job_matches_async(str(job_id))

    assert result["processed"] >= 1, f"Expected at least 1 processed, got: {result}"

    match = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(
            CandidateJobMatchModel.candidate_id == candidate_id,
            CandidateJobMatchModel.job_id == job_id,
        )
    )
    assert match is not None, "Task did not create CandidateJobMatch for candidate with completed analysis"


# ---------------------------------------------------------------------------
# Test 6: Task skips candidate without completed analysis
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recompute_task_skips_candidate_without_analysis(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Candidate pipeline entry without a completed analysis is counted as skipped."""
    from datetime import UTC, datetime
    from decimal import Decimal

    from src.infrastructure.database.models.candidate_model import CandidateModel
    from src.infrastructure.database.models.job_model import JobModel
    from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password
    from src.application.services.job_profiler_service import build_job_profile_hash

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"no-analysis-skip-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="Skip User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    # Create job with known profile hash
    job = JobModel(
        title="Skip Test Job",
        description="Job for skip test",
        minimum_years_experience=Decimal("2.0"),
        created_by=recruiter.id,
    )
    db_session.add(job)
    await db_session.flush()

    job.job_profile_hash = build_job_profile_hash(
        title=job.title,
        description=job.description,
        requirements=None,
        seniority_level=None,
        minimum_years_experience=2.0,
        minimum_education_level=None,
        job_area=None,
        responsibilities=None,
        experience_context=None,
        behavioral_requirements=(),
        priority=None,
        linked_skills=(),
    )
    job.job_profile_json = {"responsibilities": [], "area": "Test"}

    candidate = CandidateModel(
        email=f"skip-cand-{uuid4().hex[:6]}@test.local",
        full_name="Skip Candidate",
        created_by=recruiter.id,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(candidate_id=candidate.id, title="Resume", created_by=recruiter.id)
    db_session.add(resume)
    await db_session.flush()

    import hashlib
    rv = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="b",
        s3_key="k",
        original_file_name="r.pdf",
        file_size_bytes=100,
        file_hash_sha256=hashlib.sha256(b"skip").hexdigest(),
        uploaded_by=recruiter.id,
    )
    db_session.add(rv)
    await db_session.flush()

    # Pipeline entry WITHOUT any analysis
    pipeline = CandidateJobPipelineModel(
        candidate_job_pipeline_id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        resume_version_id=rv.id,
        link_status="active",
        relationship_status="active",
        is_terminal=False,
        pipeline_stage="entry",
        pipeline_status="active",
    )
    db_session.add(pipeline)
    await db_session.commit()

    _patch_celery_sessionmaker(monkeypatch)
    result = await _recompute_job_matches_async(str(job.id))

    assert result["skipped"] >= 1, f"Expected at least 1 skipped, got: {result}"
    assert result["processed"] == 0

    # Verify no Analysis was created
    analysis_count = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id)).where(
            AnalysisModel.job_id == job.id
        )
    )
    assert analysis_count == 0, "Task created Analysis for skipped candidate"


# ---------------------------------------------------------------------------
# Test 7: Task does not register tokens (no AIUsageLog created)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recompute_task_does_not_register_tokens(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """recompute_job_matches_task must not write any AIUsageLog (no token cost)."""
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    try:
        from src.infrastructure.database.models.analysis_model import AIUsageLogModel
    except ImportError:
        pytest.skip("AIUsageLogModel not available")

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"no-tokens-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="No Tokens User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job_id, _candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="No Tokens Job",
    )

    count_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(AIUsageLogModel)
    )

    _patch_celery_sessionmaker(monkeypatch)
    await _recompute_job_matches_async(str(job_id))

    count_after = await db_session.scalar(
        sa.select(sa.func.count()).select_from(AIUsageLogModel)
    )

    assert count_after == count_before, (
        f"Task registered {count_after - count_before} token log(s)"
    )


# ---------------------------------------------------------------------------
# Test 8: _get_or_create_job_profile_analysis_no_llm creates deterministic record
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_or_create_job_profile_analysis_no_llm_creates_record(
    db_session: AsyncSession,
) -> None:
    """Helper must create a JobProfileAnalysisModel from job.job_profile_json without LLM."""
    from decimal import Decimal
    from src.application.services.job_profiler_service import build_job_profile_hash
    from src.infrastructure.database.models.job_model import JobModel
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"det-profile-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="Det Profile User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job = JobModel(
        title="Deterministic Profile Job",
        description="Test description",
        minimum_years_experience=Decimal("3.0"),
        created_by=recruiter.id,
    )
    db_session.add(job)
    await db_session.flush()

    job.job_profile_hash = build_job_profile_hash(
        title=job.title,
        description=job.description,
        requirements=None,
        seniority_level=None,
        minimum_years_experience=3.0,
        minimum_education_level=None,
        job_area="TI",
        responsibilities=None,
        experience_context=None,
        behavioral_requirements=(),
        priority=None,
        linked_skills=(),
    )
    job.job_profile_json = {
        "responsibilities": ["Task A", "Task B"],
        "area": "TI",
        "target_level": "senior",
    }
    await db_session.flush()

    record = await _get_or_create_job_profile_analysis_no_llm(db_session, job)

    assert record is not None
    assert record.job_id == job.id
    assert record.job_signature_hash == job.job_profile_hash
    assert record.is_active is True
    assert record.input_tokens is None, "No tokens should be set on deterministic record"
    assert record.output_tokens is None, "No tokens should be set on deterministic record"


@pytest.mark.asyncio
async def test_get_or_create_job_profile_analysis_no_llm_returns_none_when_no_profile(
    db_session: AsyncSession,
) -> None:
    """Helper must return None when job has no job_profile_json."""
    from decimal import Decimal
    from src.infrastructure.database.models.job_model import JobModel
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"no-profile-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="No Profile User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job = JobModel(
        title="No Profile Job",
        description="Job without profile",
        minimum_years_experience=Decimal("1.0"),
        created_by=recruiter.id,
        job_profile_json=None,
        job_profile_hash=None,
    )
    db_session.add(job)
    await db_session.flush()

    record = await _get_or_create_job_profile_analysis_no_llm(db_session, job)

    assert record is None


@pytest.mark.asyncio
async def test_get_or_create_job_profile_analysis_no_llm_reactivates_inactive(
    db_session: AsyncSession,
) -> None:
    """Helper reactivates an existing inactive JobProfileAnalysisModel instead of creating new."""
    from decimal import Decimal
    from src.application.services.job_profiler_service import build_job_profile_hash
    from src.infrastructure.database.models.job_model import JobModel
    from src.domain.entities.user import User
    from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
    from src.infrastructure.security.password_service import hash_password

    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=f"reactivate-{uuid4().hex[:6]}@test.com",
        password_hash=hash_password("pw"),
        full_name="Reactivate User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    recruiter = await repo.save(user)
    await db_session.commit()

    job = JobModel(
        title="Reactivate Job",
        description="Job for reactivation test",
        minimum_years_experience=Decimal("2.0"),
        created_by=recruiter.id,
    )
    db_session.add(job)
    await db_session.flush()

    sig_hash = build_job_profile_hash(
        title=job.title,
        description=job.description,
        requirements=None,
        seniority_level=None,
        minimum_years_experience=2.0,
        minimum_education_level=None,
        job_area=None,
        responsibilities=None,
        experience_context=None,
        behavioral_requirements=(),
        priority=None,
        linked_skills=(),
    )
    job.job_profile_hash = sig_hash
    job.job_profile_json = {"responsibilities": [], "area": None}

    # Create inactive record with the same hash
    inactive_record = JobProfileAnalysisModel(
        job_id=job.id,
        provider="google",
        model_id="gemini-old",
        prompt_version="job_profiler_v1",
        job_signature_hash=sig_hash,
        responsibilities_json=[],
        raw_response_json={"responsibilities": []},
        is_active=False,
    )
    db_session.add(inactive_record)
    await db_session.flush()

    result = await _get_or_create_job_profile_analysis_no_llm(db_session, job)

    assert result is not None
    assert result.id == inactive_record.id, "Should reuse existing record, not create a new one"
    assert result.is_active is True, "Should reactivate the inactive record"


# ---------------------------------------------------------------------------
# Phase A2: Debounce / idempotency tests
# ---------------------------------------------------------------------------


class FakeRedis:
    """Minimal fake Redis that supports SET NX EX."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self.set_calls: list[tuple] = []

    async def set(self, key: str, value: str, *, nx: bool = False, ex: int | None = None) -> bool | None:
        self.set_calls.append((key, value, nx, ex))
        if nx and key in self._store:
            return None  # key already exists → NX failed
        self._store[key] = value
        return True

    async def delete(self, key: str) -> int:
        return int(self._store.pop(key, None) is not None)


def _make_fake_redis_getter(fake_redis: FakeRedis):
    async def _get_fake_redis():
        return fake_redis
    return _get_fake_redis


@pytest.mark.asyncio
async def test_first_enqueue_sets_pending_key_and_enqueues(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """First call to enqueue_job_match_recompute sets Redis key and enqueues."""
    from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

    job_id = uuid4()
    fake_redis = FakeRedis()
    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher.get_redis",
        _make_fake_redis_getter(fake_redis),
        raising=False,
    )

    enqueued: list[str] = []

    def _fake_do_enqueue(jid: str) -> None:
        enqueued.append(jid)

    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher._do_enqueue",
        _fake_do_enqueue,
        raising=False,
    )

    await enqueue_job_match_recompute(job_id)

    assert enqueued == [str(job_id)], "First call should enqueue"
    assert any(str(job_id) in call[0] for call in fake_redis.set_calls), "Pending key must be set"


@pytest.mark.asyncio
async def test_second_immediate_enqueue_same_job_is_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Second call for same job_id within debounce window does not enqueue."""
    from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

    job_id = uuid4()
    fake_redis = FakeRedis()
    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher.get_redis",
        _make_fake_redis_getter(fake_redis),
        raising=False,
    )

    enqueued: list[str] = []

    def _fake_do_enqueue(jid: str) -> None:
        enqueued.append(jid)

    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher._do_enqueue",
        _fake_do_enqueue,
        raising=False,
    )

    await enqueue_job_match_recompute(job_id)  # first call
    await enqueue_job_match_recompute(job_id)  # second call (same job_id)

    assert len(enqueued) == 1, "Second call for same job must be debounced"


@pytest.mark.asyncio
async def test_different_job_id_enqueues_independently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Different job IDs each get their own debounce key and enqueue normally."""
    from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

    job_id_a = uuid4()
    job_id_b = uuid4()
    fake_redis = FakeRedis()
    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher.get_redis",
        _make_fake_redis_getter(fake_redis),
        raising=False,
    )

    enqueued: list[str] = []

    def _fake_do_enqueue(jid: str) -> None:
        enqueued.append(jid)

    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher._do_enqueue",
        _fake_do_enqueue,
        raising=False,
    )

    await enqueue_job_match_recompute(job_id_a)
    await enqueue_job_match_recompute(job_id_b)

    assert str(job_id_a) in enqueued, "job_id_a must enqueue"
    assert str(job_id_b) in enqueued, "job_id_b must enqueue independently"


@pytest.mark.asyncio
async def test_redis_unavailable_falls_back_to_unconditional_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Redis failure must not block enqueue — fallback to unconditional enqueue."""
    from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

    job_id = uuid4()

    async def _redis_boom():
        raise ConnectionError("Redis not available")

    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher.get_redis",
        _redis_boom,
        raising=False,
    )

    enqueued: list[str] = []

    def _fake_do_enqueue(jid: str) -> None:
        enqueued.append(jid)

    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher._do_enqueue",
        _fake_do_enqueue,
        raising=False,
    )

    # Must not raise; must enqueue as fallback
    await enqueue_job_match_recompute(job_id)

    assert str(job_id) in enqueued, "Fallback: must enqueue even when Redis is unavailable"


@pytest.mark.asyncio
async def test_debounce_key_uses_correct_ttl(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Debounce key must be set with the configured TTL."""
    from src.interface.workers.matching_dispatcher import (
        _RECOMPUTE_DEBOUNCE_TTL_SECONDS,
        enqueue_job_match_recompute,
    )

    job_id = uuid4()
    fake_redis = FakeRedis()
    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher.get_redis",
        _make_fake_redis_getter(fake_redis),
        raising=False,
    )
    monkeypatch.setattr(
        "src.interface.workers.matching_dispatcher._do_enqueue",
        lambda jid: None,
        raising=False,
    )

    await enqueue_job_match_recompute(job_id)

    # The SET call must use NX=True and the expected EX
    assert fake_redis.set_calls, "SET was not called"
    _key, _val, nx_flag, ex_val = fake_redis.set_calls[0]
    assert nx_flag is True, "Must use NX to avoid overwriting existing key"
    assert ex_val == _RECOMPUTE_DEBOUNCE_TTL_SECONDS, (
        f"TTL must be {_RECOMPUTE_DEBOUNCE_TTL_SECONDS}s, got {ex_val}"
    )
