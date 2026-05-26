"""Integration tests for ERP Protheus dry-run attempts."""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admission_package_service import AdmissionPackageService
from src.application.services.erp_integration_service import ErpIntegrationService
from src.core.settings import settings
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.database.models import (
    CandidateJobHiringDecisionModel,
    CandidateJobPipelineModel,
    CandidateJobScoreModel,
    CandidateModel,
    JobModel,
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
    UserModel,
)


async def _create_user(session: AsyncSession, role: str = "recruiter") -> UserModel:
    user = UserModel(
        id=uuid4(),
        email=f"erp-{uuid4()}@example.com",
        full_name="ERP User",
        password_hash="hash",
        role=role,
        status="active",
    )
    session.add(user)
    await session.flush()
    return user


async def _auth_headers(client: httpx.AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"recruiter-{uuid4()}@example.com"
    password = "password123"
    user = UserModel(
        id=uuid4(),
        email=email,
        full_name="Recruiter ERP",
        password_hash=hash_password(password),
        role="recruiter",
        status="active",
    )
    db_session.add(user)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_candidate(session: AsyncSession, *, cpf: str | None = "390.533.447-05") -> CandidateModel:
    user = await _create_user(session, role="candidate")
    candidate = CandidateModel(
        id=uuid4(),
        user_id=user.id,
        full_name="Candidate ERP",
        email="candidate-erp@example.com",
        phone="+5511987654321",
        cpf=cpf,
        created_by=uuid4(),
    )
    session.add(candidate)
    await session.flush()
    return candidate


async def _create_job(session: AsyncSession) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title="Backend Engineer",
        description="Job for ERP dry-run integration tests",
        status="active",
        created_by=uuid4(),
    )
    session.add(job)
    await session.flush()
    return job


async def _create_pipeline(session: AsyncSession, *, candidate_id, job_id) -> CandidateJobPipelineModel:
    pipeline = CandidateJobPipelineModel(
        candidate_job_pipeline_id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_status="active",
        pipeline_stage="offer",
        link_status="active",
        relationship_status="active",
        is_terminal=False,
    )
    session.add(pipeline)
    await session.flush()
    return pipeline


async def _create_hiring_decision(
    session: AsyncSession, *, job_id, candidate_id
) -> CandidateJobHiringDecisionModel:
    user = await _create_user(session)
    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="strong_fit",
        notes="Aprovado por decisão humana auditável.",
        decided_by=user.id,
        submitted_at=datetime.now(UTC),
    )
    session.add(decision)
    await session.flush()
    return decision


async def _create_case(
    session: AsyncSession, *, candidate_id, job_id, hiring_decision_id, start_date: date | None, salary_offer: Decimal | None
) -> PreAdmissionCaseModel:
    case = PreAdmissionCaseModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        hiring_decision_id=hiring_decision_id,
        status="ready_for_admission",
        start_date=start_date,
        salary_offer=salary_offer,
        work_model="hybrid",
    )
    session.add(case)
    await session.flush()
    return case


async def _create_checklist_item(
    session: AsyncSession, *, case_id, status: str = "approved"
) -> PreAdmissionChecklistItemModel:
    item = PreAdmissionChecklistItemModel(
        id=uuid4(),
        case_id=case_id,
        item_type="cpf",
        title="CPF",
        status=status,
        required=True,
    )
    session.add(item)
    await session.flush()
    return item


async def _create_document(
    session: AsyncSession, *, case_id, item_id, candidate_id, status: str = "approved"
) -> PreAdmissionDocumentModel:
    document = PreAdmissionDocumentModel(
        id=uuid4(),
        case_id=case_id,
        checklist_item_id=item_id,
        candidate_id=candidate_id,
        original_filename="cpf.pdf",
        stored_filename="cpf-1.pdf",
        storage_key=f"{candidate_id}/{case_id}/{item_id}/cpf-1.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        status=status,
        uploaded_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(document)
    await session.flush()
    return document


async def _prepare_package(
    session: AsyncSession,
    *,
    candidate_cpf: str | None = "390.533.447-05",
    case_start_date: date | None = date(2026, 6, 1),
    case_salary_offer: Decimal | None = Decimal("8500.00"),
    with_approved_document: bool = True,
):
    candidate = await _create_candidate(session, cpf=candidate_cpf)
    job = await _create_job(session)
    pipeline = await _create_pipeline(session, candidate_id=candidate.id, job_id=job.id)
    decision = await _create_hiring_decision(session, job_id=job.id, candidate_id=candidate.id)
    case = await _create_case(
        session,
        candidate_id=candidate.id,
        job_id=job.id,
        hiring_decision_id=decision.id,
        start_date=case_start_date,
        salary_offer=case_salary_offer,
    )
    item = await _create_checklist_item(session, case_id=case.id, status="approved")
    if with_approved_document:
        await _create_document(
            session,
            case_id=case.id,
            item_id=item.id,
            candidate_id=candidate.id,
            status="approved",
        )
    package_service = AdmissionPackageService(session)
    package = await package_service.create_package(case.id, user_id=None)
    package = await package_service.approve_package(package.id, user_id=None)
    return {
        "candidate": candidate,
        "job": job,
        "pipeline": pipeline,
        "decision": decision,
        "case": case,
        "package": package,
    }


@pytest.mark.asyncio
async def test_blocks_dry_run_if_package_not_approved(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    data["package"].status = "ready_for_review"
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    assert resp.status_code == 422
    assert "approved_for_export" in resp.text


@pytest.mark.asyncio
async def test_protheus_capabilities_default_blocks_real_send(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "ERP_INTEGRATION_MODE", "dry_run")
    monkeypatch.setattr(settings, "PROTHEUS_REAL_SEND_ENABLED", False)
    monkeypatch.setattr(settings, "ERP_ALLOW_REAL_SEND", False)
    monkeypatch.setattr(settings, "PROTHEUS_BASE_URL", "")

    headers = await _auth_headers(client, db_session)

    resp = await client.get(
        "/api/v1/admission-packages/erp/protheus/capabilities",
        headers=headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["environment"] == "development"
    assert body["integration_mode"] == "dry_run"
    assert body["dry_run"]["available"] is True
    assert body["simulation"]["available"] is True
    assert body["mock"]["available"] is False
    assert body["real_send"]["available"] is False
    assert "PROTHEUS_REAL_SEND_ENABLED" in body["real_send"]["blocking_flags"]
    assert "ERP_ALLOW_REAL_SEND" in body["real_send"]["blocking_flags"]
    assert "PROTHEUS_BASE_URL" in body["real_send"]["missing_configuration"]


@pytest.mark.asyncio
async def test_protheus_capabilities_reports_mock_mode(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ERP_INTEGRATION_MODE", "mock")
    headers = await _auth_headers(client, db_session)

    resp = await client.get(
        "/api/v1/admission-packages/erp/protheus/capabilities",
        headers=headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["integration_mode"] == "mock"
    assert body["dry_run"]["available"] is True
    assert body["mock"]["available"] is True


@pytest.mark.asyncio
async def test_protheus_capabilities_allows_real_send_only_when_fully_configured(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "APP_ENV", "staging")
    monkeypatch.setattr(settings, "PROTHEUS_REAL_SEND_ENABLED", True)
    monkeypatch.setattr(settings, "ERP_ALLOW_REAL_SEND", True)
    monkeypatch.setattr(settings, "PROTHEUS_BASE_URL", "https://homolog.protheus.test")
    monkeypatch.setattr(settings, "PROTHEUS_AUTH_MODE", "basic")
    monkeypatch.setattr(settings, "PROTHEUS_USERNAME", "homolog-user")
    monkeypatch.setattr(settings, "PROTHEUS_PASSWORD", "homolog-pass")
    headers = await _auth_headers(client, db_session)

    resp = await client.get(
        "/api/v1/admission-packages/erp/protheus/capabilities",
        headers=headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["real_send"]["available"] is True
    assert body["real_send"]["disabled_reason"] is None
    assert body["real_send"]["missing_configuration"] == []
    assert body["real_send"]["blocking_flags"] == []


@pytest.mark.asyncio
async def test_creates_dry_run_attempt_for_approved_package(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    assert resp.status_code == 201
    payload = resp.json()
    assert payload["provider"] == "protheus"
    assert payload["mode"] == "dry_run"
    assert payload["status"] == "ready"
    assert payload["request_payload_json"]["candidate"]["name"] == "Candidate ERP"


@pytest.mark.asyncio
async def test_validation_failed_when_missing_cpf(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session, candidate_cpf=None)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "validation_failed"
    assert body["validation_errors_json"] is not None
    assert any(err["field"] == "candidate.cpf" for err in body["validation_errors_json"])


@pytest.mark.asyncio
async def test_status_ready_when_payload_valid(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "ready"


@pytest.mark.asyncio
async def test_simulate_moves_attempt_to_simulated_and_stores_mock_response(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    create_resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    attempt_id = create_resp.json()["id"]
    await db_session.commit()

    simulate_resp = await client.post(
        f"/api/v1/erp-integration-attempts/{attempt_id}/simulate",
        headers=headers,
    )
    assert simulate_resp.status_code == 200
    body = simulate_resp.json()
    assert body["status"] == "simulated"
    assert body["response_payload_json"] is not None
    assert body["response_payload_json"]["success"] is True
    assert body["response_payload_json"]["external_reference"].startswith("DRY-RUN-")


@pytest.mark.asyncio
async def test_simulate_does_not_call_external_api(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    create_resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    attempt_id = create_resp.json()["id"]
    await db_session.commit()

    service = ErpIntegrationService(db_session)
    with patch("socket.create_connection", autospec=True) as mocked_connection:
        attempt = await service.simulate_attempt(attempt_id=UUID(attempt_id), user_id=None)
        assert attempt.status == "simulated"
        mocked_connection.assert_not_called()


@pytest.mark.asyncio
async def test_registers_request_payload_and_events(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    create_resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    attempt_id = create_resp.json()["id"]
    await db_session.commit()

    detail_resp = await client.get(
        f"/api/v1/erp-integration-attempts/{attempt_id}",
        headers=headers,
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["request_payload_json"]["provider"] == "protheus"
    assert detail["request_payload_json"]["mode"] == "dry_run"

    await client.post(
        f"/api/v1/erp-integration-attempts/{attempt_id}/simulate",
        headers=headers,
    )

    events_stmt = (
        sa.select(PreAdmissionEventModel)
        .where(PreAdmissionEventModel.case_id == data["case"].id)
        .order_by(PreAdmissionEventModel.created_at.asc(), PreAdmissionEventModel.id.asc())
    )
    events = list((await db_session.scalars(events_stmt)).all())
    event_types = [event.event_type for event in events]
    assert "erp_dry_run_attempt_created" in event_types
    assert "erp_dry_run_simulated" in event_types


@pytest.mark.asyncio
async def test_lists_attempts_for_package(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/admission-packages/{data['package'].id}/erp/attempts",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "attempts" in body
    assert len(body["attempts"]) == 2


@pytest.mark.asyncio
async def test_dry_run_does_not_change_pipeline_or_score_or_hiring_decision(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    before_pipeline_stage = data["pipeline"].pipeline_stage
    before_pipeline_status = data["pipeline"].pipeline_status
    before_decision_status = data["decision"].decision_status
    before_decision_outcome = data["decision"].decision_outcome
    before_score_count = await db_session.scalar(sa.select(sa.func.count()).select_from(CandidateJobScoreModel))

    create_resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/dry-run",
        headers=headers,
    )
    attempt_id = create_resp.json()["id"]
    await client.post(
        f"/api/v1/erp-integration-attempts/{attempt_id}/simulate",
        headers=headers,
    )
    await db_session.commit()

    await db_session.refresh(data["pipeline"])
    await db_session.refresh(data["decision"])
    after_score_count = await db_session.scalar(sa.select(sa.func.count()).select_from(CandidateJobScoreModel))

    assert data["pipeline"].pipeline_stage == before_pipeline_stage
    assert data["pipeline"].pipeline_status == before_pipeline_status
    assert data["decision"].decision_status == before_decision_status
    assert data["decision"].decision_outcome == before_decision_outcome
    assert after_score_count == before_score_count
