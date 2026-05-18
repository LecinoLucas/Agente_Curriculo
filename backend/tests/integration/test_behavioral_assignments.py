import io
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
    SQLAlchemyBehavioralAssignmentRepository,
)
from src.infrastructure.security.password_service import hash_password

from .helpers import _auth_headers, _create_active_user

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")


@pytest.fixture
def valid_pdf_bytes() -> bytes:
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
160
%%EOF
"""


async def _create_template(
    session: AsyncSession,
    *,
    status_value: str = "active",
) -> tuple[BehavioralAssessmentTemplateModel, dict[str, BehavioralTemplateQuestionModel]]:
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Perfil Comportamental {uuid4().hex[:6]}",
        description="Avaliação comportamental de teste",
        status=status_value,
        created_by=uuid4(),
    )
    session.add(template)
    await session.flush()
    competency = BehavioralTemplateCompetencyModel(
        id=uuid4(),
        template_id=template.id,
        name="Comunicação",
        display_order=1,
    )
    session.add(competency)
    await session.flush()
    questions = {
        "text": BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Descreva uma situação de feedback.",
            answer_type="text",
            is_required=True,
            display_order=1,
        ),
        "scale": BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="De 1 a 5, como você avalia sua comunicação?",
            answer_type="scale",
            is_required=True,
            display_order=2,
        ),
        "choice": BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Qual estilo combina mais com você?",
            answer_type="multiple_choice",
            is_required=True,
            options_json=["Direto", "Colaborativo"],
            display_order=3,
        ),
    }
    session.add_all(questions.values())
    await session.commit()
    return template, questions


async def _create_job(
    session: AsyncSession,
    *,
    template_id: UUID | None = None,
) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=f"Analista Comportamental {uuid4().hex[:6]}",
        description="Vaga publicada para testar avaliação comportamental.",
        status="published",
        created_by=uuid4(),
        location="São Paulo",
        job_area="technology",
        behavioral_template_id=template_id,
    )
    session.add(job)
    await session.commit()
    return job


async def _apply(
    client: AsyncClient,
    *,
    job_id: UUID | None,
    full_name: str = "Candidato Fase Quatro",
    cpf: str = "12345678909",
    email: str = "fase4@example.com",
    valid_pdf_bytes: bytes,
) -> dict:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": full_name,
            "cpf": cpf,
            "email": email,
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "9000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(job_id) if job_id else "",
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(valid_pdf_bytes), "application/pdf")},
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


async def _assignment_count(session: AsyncSession) -> int:
    return int(await session.scalar(sa.select(sa.func.count(BehavioralAssessmentAssignmentModel.id))) or 0)


async def _login_candidate_portal(client: AsyncClient, *, email: str, password: str = "SenhaSegura123") -> None:
    response = await client.post(
        "/api/v1/public/candidate-auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK, response.text


@pytest.mark.asyncio
async def test_public_application_without_behavioral_template_does_not_create_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    job = await _create_job(db_session)

    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)

    assert await _assignment_count(db_session) == 0


@pytest.mark.asyncio
async def test_public_application_with_active_template_creates_pending_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)

    payload = await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)

    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None
    assert assignment.candidate_id == UUID(payload["candidate_id"])
    assert assignment.job_id == job.id
    assert assignment.template_id == template.id
    assert assignment.status == "pending"


@pytest.mark.asyncio
async def test_public_application_with_template_but_behavioral_not_required_does_not_create_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, _questions = await _create_template(db_session)
    job = JobModel(
        id=uuid4(),
        title=f"Analista Sem Obrigatoriedade {uuid4().hex[:6]}",
        description="Vaga publicada sem obrigatoriedade comportamental.",
        status="published",
        created_by=uuid4(),
        location="São Paulo",
        job_area="technology",
        behavioral_template_id=template.id,
        requires_behavioral_assessment=False,
    )
    db_session.add(job)
    await db_session.commit()

    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)

    assert await _assignment_count(db_session) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("template_status", ["draft", "archived"])
async def test_public_application_with_inactive_template_does_not_create_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
    template_status: str,
) -> None:
    template, _questions = await _create_template(db_session, status_value=template_status)
    job = await _create_job(db_session, template_id=template.id)

    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)

    assert await _assignment_count(db_session) == 0


@pytest.mark.asyncio
async def test_reapplication_does_not_duplicate_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    payload = await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    candidate_id = UUID(payload["candidate_id"])
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job.id,
        )
        .values(
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=datetime.now(UTC),
            termination_reason="Teste de reaplicação",
        )
    )
    await db_session.commit()

    await _apply(
        client,
        job_id=job.id,
        cpf="12345678909",
        email="fase4@example.com",
        valid_pdf_bytes=valid_pdf_bytes,
    )

    assert await _assignment_count(db_session) == 1


@pytest.mark.asyncio
async def test_candidate_lists_only_own_assignments(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, _questions = await _create_template(db_session)
    own_job = await _create_job(db_session, template_id=template.id)
    other_job = await _create_job(db_session, template_id=template.id)
    own_payload = await _apply(client, job_id=own_job.id, valid_pdf_bytes=valid_pdf_bytes)
    other_candidate = CandidateModel(
        id=uuid4(),
        full_name="Outro Candidato",
        email="outro.behavioral@example.com",
        cpf="52998224725",
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(other_candidate)
    await db_session.flush()
    await BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session)).ensure_assignment_for_application(
        candidate_id=other_candidate.id,
        job_id=other_job.id,
        template_id=template.id,
    )

    response = await client.get("/api/v1/candidate-portal/behavioral-assessments")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert len(body) == 1
    assert body[0]["candidate_id"] == own_payload["candidate_id"]


@pytest.mark.asyncio
async def test_start_changes_pending_to_in_progress(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    response = await client.post(f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/start")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["status"] == "in_progress"
    assert body["started_at"] is not None


@pytest.mark.asyncio
async def test_save_answers_creates_and_updates_answers(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    response = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(questions["text"].id), "answer_text": "Primeira resposta"}]},
    )
    assert response.status_code == status.HTTP_200_OK
    response = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(questions["text"].id), "answer_text": "Resposta atualizada"}]},
    )

    assert response.status_code == status.HTTP_200_OK
    answer = await db_session.scalar(sa.select(BehavioralAssessmentAnswerModel))
    assert answer is not None
    assert answer.answer_text == "Resposta atualizada"
    assert int(await db_session.scalar(sa.select(sa.func.count(BehavioralAssessmentAnswerModel.id))) or 0) == 1


@pytest.mark.asyncio
async def test_submit_blocks_required_question_without_answer(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    response = await client.post(f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit")

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_submit_changes_status_to_submitted(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    response = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(questions["text"].id), "answer_text": "Texto completo"},
                {"question_id": str(questions["scale"].id), "answer_value": 4},
                {"question_id": str(questions["choice"].id), "selected_options_json": ["Direto"]},
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["status"] == "submitted"
    assert body["submitted_at"] is not None


@pytest.mark.asyncio
async def test_submitted_assignment_does_not_allow_editing(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None
    await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(questions["text"].id), "answer_text": "Texto completo"},
                {"question_id": str(questions["scale"].id), "answer_value": 4},
                {"question_id": str(questions["choice"].id), "selected_options_json": ["Direto"]},
            ]
        },
    )

    response = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(questions["text"].id), "answer_text": "Alterar"}]},
    )

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_multiple_choice_rejects_invalid_option(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    response = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(questions["choice"].id), "selected_options_json": ["Inexistente"]}]},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_scale_rejects_value_outside_default_range(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    response = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(questions["scale"].id), "answer_value": 6}]},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_recruiter_can_view_basic_behavioral_status(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    payload = await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None
    await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(questions["text"].id), "answer_text": "Resposta"}]},
    )
    await _create_active_user(db_session, "behavioral-status@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "behavioral-status@test.com", "password123")

    response = await client.get(
        f"/api/v1/jobs/{job.id}/candidates/{payload['candidate_id']}/behavioral-assessment",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["status"] == "in_progress"
    assert body["template_name"] == template.name
    assert body["answered_count"] == 1
    assert body["question_count"] == 3


@pytest.mark.asyncio
async def test_answering_behavioral_assignment_does_not_change_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    payload = await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    candidate_id = UUID(payload["candidate_id"])
    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None
    before = (
        await db_session.execute(
            sa.select(
                CandidateJobPipelineModel.pipeline_stage,
                CandidateJobPipelineModel.relationship_status,
            ).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job.id,
            )
        )
    ).one()
    before_stage = before.pipeline_stage
    before_relationship = before.relationship_status

    await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(questions["text"].id), "answer_text": "Texto completo"},
                {"question_id": str(questions["scale"].id), "answer_value": 4},
                {"question_id": str(questions["choice"].id), "selected_options_json": ["Direto"]},
            ]
        },
    )

    after = (
        await db_session.execute(
            sa.select(
                CandidateJobPipelineModel.pipeline_stage,
                CandidateJobPipelineModel.relationship_status,
            ).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job.id,
            )
        )
    ).one()
    assert after.pipeline_stage == before_stage
    assert after.relationship_status == before_relationship


@pytest.mark.asyncio
async def test_alice_behavioral_flow_assignment_portal_submit_and_decision_gate(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)

    alice_payload = await _apply(
        client,
        job_id=job.id,
        full_name="Alice Gestora",
        cpf="11144477735",
        email="alice.portal@example.com",
        valid_pdf_bytes=valid_pdf_bytes,
    )
    alice_id = UUID(alice_payload["candidate_id"])

    assignment = await db_session.scalar(
        sa.select(BehavioralAssessmentAssignmentModel).where(
            BehavioralAssessmentAssignmentModel.candidate_id == alice_id,
            BehavioralAssessmentAssignmentModel.job_id == job.id,
            BehavioralAssessmentAssignmentModel.template_id == template.id,
        )
    )
    assert assignment is not None
    assert assignment.status == "pending"

    assessments_response = await client.get("/api/v1/candidate-portal/behavioral-assessments")
    assert assessments_response.status_code == status.HTTP_200_OK
    assessments = assessments_response.json()
    assert any(item["id"] == str(assignment.id) and item["status"] == "pending" for item in assessments)

    await _create_active_user(db_session, "alice-decision@test.com", "password123", UserRole.RECRUITER)
    recruiter_headers = await _auth_headers(client, "alice-decision@test.com", "password123")

    before_summary = await client.get(
        f"/api/v1/jobs/{job.id}/candidates/{alice_id}/decision-summary",
        headers=recruiter_headers,
    )
    assert before_summary.status_code == status.HTTP_200_OK
    assert before_summary.json()["behavioral_assessment"]["assignment_status"] == "pending"

    submit_response = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(questions["text"].id), "answer_text": "Conduzi mediação entre áreas com plano de ação."},
                {"question_id": str(questions["scale"].id), "answer_value": 5},
                {"question_id": str(questions["choice"].id), "selected_options_json": ["Colaborativo"]},
            ]
        },
    )
    assert submit_response.status_code == status.HTTP_200_OK
    assert submit_response.json()["status"] == "submitted"

    after_summary = await client.get(
        f"/api/v1/jobs/{job.id}/candidates/{alice_id}/decision-summary",
        headers=recruiter_headers,
    )
    assert after_summary.status_code == status.HTTP_200_OK
    assert after_summary.json()["behavioral_assessment"]["assignment_status"] == "submitted"


@pytest.mark.asyncio
async def test_manual_pipeline_link_creates_behavioral_assignment_idempotently(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Alice Pipeline",
        email="alice.pipeline@example.com",
        cpf="86288366757",
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(candidate)
    await db_session.commit()

    await _create_active_user(db_session, "pipeline-link@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "pipeline-link@test.com", "password123")

    link_response = await client.post(
        f"/api/v1/jobs/{job.id}/candidates",
        json={"candidate_id": str(candidate.id)},
        headers=headers,
    )
    assert link_response.status_code == status.HTTP_201_CREATED

    rows = (
        await db_session.execute(
            sa.select(BehavioralAssessmentAssignmentModel).where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate.id,
                BehavioralAssessmentAssignmentModel.job_id == job.id,
                BehavioralAssessmentAssignmentModel.template_id == template.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    first_assignment = rows[0]

    ensured = await BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session)).ensure_assignment_for_application(
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
    )
    assert ensured is not None
    assert ensured.id == first_assignment.id

    rows_after = (
        await db_session.execute(
            sa.select(BehavioralAssessmentAssignmentModel).where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate.id,
                BehavioralAssessmentAssignmentModel.job_id == job.id,
                BehavioralAssessmentAssignmentModel.template_id == template.id,
            )
        )
    ).scalars().all()
    assert len(rows_after) == 1


@pytest.mark.asyncio
async def test_incomplete_candidate_can_list_and_submit_own_behavioral_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Incompleto",
        email="incompleto.behavioral@example.com",
        cpf="52998224725",
        phone=None,
        salary_expectation=None,
        lgpd_consent_at=None,
        password_hash=hash_password("SenhaSegura123"),
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(candidate)
    await db_session.commit()
    assignment = await BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session)).ensure_assignment_for_application(
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
    )
    assert assignment is not None
    await db_session.commit()

    await _login_candidate_portal(client, email=candidate.email)

    list_response = await client.get("/api/v1/candidate-portal/behavioral-assessments")
    assert list_response.status_code == status.HTTP_200_OK, list_response.text
    listed_ids = {item["id"] for item in list_response.json()}
    assert str(assignment.id) in listed_ids

    submit_response = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(questions["text"].id), "answer_text": "Resposta completa do candidato."},
                {"question_id": str(questions["scale"].id), "answer_value": 4},
                {"question_id": str(questions["choice"].id), "selected_options_json": ["Colaborativo"]},
            ]
        },
    )
    assert submit_response.status_code == status.HTTP_200_OK, submit_response.text
    assert submit_response.json()["status"] == "submitted"


@pytest.mark.asyncio
async def test_incomplete_candidate_cannot_access_other_candidate_behavioral_assignment(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    template, questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    candidate_one = CandidateModel(
        id=uuid4(),
        full_name="Candidato Incompleto A",
        email="incompleto.a@example.com",
        cpf="12345678909",
        phone=None,
        salary_expectation=None,
        lgpd_consent_at=None,
        password_hash=hash_password("SenhaSegura123"),
        created_by=SYSTEM_USER_ID,
    )
    candidate_two = CandidateModel(
        id=uuid4(),
        full_name="Candidato Incompleto B",
        email="incompleto.b@example.com",
        cpf="11144477735",
        phone=None,
        salary_expectation=None,
        lgpd_consent_at=None,
        password_hash=hash_password("SenhaSegura123"),
        created_by=SYSTEM_USER_ID,
    )
    db_session.add_all([candidate_one, candidate_two])
    await db_session.commit()
    own_assignment = await BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session)).ensure_assignment_for_application(
        candidate_id=candidate_one.id,
        job_id=job.id,
        template_id=template.id,
    )
    other_assignment = await BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session)).ensure_assignment_for_application(
        candidate_id=candidate_two.id,
        job_id=job.id,
        template_id=template.id,
    )
    assert own_assignment is not None
    assert other_assignment is not None
    await db_session.commit()

    await _login_candidate_portal(client, email=candidate_one.email)

    get_other = await client.get(f"/api/v1/candidate-portal/behavioral-assessments/{other_assignment.id}")
    assert get_other.status_code == status.HTTP_404_NOT_FOUND
    submit_other = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{other_assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(questions["text"].id), "answer_text": "Tentativa indevida"},
                {"question_id": str(questions["scale"].id), "answer_value": 3},
                {"question_id": str(questions["choice"].id), "selected_options_json": ["Direto"]},
            ]
        },
    )
    assert submit_other.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_incomplete_candidate_still_blocked_from_sensitive_candidate_portal_endpoints(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Incompleto Sensível",
        email="incompleto.sensivel@example.com",
        cpf="86288366757",
        phone=None,
        salary_expectation=None,
        lgpd_consent_at=None,
        password_hash=hash_password("SenhaSegura123"),
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(candidate)
    await db_session.commit()

    await _login_candidate_portal(client, email=candidate.email)

    response = await client.get("/api/v1/candidate-portal/pre-admission")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"]["code"] == "candidate_profile_incomplete"


@pytest.mark.asyncio
async def test_behavioral_ai_uses_assignment_for_current_job_template(
    client: AsyncClient,
    db_session: AsyncSession,
    valid_pdf_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template_old, old_questions = await _create_template(db_session)
    template_new, new_questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template_old.id)
    payload = await _apply(client, job_id=job.id, valid_pdf_bytes=valid_pdf_bytes)
    candidate_id = UUID(payload["candidate_id"])

    assignment_old = await db_session.scalar(
        sa.select(BehavioralAssessmentAssignmentModel).where(
            BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
            BehavioralAssessmentAssignmentModel.job_id == job.id,
            BehavioralAssessmentAssignmentModel.template_id == template_old.id,
        )
    )
    assert assignment_old is not None

    submit_old = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_old.id}/submit",
        json={
            "answers": [
                {"question_id": str(old_questions["text"].id), "answer_text": "Resposta antiga"},
                {"question_id": str(old_questions["scale"].id), "answer_value": 4},
                {"question_id": str(old_questions["choice"].id), "selected_options_json": ["Direto"]},
            ]
        },
    )
    assert submit_old.status_code == status.HTTP_200_OK

    db_job = await db_session.get(JobModel, job.id)
    assert db_job is not None
    db_job.behavioral_template_id = template_new.id
    await db_session.commit()
    assignment_new = await BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session)).ensure_assignment_for_application(
        candidate_id=candidate_id,
        job_id=job.id,
        template_id=template_new.id,
    )
    assert assignment_new is not None
    await db_session.commit()

    submit_new = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_new.id}/submit",
        json={
            "answers": [
                {"question_id": str(new_questions["text"].id), "answer_text": "Resposta atual"},
                {"question_id": str(new_questions["scale"].id), "answer_value": 5},
                {"question_id": str(new_questions["choice"].id), "selected_options_json": ["Colaborativo"]},
            ]
        },
    )
    assert submit_new.status_code == status.HTTP_200_OK

    class _FakeAIService:
        async def analyze(self, _request):
            return SimpleNamespace(
                content=json.dumps(
                    {
                        "confidence": "medium",
                        "summary": "Resumo operacional da avaliação.",
                        "competency_signals": [
                            {
                                "competency": "Comunicação",
                                "signal": "moderate",
                                "evidence": "Respostas consistentes.",
                                "concerns": [],
                            }
                        ],
                        "strengths": ["Clareza"],
                        "concerns": [],
                        "suggested_interview_questions": ["Pode detalhar um conflito recente?"],
                        "risk_flags": [],
                    }
                )
            )

    monkeypatch.setattr(
        "src.infrastructure.ai.factory.AIServiceFactory.create",
        lambda *_args, **_kwargs: _FakeAIService(),
    )

    await _create_active_user(db_session, "behavioral-ai-current-template@test.com", "password123", UserRole.RECRUITER)
    recruiter_headers = await _auth_headers(client, "behavioral-ai-current-template@test.com", "password123")

    eval_response = await client.post(
        f"/api/v1/jobs/{job.id}/candidates/{candidate_id}/behavioral-assessment/evaluate",
        headers=recruiter_headers,
    )
    assert eval_response.status_code == status.HTTP_202_ACCEPTED, eval_response.text

    evaluation = await db_session.scalar(
        sa.select(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.job_id == job.id,
            BehavioralAssessmentAIEvaluationModel.candidate_id == candidate_id,
        )
    )
    assert evaluation is not None
    assert evaluation.assignment_id == assignment_new.id

    get_eval_response = await client.get(
        f"/api/v1/jobs/{job.id}/candidates/{candidate_id}/behavioral-assessment/evaluation",
        headers=recruiter_headers,
    )
    assert get_eval_response.status_code == status.HTTP_200_OK, get_eval_response.text
    assert get_eval_response.json()["assignment_id"] == str(assignment_new.id)


@pytest.mark.asyncio
async def test_unique_constraint_blocks_duplicate_candidate_job_template_assignment(
    db_session: AsyncSession,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Constraint",
        email="constraint.behavioral@example.com",
        cpf="28625587887",
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(candidate)
    await db_session.commit()

    first = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
    )
    duplicate = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
    )
    db_session.add(first)
    await db_session.flush()
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_integrity_error_race_recovers_existing_assignment(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, _questions = await _create_template(db_session)
    job = await _create_job(db_session, template_id=template.id)
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Race",
        email="race.behavioral@example.com",
        cpf="24102564983",
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(candidate)
    await db_session.commit()

    repository = SQLAlchemyBehavioralAssignmentRepository(db_session)
    service = BehavioralAssignmentService(repository)
    existing = await repository.create_assignment(
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
    )
    await db_session.flush()

    original_find = repository.find_assignment
    calls = {"count": 0}

    async def fake_find_assignment(*, candidate_id: UUID, job_id: UUID, template_id: UUID):
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return await original_find(candidate_id=candidate_id, job_id=job_id, template_id=template_id)

    async def fake_create_assignment(*, candidate_id: UUID, job_id: UUID, template_id: UUID, expires_at=None):
        raise IntegrityError("INSERT", {"candidate_id": str(candidate_id)}, Exception("duplicate key"))

    monkeypatch.setattr(repository, "find_assignment", fake_find_assignment)
    monkeypatch.setattr(repository, "create_assignment", fake_create_assignment)

    recovered = await service.ensure_assignment_for_application(
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
    )

    assert recovered is not None
    assert recovered.id == existing.id
