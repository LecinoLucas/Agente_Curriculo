"""Integration tests for Pipeline Stage Gates (Fase 2).

Covers structural gate validation in PATCH /pipeline/{job_id}/{candidate_id}/stage:
- Blocking transitions when required artifacts are missing
- Allowing transitions when artifacts satisfy the gate
- Bypass for system-driven moves (interview scheduling)
- Side-effect contract on blocked transitions (no event, no auto analysis)
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.hiring_decision_model import (
    CandidateJobHiringDecisionModel,
)
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _create_active_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _job_payload(**overrides) -> dict:
    payload = {
        "title": f"Backend Pipeline Gate Job {uuid4().hex[:6]}",
        "description": (
            "Build and maintain backend APIs for production systems with high reliability."
        ),
        "requirements": "Python, FastAPI, PostgreSQL, Redis, Docker, Kubernetes",
        "responsibilities": "Design backend systems and lead technical decisions.",
        "experience_context": "Production grade distributed systems experience.",
        "behavioral_requirements": ["Comunicação", "Autonomia"],
        "job_area": "technology",
        "seniority_level": "senior",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "BRL",
        "priority": "normal",
    }
    payload.update(overrides)
    return payload


async def _create_job(
    client: AsyncClient,
    headers: dict[str, str],
    db_session: AsyncSession,
    *,
    requires_interview: bool = True,
    requires_scorecard: bool = True,
    requires_behavioral_assessment: bool = False,
    requires_behavioral_ai_evaluation: bool = False,
    requires_manager_review: bool = False,
    behavioral_template_id: UUID | None = None,
    **overrides,
) -> UUID:
    resp = await client.post("/api/v1/jobs", json=_job_payload(**overrides), headers=headers)
    assert resp.status_code == 201, resp.text
    job_id = UUID(resp.json()["id"])
    await db_session.execute(
        sa.update(JobModel)
        .where(JobModel.id == job_id)
        .values(
            status="published",
            requires_interview=requires_interview,
            requires_scorecard=requires_scorecard,
            requires_behavioral_assessment=requires_behavioral_assessment,
            requires_behavioral_ai_evaluation=requires_behavioral_ai_evaluation,
            requires_manager_review=requires_manager_review,
            behavioral_template_id=behavioral_template_id,
        )
    )
    await db_session.commit()
    return job_id


async def _create_candidate(
    client: AsyncClient,
    headers: dict[str, str],
    full_name: str,
    email: str,
) -> UUID:
    resp = await client.post(
        "/api/v1/candidates",
        json={"full_name": full_name, "email": email},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return UUID(resp.json()["id"])


async def _add_to_job(
    client: AsyncClient,
    headers: dict[str, str],
    candidate_id: UUID,
    job_id: UUID,
) -> None:
    resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": "entry"},
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


async def _add_interview(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    interview_type: str,
    status: str,
) -> InterviewScheduleModel:
    now = datetime.now(UTC)
    interview = InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        title=f"Entrevista {interview_type}",
        interview_type=interview_type,
        status=status,
        scheduled_start=now,
        scheduled_end=now + timedelta(hours=1),
    )
    db_session.add(interview)
    await db_session.commit()
    return interview


async def _add_scorecard(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    interview_id: UUID | None,
    status: str = "submitted",
    final_recommendation: str | None = "yes",
) -> InterviewScorecardModel:
    now = datetime.now(UTC)
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        interview_id=interview_id,
        status=status,
        final_recommendation=final_recommendation,
        overall_notes="Notas do scorecard.",
        submitted_at=now if status == "submitted" else None,
    )
    scorecard.items = [
        InterviewScorecardItemModel(
            id=uuid4(),
            competency_name="Comunicação",
            rating=5,
            evidence="Evidência consistente.",
            weight=Decimal("1.00"),
            display_order=1,
        )
    ]
    db_session.add(scorecard)
    await db_session.commit()
    return scorecard


async def _add_behavioral_template(db_session: AsyncSession) -> UUID:
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Template Gate {uuid4().hex[:6]}",
        description="Template para gate de pipeline.",
        status="active",
        created_by=uuid4(),
    )
    db_session.add(template)
    await db_session.flush()
    competency = BehavioralTemplateCompetencyModel(
        id=uuid4(),
        template_id=template.id,
        name="Comunicação",
        weight=1,
        display_order=1,
    )
    db_session.add(competency)
    await db_session.flush()
    db_session.add(
        BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Descreva uma situação.",
            answer_type="text",
            is_required=True,
            weight=1,
            display_order=1,
        )
    )
    await db_session.commit()
    return template.id


async def _add_behavioral_assignment(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    template_id: UUID,
    status: str,
) -> BehavioralAssessmentAssignmentModel:
    """Upsert helper: if add-to-job already auto-created an assignment for the
    same (candidate, job, template), update its status; otherwise insert.
    """
    now = datetime.now(UTC)
    existing = await db_session.scalar(
        sa.select(BehavioralAssessmentAssignmentModel).where(
            BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            BehavioralAssessmentAssignmentModel.job_id == job_id,
            BehavioralAssessmentAssignmentModel.template_id == template_id,
        )
    )
    if existing is not None:
        existing.status = status
        existing.started_at = now if status in ("in_progress", "submitted") else existing.started_at
        existing.submitted_at = now if status == "submitted" else existing.submitted_at
        await db_session.commit()
        return existing

    assignment = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template_id,
        status=status,
        assigned_at=now,
        started_at=now if status in ("in_progress", "submitted") else None,
        submitted_at=now if status == "submitted" else None,
    )
    db_session.add(assignment)
    await db_session.commit()
    return assignment


async def _add_ai_evaluation(
    db_session: AsyncSession,
    *,
    assignment: BehavioralAssessmentAssignmentModel,
    status: str,
) -> BehavioralAssessmentAIEvaluationModel:
    now = datetime.now(UTC)
    evaluation = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=assignment.candidate_id,
        job_id=assignment.job_id,
        template_id=assignment.template_id,
        status=status,
        provider="test",
        model="test-model",
        prompt_version=1,
        completed_at=now if status == "completed" else None,
    )
    db_session.add(evaluation)
    await db_session.commit()
    return evaluation


async def _add_hiring_decision(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    decision_status: str = "submitted",
    decision_outcome: str = "hire",
) -> CandidateJobHiringDecisionModel:
    now = datetime.now(UTC)
    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        decision_status=decision_status,
        decision_outcome=decision_outcome,
        reason_code="strong_fit",
        notes="Decisão final para teste de gate.",
        submitted_at=now if decision_status == "submitted" else None,
    )
    db_session.add(decision)
    await db_session.commit()
    return decision


async def _setup_recruiter(db_session: AsyncSession, client: AsyncClient) -> tuple[UUID, dict[str, str]]:
    recruiter = await _create_active_user(
        db_session,
        f"gate-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    return recruiter.id, headers


async def _setup_admin(db_session: AsyncSession, client: AsyncClient) -> tuple[UUID, dict[str, str]]:
    admin = await _create_active_user(
        db_session,
        f"gate-admin-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, admin.email, "password123")
    return admin.id, headers


# ---------------------------------------------------------------------------
# A) Final stage gates — technical interview + scorecard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_blocks_move_to_final_when_technical_interview_scheduled(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C1", f"c1-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    interview = await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )
    interview_id = interview.id

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 409, resp.text
    body = resp.json()
    assert body["code"] == "pipeline_transition_blocked"
    assert body["target_stage"] == "final"
    assert body["current_stage"] == "technical_interview"
    codes = {g["code"] for g in body["missing_gates"]}
    assert "technical_interview_not_completed" in codes
    # Action payload carries interview id for the frontend to deep-link.
    tech_gate = next(g for g in body["missing_gates"] if g["code"] == "technical_interview_not_completed")
    assert tech_gate["action"] == "open_interview"
    assert tech_gate["action_payload"]["interview_id"] == str(interview_id)
    assert body["can_force"] is False
    assert body["force_requires_reason"] is True


@pytest.mark.asyncio
async def test_blocks_move_to_final_when_technical_interview_awaiting_feedback(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C2", f"c2-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="awaiting_feedback",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 409
    body = resp.json()
    codes = {g["code"] for g in body["missing_gates"]}
    # awaiting_feedback != completed → gate must still block.
    assert "technical_interview_not_completed" in codes


@pytest.mark.asyncio
async def test_allows_move_to_final_when_technical_interview_completed_and_scorecard_submitted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C3", f"c3-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    interview = await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="completed",
    )
    await _add_scorecard(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_id=interview.id,
        status="submitted",
        final_recommendation="yes",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "ok", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["stage"] == "final"


# ---------------------------------------------------------------------------
# B) Offer stage gates — behavioral / AI / scorecard / manager decision
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_blocks_move_to_offer_when_behavioral_ai_pending(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    template_id = await _add_behavioral_template(db_session)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=False,
        requires_scorecard=False,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        behavioral_template_id=template_id,
    )
    candidate_id = await _create_candidate(client, headers, "C4", f"c4-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")
    assignment = await _add_behavioral_assignment(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template_id,
        status="submitted",
    )
    await _add_ai_evaluation(db_session, assignment=assignment, status="pending")

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "offer", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 409
    body = resp.json()
    codes = {g["code"] for g in body["missing_gates"]}
    assert "behavioral_ai_pending" in codes


@pytest.mark.asyncio
async def test_blocks_move_to_offer_when_behavioral_ai_retry_scheduled(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    template_id = await _add_behavioral_template(db_session)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=False,
        requires_scorecard=False,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        behavioral_template_id=template_id,
    )
    candidate_id = await _create_candidate(client, headers, "C5", f"c5-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")
    assignment = await _add_behavioral_assignment(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template_id,
        status="submitted",
    )
    await _add_ai_evaluation(db_session, assignment=assignment, status="retry_scheduled")

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "offer", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 409
    codes = {g["code"] for g in resp.json()["missing_gates"]}
    assert "behavioral_ai_pending" in codes


@pytest.mark.asyncio
async def test_allows_move_to_offer_when_all_offer_gates_satisfied(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    template_id = await _add_behavioral_template(db_session)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=False,
        requires_scorecard=True,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        behavioral_template_id=template_id,
    )
    candidate_id = await _create_candidate(client, headers, "C6", f"c6-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")
    assignment = await _add_behavioral_assignment(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template_id,
        status="submitted",
    )
    await _add_ai_evaluation(db_session, assignment=assignment, status="completed")
    await _add_scorecard(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_id=None,
        status="submitted",
        final_recommendation="yes",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "offer", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["stage"] == "offer"


# ---------------------------------------------------------------------------
# C) Hired stage gates — final decision
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_blocks_move_to_hired_without_submitted_hire_decision(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=False,
        requires_scorecard=False,
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
    )
    candidate_id = await _create_candidate(client, headers, "C7", f"c7-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="offer")

    # draft / advance must still block.
    await _add_hiring_decision(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        decision_status="draft",
        decision_outcome="hire",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hired", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 409
    codes = {g["code"] for g in resp.json()["missing_gates"]}
    assert "final_decision_not_submitted" in codes


@pytest.mark.asyncio
async def test_allows_move_to_hired_with_submitted_hire_decision(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=False,
        requires_scorecard=False,
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
    )
    candidate_id = await _create_candidate(client, headers, "C8", f"c8-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="offer")
    await _add_hiring_decision(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        decision_status="submitted",
        decision_outcome="hire",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hired", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["stage"] == "hired"


# ---------------------------------------------------------------------------
# D) Rejected stage gates — reason required, other gates bypassed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_allows_rejection_with_reason_even_when_other_gates_pending(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    template_id = await _add_behavioral_template(db_session)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=True,
        requires_scorecard=True,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        behavioral_template_id=template_id,
    )
    candidate_id = await _create_candidate(client, headers, "C9", f"c9-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    # No interview / scorecard / behavioral seeded — all other gates pending.

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "rejected", "notes": "", "reason": "Não compatível com a vaga"},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["stage"] == "rejected"


@pytest.mark.asyncio
async def test_blocks_rejection_without_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C10", f"c10-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "rejected", "notes": "", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 409, resp.text
    body = resp.json()
    assert body["code"] == "pipeline_transition_blocked"
    codes = {g["code"] for g in body["missing_gates"]}
    assert "disqualification_reason_required" in codes
    reason_gate = next(g for g in body["missing_gates"] if g["code"] == "disqualification_reason_required")
    assert reason_gate["action"] == "add_reason"


# ---------------------------------------------------------------------------
# Backward moves bypass gates entirely
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_backwards_move_does_not_evaluate_gates(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C11", f"c11-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="final")
    # No interview / scorecard. Forward to final would be blocked. Backward must be allowed.

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "voltando etapa", "reason": ""},
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["stage"] == "hr_interview"


# ---------------------------------------------------------------------------
# Interview scheduling auto-move bypasses gates
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_schedule_interview_auto_move_bypasses_gates(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Scheduling an interview that auto-moves the candidate to technical_interview
    must succeed even when other future-stage gates would otherwise apply."""
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C12", f"c12-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    # Candidate sits in entry — auto-move will jump to technical_interview.

    resp = await client.post(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/interviews",
        json={
            "scheduled_start": "2099-02-01T13:00:00Z",
            "scheduled_end": "2099-02-01T14:00:00Z",
            "timezone": "America/Sao_Paulo",
            "interview_format": "online",
            "interview_type": "technical",
            "title": "Entrevista técnica programada",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    stage = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.pipeline_stage).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert stage == "technical_interview"


# ---------------------------------------------------------------------------
# Blocked transitions do not persist side effects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_blocked_transition_writes_no_event_and_no_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "C13", f"c13-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    # Capture event count before. The add-to-job seed wrote a 'candidate_added' event.
    events_before = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id,
            CandidateJobPipelineEventModel.job_id == job_id,
        )
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "", "reason": ""},
        headers=headers,
    )
    assert resp.status_code == 409, resp.text
    body = resp.json()
    assert body["code"] == "pipeline_transition_blocked"
    assert "missing_gates" in body
    assert "analysis" not in body  # blocked path must not return analysis envelope

    events_after = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id,
            CandidateJobPipelineEventModel.job_id == job_id,
        )
    )
    assert events_after == events_before  # no stage_moved persisted

    stage_moved_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id,
            CandidateJobPipelineEventModel.job_id == job_id,
            CandidateJobPipelineEventModel.event_type == "stage_moved",
        )
    )
    assert stage_moved_count == 0

    stage = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.pipeline_stage).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert stage == "technical_interview"


# ---------------------------------------------------------------------------
# E) Force flow — admin override with mandatory justification (Fase 5)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_can_force_is_false_for_recruiter_when_blocked(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F1", f"f1-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "", "reason": ""},
        headers=headers,
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["can_force"] is False
    assert body["force_requires_reason"] is True


@pytest.mark.asyncio
async def test_can_force_is_true_for_admin_when_all_gates_forceable(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F2", f"f2-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "", "reason": ""},
        headers=headers,
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["can_force"] is True
    # Every blocking gate exposes forceable=True so the modal can offer "Forçar".
    assert all(gate["forceable"] is True for gate in body["missing_gates"])


@pytest.mark.asyncio
async def test_recruiter_cannot_force_even_with_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F3", f"f3-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "final",
            "notes": "",
            "reason": "",
            "force": True,
            "force_reason": "Concluído fora do sistema por autorização verbal",
        },
        headers=headers,
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_admin_force_with_short_reason_is_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F4", f"f4-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "final",
            "notes": "",
            "reason": "",
            "force": True,
            "force_reason": "curto",
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_admin_force_with_empty_reason_is_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F5", f"f5-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "final",
            "notes": "",
            "reason": "",
            "force": True,
            "force_reason": "   ",
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_admin_force_success_persists_force_metadata_and_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_id, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F6", f"f6-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="scheduled",
    )

    justification = "Entrevista concluída fora do sistema — autorização da diretoria #123"
    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "final",
            "notes": "",
            "reason": "",
            "force": True,
            "force_reason": justification,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["stage"] == "final"

    # Event was recorded with force metadata + missing_gates snapshot.
    event = await db_session.scalar(
        sa.select(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id,
            CandidateJobPipelineEventModel.job_id == job_id,
            CandidateJobPipelineEventModel.event_type == "stage_moved",
            CandidateJobPipelineEventModel.to_stage == "final",
        )
    )
    assert event is not None
    assert event.actor_id == admin_id
    meta = event.metadata_payload or {}
    assert meta.get("force") is True
    assert meta.get("force_reason") == justification
    assert "technical_interview_not_completed" in (meta.get("missing_gates") or [])

    # Append-only audit row written.
    from src.infrastructure.database.models.audit_model import AuditLogModel
    audit_row = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "pipeline.stage_forced",
            AuditLogModel.user_id == admin_id,
        )
    )
    assert audit_row is not None
    assert audit_row.metadata_["from_stage"] == "technical_interview"
    assert audit_row.metadata_["to_stage"] == "final"
    assert audit_row.metadata_["force_reason"] == justification
    assert "technical_interview_not_completed" in audit_row.metadata_["missing_gates"]


@pytest.mark.asyncio
async def test_force_does_not_bypass_terminal_stage_block(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F7", f"f7-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    # Force the entry into a terminal stage directly in the DB. The
    # ck_candidate_job_pipeline_relationship_terminal constraint requires
    # terminated_at to be set alongside is_terminal.
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(
            pipeline_stage="hired",
            relationship_status="hired",
            is_terminal=True,
            terminated_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "final",
            "notes": "",
            "reason": "",
            "force": True,
            "force_reason": "Justificativa válida e suficientemente longa",
        },
        headers=headers,
    )
    # Terminal stage is a structural rule, not a forceable gate. The active
    # entry lookup already excludes terminal entries, so the API returns 404
    # ("Candidato não está no pipeline desta vaga"). Force cannot reactivate
    # a hired/rejected entry from here.
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_force_does_not_bypass_disqualification_reason_required(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F8", f"f8-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)

    # disqualification_reason_required has forceable=False — admin force must
    # be rejected at the 422 layer (PipelineForceNotApplicableError).
    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "rejected",
            "notes": "",
            "reason": "",  # missing reason triggers the non-forceable gate
            "force": True,
            "force_reason": "Tentativa de bypass do motivo obrigatório",
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_force_true_without_pending_gates_is_422(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    # When the move would succeed on its own, force=true is meaningless — we
    # surface 422 so the UI drops the flag instead of silently accepting and
    # recording a misleading "forced" audit entry.
    _, headers = await _setup_admin(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "F9", f"f9-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)

    resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={
            "stage": "screening",
            "notes": "",
            "reason": "",
            "force": True,
            "force_reason": "Justificativa válida desnecessária",
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.text
