from __future__ import annotations

from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pipeline_service import (
    PipelineCandidateAlreadyActiveInAnotherJobError,
    PipelineService,
    PipelineTransferBlockedAdvancedStageError,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository
from src.interface.api.schemas.pipeline_schemas import (
    AddCandidateToJobRequest,
    MoveCandidateRequest,
    ReconsiderCandidateRequest,
    TransferCandidateJobRequest,
)


async def _seed_user_candidate_job(
    db_session: AsyncSession,
    *,
    job_status: str = "published",
) -> tuple[UserModel, CandidateModel, JobModel]:
    user = UserModel(
        id=uuid4(),
        email=f"user-{uuid4()}@example.com",
        password_hash="hash",
        role="recruiter",
        status="active",
        full_name="Recruiter",
    )
    db_session.add(user)
    await db_session.flush()

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidate",
        email=f"cand-{uuid4()}@example.com",
        location_country="BR",
        tags=[],
        created_by=user.id,
    )
    db_session.add(candidate)

    job = JobModel(
        id=uuid4(),
        title="Backend Engineer",
        description="Desc",
        status=job_status,
        created_by=user.id,
    )
    db_session.add(job)
    await db_session.commit()

    return user, candidate, job


async def _seed_completed_analysis_for_candidate_job(
    db_session: AsyncSession,
    *,
    candidate: CandidateModel,
    job: JobModel,
    requested_by: UserModel,
) -> AnalysisModel:
    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate.id,
        title="Resume",
        status="active",
        current_version=1,
        created_by=requested_by.id,
    )
    db_session.add(resume)
    await db_session.flush()

    resume_version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        original_file_name="resume.pdf",
        file_size_bytes=1234,
        file_hash_sha256=f"hash-{uuid4().hex}",
        s3_bucket="bucket",
        s3_key=f"resume/{uuid4().hex}.pdf",
        extraction_status="completed",
        uploaded_by=requested_by.id,
    )
    db_session.add(resume_version)

    ai_model = AIModelModel(
        id=uuid4(),
        provider="google",
        model_id=f"gemini-{uuid4().hex[:6]}",
        model_name="Gemini",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        id=uuid4(),
        name=f"prompt-{uuid4().hex[:6]}",
        version=1,
        template_type="candidate_analysis",
        user_prompt_template="{}",
        created_by=requested_by.id,
        is_active=True,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=resume_version.id,
        job_id=job.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="completed",
        requested_by=requested_by.id,
    )
    db_session.add(analysis)
    await db_session.commit()
    return analysis


def _active_pipeline_filters(candidate_id) -> tuple:
    return (
        CandidateJobPipelineModel.candidate_id == candidate_id,
        CandidateJobPipelineModel.relationship_status == "active",
        CandidateJobPipelineModel.is_terminal.is_(False),
        CandidateJobPipelineModel.terminated_at.is_(None),
    )


@pytest.mark.asyncio
async def test_create_link_creates_single_canonical_row(db_session: AsyncSession) -> None:
    user, candidate, job = await _seed_user_candidate_job(db_session)
    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)

    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate.id,
                CandidateJobPipelineModel.job_id == job.id,
            )
        )
    ).scalars().all()

    assert len(rows) == 1
    assert rows[0].link_status == "active"
    assert rows[0].pipeline_status == "active"
    assert rows[0].pipeline_stage == "entry"


@pytest.mark.asyncio
async def test_stage_move_updates_pipeline_and_creates_event(db_session: AsyncSession) -> None:
    user, candidate, job = await _seed_user_candidate_job(db_session)
    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)

    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    await svc.move_candidate(
        candidate_id=candidate.id,
        body=MoveCandidateRequest(job_id=job.id, stage="screening"),
        moved_by=user.id,
    )
    await db_session.commit()

    row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert row is not None
    assert row.pipeline_stage == "screening"
    assert row.link_status == "active"

    event = await db_session.scalar(
        sa.select(CandidateJobPipelineEventModel)
        .where(
            CandidateJobPipelineEventModel.candidate_id == candidate.id,
            CandidateJobPipelineEventModel.job_id == job.id,
            CandidateJobPipelineEventModel.event_type == "stage_moved",
        )
        .order_by(CandidateJobPipelineEventModel.created_at.desc())
        .limit(1)
    )
    assert event is not None


@pytest.mark.asyncio
async def test_transfer_marks_source_terminal_and_destination_active(db_session: AsyncSession) -> None:
    user, candidate, source_job = await _seed_user_candidate_job(db_session)

    destination_job = JobModel(
        id=uuid4(),
        title="New Job",
        description="Desc",
        status="published",
        created_by=user.id,
    )
    db_session.add(destination_job)
    await db_session.commit()

    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)
    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=source_job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    await svc.transfer_candidate_job(
        candidate_id=candidate.id,
        body=TransferCandidateJobRequest(
            from_job_id=source_job.id,
            to_job_id=destination_job.id,
            reason="reposicao",
        ),
        moved_by=user.id,
    )
    await db_session.commit()

    source = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == source_job.id,
        )
    )
    destination = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == destination_job.id,
        )
    )

    assert source is not None
    assert source.link_status == "transferred"
    assert source.pipeline_status == "terminal"

    assert destination is not None
    assert destination.link_status == "active"
    assert destination.pipeline_status == "active"
    assert destination.pipeline_stage == "entry"


@pytest.mark.asyncio
async def test_transfer_blocked_if_advanced_stage(db_session: AsyncSession) -> None:
    user, candidate, source_job = await _seed_user_candidate_job(db_session)

    destination_job = JobModel(
        id=uuid4(),
        title="New Job",
        description="Desc",
        status="published",
        created_by=user.id,
    )
    db_session.add(destination_job)
    await db_session.commit()

    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)
    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=source_job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    # Move to advanced stage
    await svc.move_candidate(
        candidate_id=candidate.id,
        body=MoveCandidateRequest(stage="hr_interview", job_id=source_job.id),
        moved_by=user.id,
    )
    await db_session.commit()

    # Attempt transfer
    with pytest.raises(PipelineTransferBlockedAdvancedStageError):
        await svc.transfer_candidate_job(
            candidate_id=candidate.id,
            body=TransferCandidateJobRequest(
                from_job_id=source_job.id,
                to_job_id=destination_job.id,
                reason="reposicao",
            ),
            moved_by=user.id,
        )


@pytest.mark.asyncio
async def test_remove_candidate_marks_terminal_and_inactive(db_session: AsyncSession) -> None:
    user, candidate, job = await _seed_user_candidate_job(db_session)
    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)

    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    await svc.remove_candidate_from_job(
        candidate_id=candidate.id,
        job_id=job.id,
        moved_by=user.id,
    )
    await db_session.commit()

    row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert row is not None
    assert row.link_status == "removed"
    assert row.pipeline_status == "terminal"


@pytest.mark.asyncio
async def test_reconsider_reactivates_same_job_without_creating_second_active_pipeline(
    db_session: AsyncSession,
) -> None:
    user, candidate, job = await _seed_user_candidate_job(db_session)
    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)

    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    await svc.move_candidate(
        candidate_id=candidate.id,
        body=MoveCandidateRequest(job_id=job.id, stage="rejected", reason="sem aderência"),
        moved_by=user.id,
    )
    await db_session.commit()

    result = await svc.reconsider_candidate(
        candidate_id=candidate.id,
        body=ReconsiderCandidateRequest(
            job_id=job.id,
            initial_stage="entry",
            reason="Revisão manual do perfil",
        ),
        moved_by=user.id,
    )
    await db_session.commit()

    assert result.job_id == job.id
    assert result.stage == "entry"
    assert result.status == "active"

    rows = (
        await db_session.execute(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate.id,
                CandidateJobPipelineModel.job_id == job.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].relationship_status == "active"
    assert rows[0].is_terminal is False

    active_count = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateJobPipelineModel)
                .where(*_active_pipeline_filters(candidate.id))
            )
        )
        or 0
    )
    assert active_count == 1

    event_types = (
        await db_session.execute(
            sa.select(CandidateJobPipelineEventModel.event_type).where(
                CandidateJobPipelineEventModel.candidate_id == candidate.id,
                CandidateJobPipelineEventModel.job_id == job.id,
            )
        )
    ).scalars().all()
    assert "stage_moved" in event_types
    assert "candidate_reconsidered" in event_types


@pytest.mark.asyncio
async def test_candidate_has_single_active_state_across_jobs(db_session: AsyncSession) -> None:
    user, candidate, first_job = await _seed_user_candidate_job(db_session)
    second_job = JobModel(
        id=uuid4(),
        title="Second Job",
        description="Desc",
        status="published",
        created_by=user.id,
    )
    db_session.add(second_job)
    await db_session.commit()

    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)

    await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=first_job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    with pytest.raises(PipelineCandidateAlreadyActiveInAnotherJobError):
        await svc.add_candidate_to_job(
            candidate_id=candidate.id,
            body=AddCandidateToJobRequest(job_id=second_job.id, initial_stage="entry"),
            moved_by=user.id,
        )

    active_count = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateJobPipelineModel)
                .where(*_active_pipeline_filters(candidate.id))
            )
        )
        or 0
    )
    assert active_count == 1


@pytest.mark.asyncio
async def test_match_registration_does_not_create_pipeline_entry(db_session: AsyncSession) -> None:
    user, candidate, job = await _seed_user_candidate_job(db_session)
    analysis = await _seed_completed_analysis_for_candidate_job(
        db_session,
        candidate=candidate,
        job=job,
        requested_by=user,
    )

    repo = SQLAlchemyPipelineRepository(db_session)
    await repo.upsert_and_record_transition(analysis.id, job.id)
    await db_session.commit()

    created_entry = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert created_entry is None


@pytest.mark.asyncio
async def test_match_registration_does_not_create_second_active_pipeline(db_session: AsyncSession) -> None:
    user, candidate, source_job = await _seed_user_candidate_job(db_session)
    target_job = JobModel(
        id=uuid4(),
        title="Target Job",
        description="Desc",
        status="published",
        created_by=user.id,
    )
    db_session.add(target_job)
    await db_session.flush()

    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=source_job.id,
            pipeline_stage="entry",
            link_status="active",
            pipeline_status="active",
            relationship_status="active",
            is_terminal=False,
            terminated_at=None,
        )
    )
    await db_session.commit()

    analysis = await _seed_completed_analysis_for_candidate_job(
        db_session,
        candidate=candidate,
        job=target_job,
        requested_by=user,
    )
    repo = SQLAlchemyPipelineRepository(db_session)
    await repo.upsert_and_record_transition(analysis.id, target_job.id)
    await db_session.commit()

    active_count = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateJobPipelineModel)
                .where(*_active_pipeline_filters(candidate.id))
            )
        )
        or 0
    )
    target_entry = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == target_job.id,
        )
    )
    assert active_count == 1
    assert target_entry is None


@pytest.mark.asyncio
async def test_database_unique_index_blocks_second_active_pipeline(db_session: AsyncSession) -> None:
    user, candidate, first_job = await _seed_user_candidate_job(db_session)
    second_job = JobModel(
        id=uuid4(),
        title="Second Active Job",
        description="Desc",
        status="published",
        created_by=user.id,
    )
    db_session.add(second_job)
    await db_session.commit()

    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=first_job.id,
            pipeline_stage="entry",
            link_status="active",
            pipeline_status="active",
            relationship_status="active",
            is_terminal=False,
            terminated_at=None,
        )
    )
    await db_session.commit()

    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=second_job.id,
            pipeline_stage="entry",
            link_status="active",
            pipeline_status="active",
            relationship_status="active",
            is_terminal=False,
            terminated_at=None,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_terminal_pipeline_does_not_block_new_active_pipeline(db_session: AsyncSession) -> None:
    user, candidate, first_job = await _seed_user_candidate_job(db_session)
    second_job = JobModel(
        id=uuid4(),
        title="Replacement Job",
        description="Desc",
        status="published",
        created_by=user.id,
    )
    db_session.add(second_job)
    await db_session.commit()

    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=first_job.id,
            pipeline_stage="rejected",
            link_status="rejected",
            pipeline_status="terminal",
            relationship_status="rejected",
            is_terminal=True,
            terminated_at=sa.func.now(),
        )
    )
    await db_session.commit()

    svc = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)
    response = await svc.add_candidate_to_job(
        candidate_id=candidate.id,
        body=AddCandidateToJobRequest(job_id=second_job.id, initial_stage="entry"),
        moved_by=user.id,
    )
    await db_session.commit()

    active_count = int(
        (
            await db_session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateJobPipelineModel)
                .where(*_active_pipeline_filters(candidate.id))
            )
        )
        or 0
    )

    assert response.job_id == second_job.id
    assert active_count == 1
