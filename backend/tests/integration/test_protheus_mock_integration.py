"""Integration tests for Protheus mock/homologation adapter."""

from copy import deepcopy

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.infrastructure.database.models import (
    CandidateJobHiringDecisionModel,
    CandidateJobPipelineModel,
    CandidateJobScoreModel,
    PreAdmissionEventModel,
)
from tests.integration.test_erp_dry_run import _auth_headers, _prepare_package


@pytest.fixture
def mock_mode(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "ERP_INTEGRATION_MODE", "mock")


@pytest.mark.asyncio
async def test_mock_send_creates_attempt_with_mode_mock_and_idempotency_key(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={"simulate_failure": False},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["mode"] == "mock"
    assert body["status"] == "sent"
    assert body["idempotency_key"] is not None
    assert body["idempotency_key"].startswith(f"protheus:mock:{data['package'].id}:")


@pytest.mark.asyncio
async def test_mock_send_uses_snapshot_payload_not_live_data(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    package_before = deepcopy(data["package"].payload_json)

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    assert resp.status_code == 201
    sent_payload = resp.json()["request_payload_json"]
    assert sent_payload["schema_version"] == "protheus_admission_payload_v1"
    assert sent_payload["candidate"]["name"] == package_before["candidate"]["full_name"]
    await db_session.refresh(data["package"])
    assert data["package"].payload_json == package_before


@pytest.mark.asyncio
async def test_duplicate_idempotency_returns_existing_attempt(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    first = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    second = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    attempts = await client.get(
        f"/api/v1/admission-packages/{data['package'].id}/erp/attempts",
        headers=headers,
    )
    assert attempts.status_code == 200
    assert len(attempts.json()["attempts"]) == 1


@pytest.mark.asyncio
async def test_mock_failure_saves_failed_and_retry_works(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    failed_resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={"simulate_failure": True},
    )
    assert failed_resp.status_code == 201
    failed = failed_resp.json()
    assert failed["status"] == "failed"
    assert failed["response_payload_json"]["success"] is False
    assert failed["response_payload_json"]["error"]["code"] == "PROTHEUS_MOCK_VALIDATION_ERROR"

    retry_resp = await client.post(
        f"/api/v1/erp-integration-attempts/{failed['id']}/retry",
        headers=headers,
        json={"simulate_failure": False},
    )
    assert retry_resp.status_code == 200
    retried = retry_resp.json()
    assert retried["status"] == "sent"
    assert retried["attempt_number"] == 2
    assert retried["external_reference"].startswith("PROTHEUS-MOCK-")


@pytest.mark.asyncio
async def test_request_response_headers_are_saved_without_secrets(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["request_headers_json"] is not None
    assert body["response_headers_json"] is not None
    serialized = str(body["request_headers_json"]).lower() + str(body["response_headers_json"]).lower()
    assert "authorization" not in serialized
    assert "token" not in serialized
    assert "password" not in serialized


@pytest.mark.asyncio
async def test_mode_real_is_blocked(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ERP_INTEGRATION_MODE", "real")
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    assert resp.status_code == 422
    assert "mode=real bloqueado" in resp.text


@pytest.mark.asyncio
async def test_mock_send_registers_events_and_persists_request_response(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    assert resp.status_code == 201
    attempt = resp.json()
    assert attempt["request_payload_json"]["schema_version"] == "protheus_admission_payload_v1"
    assert attempt["response_payload_json"]["success"] is True

    events_stmt = (
        sa.select(PreAdmissionEventModel)
        .where(PreAdmissionEventModel.case_id == data["case"].id)
        .order_by(PreAdmissionEventModel.created_at.asc(), PreAdmissionEventModel.id.asc())
    )
    events = list((await db_session.scalars(events_stmt)).all())
    event_types = [event.event_type for event in events]
    assert "erp_export_requested" in event_types
    assert "erp_export_started" in event_types
    assert "erp_export_succeeded" in event_types


@pytest.mark.asyncio
async def test_mock_send_does_not_change_pipeline_ranking_score_or_hiring_decision(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    mock_mode,
) -> None:
    headers = await _auth_headers(client, db_session)
    data = await _prepare_package(db_session)
    await db_session.commit()

    before_pipeline_stage = data["pipeline"].pipeline_stage
    before_pipeline_status = data["pipeline"].pipeline_status
    before_decision_status = data["decision"].decision_status
    before_decision_outcome = data["decision"].decision_outcome
    before_score_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobScoreModel)
    )

    resp = await client.post(
        f"/api/v1/admission-packages/{data['package'].id}/erp/protheus/mock-send",
        headers=headers,
        json={},
    )
    assert resp.status_code == 201
    await db_session.commit()

    await db_session.refresh(data["pipeline"])
    await db_session.refresh(data["decision"])
    after_score_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobScoreModel)
    )
    assert data["pipeline"].pipeline_stage == before_pipeline_stage
    assert data["pipeline"].pipeline_status == before_pipeline_status
    assert data["decision"].decision_status == before_decision_status
    assert data["decision"].decision_outcome == before_decision_outcome
    assert after_score_count == before_score_count

    pipeline_rows = list(
        (
            await db_session.scalars(
                sa.select(CandidateJobPipelineModel).where(
                    CandidateJobPipelineModel.candidate_id == data["candidate"].id
                )
            )
        ).all()
    )
    decision_rows = list(
        (
            await db_session.scalars(
                sa.select(CandidateJobHiringDecisionModel).where(
                    CandidateJobHiringDecisionModel.candidate_id == data["candidate"].id
                )
            )
        ).all()
    )
    assert len(pipeline_rows) == 1
    assert len(decision_rows) == 1
