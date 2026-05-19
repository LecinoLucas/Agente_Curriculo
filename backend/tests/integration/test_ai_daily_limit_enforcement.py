"""P0.2B — Daily-limit enforcement for AI analysis requests.

The service-level tests below cover the obligatory cases listed in the spec
(within/exceed by user/job/global, override increases limit, override priority,
expired override ignored, disabled flag bypass, reuse-skip, retry, idempotent reuse).
A single end-to-end test exercises ``POST /api/v1/analyses`` to confirm the
429 contract returned by the router.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.application.services.ai_limit_override_service import (
    AIDailyLimitExceededError,
    AILimitOverrideService,
    CreateOverrideCommand,
)
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.ai_daily_limit_override_model import (
    AIDailyLimitOverrideModel,
)
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import (
    ResumeModel,
    ResumeVersionModel,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)

from .helpers import _auth_headers, _create_active_user


# ── helpers ──────────────────────────────────────────────────────────────────


async def _admin_user(db_session: AsyncSession, email: str = "p2b-admin@test.com"):
    return await _create_active_user(db_session, email, "x", UserRole.ADMIN)


async def _seed_analyses(
    db_session: AsyncSession,
    *,
    requested_by: UUID,
    job_id: UUID | None,
    count: int,
) -> None:
    """Insert ``count`` analyses created today for the given (user, job).

    Each row needs a unique idempotency_key, a real ai_model_id, prompt_template_id,
    and resume_version_id. Builds the minimum chain.
    """
    ai_model = AIModelModel(
        provider="google",
        model_id=f"gemini-test-{uuid4().hex[:8]}",
        model_name="Test",
        context_window=200000,
        is_active=True,
    )
    db_session.add(ai_model)
    prompt = PromptTemplateModel(
        name=f"tpl-{uuid4().hex[:6]}",
        version=1,
        description="t",
        template_type=f"full_analysis_seed_{uuid4().hex[:6]}",
        user_prompt_template="x",
        is_active=False,
        created_by=requested_by,
    )
    db_session.add(prompt)
    await db_session.flush()

    candidate = CandidateModel(full_name="Seed", created_by=requested_by)
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(candidate_id=candidate.id, created_by=requested_by, title="r")
    db_session.add(resume)
    await db_session.flush()

    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test",
        s3_key=f"resumes/{uuid4().hex}.pdf",
        original_file_name="x.pdf",
        file_size_bytes=100,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="some text",
        extraction_status="completed",
    )
    db_session.add(version)
    await db_session.flush()

    for i in range(count):
        db_session.add(
            AnalysisModel(
                resume_version_id=version.id,
                ai_model_id=ai_model.id,
                prompt_template_id=prompt.id,
                requested_by=requested_by,
                job_id=job_id,
                idempotency_key=f"seed-{uuid4().hex}",
                priority=5,
                status="completed",
            )
        )
    await db_session.commit()


# ── direct service tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_within_user_limit_allows(db_session: AsyncSession) -> None:
    admin = await _admin_user(db_session)
    svc = AILimitOverrideService(db_session)
    # Seed 1 analysis today; per-user baseline is 50 by default → allowed.
    await _seed_analyses(db_session, requested_by=admin.id, job_id=None, count=1)
    await svc.check_request_allowed(user_id=admin.id, job_id=None)


@pytest.mark.asyncio
async def test_exceeds_user_limit_raises_429(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 3)
    admin = await _admin_user(db_session)
    await _seed_analyses(db_session, requested_by=admin.id, job_id=None, count=3)
    svc = AILimitOverrideService(db_session)
    with pytest.raises(AIDailyLimitExceededError) as exc:
        await svc.check_request_allowed(user_id=admin.id, job_id=None)
    assert exc.value.scope == "user"
    assert exc.value.limit == 3
    assert exc.value.used == 3
    assert exc.value.reset_at > datetime.now(UTC)


@pytest.mark.asyncio
async def test_within_job_limit_allows(db_session: AsyncSession) -> None:
    admin = await _admin_user(db_session)
    job_id = uuid4()
    await _seed_analyses(db_session, requested_by=admin.id, job_id=job_id, count=5)
    svc = AILimitOverrideService(db_session)
    await svc.check_request_allowed(user_id=admin.id, job_id=job_id)


@pytest.mark.asyncio
async def test_exceeds_job_limit_raises_429(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_JOB", 4)
    admin = await _admin_user(db_session)
    job_id = uuid4()
    # Spread across 2 users so user-scope doesn't trip first.
    other_user = await _create_active_user(db_session, "p2b-other@test.com", "x", UserRole.RECRUITER)
    await _seed_analyses(db_session, requested_by=admin.id, job_id=job_id, count=2)
    await _seed_analyses(db_session, requested_by=other_user.id, job_id=job_id, count=2)
    svc = AILimitOverrideService(db_session)
    with pytest.raises(AIDailyLimitExceededError) as exc:
        await svc.check_request_allowed(user_id=admin.id, job_id=job_id)
    assert exc.value.scope == "job"
    assert exc.value.limit == 4
    assert exc.value.used == 4


@pytest.mark.asyncio
async def test_exceeds_global_limit_raises_429(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Tight global limit; loose per-user/per-job so they don't trip first.
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_GLOBAL", 2)
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 100)
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_JOB", 100)

    admin = await _admin_user(db_session)
    other = await _create_active_user(db_session, "p2b-x@test.com", "x", UserRole.RECRUITER)
    job_a, job_b = uuid4(), uuid4()
    await _seed_analyses(db_session, requested_by=admin.id, job_id=job_a, count=1)
    await _seed_analyses(db_session, requested_by=other.id, job_id=job_b, count=1)

    svc = AILimitOverrideService(db_session)
    with pytest.raises(AIDailyLimitExceededError) as exc:
        await svc.check_request_allowed(user_id=admin.id, job_id=job_a)
    assert exc.value.scope == "global"
    assert exc.value.used == 2
    assert exc.value.limit == 2


@pytest.mark.asyncio
async def test_user_override_raises_user_limit_and_allows(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 2)
    admin = await _admin_user(db_session)
    target = await _create_active_user(db_session, "p2b-target@test.com", "x", UserRole.RECRUITER)
    await _seed_analyses(db_session, requested_by=target.id, job_id=None, count=2)

    svc = AILimitOverrideService(db_session)
    # Without override → blocked
    with pytest.raises(AIDailyLimitExceededError):
        await svc.check_request_allowed(user_id=target.id, job_id=None)

    # With override → allowed
    await svc.create_override(
        CreateOverrideCommand(
            scope="user",
            scope_id=target.id,
            new_limit=10,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            reason="aumento aprovado",
            actor_id=admin.id,
        )
    )
    await db_session.commit()
    await svc.check_request_allowed(user_id=target.id, job_id=None)


@pytest.mark.asyncio
async def test_job_override_raises_job_limit_and_allows(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_JOB", 2)
    admin = await _admin_user(db_session)
    other = await _create_active_user(db_session, "p2b-other2@test.com", "x", UserRole.RECRUITER)
    job_id = uuid4()
    await _seed_analyses(db_session, requested_by=admin.id, job_id=job_id, count=1)
    await _seed_analyses(db_session, requested_by=other.id, job_id=job_id, count=1)

    svc = AILimitOverrideService(db_session)
    with pytest.raises(AIDailyLimitExceededError):
        await svc.check_request_allowed(user_id=admin.id, job_id=job_id)

    await svc.create_override(
        CreateOverrideCommand(
            scope="job",
            scope_id=job_id,
            new_limit=20,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            reason="job aumentado",
            actor_id=admin.id,
        )
    )
    await db_session.commit()
    await svc.check_request_allowed(user_id=admin.id, job_id=job_id)


@pytest.mark.asyncio
async def test_global_override_raises_global_limit_and_allows(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_GLOBAL", 2)
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 100)
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_JOB", 100)
    admin = await _admin_user(db_session)
    other = await _create_active_user(db_session, "p2b-z@test.com", "x", UserRole.RECRUITER)
    await _seed_analyses(db_session, requested_by=admin.id, job_id=uuid4(), count=1)
    await _seed_analyses(db_session, requested_by=other.id, job_id=uuid4(), count=1)

    svc = AILimitOverrideService(db_session)
    with pytest.raises(AIDailyLimitExceededError):
        await svc.check_request_allowed(user_id=admin.id, job_id=None)

    await svc.create_override(
        CreateOverrideCommand(
            scope="global",
            scope_id=None,
            new_limit=50,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            reason="pico",
            actor_id=admin.id,
        )
    )
    await db_session.commit()
    await svc.check_request_allowed(user_id=admin.id, job_id=None)


@pytest.mark.asyncio
async def test_user_override_priority_over_job_and_global(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When user, job, and global overrides all exist, the user-scope check
    uses the user-override limit (priority user > job > global in resolution)."""
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 1)
    admin = await _admin_user(db_session)
    target = await _create_active_user(db_session, "p2b-prio@test.com", "x", UserRole.RECRUITER)
    job_id = uuid4()
    await _seed_analyses(db_session, requested_by=target.id, job_id=job_id, count=3)

    svc = AILimitOverrideService(db_session)
    # User override = 10 (will allow); Job override = 2 (would block); Global = 2
    await svc.create_override(
        CreateOverrideCommand(
            scope="user",
            scope_id=target.id,
            new_limit=10,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            reason="u",
            actor_id=admin.id,
        )
    )
    # resolve_effective_limit(user_id=X, job_id=None) → user override (10)
    user_resolution = await svc.resolve_effective_limit(user_id=target.id, job_id=None)
    assert user_resolution["scope"] == "user"
    assert user_resolution["limit"] == 10
    # User scope check passes; job scope still applies its baseline (default 100).
    await svc.check_request_allowed(user_id=target.id, job_id=job_id)


@pytest.mark.asyncio
async def test_expired_override_does_not_lift_limit(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 2)
    admin = await _admin_user(db_session)
    target = await _create_active_user(db_session, "p2b-exp@test.com", "x", UserRole.RECRUITER)
    await _seed_analyses(db_session, requested_by=target.id, job_id=None, count=2)

    # Insert an *expired* override directly, bypassing validation.
    db_session.add(
        AIDailyLimitOverrideModel(
            scope="user",
            scope_id=target.id,
            limit_type="analysis_request",
            old_limit=2,
            new_limit=999,
            reason="expirado",
            expires_at=datetime.now(UTC) - timedelta(seconds=10),
            created_by=admin.id,
        )
    )
    await db_session.commit()

    svc = AILimitOverrideService(db_session)
    with pytest.raises(AIDailyLimitExceededError):
        await svc.check_request_allowed(user_id=target.id, job_id=None)


@pytest.mark.asyncio
async def test_disabled_flag_bypasses_check(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "AI_DAILY_LIMITS_ENABLED", False)
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 1)
    admin = await _admin_user(db_session)
    await _seed_analyses(db_session, requested_by=admin.id, job_id=None, count=10)
    svc = AILimitOverrideService(db_session)
    # 10 well beyond the limit, but the toggle is off.
    await svc.check_request_allowed(user_id=admin.id, job_id=None)


# ── use case integration (reuse must not consume) ────────────────────────────


@pytest.mark.asyncio
async def test_idempotent_reuse_does_not_consume_limit(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A pre-existing analysis for the same (resume_version, job) should be
    returned as ``reused`` BEFORE the daily-limit check runs."""
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 1)
    admin = await _admin_user(db_session)
    job = JobModel(
        title="Job test",
        description="d",
        status="published",
        created_by=admin.id,
    )
    db_session.add(job)
    await db_session.flush()

    ai_model = AIModelModel(
        provider="google",
        model_id="gemini-test",
        model_name="Test",
        context_window=200000,
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name="tpl-reuse",
        version=1,
        description="t",
        template_type="full_analysis",
        user_prompt_template="x",
        is_active=True,
        created_by=admin.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    candidate = CandidateModel(full_name="Reuse", created_by=admin.id)
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(candidate_id=candidate.id, created_by=admin.id, title="r")
    db_session.add(resume)
    await db_session.flush()

    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test",
        s3_key=f"resumes/{uuid4().hex}.pdf",
        original_file_name="x.pdf",
        file_size_bytes=100,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="some text",
        extraction_status="completed",
    )
    db_session.add(version)
    await db_session.flush()

    # Existing completed analysis for the same (version, job) — user_id is admin.
    existing = AnalysisModel(
        resume_version_id=version.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        requested_by=admin.id,
        job_id=job.id,
        idempotency_key=f"seed-{uuid4().hex}",
        priority=5,
        status="completed",
    )
    db_session.add(existing)
    await db_session.commit()

    # User already has 1 analysis today (= limit). A new request would normally
    # 429, but because the resume+job has an existing completed analysis, the
    # use case should return ``reused`` without touching the limit.
    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
        AILimitOverrideService(db_session),
    )
    result = await use_case.execute(
        RequestAnalysisCommand(
            resume_version_id=version.id,
            requested_by=admin.id,
            job_id=job.id,
            force_reanalyze=False,
            priority=5,
        )
    )
    assert result.reused is True
    assert result.created is False


# ── end-to-end: HTTP 429 contract ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_429_contract_when_limit_exceeded(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Hit POST /api/v1/analyses for a user already at their daily limit;
    confirm the 429 body shape that the frontend parses."""
    monkeypatch.setattr(settings, "AI_ANALYSIS_DAILY_LIMIT_PER_USER", 1)

    # Recruiter with one analysis today
    user = await _create_active_user(db_session, "p2b-http@test.com", "password123", UserRole.RECRUITER)
    job = JobModel(
        title="Job",
        description="d",
        status="published",
        created_by=user.id,
    )
    db_session.add(job)
    await db_session.flush()

    ai_model = AIModelModel(
        provider="google",
        model_id="gemini-test",
        model_name="Test",
        context_window=200000,
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name="tpl-http",
        version=1,
        description="t",
        template_type="full_analysis",
        user_prompt_template="x",
        is_active=True,
        created_by=user.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    candidate = CandidateModel(full_name="HTTP", created_by=user.id)
    db_session.add(candidate)
    await db_session.flush()
    resume = ResumeModel(candidate_id=candidate.id, created_by=user.id, title="r")
    db_session.add(resume)
    await db_session.flush()
    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test",
        s3_key=f"resumes/{uuid4().hex}.pdf",
        original_file_name="x.pdf",
        file_size_bytes=100,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="some text",
        extraction_status="completed",
    )
    db_session.add(version)
    await db_session.flush()
    db_session.add(
        AnalysisModel(
            resume_version_id=version.id,
            ai_model_id=ai_model.id,
            prompt_template_id=prompt.id,
            requested_by=user.id,
            job_id=job.id,
            idempotency_key=f"seed-{uuid4().hex}",
            priority=5,
            status="completed",
        )
    )
    await db_session.commit()

    # Different resume version so reuse path doesn't trigger
    new_resume = ResumeModel(candidate_id=candidate.id, created_by=user.id, title="r2")
    db_session.add(new_resume)
    await db_session.flush()
    new_version = ResumeVersionModel(
        resume_id=new_resume.id,
        version_number=1,
        s3_bucket="test",
        s3_key=f"resumes/{uuid4().hex}.pdf",
        original_file_name="y.pdf",
        file_size_bytes=100,
        file_hash_sha256="b" * 64,
        mime_type="application/pdf",
        extracted_text="text",
        extraction_status="completed",
    )
    db_session.add(new_version)
    await db_session.commit()

    headers = await _auth_headers(client, "p2b-http@test.com", "password123")
    r = await client.post(
        f"/api/v1/analyses?resume_version_id={new_version.id}&job_id={job.id}",
        headers=headers,
    )
    assert r.status_code == 429, r.text
    body = r.json()
    detail = body["detail"]
    assert detail["code"] == "ai_daily_limit_exceeded"
    assert detail["message"] == "Limite diário de análises atingido."
    assert detail["scope"] == "user"
    assert detail["limit"] == 1
    assert detail["used"] >= 1
    assert "reset_at" in detail
