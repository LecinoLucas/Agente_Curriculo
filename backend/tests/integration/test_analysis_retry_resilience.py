from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.application.services.analysis_service import AnalysisService
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel, PromptTemplateModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import SQLAlchemyAnalysisRepository
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.interface.workers.analysis_tasks import _claim_analysis_for_processing

from tests.conftest import TestSessionFactory


async def _seed_retry_scheduled_analysis(db_session: AsyncSession) -> tuple[UserModel, ResumeVersionModel, JobModel, AnalysisModel]:
    now = datetime.now(UTC)
    user = UserModel(
        id=uuid4(),
        email=f"retry-{uuid4().hex[:8]}@test.com",
        password_hash="hash",
        role="recruiter",
        status="active",
        full_name="Retry Recruiter",
        created_at=now,
        updated_at=now,
    )
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidate Retry",
        email="candidate@test.com",
        created_by=user.id,
        created_at=now,
        updated_at=now,
        location_country="BR",
        tags=[],
    )
    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate.id,
        title="Currículo",
        status="active",
        current_version=1,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        s3_bucket="bucket",
        s3_key="resume.pdf",
        original_file_name="resume.pdf",
        file_size_bytes=1024,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="Experiência com Python e FastAPI",
        extraction_status="completed",
        uploaded_by=user.id,
        uploaded_at=now,
    )
    job = JobModel(
        id=uuid4(),
        title="Backend Engineer",
        description="APIs",
        status="published",
        created_by=user.id,
        created_at=now,
        updated_at=now,
        deal_breakers=[],
        behavioral_requirements=[],
    )
    ai_model = AIModelModel(
        id=uuid4(),
        provider="gemini",
        model_id=f"gemini-{uuid4().hex[:8]}",
        model_name="Gemini",
        is_active=True,
        activated_at=now,
        created_at=now,
    )
    prompt = PromptTemplateModel(
        id=uuid4(),
        name="full-analysis",
        version=1,
        template_type="full_analysis",
        user_prompt_template="{}",
        max_tokens=1000,
        temperature=0.1,
        is_active=True,
        created_by=user.id,
        created_at=now,
    )
    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=version.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        requested_by=user.id,
        job_id=job.id,
        status="retry_scheduled",
        retry_count=2,
        attempts=2,
        next_retry_at=now + timedelta(seconds=45),
        failure_reason="Alta demanda no provedor IA. Tentando novamente automaticamente.",
        provider_error_type="provider_unavailable",
        provider_status_code=503,
        created_at=now,
        updated_at=now,
    )

    db_session.add_all([user, candidate, resume, version, job, ai_model, prompt, analysis])
    await db_session.commit()
    return user, version, job, analysis


@pytest.mark.asyncio
async def test_retry_scheduled_analysis_can_be_claimed_again(db_session: AsyncSession) -> None:
    _, _, _, analysis = await _seed_retry_scheduled_analysis(db_session)

    claimed = await _claim_analysis_for_processing(
        analysis_id=analysis.id,
        task_id="task-retry-1",
        worker_id="worker-1",
        sessionmaker=TestSessionFactory,
    )

    assert claimed is True

    await db_session.refresh(analysis)
    assert analysis.status == "processing"
    assert analysis.worker_claim_id == "task-retry-1"
    assert analysis.next_retry_at is None
    assert analysis.failure_reason is None


@pytest.mark.asyncio
async def test_request_analysis_reuses_retry_scheduled_analysis(db_session: AsyncSession) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(db_session)

    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
    )

    result = await use_case.execute(
        RequestAnalysisCommand(
            resume_version_id=version.id,
            requested_by=user.id,
            job_id=job.id,
        )
    )

    assert result.analysis_id == analysis.id
    assert str(result.status) == "retry_scheduled"
    assert result.enqueue_required is False


@pytest.mark.asyncio
async def test_list_global_marks_stale_pending_analysis_failed(db_session: AsyncSession) -> None:
    _, _, _, analysis = await _seed_retry_scheduled_analysis(db_session)
    old = datetime.now(UTC) - timedelta(hours=3)
    analysis.status = "pending"
    analysis.retry_count = 0
    analysis.next_retry_at = None
    analysis.failure_reason = None
    analysis.created_at = old
    analysis.updated_at = old
    await db_session.commit()

    service = AnalysisService(SQLAlchemyAnalysisRepository(db_session))
    items, _ = await service.list_global(page=1, page_size=20)

    await db_session.refresh(analysis)
    assert analysis.status == "failed"
    assert analysis.failure_reason == "analysis_stuck_pending_timeout"
    item = next(item for item in items if item.id == analysis.id)
    assert item.stuck is True
    assert item.reason == "analysis_stuck_pending_timeout"


@pytest.mark.asyncio
async def test_list_global_marks_expired_processing_claim_failed(db_session: AsyncSession) -> None:
    _, _, _, analysis = await _seed_retry_scheduled_analysis(db_session)
    old = datetime.now(UTC) - timedelta(minutes=45)
    analysis.status = "processing"
    analysis.next_retry_at = None
    analysis.failure_reason = None
    analysis.started_at = old
    analysis.updated_at = old
    analysis.worker_claim_id = "task-stale"
    analysis.claimed_at = old
    analysis.stale_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    service = AnalysisService(SQLAlchemyAnalysisRepository(db_session))
    items, _ = await service.list_global(page=1, page_size=20)

    await db_session.refresh(analysis)
    assert analysis.status == "failed"
    assert analysis.failure_reason == "analysis_worker_claim_expired"
    assert analysis.worker_claim_id is None
    item = next(item for item in items if item.id == analysis.id)
    assert item.stuck is True
    assert item.reason == "analysis_worker_claim_expired"
