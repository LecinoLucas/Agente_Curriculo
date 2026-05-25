"""Integration tests: overview preview_pendencies matches PipelineGateEvaluator.

Validates that GET /api/v1/candidates/{id}/overview surfaces the same
blocking gates that PATCH /pipeline/{job_id}/{candidate_id}/stage evaluates,
so the "Pendências" card and the blocked-transition modal are consistent.
"""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel

from .helpers import _auth_headers, _create_active_user


# ---------------------------------------------------------------------------
# Minimal fixtures
# ---------------------------------------------------------------------------


async def _create_job(
    db_session: AsyncSession,
    created_by: UUID,
    *,
    requires_interview: bool = False,
    requires_scorecard: bool = False,
    requires_manager_review: bool = False,
    requires_behavioral_ai_evaluation: bool = False,
    requires_behavioral_assessment: bool = False,
) -> UUID:
    job = JobModel(
        id=uuid4(),
        title=f"Gate Test Job {uuid4().hex[:6]}",
        description="desc",
        requirements="none",
        responsibilities="none",
        experience_context="none",
        status="published",
        created_by=created_by,
        requires_interview=requires_interview,
        requires_scorecard=requires_scorecard,
        requires_manager_review=requires_manager_review,
        requires_behavioral_ai_evaluation=requires_behavioral_ai_evaluation,
        requires_behavioral_assessment=requires_behavioral_assessment,
    )
    db_session.add(job)
    await db_session.flush()
    return job.id


async def _create_candidate(
    client: AsyncClient,
    headers: dict[str, str],
    full_name: str,
) -> UUID:
    resp = await client.post(
        "/api/v1/candidates",
        json={"full_name": full_name, "email": f"{uuid4().hex[:8]}@test.com"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return UUID(resp.json()["id"])


async def _add_to_job(
    client: AsyncClient,
    headers: dict[str, str],
    candidate_id: UUID,
    job_id: UUID,
    stage: str = "entry",
) -> None:
    resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": stage},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text


async def _force_stage(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    stage: str,
) -> None:
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage=stage)
    )
    await db_session.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_overview_shows_no_gate_pendencies_when_no_active_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Candidate with no active pipeline → preview_pendencies is empty."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-nogates-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate_id = await _create_candidate(client, headers, "Candidato Sem Vaga")

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Without an active pipeline there are no gate pendencies (tone="block").
    # Non-gate pendencies (resume, analysis) may still appear — that is fine.
    gate_pendencies = [p for p in data["preview_pendencies"] if p.get("tone") == "block"]
    assert gate_pendencies == []


@pytest.mark.asyncio
async def test_overview_shows_no_gate_pendencies_for_entry_stage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """entry → screening has no gates; overview must not show false pendencies."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-entry-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    # Job with no gate requirements
    job_id = await _create_job(db_session, recruiter.id)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Entry")
    await _add_to_job(client, headers, candidate_id, job_id)

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # No blocking gates exist for entry→screening
    gate_pendencies = [p for p in data["preview_pendencies"] if p.get("tone") == "block"]
    assert gate_pendencies == []


@pytest.mark.asyncio
async def test_overview_shows_final_decision_pending_when_candidate_in_offer(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Candidate in offer with no hire decision → final_decision_not_submitted in overview."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-offer-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(db_session, recruiter.id)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Offer")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="offer")

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    gate_ids = [p["id"] for p in data["preview_pendencies"]]
    assert "final_decision_not_submitted" in gate_ids, (
        f"Expected final_decision_not_submitted in gate_ids, got: {gate_ids}"
    )

    gate = next(p for p in data["preview_pendencies"] if p["id"] == "final_decision_not_submitted")
    assert gate["tone"] == "block"
    assert gate["action"] == "open_decision"
    assert gate["description"] is not None


@pytest.mark.asyncio
async def test_overview_gate_pendency_removed_when_hire_decision_submitted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """After submitting a hire decision, final_decision_not_submitted must disappear."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-hire-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(db_session, recruiter.id)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Hire Decision")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="offer")

    # Insert a submitted hire decision directly
    db_session.add(
        CandidateJobHiringDecisionModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            decision_status="submitted",
            decision_outcome="hire",
            reason_code="strong_fit",
            decided_by=recruiter.id,
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    gate_ids = [p["id"] for p in data["preview_pendencies"]]
    assert "final_decision_not_submitted" not in gate_ids, (
        f"hire decision submitted should remove gate, still got: {gate_ids}"
    )


@pytest.mark.asyncio
async def test_overview_shows_manager_decision_missing_in_final_stage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Candidate in final, job requires_manager_review → manager_decision_missing in overview."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-mgr-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(db_session, recruiter.id, requires_manager_review=True)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Manager Review")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    gate_ids = [p["id"] for p in data["preview_pendencies"]]
    assert "manager_decision_missing" in gate_ids, (
        f"Expected manager_decision_missing, got: {gate_ids}"
    )
    gate = next(p for p in data["preview_pendencies"] if p["id"] == "manager_decision_missing")
    assert gate["tone"] == "block"
    assert gate["action"] == "open_decision"


@pytest.mark.asyncio
async def test_overview_manager_decision_resolved_when_advance_submitted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """manager_decision_missing clears when hiring decision submitted with outcome=advance."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-advance-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(db_session, recruiter.id, requires_manager_review=True)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Advance Decision")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")

    db_session.add(
        CandidateJobHiringDecisionModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            decision_status="submitted",
            decision_outcome="advance",
            reason_code="strong_fit",
            decided_by=recruiter.id,
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    gate_ids = [p["id"] for p in data["preview_pendencies"]]
    assert "manager_decision_missing" not in gate_ids, (
        f"advance decision should clear manager gate, still got: {gate_ids}"
    )


@pytest.mark.asyncio
async def test_overview_manager_decision_not_cleared_when_hold_submitted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Decision with outcome=hold does NOT satisfy manager_decision_missing gate."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-hold-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(db_session, recruiter.id, requires_manager_review=True)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Hold Decision")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")

    db_session.add(
        CandidateJobHiringDecisionModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            decision_status="submitted",
            decision_outcome="hold",
            reason_code="other",
            decided_by=recruiter.id,
        )
    )
    await db_session.commit()

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    gate_ids = [p["id"] for p in data["preview_pendencies"]]
    assert "manager_decision_missing" in gate_ids, (
        f"hold decision must not clear manager gate, got: {gate_ids}"
    )


@pytest.mark.asyncio
async def test_overview_shows_technical_interview_gate_in_technical_interview_stage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Candidate in technical_interview, job requires_interview → gate surfaced in overview."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-tech-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(
        db_session,
        recruiter.id,
        requires_interview=True,
        requires_scorecard=True,
    )
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Tech Interview")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        stage="technical_interview",
    )

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    gate_ids = [p["id"] for p in data["preview_pendencies"]]
    assert "technical_interview_not_completed" in gate_ids, (
        f"Expected technical_interview_not_completed, got: {gate_ids}"
    )
    gate = next(p for p in data["preview_pendencies"] if p["id"] == "technical_interview_not_completed")
    assert gate["tone"] == "block"
    assert gate["action"] == "open_interview"


@pytest.mark.asyncio
async def test_overview_gate_codes_match_pipeline_move_blocked_codes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """overview.preview_pendencies codes must equal those returned by the pipeline endpoint
    when attempting to move the same candidate to the same target stage."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-consistency-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(
        db_session,
        recruiter.id,
        requires_interview=True,
        requires_scorecard=True,
    )
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Consistency")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        stage="technical_interview",
    )

    # Get overview pendency codes
    overview_resp = await client.get(
        f"/api/v1/candidates/{candidate_id}/overview", headers=headers
    )
    assert overview_resp.status_code == 200
    overview_gate_ids = {
        p["id"]
        for p in overview_resp.json()["preview_pendencies"]
        if p.get("tone") == "block"
    }

    # Attempt pipeline move to final — must receive 409 with same codes
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final"},
        headers=headers,
    )
    assert move_resp.status_code == 409, move_resp.text
    blocked_payload = move_resp.json()
    move_gate_ids = {g["code"] for g in blocked_payload.get("missing_gates", [])}

    assert overview_gate_ids == move_gate_ids, (
        f"overview gates {overview_gate_ids!r} do not match pipeline gates {move_gate_ids!r}"
    )


@pytest.mark.asyncio
async def test_overview_does_not_show_nenhuma_pendencia_when_gates_block(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """The overview must not return an empty preview_pendencies when the gate
    evaluator finds blocking gates for the next stage."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-nonempty-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(db_session, recruiter.id, requires_manager_review=True)
    await db_session.commit()
    candidate_id = await _create_candidate(client, headers, "Candidato Nao Vazio")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")

    resp = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["preview_pendencies"], (
        "preview_pendencies must not be empty when gate evaluator finds blocks"
    )
