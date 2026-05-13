from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import (
    PORTAL_SESSION_PURPOSE,
)
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.assessment_model import (
    AssessmentOptionModel,
    AssessmentQuestionModel,
    AssessmentTemplateModel,
    CandidateAssessmentAnswerModel,
    CandidateAssessmentAssignmentModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_auth_token_model import (
    CandidateAuthTokenModel,
)
from tests.integration.helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = "admin.assessment@example.com"
    await _create_active_user(db_session, email, "password123", UserRole.ADMIN)
    return await _auth_headers(client, email, "password123")


@pytest.mark.asyncio
async def test_admin_cannot_create_active_template_without_questions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Template inválido",
            "type": "behavioral_test",
            "status": "active",
            "questions": [],
        },
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "pelo menos uma pergunta" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_creates_template_lists_with_filters_and_archives(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)

    create_response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Teste de Fit",
            "description": "Template de teste",
            "type": "behavioral_test",
            "status": "active",
            "questions": [
                {
                    "question_text": "Como você toma decisões?",
                    "question_type": "single_choice",
                    "required": True,
                    "order_index": 1,
                    "options": [
                        {"option_text": "Analiso dados", "order_index": 1},
                        {"option_text": "Peço apoio da equipe", "order_index": 2},
                    ],
                }
            ],
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED
    template_id = create_response.json()["id"]

    filtered_response = await client.get(
        "/api/v1/admin/assessments/templates?type=behavioral_test&status=active",
        headers=headers,
    )
    assert filtered_response.status_code == status.HTTP_200_OK
    assert any(item["id"] == template_id for item in filtered_response.json())

    detail_response = await client.get(
        f"/api/v1/admin/assessments/templates/{template_id}",
        headers=headers,
    )
    assert detail_response.status_code == status.HTTP_200_OK
    assert detail_response.json()["question_count"] == 1

    archive_response = await client.post(
        f"/api/v1/admin/assessments/templates/{template_id}/archive",
        headers=headers,
    )
    assert archive_response.status_code == status.HTTP_200_OK
    assert archive_response.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_admin_blocks_invalid_question_payload_and_supports_question_crud(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    template_response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Pesquisa base",
            "type": "behavioral_survey",
            "status": "draft",
            "questions": [],
        },
    )
    assert template_response.status_code == status.HTTP_201_CREATED
    template_id = template_response.json()["id"]

    invalid_response = await client.post(
        f"/api/v1/admin/assessments/templates/{template_id}/questions",
        headers=headers,
        json={
            "question_text": "Escolha uma alternativa",
            "question_type": "single_choice",
            "required": True,
            "order_index": 1,
            "options": [{"option_text": "Única", "order_index": 1}],
        },
    )
    assert invalid_response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "duas opções" in invalid_response.json()["detail"]

    create_question_response = await client.post(
        f"/api/v1/admin/assessments/templates/{template_id}/questions",
        headers=headers,
        json={
            "question_text": "Como você organiza seu dia?",
            "question_type": "multiple_choice",
            "required": True,
            "order_index": 1,
            "options": [
                {"option_text": "Planejo por blocos", "order_index": 1},
                {"option_text": "Defino prioridades no início", "order_index": 2},
            ],
        },
    )
    assert create_question_response.status_code == status.HTTP_201_CREATED
    question_id = create_question_response.json()["id"]
    option_id = create_question_response.json()["options"][0]["id"]

    update_question_response = await client.patch(
        f"/api/v1/admin/assessments/questions/{question_id}",
        headers=headers,
        json={
            "question_text": "Como você estrutura seu dia?",
            "required": False,
            "order_index": 7,
        },
    )
    assert update_question_response.status_code == status.HTTP_200_OK
    assert update_question_response.json()["question_text"] == "Como você estrutura seu dia?"
    assert update_question_response.json()["required"] is False
    assert update_question_response.json()["order_index"] == 7

    update_option_response = await client.patch(
        f"/api/v1/admin/assessments/options/{option_id}",
        headers=headers,
        json={"option_text": "Planejo a semana por blocos", "order_index": 5},
    )
    assert update_option_response.status_code == status.HTTP_200_OK
    assert update_option_response.json()["option_text"] == "Planejo a semana por blocos"
    assert update_option_response.json()["order_index"] == 5

    delete_option_response = await client.delete(
        f"/api/v1/admin/assessments/options/{option_id}",
        headers=headers,
    )
    assert delete_option_response.status_code == status.HTTP_204_NO_CONTENT

    delete_question_response = await client.delete(
        f"/api/v1/admin/assessments/questions/{question_id}",
        headers=headers,
    )
    assert delete_question_response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.asyncio
async def test_template_question_delete_is_blocked_for_active_used_template(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    template = AssessmentTemplateModel(
        id=uuid4(),
        title="Template usado",
        type="behavioral_test",
        status="active",
        version=1,
    )
    question = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Pergunta",
        question_type="single_choice",
        required=True,
        order_index=1,
    )
    option_1 = AssessmentOptionModel(
        id=uuid4(),
        question_id=question.id,
        option_text="A",
        order_index=1,
    )
    option_2 = AssessmentOptionModel(
        id=uuid4(),
        question_id=question.id,
        option_text="B",
        order_index=2,
    )
    db_session.add_all([template, question, option_1, option_2])
    await db_session.commit()

    # Link template to a job and force one assignment via API flow can be heavy; simulate by create candidate assignment row.
    from src.infrastructure.database.models.assessment_model import CandidateAssessmentAssignmentModel
    from src.infrastructure.database.models.candidate_model import CandidateModel

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato teste",
        email="candidate-assessment-used@example.com",
        cpf="52998224725",
        phone="11999999999",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=uuid4(),
        application_source="manual",
    )
    db_session.add(candidate)
    await db_session.flush()
    db_session.add(
        CandidateAssessmentAssignmentModel(
            id=uuid4(),
            candidate_id=candidate.id,
            job_id=None,
            pipeline_id=None,
            template_id=template.id,
            status="completed",
        )
    )
    await db_session.commit()

    response = await client.delete(
        f"/api/v1/admin/assessments/questions/{question.id}",
        headers=headers,
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "template ativo já utilizado" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_duplicates_template_with_questions_and_options(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    create_response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Teste original",
            "description": "Template base",
            "type": "behavioral_test",
            "status": "draft",
            "questions": [
                {
                    "question_text": "Como você prefere receber feedback?",
                    "question_type": "single_choice",
                    "required": True,
                    "order_index": 1,
                    "options": [
                        {"option_text": "Direto", "order_index": 1},
                        {"option_text": "Com contexto", "order_index": 2},
                    ],
                }
            ],
        },
    )
    assert create_response.status_code == status.HTTP_201_CREATED

    duplicate_response = await client.post(
        f"/api/v1/admin/assessments/templates/{create_response.json()['id']}/duplicate",
        headers=headers,
        json={"title": "Teste original v2", "status": "draft"},
    )
    assert duplicate_response.status_code == status.HTTP_200_OK
    duplicate_id = duplicate_response.json()["id"]
    assert duplicate_id != create_response.json()["id"]
    assert duplicate_response.json()["title"] == "Teste original v2"
    assert duplicate_response.json()["status"] == "draft"
    assert duplicate_response.json()["version"] == 2

    detail_response = await client.get(
        f"/api/v1/admin/assessments/templates/{duplicate_id}",
        headers=headers,
    )
    assert detail_response.status_code == status.HTTP_200_OK
    payload = detail_response.json()
    assert payload["question_count"] == 1
    assert payload["questions"][0]["question_text"] == "Como você prefere receber feedback?"
    assert [option["option_text"] for option in payload["questions"][0]["options"]] == [
        "Direto",
        "Com contexto",
    ]


@pytest.mark.asyncio
async def test_active_used_template_blocks_structural_updates(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    template = AssessmentTemplateModel(
        id=uuid4(),
        title="Template ativo usado",
        type="behavioral_test",
        status="active",
        version=1,
    )
    question = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Pergunta bloqueada",
        question_type="single_choice",
        required=True,
        order_index=1,
    )
    option_1 = AssessmentOptionModel(id=uuid4(), question_id=question.id, option_text="A", order_index=1)
    option_2 = AssessmentOptionModel(id=uuid4(), question_id=question.id, option_text="B", order_index=2)
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato usado",
        email="candidate-used-block@example.com",
        cpf="39053344705",
        phone="11999999999",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=uuid4(),
        application_source="manual",
    )
    assignment = CandidateAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=None,
        pipeline_id=None,
        template_id=template.id,
        status="pending",
    )
    question_id = question.id
    option_id = option_1.id
    db_session.add_all([template, question, option_1, option_2, candidate, assignment])
    await db_session.commit()

    question_response = await client.patch(
        f"/api/v1/admin/assessments/questions/{question_id}",
        headers=headers,
        json={"question_text": "Tentativa de alteração"},
    )
    assert question_response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "duplique" in question_response.json()["detail"].lower()

    option_response = await client.patch(
        f"/api/v1/admin/assessments/options/{option_id}",
        headers=headers,
        json={"option_text": "Tentativa"},
    )
    assert option_response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "duplique" in option_response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_archiving_used_template_keeps_historical_answers_accessible(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    template = AssessmentTemplateModel(
        id=uuid4(),
        title="Template com histórico",
        type="behavioral_survey",
        status="active",
        version=1,
    )
    question = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Resposta histórica",
        question_type="text",
        required=True,
        order_index=1,
    )
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato histórico",
        email="candidate-history-assessment@example.com",
        cpf="30676851060",
        phone="11988887777",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=uuid4(),
        application_source="manual",
    )
    assignment = CandidateAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=None,
        pipeline_id=None,
        template_id=template.id,
        status="completed",
        completed_at=datetime.now(UTC),
    )
    answer = CandidateAssessmentAnswerModel(
        id=uuid4(),
        assignment_id=assignment.id,
        question_id=question.id,
        answer_text="Resposta preservada",
    )
    db_session.add_all([template, question, candidate, assignment, answer])
    await db_session.commit()

    archive_response = await client.post(
        f"/api/v1/admin/assessments/templates/{template.id}/archive",
        headers=headers,
    )
    assert archive_response.status_code == status.HTTP_200_OK
    assert archive_response.json()["status"] == "archived"

    history_response = await client.get(
        f"/api/v1/candidates/{candidate.id}/assessments?include_answers=true",
        headers=headers,
    )
    assert history_response.status_code == status.HTTP_200_OK
    payload = history_response.json()
    assert payload[0]["status"] == "completed"
    assert payload[0]["answers"][0]["answer_text"] == "Resposta preservada"


@pytest.mark.asyncio
async def test_assessment_submit_does_not_log_sensitive_payload(
    client: AsyncClient,
    db_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    template = AssessmentTemplateModel(
        id=uuid4(),
        title="Template privacidade",
        type="behavioral_survey",
        status="active",
        version=1,
    )
    question = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Descreva seu estilo de trabalho",
        question_type="text",
        required=True,
        order_index=1,
    )
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Sigiloso",
        email="sigilo.assessment@example.com",
        cpf="12345678909",
        phone="11912345678",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=uuid4(),
        application_source="manual",
    )
    assignment = CandidateAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=None,
        pipeline_id=None,
        template_id=template.id,
        status="pending",
    )
    token_raw = "candidate-session-secret"
    token_hash = sha256(token_raw.encode("utf-8")).hexdigest()
    session = CandidateAuthTokenModel(
        id=uuid4(),
        candidate_id=candidate.id,
        purpose=PORTAL_SESSION_PURPOSE,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )

    db_session.add_all([template, question, candidate, assignment, session])
    await db_session.commit()
    client.cookies.set("candidate_portal_token", token_raw)

    sentinel = "RESPOSTA_SIGILOSA_ABC123"
    caplog.clear()
    response = await client.post(
        f"/api/v1/public/candidate-portal/assessments/{assignment.id}/submit",
        json={
            "answers": [
                {
                    "question_id": str(question.id),
                    "answer_text": sentinel,
                }
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK
    captured = caplog.text
    assert sentinel not in captured
    assert candidate.email not in captured
    assert candidate.cpf not in captured
    assert candidate.phone not in captured
    assert candidate.full_name not in captured
    assert token_raw not in captured


@pytest.mark.asyncio
async def test_candidate_submit_supports_single_multiple_scale_and_text(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    template = AssessmentTemplateModel(
        id=uuid4(),
        title="Template multiformato",
        type="behavioral_test",
        status="active",
        version=1,
    )
    q_single = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Escolha uma opção",
        question_type="single_choice",
        required=True,
        order_index=1,
    )
    q_multiple = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Escolha múltiplas opções",
        question_type="multiple_choice",
        required=True,
        order_index=2,
    )
    q_scale = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Avalie de 1 a 5",
        question_type="scale",
        required=True,
        order_index=3,
        metadata_payload={"min": 1, "max": 5},
    )
    q_text = AssessmentQuestionModel(
        id=uuid4(),
        template_id=template.id,
        question_text="Resposta textual",
        question_type="text",
        required=True,
        order_index=4,
    )
    single_option_a = AssessmentOptionModel(
        id=uuid4(),
        question_id=q_single.id,
        option_text="A",
        order_index=1,
    )
    single_option_b = AssessmentOptionModel(
        id=uuid4(),
        question_id=q_single.id,
        option_text="B",
        order_index=2,
    )
    multiple_option_a = AssessmentOptionModel(
        id=uuid4(),
        question_id=q_multiple.id,
        option_text="M1",
        order_index=1,
    )
    multiple_option_b = AssessmentOptionModel(
        id=uuid4(),
        question_id=q_multiple.id,
        option_text="M2",
        order_index=2,
    )

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Tipos",
        email="candidate.types.assessment@example.com",
        cpf="11122233396",
        phone="11912345678",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=uuid4(),
        application_source="manual",
    )
    assignment = CandidateAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=None,
        pipeline_id=None,
        template_id=template.id,
        status="pending",
    )
    token_raw = "candidate-session-types"
    token_hash = sha256(token_raw.encode("utf-8")).hexdigest()
    session = CandidateAuthTokenModel(
        id=uuid4(),
        candidate_id=candidate.id,
        purpose=PORTAL_SESSION_PURPOSE,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )

    db_session.add_all(
        [
            template,
            q_single,
            q_multiple,
            q_scale,
            q_text,
            single_option_a,
            single_option_b,
            multiple_option_a,
            multiple_option_b,
            candidate,
            assignment,
            session,
        ]
    )
    await db_session.commit()
    client.cookies.set("candidate_portal_token", token_raw)

    response = await client.post(
        f"/api/v1/public/candidate-portal/assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(q_single.id), "option_id": str(single_option_a.id)},
                {
                    "question_id": str(q_multiple.id),
                    "option_ids": [str(multiple_option_a.id), str(multiple_option_b.id)],
                },
                {"question_id": str(q_scale.id), "answer_value": 4},
                {"question_id": str(q_text.id), "answer_text": "Resposta detalhada do candidato."},
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["message"] == "Respostas enviadas com sucesso."

    assignment_row = await db_session.execute(
        sa.select(
            CandidateAssessmentAssignmentModel.status,
            CandidateAssessmentAssignmentModel.completed_at,
        ).where(CandidateAssessmentAssignmentModel.id == assignment.id)
    )
    assignment_state = assignment_row.mappings().first()
    assert assignment_state is not None
    assert assignment_state["status"] == "completed"
    assert assignment_state["completed_at"] is not None

    answers_count = await db_session.scalar(
        sa.select(sa.func.count(CandidateAssessmentAnswerModel.id)).where(
            CandidateAssessmentAnswerModel.assignment_id == assignment.id
        )
    )
    assert int(answers_count or 0) == 5
