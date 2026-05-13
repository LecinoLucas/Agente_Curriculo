from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assessment_service import AssessmentService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.repositories.sqlalchemy_assessment_repository import (
    SQLAlchemyAssessmentRepository,
)
from tests.integration.helpers import _auth_headers, _create_active_user


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = "recruiter.assessment@example.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    return await _auth_headers(client, email, "password123")


@pytest.mark.asyncio
async def test_job_assessment_crud_and_duplicate_block(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id = str(published_job.id)
    template_response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Teste para vaga",
            "type": "behavioral_test",
            "status": "active",
            "questions": [
                {
                    "question_text": "Como você lida com pressão?",
                    "question_type": "single_choice",
                    "required": True,
                    "order_index": 1,
                    "options": [
                        {"option_text": "Com planejamento", "order_index": 1},
                        {"option_text": "Com apoio da equipe", "order_index": 2},
                    ],
                }
            ],
        },
    )
    assert template_response.status_code == status.HTTP_201_CREATED
    template_id = template_response.json()["id"]

    attach_response = await client.post(
        f"/api/v1/jobs/{job_id}/assessments",
        headers=headers,
        json={"template_id": template_id, "required": True, "order_index": 1},
    )
    assert attach_response.status_code == status.HTTP_201_CREATED
    job_assessment_id = attach_response.json()["id"]

    duplicate_response = await client.post(
        f"/api/v1/jobs/{job_id}/assessments",
        headers=headers,
        json={"template_id": template_id, "required": True, "order_index": 2},
    )
    assert duplicate_response.status_code == status.HTTP_409_CONFLICT

    list_response = await client.get(
        f"/api/v1/jobs/{job_id}/assessments",
        headers=headers,
    )
    assert list_response.status_code == status.HTTP_200_OK
    assert len(list_response.json()) == 1

    update_response = await client.patch(
        f"/api/v1/jobs/{job_id}/assessments/{job_assessment_id}",
        headers=headers,
        json={"required": False, "order_index": 3},
    )
    assert update_response.status_code == status.HTTP_200_OK
    assert update_response.json()["required"] is False
    assert update_response.json()["order_index"] == 3

    delete_response = await client.delete(
        f"/api/v1/jobs/{job_id}/assessments/{job_assessment_id}",
        headers=headers,
    )
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.asyncio
async def test_assignment_creation_respects_job_configuration_and_talent_pool(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id = str(published_job.id)
    template_response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Pesquisa para vaga",
            "type": "behavioral_survey",
            "status": "active",
            "questions": [
                {
                    "question_text": "Você prefere trabalho remoto?",
                    "question_type": "single_choice",
                    "required": True,
                    "order_index": 1,
                    "options": [
                        {"option_text": "Sim", "order_index": 1},
                        {"option_text": "Não", "order_index": 2},
                    ],
                }
            ],
        },
    )
    assert template_response.status_code == status.HTTP_201_CREATED
    template_id = template_response.json()["id"]

    attach_response = await client.post(
        f"/api/v1/jobs/{job_id}/assessments",
        headers=headers,
        json={"template_id": template_id, "required": True, "order_index": 1},
    )
    assert attach_response.status_code == status.HTTP_201_CREATED

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Integracao",
        email="candidate.job.assessment@example.com",
        cpf="98765432100",
        phone="11911111111",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=uuid4(),
        application_source="manual",
    )
    db_session.add(candidate)
    await db_session.commit()

    service = AssessmentService(SQLAlchemyAssessmentRepository(db_session))
    created = await service.create_assignments_for_job(
        candidate_id=candidate.id,
        job_id=UUID(job_id),
        pipeline_id=None,
    )
    assert len(created) == 1
    assert created[0]["status"] == "pending"

    talent_pool_created = await service.create_assignments_for_job(
        candidate_id=candidate.id,
        job_id=None,
        pipeline_id=None,
    )
    assert talent_pool_created == []


@pytest.mark.asyncio
async def test_attach_template_creates_assignments_for_active_pipeline_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    published_job,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id = str(published_job.id)
    user = await _create_active_user(
        db_session,
        "recruiter.attach.assessment@example.com",
        "password123",
        UserRole.RECRUITER,
    )

    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Pipeline Ativo",
        email=f"candidate.attach.{uuid4()}@example.com",
        cpf="12345678901",
        phone="11922223333",
        location_city="Sao Paulo",
        location_state="SP",
        location_country="BR",
        created_by=user.id,
        application_source="manual",
    )
    db_session.add(candidate)
    await db_session.commit()

    add_response = await client.post(
        f"/api/v1/pipeline/{candidate.id}/add-to-job",
        headers=headers,
        json={"job_id": job_id, "initial_stage": "entry"},
    )
    assert add_response.status_code == status.HTTP_200_OK

    before_attach = await client.get(
        f"/api/v1/candidates/{candidate.id}/assessments",
        headers=headers,
    )
    assert before_attach.status_code == status.HTTP_200_OK
    assert before_attach.json() == []

    template_response = await client.post(
        "/api/v1/admin/assessments/templates",
        headers=headers,
        json={
            "title": "Template para pipeline ativo",
            "type": "behavioral_test",
            "status": "active",
            "questions": [
                {
                    "question_text": "Como você toma decisões difíceis?",
                    "question_type": "single_choice",
                    "required": True,
                    "order_index": 1,
                    "options": [
                        {"option_text": "Analiso dados", "order_index": 1},
                        {"option_text": "Consulto o time", "order_index": 2},
                    ],
                }
            ],
        },
    )
    assert template_response.status_code == status.HTTP_201_CREATED
    template_id = template_response.json()["id"]

    attach_response = await client.post(
        f"/api/v1/jobs/{job_id}/assessments",
        headers=headers,
        json={"template_id": template_id, "required": True, "order_index": 1},
    )
    assert attach_response.status_code == status.HTTP_201_CREATED

    after_attach = await client.get(
        f"/api/v1/candidates/{candidate.id}/assessments",
        headers=headers,
    )
    assert after_attach.status_code == status.HTTP_200_OK
    items = after_attach.json()
    assert len(items) == 1
    assert items[0]["title"] == "Template para pipeline ativo"
    assert items[0]["status"] == "pending"
