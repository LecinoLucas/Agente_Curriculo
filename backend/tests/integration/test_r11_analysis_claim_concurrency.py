"""R11 — Two simultaneous workers must NOT both claim the same analysis.

The fix relies on `_claim_analysis_for_processing` using a conditional
UPDATE that filters by status and stale_cutoff. Concurrent workers both run
that UPDATE; only one returns rowcount > 0 (claimed). The other gets `False`
and exits before any AI call.

This test pins that contract: out of N concurrent claims for the same row,
exactly 1 succeeds.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.resume_model import (
    ResumeModel,
    ResumeVersionModel,
)
from src.infrastructure.database.models.user_model import UserModel
from src.interface.workers.analysis_tasks import _claim_analysis_for_processing


SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")


async def _seed_pending_analysis(session: AsyncSession) -> UUID:
    """Insert the minimal graph needed to satisfy AnalysisModel FKs and return
    a freshly-created analysis row in `pending` state."""
    now = datetime.now(UTC)

    candidate_id = uuid4()
    resume_id = uuid4()
    version_id = uuid4()
    model_id_pk = uuid4()
    prompt_id_pk = uuid4()
    analysis_id = uuid4()

    # User already exists via the `system_user_for_public_app` fixture.

    # Candidate is referenced via Resume → ResumeVersion → Analysis
    from src.infrastructure.database.models.candidate_model import CandidateModel
    candidate = CandidateModel(
        id=candidate_id,
        full_name="Test Candidate",
        created_by=SYSTEM_USER_ID,
        created_at=now,
        updated_at=now,
    )
    session.add(candidate)

    resume = ResumeModel(
        id=resume_id,
        candidate_id=candidate_id,
        title="curriculo.pdf",
        status="active",
        current_version=1,
        created_by=SYSTEM_USER_ID,
        created_at=now,
        updated_at=now,
    )
    session.add(resume)

    version = ResumeVersionModel(
        id=version_id,
        resume_id=resume_id,
        version_number=1,
        s3_bucket="local",
        s3_key="dummy",
        original_file_name="curriculo.pdf",
        file_size_bytes=1,
        file_hash_sha256="0" * 64,
        mime_type="application/pdf",
        extraction_status="completed",
        extracted_text="texto",
        uploaded_by=SYSTEM_USER_ID,
        uploaded_at=now,
    )
    session.add(version)

    ai_model = AIModelModel(
        id=model_id_pk,
        provider="claude",
        model_id="test-model",
        model_name="Test",
        is_active=True,
        activated_at=now,
        created_at=now,
    )
    session.add(ai_model)

    prompt = PromptTemplateModel(
        id=prompt_id_pk,
        name="test_prompt",
        version=1,
        template_type="full_analysis",
        user_prompt_template="...",
        max_tokens=1000,
        temperature=0.1,
        is_active=True,
        created_by=SYSTEM_USER_ID,
        created_at=now,
    )
    session.add(prompt)

    analysis = AnalysisModel(
        id=analysis_id,
        resume_version_id=version_id,
        ai_model_id=model_id_pk,
        prompt_template_id=prompt_id_pk,
        requested_by=SYSTEM_USER_ID,
        status="pending",
        idempotency_key=f"analysis:v1:{version_id}:null:{model_id_pk}:{prompt_id_pk}:{SYSTEM_USER_ID}",
        created_at=now,
        updated_at=now,
    )
    session.add(analysis)
    await session.commit()
    return analysis_id


@pytest.mark.asyncio
async def test_concurrent_workers_only_one_claims(db_session: AsyncSession) -> None:
    from tests.conftest import TestSessionFactory

    analysis_id = await _seed_pending_analysis(db_session)

    async def _try_claim(task_id: str) -> bool:
        return await _claim_analysis_for_processing(
            analysis_id=analysis_id,
            task_id=task_id,
            worker_id=f"worker:{task_id}",
            sessionmaker=TestSessionFactory,
        )

    results = await asyncio.gather(
        _try_claim("task-A"),
        _try_claim("task-B"),
        _try_claim("task-C"),
    )

    assert results.count(True) == 1, (
        f"Exactly one worker must win the claim. Got {results}."
    )
    assert results.count(False) == 2

    # Status must be `processing` after a successful claim.
    async with TestSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        assert analysis is not None
        assert str(analysis.status) == "processing"
        assert analysis.worker_claim_id in {"task-A", "task-B", "task-C"}


@pytest.mark.asyncio
async def test_completed_analysis_is_not_reclaimed(db_session: AsyncSession) -> None:
    """A completed analysis must not be re-claimed even by a fresh worker."""
    from tests.conftest import TestSessionFactory

    analysis_id = await _seed_pending_analysis(db_session)

    # Mark as completed.
    async with TestSessionFactory() as session:
        await session.execute(
            sa.update(AnalysisModel)
            .where(AnalysisModel.id == analysis_id)
            .values(status="completed", completed_at=datetime.now(UTC))
        )
        await session.commit()

    claimed = await _claim_analysis_for_processing(
        analysis_id=analysis_id,
        task_id="late-task",
        worker_id="late-worker",
        sessionmaker=TestSessionFactory,
    )
    assert claimed is False
