from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import JobProfileAnalysisModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)

from .helpers import _create_active_user


@pytest.mark.asyncio
async def test_reactivating_existing_job_profile_keeps_it_active(
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-job-profile-reactivation-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    job = JobModel(
        id=uuid4(),
        title="Job Reactivation",
        description="Test job reactivation path",
        status="published",
        created_by=recruiter.id,
    )
    db_session.add(job)
    await db_session.flush()

    historical_profile = JobProfileAnalysisModel(
        id=uuid4(),
        job_id=job.id,
        provider="google",
        model_id="gemini-test",
        prompt_version="v1",
        job_signature_hash="sig-historical",
        responsibilities_json=["old"],
        raw_response_json={"responsibilities": ["old"]},
        is_active=False,
    )
    current_active_profile = JobProfileAnalysisModel(
        id=uuid4(),
        job_id=job.id,
        provider="google",
        model_id="gemini-test",
        prompt_version="v1",
        job_signature_hash="sig-current",
        responsibilities_json=["current"],
        raw_response_json={"responsibilities": ["current"]},
        is_active=True,
    )
    db_session.add(historical_profile)
    db_session.add(current_active_profile)
    await db_session.commit()

    row_to_reactivate = await db_session.scalar(
        sa.select(JobProfileAnalysisModel).where(
            JobProfileAnalysisModel.id == historical_profile.id
        )
    )
    assert row_to_reactivate is not None
    row_to_reactivate.is_active = True
    row_to_reactivate.superseded_at = None

    repository = SQLAlchemyAnalysisRepository(db_session)
    saved = await repository.save_job_profile_analysis(row_to_reactivate)
    await db_session.commit()
    await db_session.refresh(saved)

    refreshed_historical = await db_session.scalar(
        sa.select(JobProfileAnalysisModel).where(
            JobProfileAnalysisModel.id == historical_profile.id
        )
    )
    refreshed_current = await db_session.scalar(
        sa.select(JobProfileAnalysisModel).where(
            JobProfileAnalysisModel.id == current_active_profile.id
        )
    )
    assert refreshed_historical is not None
    assert refreshed_current is not None

    assert refreshed_historical.is_active is True
    assert refreshed_current.is_active is False

