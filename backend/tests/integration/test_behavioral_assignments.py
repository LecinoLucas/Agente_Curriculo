import io
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.behavioral_assignment_model import (
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

from .helpers import _auth_headers, _create_active_user

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


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
    cpf: str = "12345678909",
    email: str = "fase4@example.com",
    valid_pdf_bytes: bytes,
) -> dict:
    response = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Candidato Fase Quatro",
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
