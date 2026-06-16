from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.admission_model import (
    Admission,
    CandidateDocument,
    DocumentRequirement,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
)

from .helpers import _auth_headers, _create_active_user


async def _headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
    *,
    suffix: str,
) -> dict[str, str]:
    email = f"document-ai-{role.value}-{suffix}@example.com"
    await _create_active_user(db_session, email, "Senha123!", role)
    return await _auth_headers(client, email, "Senha123!")


async def _seed_candidate_document_analysis(
    db_session: AsyncSession,
    *,
    created_by: UUID,
    with_pipeline: bool = True,
    status: str = "processed",
) -> tuple[UUID, UUID, UUID, UUID]:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=f"Candidato Document AI {uuid4().hex[:6]}",
        email=f"doc-ai-{uuid4().hex}@example.com",
        created_by=created_by,
    )
    job = JobModel(
        id=uuid4(),
        title=f"Vaga Document AI {uuid4().hex[:6]}",
        description="Vaga para validar escopo de documentos.",
        status="published",
        created_by=created_by,
    )
    admission = Admission(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=job.id,
        status="in_progress",
    )
    requirement = DocumentRequirement(id=uuid4(), name="CPF", is_required=True)
    document = CandidateDocument(
        id=uuid4(),
        admission_id=admission.id,
        document_requirement_id=requirement.id,
        file_path="/private/admission/cpf.pdf",
        status="pending",
    )
    analysis = DocumentAIAnalysisModel(
        id=uuid4(),
        document_id=document.id,
        raw_text="Texto OCR interno",
        clean_text="Texto limpo interno",
        structured_data={"kind": "cpf"},
        confidence=0.98,
        status=status,
        model_used="document_ai_v1",
        created_at=datetime.now(UTC),
    )
    db_session.add_all([candidate, job, admission, requirement, document, analysis])
    if with_pipeline:
        db_session.add(
            CandidateJobPipelineModel(
                candidate_job_pipeline_id=uuid4(),
                candidate_id=candidate.id,
                job_id=job.id,
                relationship_status="active",
                pipeline_status="active",
                is_terminal=False,
                pipeline_stage="pre_admission",
                source="manual",
            )
        )
    await db_session.commit()
    return document.id, analysis.id, candidate.id, job.id


@pytest.mark.asyncio
async def test_admin_accesses_valid_document_ai_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(
        db_session,
        f"document-ai-admin-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, admin.email, "Senha123!")
    document_id, analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
        with_pipeline=False,
    )

    response = await client.get(f"/api/v1/document-ai/{document_id}/analysis", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == str(analysis_id)
    assert body["document_id"] == str(document_id)


@pytest.mark.asyncio
async def test_recruiter_accesses_document_ai_analysis_with_candidate_job_scope(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"document-ai-recruiter-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "Senha123!")
    document_id, _analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=recruiter.id,
        with_pipeline=True,
    )

    response = await client.get(f"/api/v1/document-ai/{document_id}/analysis", headers=headers)

    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_recruiter_cannot_access_document_ai_analysis_without_candidate_job_scope(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"document-ai-recruiter-noscope-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "Senha123!")
    document_id, _analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=recruiter.id,
        with_pipeline=False,
    )

    response = await client.get(f"/api/v1/document-ai/{document_id}/analysis", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_access_document_ai_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(
        db_session,
        f"document-ai-viewer-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    document_id, _analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
    )
    headers = await _headers(client, db_session, UserRole.VIEWER, suffix=uuid4().hex)

    response = await client.get(f"/api/v1/document-ai/{document_id}/analysis", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_candidate_user_cannot_access_staff_document_ai_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(
        db_session,
        f"document-ai-candidate-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    document_id, _analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
    )
    headers = await _headers(client, db_session, UserRole.CANDIDATE, suffix=uuid4().hex)

    response = await client.get(f"/api/v1/document-ai/{document_id}/analysis", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_document_ai_analysis_requires_authentication(client: AsyncClient) -> None:
    response = await client.get(f"/api/v1/document-ai/{uuid4()}/analysis")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_missing_document_ai_analysis_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers(client, db_session, UserRole.ADMIN, suffix=uuid4().hex)

    response = await client.get(f"/api/v1/document-ai/{uuid4()}/analysis", headers=headers)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_pre_admission_document_id_does_not_resolve_as_document_ai_candidate_document(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(
        db_session,
        f"document-ai-preadmission-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, admin.email, "Senha123!")
    _document_id, _analysis_id, candidate_id, job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
    )
    pre_admission_case = PreAdmissionCaseModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        hiring_decision_id=uuid4(),
        status="documents_pending",
        created_by=admin.id,
    )
    checklist_item = PreAdmissionChecklistItemModel(
        id=uuid4(),
        case_id=pre_admission_case.id,
        item_type="cpf",
        title="CPF",
        status="received",
    )
    pre_admission_document = PreAdmissionDocumentModel(
        id=uuid4(),
        case_id=pre_admission_case.id,
        checklist_item_id=checklist_item.id,
        candidate_id=candidate_id,
        original_filename="cpf.pdf",
        stored_filename="cpf.pdf",
        storage_key="private/pre-admission/cpf.pdf",
        mime_type="application/pdf",
        size_bytes=100,
        status="uploaded",
    )
    leaked_analysis = DocumentAIAnalysisModel(
        id=uuid4(),
        document_id=pre_admission_document.id,
        raw_text="Texto de pré-admissão que não deve vazar",
        clean_text="Texto de pré-admissão que não deve vazar",
        structured_data={"kind": "pre_admission"},
        confidence=0.90,
        status="processed",
        model_used="document_ai_v1",
        created_at=datetime.now(UTC),
    )
    db_session.add_all(
        [pre_admission_case, checklist_item, pre_admission_document, leaked_analysis]
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/document-ai/{pre_admission_document.id}/analysis",
        headers=headers,
    )

    assert response.status_code == 404
    assert "pré-admissão" not in response.text


@pytest.mark.asyncio
async def test_document_ai_history_accepts_limit_param(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET /history must accept limit query param and return results (B-04 fix)."""
    admin = await _create_active_user(
        db_session,
        f"document-ai-history-limit-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, admin.email, "Senha123!")
    document_id, analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
        with_pipeline=False,
    )

    response = await client.get(
        f"/api/v1/document-ai/{document_id}/history?limit=10",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["id"] == str(analysis_id)


@pytest.mark.asyncio
async def test_document_ai_history_offset_skips_results(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET /history with offset beyond total must return empty list (B-04 fix)."""
    admin = await _create_active_user(
        db_session,
        f"document-ai-history-offset-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, admin.email, "Senha123!")
    document_id, _first_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
        with_pipeline=False,
    )

    response = await client.get(
        f"/api/v1/document-ai/{document_id}/history?limit=10&offset=99",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json() == []


@pytest.mark.asyncio
async def test_document_ai_analysis_response_keeps_expected_contract(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(
        db_session,
        f"document-ai-contract-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, admin.email, "Senha123!")
    document_id, _analysis_id, _candidate_id, _job_id = await _seed_candidate_document_analysis(
        db_session,
        created_by=admin.id,
    )

    response = await client.get(f"/api/v1/document-ai/{document_id}/analysis", headers=headers)

    assert response.status_code == 200, response.text
    assert set(response.json()) == {
        "id",
        "document_id",
        "raw_text",
        "clean_text",
        "structured_data",
        "confidence",
        "status",
        "model_used",
        "created_at",
        "error_message",
    }
