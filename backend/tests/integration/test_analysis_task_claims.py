from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.interface.workers.analysis_tasks import (
    _mark_analysis_failed,
    _persist_completed_analysis,
    _process_analysis_async,
)
from tests.conftest import TestSessionFactory


def _stub_celery_sessionmaker() -> AsyncMock:
    return AsyncMock(
        return_value=(
            SimpleNamespace(dispose=AsyncMock()),
            TestSessionFactory,
        )
    )


@pytest.fixture(autouse=True)
def _use_test_session_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.infrastructure.database.connection.AsyncSessionFactory",
        TestSessionFactory,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )


def _build_result_fields() -> dict:
    return {
        "overall_score": 88,
        "technical_score": 90,
        "experience_score": 80,
        "education_score": 70,
        "communication_score": 85,
        "leadership_score": 75,
        "candidate_summary": "Perfil backend consistente.",
        "seniority_level": "senior",
        "total_experience_years": 7,
        "highest_education_level": "bachelor",
        "highest_education_field": "computacao",
        "strengths": ["python"],
        "weaknesses": ["english"],
        "recommendations": ["praticar entrevistas"],
        "keywords": ["python", "sql"],
        "extracted_data": {"candidate": {"professional_area": "backend"}},
    }


async def _create_analysis_fixture(
    db_session: AsyncSession,
    *,
    status: str = "pending",
    claimed_at: datetime | None = None,
    started_at: datetime | None = None,
    stale_at: datetime | None = None,
    worker_claim_id: str | None = None,
) -> AnalysisModel:
    user = UserModel(
        id=uuid4(),
        email=f"user-{uuid4()}@test.com",
        password_hash="hash",
        role="admin",
        status="active",
        full_name="Worker Test User",
    )
    db_session.add(user)
    await db_session.flush()

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidate",
        email=f"candidate-{uuid4()}@test.com",
        created_by=user.id,
        user_id=user.id,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate.id,
        title="Resume",
        created_by=user.id,
    )
    db_session.add(resume)
    await db_session.flush()

    resume_version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        s3_bucket="bucket",
        s3_key=f"resume-{uuid4()}.pdf",
        original_file_name="resume.pdf",
        file_size_bytes=100,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="Python FastAPI SQL",
        extraction_status="completed",
        uploaded_by=user.id,
    )
    db_session.add(resume_version)

    ai_model = AIModelModel(
        id=uuid4(),
        provider="anthropic",
        model_id=f"claude-claim-{uuid4()}",
        model_name="Claim Test Model",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        id=uuid4(),
        name=f"claim_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        system_prompt="System",
        user_prompt_template="{resume_text}\n{job_context}",
        is_active=True,
        created_by=user.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    now = datetime.now(UTC)
    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=resume_version.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status=status,
        requested_by=user.id,
        claimed_at=claimed_at,
        started_at=started_at,
        stale_at=stale_at,
        worker_claim_id=worker_claim_id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(analysis)
    await db_session.commit()
    return analysis


@pytest.fixture
def patch_ai_runtime(monkeypatch: pytest.MonkeyPatch):
    calls = {"ai": 0}

    async def fake_run_real_ai_analysis(**_: object):
        calls["ai"] += 1
        return _build_result_fields(), "{}", 10, 20, 0, 0, 100, "1"

    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._run_real_ai_analysis",
        fake_run_real_ai_analysis,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._provider_api_key_is_configured",
        lambda provider: True,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._real_ai_calls_allowed",
        lambda: True,
    )

    return calls


@pytest.mark.asyncio
async def test_pending_analysis_can_run_with_valid_claim(
    db_session: AsyncSession,
    patch_ai_runtime,
) -> None:
    analysis = await _create_analysis_fixture(db_session, status="pending")

    result = await _process_analysis_async(str(analysis.id), "task-claim-pending")

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    persisted_result = await db_session.scalar(
        sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis.id)
    )
    assert refreshed is not None
    await db_session.refresh(refreshed)

    assert result["status"] == "completed"
    assert patch_ai_runtime["ai"] == 1
    assert refreshed.status == "completed"
    assert refreshed.worker_claim_id is None
    assert persisted_result is not None


@pytest.mark.asyncio
async def test_completed_analysis_does_not_call_ai(
    db_session: AsyncSession,
    patch_ai_runtime,
) -> None:
    analysis = await _create_analysis_fixture(db_session, status="completed")

    result = await _process_analysis_async(str(analysis.id), "task-claim-completed")

    assert result["status"] == "completed"
    assert patch_ai_runtime["ai"] == 0


@pytest.mark.asyncio
async def test_processing_recent_does_not_call_ai(
    db_session: AsyncSession,
    patch_ai_runtime,
) -> None:
    now = datetime.now(UTC)
    analysis = await _create_analysis_fixture(
        db_session,
        status="processing",
        claimed_at=now,
        started_at=now,
        stale_at=now + timedelta(minutes=20),
        worker_claim_id="task-active",
    )

    result = await _process_analysis_async(str(analysis.id), "task-recent")

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)

    assert result["status"] == "claim_skipped"
    assert result["current_status"] == "processing"
    assert patch_ai_runtime["ai"] == 0
    assert refreshed.status == "processing"
    assert refreshed.worker_claim_id == "task-active"


@pytest.mark.asyncio
async def test_processing_stale_can_resume(
    db_session: AsyncSession,
    patch_ai_runtime,
) -> None:
    stale_time = datetime.now(UTC) - timedelta(minutes=30)
    analysis = await _create_analysis_fixture(
        db_session,
        status="processing",
        claimed_at=stale_time,
        started_at=stale_time,
        stale_at=stale_time,
        worker_claim_id="task-old",
    )

    result = await _process_analysis_async(str(analysis.id), "task-new")

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    persisted_result = await db_session.scalar(
        sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis.id)
    )
    assert refreshed is not None
    await db_session.refresh(refreshed)

    assert result["status"] == "completed"
    assert patch_ai_runtime["ai"] == 1
    assert refreshed.status == "completed"
    assert refreshed.worker_claim_id is None
    assert persisted_result is not None


@pytest.mark.asyncio
async def test_concurrent_tasks_do_not_call_ai_twice(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = await _create_analysis_fixture(db_session, status="pending")
    calls = {"ai": 0}

    async def fake_run_real_ai_analysis(**_: object):
        calls["ai"] += 1
        await asyncio.sleep(0.05)
        return _build_result_fields(), "{}", 10, 20, 0, 0, 100, "1"

    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._run_real_ai_analysis",
        fake_run_real_ai_analysis,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._provider_api_key_is_configured",
        lambda provider: True,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._real_ai_calls_allowed",
        lambda: True,
    )

    results = await asyncio.gather(
        _process_analysis_async(str(analysis.id), "task-concurrent-1"),
        _process_analysis_async(str(analysis.id), "task-concurrent-2"),
    )

    statuses = sorted(result["status"] for result in results)
    assert calls["ai"] == 1
    assert statuses == ["claim_skipped", "completed"]


@pytest.mark.asyncio
async def test_old_task_does_not_overwrite_completed_result(
    db_session: AsyncSession,
) -> None:
    analysis = await _create_analysis_fixture(
        db_session,
        status="processing",
        claimed_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        stale_at=datetime.now(UTC) + timedelta(minutes=20),
        worker_claim_id="task-new",
    )

    persisted = await _persist_completed_analysis(
        analysis_id=analysis.id,
        result_fields=_build_result_fields(),
        raw_response="{}",
        input_tokens=1,
        output_tokens=1,
        cache_read=0,
        cache_write=0,
        processing_ms=1,
        prompt_version_used="1",
        expected_worker_claim_id="task-old",
        sessionmaker=TestSessionFactory,
    )

    persisted_result = await db_session.scalar(
        sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis.id)
    )
    refreshed = await db_session.get(AnalysisModel, analysis.id)

    assert persisted is False
    assert persisted_result is None
    assert refreshed is not None
    assert refreshed.status == "processing"
    assert refreshed.worker_claim_id == "task-new"


@pytest.mark.asyncio
async def test_error_does_not_generate_duplicate_execution(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = await _create_analysis_fixture(db_session, status="pending")
    calls = {"ai": 0}

    async def fake_run_real_ai_analysis(**_: object):
        calls["ai"] += 1
        await asyncio.sleep(0.05)
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._run_real_ai_analysis",
        fake_run_real_ai_analysis,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._provider_api_key_is_configured",
        lambda provider: True,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._real_ai_calls_allowed",
        lambda: True,
    )

    results = await asyncio.gather(
        _process_analysis_async(str(analysis.id), "task-error-1"),
        _process_analysis_async(str(analysis.id), "task-error-2"),
        return_exceptions=True,
    )

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    persisted_result = await db_session.scalar(
        sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis.id)
    )
    assert refreshed is not None
    await db_session.refresh(refreshed)

    assert calls["ai"] == 1
    assert any(isinstance(result, RuntimeError) for result in results)
    assert any(
        isinstance(result, dict) and result.get("status") == "claim_skipped"
        for result in results
    )
    assert refreshed.status == "processing"
    assert refreshed.worker_claim_id == "task-error-1"
    assert persisted_result is None


@pytest.mark.asyncio
async def test_old_task_does_not_mark_failed(
    db_session: AsyncSession,
) -> None:
    analysis = await _create_analysis_fixture(
        db_session,
        status="processing",
        claimed_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        stale_at=datetime.now(UTC) + timedelta(minutes=20),
        worker_claim_id="task-new",
    )

    changed = await _mark_analysis_failed(
        analysis_id=str(analysis.id),
        task_id="task-old",
        error="boom",
        retry_count=1,
        expected_worker_claim_id="task-old",
        sessionmaker=TestSessionFactory,
    )

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)

    assert changed is False
    assert refreshed.status == "processing"
    assert refreshed.failure_reason is None
