from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.application.services.analysis_service import AnalysisService
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.interface.api.routers.analyses import request_analysis
from src.interface.workers.analysis_tasks import (
    _PLACEHOLDER_RESUME,
    _claim_analysis_for_processing,
    _process_analysis_with_session,
)
from tests.conftest import TestSessionFactory


async def _seed_retry_scheduled_analysis(
    db_session: AsyncSession,
    *,
    extraction_status: str = "completed",
    extracted_text: str | None = "Experiência com Python e FastAPI",
    original_file_name: str = "resume.pdf",
    mime_type: str = "application/pdf",
) -> tuple[UserModel, ResumeVersionModel, JobModel, AnalysisModel]:
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
        s3_key=original_file_name,
        original_file_name=original_file_name,
        file_size_bytes=1024,
        file_hash_sha256="a" * 64,
        mime_type=mime_type,
        extracted_text=extracted_text,
        extraction_status=extraction_status,
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
@pytest.mark.parametrize("terminal_status", ["completed", "cancelled"])
async def test_terminal_analysis_is_not_reprocessed_by_retry(
    db_session: AsyncSession,
    terminal_status: str,
) -> None:
    _, _, _, analysis = await _seed_retry_scheduled_analysis(db_session)
    analysis.status = terminal_status
    analysis.worker_claim_id = None
    analysis.next_retry_at = None
    await db_session.commit()

    result = await _process_analysis_with_session(
        analysis_id=str(analysis.id),
        task_id=f"task-{terminal_status}",
        sessionmaker=TestSessionFactory,
    )

    await db_session.refresh(analysis)
    assert result == {"analysis_id": str(analysis.id), "status": terminal_status}
    assert analysis.status == terminal_status
    assert analysis.worker_claim_id is None


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
async def test_force_request_requeues_stale_pending_analysis(db_session: AsyncSession) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(db_session)
    old = datetime.now(UTC) - timedelta(hours=3)
    analysis.status = "pending"
    analysis.created_at = old
    analysis.updated_at = old
    analysis.next_retry_at = None
    analysis.failure_reason = None
    analysis.task_id = None
    await db_session.commit()

    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
    )

    result = await use_case.execute(
        RequestAnalysisCommand(
            resume_version_id=version.id,
            requested_by=user.id,
            job_id=job.id,
            force_reanalyze=True,
        )
    )

    assert result.analysis_id == analysis.id
    assert str(result.status) == "pending"
    assert result.enqueue_required is True
    assert result.stuck is True
    assert result.reason == "analysis_stale_requeued"


@pytest.mark.asyncio
async def test_force_request_with_valid_extracted_text_creates_pending_analysis(
    db_session: AsyncSession,
) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(db_session)
    analysis.status = "completed"
    analysis.completed_at = datetime.now(UTC)
    analysis.next_retry_at = None
    await db_session.commit()

    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
    )

    result = await use_case.execute(
        RequestAnalysisCommand(
            resume_version_id=version.id,
            requested_by=user.id,
            job_id=job.id,
            force_reanalyze=True,
        )
    )

    assert result.created is True
    assert result.enqueue_required is True
    assert str(result.status) == "pending"
    assert result.analysis_id != analysis.id
    audit_event = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == result.analysis_id,
            AuditLogModel.action == "analysis_requested",
        )
    )
    assert audit_event is not None
    assert audit_event.metadata_["provider"] == "gemini"
    assert audit_event.metadata_["model"].startswith("gemini-")
    assert audit_event.metadata_["prompt_version"] == 1
    assert audit_event.metadata_["extraction_ready"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("extraction_status", "extracted_text", "expected_message"),
    [
        (
            "completed",
            None,
            "Não foi possível reprocessar: o currículo não possui texto extraído válido.",
        ),
        (
            "completed",
            "  ",
            "Não foi possível reprocessar: o currículo não possui texto extraído válido.",
        ),
        (
            "completed",
            "|||||||| 000000 ----",
            "Não foi possível reprocessar: o currículo não possui texto extraído válido.",
        ),
        (
            "pending",
            None,
            "A extração do currículo ainda não foi concluída. "
            "Aguarde a extração antes de reprocessar a análise.",
        ),
        (
            "failed",
            None,
            "A extração do currículo falhou. Envie um novo PDF ou tente extrair novamente.",
        ),
    ],
)
async def test_force_request_blocks_when_resume_extraction_is_not_ready(
    db_session: AsyncSession,
    extraction_status: str,
    extracted_text: str | None,
    expected_message: str,
) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(
        db_session,
        extraction_status=extraction_status,
        extracted_text=extracted_text,
    )
    analysis.status = "completed"
    analysis.completed_at = datetime.now(UTC)
    analysis.next_retry_at = None
    await db_session.commit()

    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            RequestAnalysisCommand(
                resume_version_id=version.id,
                requested_by=user.id,
                job_id=job.id,
                force_reanalyze=True,
            )
        )

    assert str(exc_info.value) == expected_message
    analysis_count = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(AnalysisModel)
        .where(AnalysisModel.resume_version_id == version.id)
    )
    assert analysis_count == 1


@pytest.mark.asyncio
async def test_force_request_blocks_unsupported_resume_format(
    db_session: AsyncSession,
) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(
        db_session,
        original_file_name="resume.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    analysis.status = "completed"
    analysis.completed_at = datetime.now(UTC)
    analysis.next_retry_at = None
    await db_session.commit()

    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            RequestAnalysisCommand(
                resume_version_id=version.id,
                requested_by=user.id,
                job_id=job.id,
                force_reanalyze=True,
            )
        )

    assert str(exc_info.value) == (
        "Não foi possível reprocessar: o currículo está em formato não suportado. "
        "Envie um novo PDF."
    )


@pytest.mark.asyncio
async def test_force_request_does_not_requeue_stale_analysis_without_extracted_text(
    db_session: AsyncSession,
) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(
        db_session,
        extraction_status="completed",
        extracted_text=None,
    )
    analysis.status = "retry_scheduled"
    analysis.next_retry_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    use_case = RequestAnalysisUseCase(
        SQLAlchemyAnalysisRepository(db_session),
        SQLAlchemyResumeRepository(db_session),
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            RequestAnalysisCommand(
                resume_version_id=version.id,
                requested_by=user.id,
                job_id=job.id,
                force_reanalyze=True,
            )
        )

    assert str(exc_info.value) == (
        "Não foi possível reprocessar: o currículo não possui texto extraído válido."
    )
    await db_session.refresh(analysis)
    assert analysis.status == "retry_scheduled"
    assert analysis.next_retry_at is not None


@pytest.mark.asyncio
async def test_request_analysis_enqueue_failure_marks_analysis_failed(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(db_session)
    analysis.status = "completed"
    analysis.completed_at = datetime.now(UTC)
    analysis.next_retry_at = None
    version_id = version.id
    job_id = job.id
    await db_session.commit()

    def _raise_enqueue(_analysis_id):
        raise RuntimeError("broker down")

    monkeypatch.setattr("src.interface.api.routers.analyses.enqueue_analysis", _raise_enqueue)

    with pytest.raises(HTTPException) as exc_info:
        await request_analysis(
            resume_version_id=version_id,
            current_user=user,
            job_id=job_id,
            force=True,
            db=db_session,
            _rl=None,
        )

    assert exc_info.value.status_code == 503
    failed = await db_session.scalar(
        sa.select(AnalysisModel)
        .where(
            AnalysisModel.resume_version_id == version_id,
            AnalysisModel.job_id == job_id,
            AnalysisModel.status == "failed",
        )
        .order_by(AnalysisModel.created_at.desc())
    )
    assert failed is not None
    assert failed.failure_reason == "analysis_enqueue_failed"
    assert failed.provider_error_type == "enqueue_failed"


@pytest.mark.asyncio
async def test_manual_reprocess_without_extracted_text_returns_clear_error_and_does_not_enqueue(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, version, job, analysis = await _seed_retry_scheduled_analysis(
        db_session,
        extraction_status="completed",
        extracted_text=None,
    )
    analysis.status = "completed"
    analysis.completed_at = datetime.now(UTC)
    analysis.next_retry_at = None
    version_id = version.id
    job_id = job.id
    await db_session.commit()

    monkeypatch.setattr(
        "src.interface.api.routers.analyses.enqueue_analysis",
        lambda _analysis_id: (_ for _ in ()).throw(
            AssertionError("manual retry must not enqueue without extracted text")
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await request_analysis(
            resume_version_id=version_id,
            current_user=user,
            job_id=job_id,
            force=True,
            db=db_session,
            _rl=None,
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == (
        "Não foi possível reprocessar: o currículo não possui texto extraído válido."
    )
    analysis_count = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(AnalysisModel)
        .where(AnalysisModel.resume_version_id == version_id)
    )
    assert analysis_count == 1


@pytest.mark.asyncio
async def test_list_global_includes_waiting_extraction_analysis(db_session: AsyncSession) -> None:
    _, _, _, analysis = await _seed_retry_scheduled_analysis(db_session)
    analysis.status = "waiting_extraction"
    analysis.task_id = None
    analysis.next_retry_at = None
    analysis.failure_reason = None
    await db_session.commit()

    service = AnalysisService(SQLAlchemyAnalysisRepository(db_session))
    items, _ = await service.list_global(page=1, page_size=20)

    item = next(item for item in items if item.id == analysis.id)
    assert item.status == "waiting_extraction"
    assert item.stuck is False


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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "extracted_text",
    [None, "   ", _PLACEHOLDER_RESUME],
    ids=["none", "whitespace_only", "placeholder_string"],
)
async def test_worker_sets_waiting_extraction_when_text_not_ready(
    db_session: AsyncSession,
    extracted_text: str | None,
) -> None:
    """When resume_text is absent or placeholder, the worker must park the analysis
    at waiting_extraction without calling the AI provider."""
    _, _, _, analysis = await _seed_retry_scheduled_analysis(
        db_session,
        extracted_text=extracted_text,
    )

    result = await _process_analysis_with_session(
        analysis_id=str(analysis.id),
        task_id="task-gate-1",
        sessionmaker=TestSessionFactory,
    )

    assert result == {"analysis_id": str(analysis.id), "status": "waiting_extraction"}

    await db_session.refresh(analysis)
    assert analysis.status == "waiting_extraction"
    assert analysis.worker_claim_id is None
    assert analysis.claimed_at is None
    assert analysis.stale_at is None

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.resource_id == analysis.id,
            AuditLogModel.action == "analysis_waiting_for_extraction",
        )
    )
    assert audit is not None
