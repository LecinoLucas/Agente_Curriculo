"""Integration tests for pipeline endpoints.

Coverage for:
- PATCH /pipeline/{job_id}/{candidate_id}/stage
- GET /pipeline/{job_id}/{candidate_id}/history
"""
from datetime import UTC, datetime
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
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.hiring_decision_model import (
    CandidateJobHiringDecisionModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistTemplateItemModel,
    PreAdmissionChecklistTemplateModel,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


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
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _job_payload(**overrides) -> dict:
    payload = {
        "title": "Senior Backend Engineer Position",
        "description": "Build and maintain backend APIs for production systems with high reliability and performance standards. Work with modern technologies and collaborate with cross-functional teams.",
        "requirements": "5+ years Python experience, expertise in FastAPI, PostgreSQL, Redis, Docker, Kubernetes, microservices architecture, REST API design",
        "responsibilities": "Design and implement scalable backend systems, mentor junior developers, lead technical decisions, manage production deployments, optimize database queries",
        "experience_context": "Experience with production-grade backend systems, distributed systems, high-traffic applications, CI/CD pipelines, infrastructure automation",
        "behavioral_requirements": ["Comunicação", "Autonomia", "Liderança", "Problem-solving"],
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
    publish: bool = True,
    **overrides,
) -> UUID:
    """Create a job and optionally publish it."""
    job_resp = await client.post(
        "/api/v1/jobs",
        json=_job_payload(**overrides),
        headers=headers,
    )
    assert job_resp.status_code == 201, f"Job creation failed: {job_resp.text}"
    job_id = UUID(job_resp.json()["id"])

    if publish:
        # Keep this helper deterministic for pipeline tests by avoiding publish side-effects.
        job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
        assert job is not None
        job.status = "published"
        await db_session.commit()

    return job_id


async def _create_candidate(
    client: AsyncClient,
    headers: dict[str, str],
    db_session: AsyncSession,
    full_name: str,
    email: str,
) -> UUID:
    """Create a candidate via API."""
    resp = await client.post(
        "/api/v1/candidates",
        json={"full_name": full_name, "email": email},
        headers=headers,
    )
    assert resp.status_code == 201
    return UUID(resp.json()["id"])


async def _add_candidate_to_job(
    client: AsyncClient,
    headers: dict[str, str],
    candidate_id: UUID,
    job_id: UUID,
    initial_stage: str = "entry",
) -> dict:
    """Add a candidate to a job's pipeline."""
    resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": initial_stage},
        headers=headers,
    )
    assert resp.status_code == 200
    return resp.json()


async def _submit_hire_decision(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    actor_id: UUID,
) -> CandidateJobHiringDecisionModel:
    pipeline_id = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_id=pipeline_id,
        decided_by=actor_id,
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="strong_fit",
        notes="Aprovado para pré-admissão.",
        submitted_at=datetime.now(UTC),
    )
    db_session.add(decision)
    await db_session.commit()
    return decision


async def _ensure_default_checklist_template(db_session: AsyncSession) -> PreAdmissionChecklistTemplateModel:
    existing = await db_session.scalar(
        sa.select(PreAdmissionChecklistTemplateModel).where(
            PreAdmissionChecklistTemplateModel.is_default.is_(True),
            PreAdmissionChecklistTemplateModel.is_active.is_(True),
        )
    )
    if existing is not None:
        return existing

    now = datetime.now(UTC)
    template = PreAdmissionChecklistTemplateModel(
        id=uuid4(),
        name=f"Checklist padrão pipeline {uuid4().hex[:6]}",
        description="Template padrão para testes de pipeline.",
        is_active=True,
        is_default=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(template)
    await db_session.flush()
    db_session.add(
        PreAdmissionChecklistTemplateItemModel(
            id=uuid4(),
            template_id=template.id,
            document_key="cpf",
            title="CPF",
            candidate_description="Envie o CPF.",
            is_required=True,
            accepted_file_types=["application/pdf", "image/jpeg", "image/png"],
            max_file_size_mb=10,
            display_order=0,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    await db_session.commit()
    return template


async def _disable_default_checklist_templates(db_session: AsyncSession) -> None:
    await db_session.execute(
        sa.update(PreAdmissionChecklistTemplateModel)
        .where(
            PreAdmissionChecklistTemplateModel.is_default.is_(True),
            PreAdmissionChecklistTemplateModel.is_active.is_(True),
        )
        .values(is_active=False, is_default=False, updated_at=datetime.now(UTC))
    )
    await db_session.commit()


def _board_candidate_ids(board_payload: dict) -> list[str]:
    return [
        candidate["candidate_id"]
        for column in board_payload["columns"]
        for candidate in column["candidates"]
    ]


async def _create_behavioral_template(db_session: AsyncSession) -> UUID:
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Template Pipeline {uuid4().hex[:6]}",
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
            question_text="Descreva uma situação de comunicação com o time.",
            answer_type="text",
            is_required=True,
            weight=1,
            display_order=1,
        )
    )
    await db_session.commit()
    return template.id


async def _set_job_behavioral_policy(
    db_session: AsyncSession,
    *,
    job_id: UUID,
    template_id: UUID,
    requires_ai: bool,
) -> None:
    await db_session.execute(
        sa.update(JobModel)
        .where(JobModel.id == job_id)
        .values(
            behavioral_template_id=template_id,
            requires_behavioral_assessment=True,
            requires_behavioral_ai_evaluation=requires_ai,
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH /pipeline/{job_id}/{candidate_id}/stage endpoint."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-patch-v2-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    # Create job and candidate
    job_id = await _create_job(client, headers, db_session, title="Backend Position")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Alice Johnson", f"alice-{uuid4().hex[:6]}@test.com"
    )

    # Add candidate to job
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    # Move candidate from entry to screening stage
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "screening", "notes": "Strong profile", "reason": "Good fit"},
        headers=headers,
    )

    assert move_resp.status_code == 200
    result = move_resp.json()
    assert result["stage"] == "screening"
    assert result["candidate_id"] == str(candidate_id)


@pytest.mark.asyncio
async def test_move_to_pre_admission_returns_required_action_and_case_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-pre-adm-case-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(client, headers, db_session, title="Pre Admission Case Job")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Case Candidate", f"case-{uuid4().hex[:6]}@test.com"
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="hired")
    )
    await db_session.commit()
    await _submit_hire_decision(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        actor_id=recruiter.id,
    )
    await _ensure_default_checklist_template(db_session)

    response = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "pre_admission", "notes": "", "reason": "Iniciar pré-admissão."},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["required_action"] == "open_pre_admission"
    assert payload["pre_admission_case_id"] is not None

    case_row = await db_session.scalar(
        sa.select(PreAdmissionCaseModel).where(
            PreAdmissionCaseModel.id == UUID(payload["pre_admission_case_id"])
        )
    )
    assert case_row is not None
    assert case_row.candidate_id == candidate_id
    assert case_row.job_id == job_id


@pytest.mark.asyncio
async def test_move_to_pre_admission_without_default_checklist_blocks_without_case(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-pre-adm-no-template-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(client, headers, db_session, title="Pre Admission Missing Template Job")
    candidate_id = await _create_candidate(
        client,
        headers,
        db_session,
        "Missing Template Candidate",
        f"missing-template-{uuid4().hex[:6]}@test.com",
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="hired")
    )
    await db_session.commit()
    await _submit_hire_decision(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        actor_id=recruiter.id,
    )
    await _disable_default_checklist_templates(db_session)

    response = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "pre_admission", "notes": "", "reason": "Iniciar pré-admissão."},
        headers=headers,
    )

    assert response.status_code == 409, response.text
    payload = response.json()
    assert payload == {
        "ok": False,
        "code": "DEFAULT_CHECKLIST_TEMPLATE_REQUIRED",
        "message": "Não há checklist admissional padrão ativo. Configure um checklist padrão antes de iniciar a pré-admissão.",
        "required_action": "configure_default_checklist_template",
        "pre_admission_case_id": None,
    }

    case_count = await db_session.scalar(
        sa.select(sa.func.count(PreAdmissionCaseModel.id)).where(
            PreAdmissionCaseModel.candidate_id == candidate_id,
            PreAdmissionCaseModel.job_id == job_id,
        )
    )
    assert int(case_count or 0) == 0

    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    assert pipeline.pipeline_stage == "hired"


@pytest.mark.asyncio
async def test_move_stage_outside_pre_admission_returns_null_pre_admission_case_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-pre-adm-null-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(client, headers, db_session, title="Non Pre Admission Stage Job")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Null Case Candidate", f"null-case-{uuid4().hex[:6]}@test.com"
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    response = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "screening", "notes": "", "reason": ""},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["pre_admission_case_id"] is None
    assert payload["required_action"] is None


@pytest.mark.asyncio
async def test_move_to_pre_admission_reuses_existing_case_idempotently(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-pre-adm-idem-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(client, headers, db_session, title="Pre Admission Idempotency Job")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Idempotency Candidate", f"idem-{uuid4().hex[:6]}@test.com"
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="hired")
    )
    await db_session.commit()
    await _submit_hire_decision(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        actor_id=recruiter.id,
    )
    await _ensure_default_checklist_template(db_session)

    first_response = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "pre_admission", "notes": "", "reason": "Primeira ida para pré-admissão."},
        headers=headers,
    )
    assert first_response.status_code == 200, first_response.text
    first_case_id = first_response.json()["pre_admission_case_id"]
    assert first_case_id is not None

    # Simula retry/novo avanço após retorno ao estágio anterior.
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="hired")
    )
    await db_session.commit()

    second_response = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "pre_admission", "notes": "", "reason": "Retorno para pré-admissão."},
        headers=headers,
    )
    assert second_response.status_code == 200, second_response.text
    second_case_id = second_response.json()["pre_admission_case_id"]
    assert second_case_id == first_case_id

    total_cases = await db_session.scalar(
        sa.select(sa.func.count(PreAdmissionCaseModel.id)).where(
            PreAdmissionCaseModel.candidate_id == candidate_id,
            PreAdmissionCaseModel.job_id == job_id,
        )
    )
    assert int(total_cases or 0) == 1


@pytest.mark.asyncio
async def test_get_pipeline_board_supports_safe_link_date_filters(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-board-filters-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session, title="Pipeline Date Filters Job")
    candidate_ids = [
        await _create_candidate(
            client,
            headers,
            db_session,
            full_name=f"Candidate {index}",
            email=f"candidate-filter-{index}-{uuid4().hex[:6]}@test.com",
        )
        for index in range(1, 4)
    ]
    for candidate_id in candidate_ids:
        await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    timestamps = {
        candidate_ids[0]: (
            datetime(2026, 5, 10, 9, 0, tzinfo=UTC),
            datetime(2026, 5, 15, 14, 0, tzinfo=UTC),
        ),
        candidate_ids[1]: (
            datetime(2026, 5, 20, 9, 0, tzinfo=UTC),
            datetime(2026, 5, 25, 14, 0, tzinfo=UTC),
        ),
        candidate_ids[2]: (
            datetime(2026, 6, 1, 9, 0, tzinfo=UTC),
            datetime(2026, 6, 3, 14, 0, tzinfo=UTC),
        ),
    }
    for candidate_id, (entered_at, updated_at) in timestamps.items():
        await db_session.execute(
            sa.update(CandidateJobPipelineModel)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
            )
            .values(entered_at=entered_at, updated_at=updated_at)
        )
    await db_session.commit()

    board = await client.get(f"/api/v1/pipeline/{job_id}", headers=headers)
    assert board.status_code == 200, board.text
    assert _board_candidate_ids(board.json()) == [
        str(candidate_ids[2]),
        str(candidate_ids[1]),
        str(candidate_ids[0]),
    ]

    entered_from = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={"entered_from": "2026-05-15T00:00:00+00:00"},
        headers=headers,
    )
    assert entered_from.status_code == 200, entered_from.text
    assert _board_candidate_ids(entered_from.json()) == [
        str(candidate_ids[2]),
        str(candidate_ids[1]),
    ]

    entered_to = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={"entered_to": "2026-05-20T23:59:59+00:00"},
        headers=headers,
    )
    assert entered_to.status_code == 200, entered_to.text
    assert _board_candidate_ids(entered_to.json()) == [
        str(candidate_ids[1]),
        str(candidate_ids[0]),
    ]

    updated_from = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={"updated_from": "2026-05-20T00:00:00+00:00"},
        headers=headers,
    )
    assert updated_from.status_code == 200, updated_from.text
    assert _board_candidate_ids(updated_from.json()) == [
        str(candidate_ids[2]),
        str(candidate_ids[1]),
    ]

    updated_to = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={"updated_to": "2026-05-25T23:59:59+00:00"},
        headers=headers,
    )
    assert updated_to.status_code == 200, updated_to.text
    assert _board_candidate_ids(updated_to.json()) == [
        str(candidate_ids[1]),
        str(candidate_ids[0]),
    ]

    combined = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={
            "entered_from": "2026-05-15T00:00:00+00:00",
            "updated_to": "2026-05-31T23:59:59+00:00",
        },
        headers=headers,
    )
    assert combined.status_code == 200, combined.text
    assert _board_candidate_ids(combined.json()) == [str(candidate_ids[1])]


@pytest.mark.asyncio
async def test_get_pipeline_board_rejects_invalid_date_filter_ranges(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-board-range-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(client, headers, db_session, title="Pipeline Invalid Range Job")

    invalid_entered = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={
            "entered_from": "2026-06-01T00:00:00+00:00",
            "entered_to": "2026-05-01T00:00:00+00:00",
        },
        headers=headers,
    )
    assert invalid_entered.status_code == 422, invalid_entered.text
    assert "entered_from" in invalid_entered.text

    invalid_updated = await client.get(
        f"/api/v1/pipeline/{job_id}",
        params={
            "updated_from": "2026-06-01T00:00:00+00:00",
            "updated_to": "2026-05-01T00:00:00+00:00",
        },
        headers=headers,
    )
    assert invalid_updated.status_code == 422, invalid_updated.text
    assert "updated_from" in invalid_updated.text


@pytest.mark.asyncio
async def test_hired_candidate_stays_on_pipeline_and_can_advance_to_pre_admission_protheus_and_admitted(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-post-hire-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(
        client,
        headers,
        db_session,
        title="Analista de Suporte N1",
        requires_interview=False,
        requires_scorecard=False,
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
    )
    candidate_id = await _create_candidate(
        client,
        headers,
        db_session,
        "Pedro Miguel",
        f"pedro-miguel-{uuid4().hex[:6]}@test.com",
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id)
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="offer")
    )
    await db_session.commit()

    hired = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hired", "notes": "", "reason": "Contratação aprovada."},
        headers=headers,
    )
    assert hired.status_code == 200, hired.text

    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    assert pipeline.pipeline_stage == "hired"
    assert pipeline.relationship_status == "active"
    assert pipeline.pipeline_status == "active"
    assert pipeline.is_terminal is False
    assert pipeline.terminated_at is None

    board = await client.get(f"/api/v1/pipeline/{job_id}", headers=headers)
    assert board.status_code == 200, board.text
    hired_column = next(column for column in board.json()["columns"] if column["stage"] == "hired")
    assert str(candidate_id) in {candidate["candidate_id"] for candidate in hired_column["candidates"]}

    decision = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Candidato aprovado para admissão.",
            "submit": True,
            "pipeline_action": {"enabled": False},
        },
        headers=headers,
    )
    assert decision.status_code == 201, decision.text
    await _ensure_default_checklist_template(db_session)

    pre_admission = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "pre_admission", "notes": "", "reason": "Iniciar pré-admissão."},
        headers=headers,
    )
    assert pre_admission.status_code == 200, pre_admission.text
    pre_admission_payload = pre_admission.json()
    assert pre_admission_payload["stage"] == "pre_admission"
    assert pre_admission_payload["required_action"] == "open_pre_admission"
    case_id = pre_admission_payload["pre_admission_case_id"]
    assert case_id is not None

    case_envelope = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
    )
    assert case_envelope.status_code == 200, case_envelope.text
    checklist_items = case_envelope.json()["case"]["checklist_items"]
    assert checklist_items

    for item in checklist_items:
        received_item = await client.patch(
            f"/api/v1/pre-admission/{case_id}/checklist-items/{item['id']}",
            json={"status": "received"},
            headers=headers,
        )
        assert received_item.status_code == 200, received_item.text

        updated_item = await client.patch(
            f"/api/v1/pre-admission/{case_id}/checklist-items/{item['id']}",
            json={"status": "approved"},
            headers=headers,
        )
        assert updated_item.status_code == 200, updated_item.text

    ready_case = await client.patch(
        f"/api/v1/pre-admission/{case_id}",
        json={"status": "ready_for_admission"},
        headers=headers,
    )
    assert ready_case.status_code == 200, ready_case.text

    protheus = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "protheus", "notes": "", "reason": "Enviar ao Protheus."},
        headers=headers,
    )
    assert protheus.status_code == 200, protheus.text
    assert protheus.json()["stage"] == "protheus"

    admitted = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "admitted", "notes": "", "reason": "Admissão concluída."},
        headers=headers,
    )
    assert admitted.status_code == 200, admitted.text
    assert admitted.json()["stage"] == "admitted"

    await db_session.refresh(pipeline)
    assert pipeline.pipeline_stage == "admitted"
    assert pipeline.relationship_status == "hired"
    assert pipeline.pipeline_status == "terminal"
    assert pipeline.is_terminal is True
    assert pipeline.terminated_at is not None
    synced_case = await db_session.scalar(
        sa.select(PreAdmissionCaseModel).where(PreAdmissionCaseModel.id == UUID(case_id))
    )
    assert synced_case is not None
    assert synced_case.status == "admitted"
    assert synced_case.closed_at is not None

    board = await client.get(f"/api/v1/pipeline/{job_id}", headers=headers)
    assert board.status_code == 200, board.text
    admitted_column = next(column for column in board.json()["columns"] if column["stage"] == "admitted")
    assert str(candidate_id) in {candidate["candidate_id"] for candidate in admitted_column["candidates"]}

    blocked_after_admitted = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "pre_admission", "notes": "", "reason": "Tentativa após admissão."},
        headers=headers,
    )
    assert blocked_after_admitted.status_code == 404, blocked_after_admitted.text


@pytest.mark.asyncio
async def test_patch_pipeline_stage_hired_blocks_when_behavioral_required_pending(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-hire-gate-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template_id = await _create_behavioral_template(db_session)

    job_id = await _create_job(client, headers, db_session, title="Pipeline Gate Job")
    await _set_job_behavioral_policy(
        db_session,
        job_id=job_id,
        template_id=template_id,
        requires_ai=False,
    )
    candidate_id = await _create_candidate(
        client,
        headers,
        db_session,
        "Gate Candidate",
        f"gate-{uuid4().hex[:6]}@test.com",
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="final")
    )
    await db_session.commit()

    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hired", "notes": "", "reason": ""},
        headers=headers,
    )

    assert move_resp.status_code == 409
    body = move_resp.json()
    assert body["code"] == "pipeline_transition_blocked"
    gate_codes = {g["code"] for g in body["missing_gates"]}
    assert "behavioral_assessment_pending" in gate_codes


@pytest.mark.asyncio
async def test_patch_pipeline_stage_hired_requires_behavioral_ai_when_policy_requires_it(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-hire-ai-gate-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template_id = await _create_behavioral_template(db_session)

    job_id = await _create_job(client, headers, db_session, title="Pipeline Gate AI Job")
    await _set_job_behavioral_policy(
        db_session,
        job_id=job_id,
        template_id=template_id,
        requires_ai=True,
    )
    candidate_id = await _create_candidate(
        client,
        headers,
        db_session,
        "AI Gate Candidate",
        f"ai-gate-{uuid4().hex[:6]}@test.com",
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="final")
    )
    await db_session.commit()

    now = datetime.now(UTC)
    assignment = await db_session.scalar(
        sa.select(BehavioralAssessmentAssignmentModel).where(
            BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            BehavioralAssessmentAssignmentModel.job_id == job_id,
            BehavioralAssessmentAssignmentModel.template_id == template_id,
        )
    )
    assert assignment is not None
    assignment_id = assignment.id
    assignment.status = "submitted"
    assignment.started_at = now
    assignment.submitted_at = now
    await db_session.commit()

    blocked = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hired", "notes": "", "reason": ""},
        headers=headers,
    )
    assert blocked.status_code == 409
    blocked_body = blocked.json()
    assert blocked_body["code"] == "pipeline_transition_blocked"
    blocked_codes = {g["code"] for g in blocked_body["missing_gates"]}
    assert "behavioral_ai_pending" in blocked_codes

    db_session.add(
        BehavioralAssessmentAIEvaluationModel(
            id=uuid4(),
            assignment_id=assignment_id,
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
            status="completed",
            provider="test",
            model="test-model",
            prompt_version=1,
            completed_at=now,
        )
    )
    await db_session.commit()

    allowed = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hired", "notes": "", "reason": ""},
        headers=headers,
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["stage"] == "hired"


@pytest.mark.asyncio
async def test_schedule_pipeline_technical_interview_moves_candidate_to_technical_stage(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-tech-interview-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id = await _create_job(client, headers, db_session, title="Pipeline Technical Interview Job")
    candidate_id = await _create_candidate(
        client,
        headers,
        db_session,
        "Technical Interview Candidate",
        f"tech-interview-{uuid4().hex[:6]}@test.com",
    )
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="hr_interview")
    )
    await db_session.commit()

    response = await client.post(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/interviews",
        json={
            "scheduled_start": "2099-01-01T13:00:00Z",
            "scheduled_end": "2099-01-01T14:00:00Z",
            "timezone": "America/Sao_Paulo",
            "interview_format": "online",
            "interview_type": "technical",
            "title": "Entrevista técnica",
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["interview_type"] == "technical"

    entry_stage = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.pipeline_stage).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert entry_stage == "technical_interview"


@pytest.mark.asyncio
async def test_list_pipeline_jobs_filters_published_by_default(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-pipeline-jobs-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    published_job_id = await _create_job(client, headers, db_session, publish=False, title="Pipeline Published")
    paused_job_id = await _create_job(client, headers, db_session, publish=False, title="Pipeline Paused")
    closed_job_id = await _create_job(client, headers, db_session, publish=False, title="Pipeline Closed")
    draft_job_id = await _create_job(client, headers, db_session, publish=False, title="Pipeline Draft")

    jobs = (
        await db_session.execute(
            sa.select(JobModel).where(
                JobModel.id.in_([published_job_id, paused_job_id, closed_job_id, draft_job_id])
            )
        )
    ).scalars().all()
    status_by_id = {
        published_job_id: "published",
        paused_job_id: "paused",
        closed_job_id: "closed",
        draft_job_id: "draft",
    }
    for job in jobs:
        job.status = status_by_id[job.id]
    await db_session.commit()

    response = await client.get("/api/v1/pipeline/jobs", headers=headers)
    assert response.status_code == 200, response.text

    returned_ids = {item["job_id"] for item in response.json()}
    assert str(published_job_id) in returned_ids
    assert str(paused_job_id) not in returned_ids
    assert str(closed_job_id) not in returned_ids
    assert str(draft_job_id) not in returned_ids

    response_with_closed = await client.get(
        "/api/v1/pipeline/jobs?include_closed=true",
        headers=headers,
    )
    assert response_with_closed.status_code == 200, response_with_closed.text

    returned_ids_with_closed = {item["job_id"] for item in response_with_closed.json()}
    assert str(published_job_id) in returned_ids_with_closed
    assert str(paused_job_id) in returned_ids_with_closed
    assert str(closed_job_id) in returned_ids_with_closed
    assert str(draft_job_id) in returned_ids_with_closed


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_with_multiple_jobs(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Candidate cannot be active in two jobs and must transfer between jobs."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-multi-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    # Create two jobs
    job_a_id = await _create_job(client, headers, db_session, title="Backend Position A")
    job_b_id = await _create_job(client, headers, db_session, title="Backend Position B")

    # Create one candidate
    candidate_id = await _create_candidate(
        client, headers, db_session, "Bob Smith", f"bob-{uuid4().hex[:6]}@test.com"
    )

    # Add candidate to job A
    await _add_candidate_to_job(client, headers, candidate_id, job_a_id, "entry")

    # Trying to add candidate to job B while active in job A must fail
    add_b = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_b_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_b.status_code == 409
    assert "Use transferência" in add_b.json().get("detail", "")

    # Transfer candidate from A to B
    transfer = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={
            "from_job_id": str(job_a_id),
            "to_job_id": str(job_b_id),
            "reason": "Mudança de contexto",
        },
        headers=headers,
    )
    assert transfer.status_code == 200, transfer.text
    assert transfer.json()["to_job_id"] == str(job_b_id)

    # Move candidate in job B to offer
    move_b = await client.patch(
        f"/api/v1/pipeline/{job_b_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_b.status_code == 200
    assert move_b.json()["stage"] == "hr_interview"

    # Candidate is no longer in job A pipeline
    move_a = await client.patch(
        f"/api/v1/pipeline/{job_a_id}/{candidate_id}/stage",
        json={"stage": "offer", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_a.status_code == 404

    # Verify candidate appears only in job B board
    board_a = await client.get(f"/api/v1/pipeline/{job_a_id}", headers=headers)
    assert board_a.status_code == 200
    ids_a = {
        candidate["candidate_id"]
        for column in board_a.json()["columns"]
        for candidate in column["candidates"]
    }
    assert str(candidate_id) not in ids_a

    board_b = await client.get(f"/api/v1/pipeline/{job_b_id}", headers=headers)
    assert board_b.status_code == 200
    ids_b = {
        candidate["candidate_id"]
        for column in board_b.json()["columns"]
        for candidate in column["candidates"]
    }
    assert str(candidate_id) in ids_b

    active_count = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.relationship_status == "active",
            CandidateJobPipelineModel.is_terminal.is_(False),
            CandidateJobPipelineModel.terminated_at.is_(None),
        )
    )
    assert active_count == 1


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_invalid_transition(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH endpoint rejects invalid stage transitions."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-invalid-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(
        client, headers, db_session, "Charlie Brown", f"charlie-{uuid4().hex[:6]}@test.com"
    )

    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    # Try invalid stage
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "invalid_stage_xyz", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_nonexistent_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH endpoint with nonexistent candidate."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-nocandidate-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    fake_candidate_id = uuid4()

    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{fake_candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_not_in_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH endpoint when candidate is not in the job's pipeline."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-notpipe-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(
        client, headers, db_session, "David Lee", f"david-{uuid4().hex[:6]}@test.com"
    )

    # Do NOT add candidate to job
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 404


@pytest.mark.asyncio
async def test_get_candidate_pipeline_history(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET /pipeline/{job_id}/{candidate_id}/history endpoint."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-history-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session, title="History Test Job")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Eve Wilson", f"eve-{uuid4().hex[:6]}@test.com"
    )

    # Add candidate to job
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    # Move through stages to create history
    await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "First interview", "reason": "Good background"},
        headers=headers,
    )

    await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "technical_interview", "notes": "Programming test", "reason": "Interview passed"},
        headers=headers,
    )

    # Get history
    history_resp = await client.get(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/history",
        headers=headers,
    )

    assert history_resp.status_code == 200
    history = history_resp.json()

    # Check history response has required fields
    assert "candidate_id" in history
    assert "current_stage" in history
    assert history["current_stage"] == "technical_interview"
    assert "transitions" in history
    assert len(history["transitions"]) >= 2  # At least 2 transitions (entry→hr_interview, hr_interview→technical_interview)


@pytest.mark.asyncio
async def test_get_candidate_pipeline_history_nonexistent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET history endpoint with nonexistent candidate/job."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-nohistory-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    fake_candidate_id = uuid4()

    history_resp = await client.get(
        f"/api/v1/pipeline/{job_id}/{fake_candidate_id}/history",
        headers=headers,
    )
    assert history_resp.status_code == 404


@pytest.mark.asyncio
async def test_get_candidate_pipeline_history_not_in_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET history when candidate is not in the job."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-history-notpipe-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(
        client, headers, db_session, "Frank Brown", f"frank-{uuid4().hex[:6]}@test.com"
    )

    history_resp = await client.get(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/history",
        headers=headers,
    )
    assert history_resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_pipeline_stage_only_recruiter_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that only recruiters/admins can modify pipeline stages."""
    candidate_user = await _create_active_user(
        db_session,
        f"candidate-move-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate_user.email, "password123")

    recruiter = await _create_active_user(
        db_session,
        f"recruiter-perm-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    recruiter_headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, recruiter_headers, db_session, title="Permission Test Job")
    candidate_id = await _create_candidate(
        client, recruiter_headers, db_session, "Grace Lee", f"grace-{uuid4().hex[:6]}@test.com"
    )

    await _add_candidate_to_job(client, recruiter_headers, candidate_id, job_id, "entry")

    # Try to move with candidate account
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 403

    # Should work with recruiter
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=recruiter_headers,
    )
    assert move_resp.status_code == 200
