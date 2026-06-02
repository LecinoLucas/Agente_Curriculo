"""OP-6G — Link CandidateApplication (submitted) to the pipeline.

Tests the POST /api/v1/applications/{id}/link-pipeline endpoint and the
underlying service, covering all guard rules and idempotency.
"""
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


# ── Fixtures ─────────────────────────────────────────────────────────────────


async def _recruiter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> tuple[dict[str, str], UUID]:
    email = f"recruiter-{uuid4()}@example.com"
    user = await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    return headers, user.id


async def _candidate(db_session: AsyncSession, created_by: UUID) -> CandidateModel:
    c = CandidateModel(
        full_name="Pessoa Candidata",
        email=f"cand-{uuid4()}@example.com",
        created_by=created_by,
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


async def _job(db_session: AsyncSession, created_by: UUID) -> JobModel:
    j = JobModel(
        title="Frentista",
        description="Atendimento ao posto.",
        location="Peritoró, MA",
        created_by=created_by,
    )
    db_session.add(j)
    await db_session.commit()
    await db_session.refresh(j)
    return j


async def _application(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    status: str = "submitted",
) -> CandidateApplicationModel:
    app = CandidateApplicationModel(
        candidate_id=candidate_id,
        job_id=job_id,
        source="bot",
        status=status,
    )
    db_session.add(app)
    await db_session.commit()
    await db_session.refresh(app)
    return app


async def _link(
    client: AsyncClient,
    headers: dict,
    application_id: UUID,
) -> tuple[int, dict]:
    response = await client.post(
        f"/api/v1/applications/{application_id}/link-pipeline",
        headers=headers,
    )
    return response.status_code, response.json()


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_submitted_application_creates_pipeline_entry(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(db_session, candidate_id=candidate.id, job_id=job.id)

    code, payload = await _link(client, headers, app.id)

    assert code == 200
    assert payload["created"] is True
    assert payload["application_status"] == "linked_to_pipeline"
    assert payload["pipeline_id"] is not None

    # Application status updated.
    refreshed = await db_session.get(CandidateApplicationModel, app.id)
    assert refreshed is not None
    assert refreshed.status == "linked_to_pipeline"

    # Pipeline entry created in 'entry' stage.
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert pipeline is not None
    assert pipeline.pipeline_stage == "entry"
    assert pipeline.link_status == "active"
    assert pipeline.application_id == app.id


async def test_pipeline_entry_in_correct_initial_stage(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(db_session, candidate_id=candidate.id, job_id=job.id)

    await _link(client, headers, app.id)

    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
        )
    )
    assert pipeline is not None
    assert pipeline.pipeline_stage == "entry"
    assert pipeline.pipeline_status == "active"
    assert pipeline.relationship_status == "active"
    assert pipeline.is_terminal is False


async def test_application_started_cannot_be_linked(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(
        db_session, candidate_id=candidate.id, job_id=job.id, status="started"
    )

    code, payload = await _link(client, headers, app.id)

    assert code == 422
    assert "submitted" in payload["error"]["message"].lower()


async def test_application_qualified_cannot_be_linked(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(
        db_session, candidate_id=candidate.id, job_id=job.id, status="qualified"
    )

    code, _ = await _link(client, headers, app.id)

    assert code == 422


async def test_application_without_job_id_cannot_be_linked(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    app = CandidateApplicationModel(
        candidate_id=candidate.id,
        job_id=None,
        source="bot",
        status="submitted",
    )
    db_session.add(app)
    await db_session.commit()
    await db_session.refresh(app)

    code, payload = await _link(client, headers, app.id)

    assert code == 422
    assert "vaga" in payload["error"]["message"].lower()


async def test_candidate_with_conflicting_active_pipeline_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
):
    from datetime import UTC, datetime

    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    job2 = await _job(db_session, actor_id)

    # Create an existing active pipeline entry for the candidate.
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=uuid4(),
            candidate_id=candidate.id,
            job_id=job.id,
            pipeline_stage="entry",
            link_status="active",
            pipeline_status="active",
            relationship_status="active",
            is_terminal=False,
            source="manual",
            entered_at=now,
            created_at=now,
            updated_at=now,
        )
    )
    await db_session.commit()

    # Try to link a second application for the same candidate.
    app = await _application(db_session, candidate_id=candidate.id, job_id=job2.id)
    code, payload = await _link(client, headers, app.id)

    assert code == 409
    msg = payload["error"]["message"].lower()
    assert "ativa" in msg or "pipeline" in msg


async def test_repeated_call_is_idempotent_no_duplicate_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(db_session, candidate_id=candidate.id, job_id=job.id)

    # First call.
    code1, payload1 = await _link(client, headers, app.id)
    assert code1 == 200
    assert payload1["created"] is True

    # Second call — must not create a second pipeline entry.
    code2, payload2 = await _link(client, headers, app.id)
    assert code2 == 200
    assert payload2["created"] is False
    assert payload2["application_status"] == "linked_to_pipeline"

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert count == 1


async def test_application_status_is_linked_to_pipeline_after_success(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(db_session, candidate_id=candidate.id, job_id=job.id)

    await _link(client, headers, app.id)

    await db_session.refresh(app)
    assert app.status == "linked_to_pipeline"


async def test_pipeline_event_recorded(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(db_session, candidate_id=candidate.id, job_id=job.id)

    await _link(client, headers, app.id)

    event = await db_session.scalar(
        sa.select(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate.id,
            CandidateJobPipelineEventModel.job_id == job.id,
            CandidateJobPipelineEventModel.event_type == "application_linked",
        )
    )
    assert event is not None
    assert event.to_stage == "entry"


async def test_unknown_application_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _recruiter(client, db_session)
    code, _ = await _link(client, headers, uuid4())
    assert code == 404


async def test_link_does_not_advance_candidate_stage(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Pipeline entry must start at 'entry', never at a later stage."""
    headers, actor_id = await _recruiter(client, db_session)
    candidate = await _candidate(db_session, actor_id)
    job = await _job(db_session, actor_id)
    app = await _application(db_session, candidate_id=candidate.id, job_id=job.id)

    await _link(client, headers, app.id)

    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
        )
    )
    assert pipeline is not None
    assert pipeline.pipeline_stage == "entry"
    # Not rejected, not hired, not at any advanced stage.
    assert pipeline.pipeline_stage not in (
        "screening", "hr_interview", "technical_interview",
        "final", "offer", "hired", "pre_admission", "protheus", "admitted", "rejected",
    )
