from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole

from .helpers import _auth_headers, _create_active_user
from .test_hiring_decisions import _create_decision, _seed_candidate_job, seed_candidate_ready_for_hire


async def _staff_headers_for_role(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> dict[str, str]:
    email = f"pre-admission-checklist-{role.value}-{uuid4().hex[:8]}@example.com"
    password = "password123"
    await _create_active_user(db_session, email, password, role)
    return await _auth_headers(client, email, password)


async def _create_hire_decision(
    client: AsyncClient,
    db_session: AsyncSession,
    headers: dict[str, str],
    job_id: UUID,
    candidate_id: UUID,
) -> dict:
    await seed_candidate_ready_for_hire(db_session, job_id=job_id, candidate_id=candidate_id)
    decision_email = f"pre-admission-decision-admin-{uuid4().hex[:8]}@example.com"
    decision_password = "password123"
    await _create_active_user(db_session, decision_email, decision_password, UserRole.ADMIN)
    decision_headers = await _auth_headers(client, decision_email, decision_password)
    return await _create_decision(
        client,
        decision_headers,
        job_id,
        candidate_id,
        outcome="hire",
        reason_code="strong_fit",
        notes="Decisão humana de contratação.",
    )


async def _move_pipeline_to_hired(
    db_session: AsyncSession,
    *,
    job_id: UUID,
    candidate_id: UUID,
) -> None:
    from .test_pre_admission import _move_pipeline_to_stage

    await _move_pipeline_to_stage(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        stage="hired",
    )


async def _create_template(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    name: str = "Checklist admissional padrão",
    is_default: bool = False,
) -> dict:
    response = await client.post(
        "/api/v1/admin/pre-admission/checklists",
        headers=headers,
        json={
            "name": name,
            "description": "Checklist para fluxo de testes.",
            "is_active": True,
            "is_default": is_default,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


async def _create_template_item(
    client: AsyncClient,
    headers: dict[str, str],
    template_id: str,
    *,
    document_key: str = "cpf",
    title: str = "CPF",
    is_required: bool = True,
) -> dict:
    response = await client.post(
        f"/api/v1/admin/pre-admission/checklists/{template_id}/items",
        headers=headers,
        json={
            "document_key": document_key,
            "title": title,
            "candidate_description": f"Envie o documento {title}.",
            "is_required": is_required,
            "accepted_file_types": ["application/pdf", "image/jpeg"],
            "max_file_size_mb": 5,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


async def _create_case(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    job_id: UUID,
    candidate_id: UUID,
    checklist_template_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "salary_offer": "12000.00",
        "start_date": "2026-06-01",
        "work_model": "hibrido",
    }
    if checklist_template_id is not None:
        payload["checklist_template_id"] = checklist_template_id

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
        json=payload,
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR])
async def test_hr_admin_can_create_checklist_template(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, role)

    response = await client.post(
        "/api/v1/admin/pre-admission/checklists",
        headers=headers,
        json={"name": f"Checklist {role.value}", "description": "Template de teste", "is_active": True},
    )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["name"] == f"Checklist {role.value}"
    assert payload["is_active"] is True


@pytest.mark.asyncio
async def test_user_without_permission_cannot_create_checklist_template(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.RECRUITER)

    response = await client.post(
        "/api/v1/admin/pre-admission/checklists",
        headers=headers,
        json={"name": "Checklist proibido", "description": "Sem permissão", "is_active": True},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_creates_required_template_item(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.HR)
    template = await _create_template(client, headers)

    payload = await _create_template_item(
        client,
        headers,
        template["id"],
        document_key="rg",
        title="Documento de identidade",
        is_required=True,
    )

    assert payload["document_key"] == "rg"
    assert payload["title"] == "Documento de identidade"
    assert payload["is_required"] is True


@pytest.mark.asyncio
async def test_archives_checklist_template(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.ADMIN)
    template = await _create_template(client, headers, is_default=True)

    response = await client.post(
        f"/api/v1/admin/pre-admission/checklists/{template['id']}/archive",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["is_active"] is False
    assert payload["is_default"] is False


@pytest.mark.asyncio
async def test_duplicates_checklist_template(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.ADMIN)
    template = await _create_template(client, headers, name="Checklist original")
    await _create_template_item(client, headers, template["id"], document_key="cpf", title="CPF")

    response = await client.post(
        f"/api/v1/admin/pre-admission/checklists/{template['id']}/duplicate",
        headers=headers,
    )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["id"] != template["id"]
    assert payload["name"] == "Checklist original (Cópia)"
    assert len(payload["items"]) == 1
    assert payload["items"][0]["document_key"] == "cpf"


@pytest.mark.asyncio
async def test_create_case_copies_only_active_template_items(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.ADMIN)
    template = await _create_template(client, headers, name="Checklist CLT")
    active_item = await _create_template_item(client, headers, template["id"], document_key="cpf", title="CPF")
    removed_item = await _create_template_item(client, headers, template["id"], document_key="rg", title="RG")

    delete_response = await client.delete(
        f"/api/v1/admin/pre-admission/checklists/{template['id']}/items/{removed_item['id']}",
        headers=headers,
    )
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_hired(db_session, job_id=job_id, candidate_id=candidate_id)

    case = await _create_case(
        client,
        headers,
        job_id=job_id,
        candidate_id=candidate_id,
        checklist_template_id=template["id"],
    )

    assert case["checklist_template_id"] == template["id"]
    assert len(case["checklist_items"]) == 1
    assert case["checklist_items"][0]["template_item_id"] == active_item["id"]
    assert case["checklist_items"][0]["document_key"] == "cpf"
    assert case["checklist_items"][0]["title"] == "CPF"


@pytest.mark.asyncio
async def test_editing_template_does_not_change_existing_case_snapshot(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.ADMIN)
    template = await _create_template(client, headers, name="Checklist snapshot")
    item = await _create_template_item(client, headers, template["id"], document_key="cpf", title="CPF antigo")

    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_hired(db_session, job_id=job_id, candidate_id=candidate_id)

    created_case = await _create_case(
        client,
        headers,
        job_id=job_id,
        candidate_id=candidate_id,
        checklist_template_id=template["id"],
    )

    update_response = await client.patch(
        f"/api/v1/admin/pre-admission/checklists/{template['id']}/items/{item['id']}",
        headers=headers,
        json={"title": "CPF novo", "candidate_description": "Descrição atualizada"},
    )
    assert update_response.status_code == status.HTTP_200_OK

    get_response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        headers=headers,
    )
    assert get_response.status_code == status.HTTP_200_OK
    refreshed_case = get_response.json()["case"]

    assert created_case["checklist_items"][0]["title"] == "CPF antigo"
    assert refreshed_case["checklist_items"][0]["title"] == "CPF antigo"
    assert refreshed_case["checklist_items"][0]["candidate_description"] == "Envie o documento CPF antigo."


@pytest.mark.asyncio
async def test_case_uses_default_active_template_when_none_is_informed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _staff_headers_for_role(client, db_session, UserRole.ADMIN)
    default_template = await _create_template(client, headers, name="Checklist padrão", is_default=True)
    await _create_template_item(client, headers, default_template["id"], document_key="cpf", title="CPF")

    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _create_hire_decision(client, db_session, headers, job_id, candidate_id)
    await _move_pipeline_to_hired(db_session, job_id=job_id, candidate_id=candidate_id)

    case = await _create_case(
        client,
        headers,
        job_id=job_id,
        candidate_id=candidate_id,
    )

    assert case["checklist_template_id"] == default_template["id"]
    assert case["checklist_template_name"] == "Checklist padrão"
    assert len(case["checklist_items"]) == 1
    assert case["checklist_items"][0]["document_key"] == "cpf"
