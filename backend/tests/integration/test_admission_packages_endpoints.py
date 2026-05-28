"""Integration tests for admission packages endpoints."""

import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admission_package_service import AdmissionPackageService
from src.infrastructure.database.models import (
    CandidateJobHiringDecisionModel,
    CandidateJobPipelineModel,
    CandidateModel,
    JobModel,
    PreAdmissionDocumentModel,
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionEventModel,
    UserModel,
)
from src.infrastructure.security.password_service import hash_password


async def _create_user(session: AsyncSession, role: str = "recruiter") -> UserModel:
    """Create a test user."""
    user = UserModel(
        id=uuid4(),
        email=f"test-{uuid4()}@example.com",
        full_name="Test User",
        password_hash="hash",
        role=role,
        status="active",
    )
    session.add(user)
    await session.flush()
    return user


async def _auth_headers(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
    *,
    role: str = "hr",
) -> dict[str, str]:
    email = f"{role}-{uuid4()}@example.com"
    password = "password123"
    user = UserModel(
        id=uuid4(),
        email=email,
        full_name=f"{role.upper()} Test",
        password_hash=hash_password(password),
        role=role,
        status="active",
    )
    db_session.add(user)
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _create_candidate(session: AsyncSession, created_by_id=None) -> CandidateModel:
    """Create a test candidate."""
    user = await _create_user(session, role="candidate")
    candidate = CandidateModel(
        id=uuid4(),
        user_id=user.id,
        full_name="Test Candidate",
        email="candidate@example.com",
        phone="+5511999999999",
        cpf="12345678901",
        created_by=created_by_id or uuid4(),
    )
    session.add(candidate)
    await session.flush()
    return candidate


async def _create_job(session: AsyncSession, created_by_id=None) -> JobModel:
    """Create a test job."""
    job = JobModel(
        id=uuid4(),
        title="Test Job",
        description="Test Description",
        status="active",
        created_by=created_by_id or uuid4(),
    )
    session.add(job)
    await session.flush()
    return job


async def _create_pipeline(
    session: AsyncSession,
    candidate_id,
    job_id,
) -> CandidateJobPipelineModel:
    """Create a pipeline link."""
    pipeline = CandidateJobPipelineModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        status="active",
    )
    session.add(pipeline)
    await session.flush()
    return pipeline


async def _create_pre_admission_case(
    session: AsyncSession,
    candidate_id,
    job_id,
    hiring_decision_id,
    status="ready_for_admission",
) -> PreAdmissionCaseModel:
    """Create a pre-admission case."""
    case = PreAdmissionCaseModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        hiring_decision_id=hiring_decision_id,
        status=status,
        start_date=None,
        salary_offer=None,
        work_model="CLT",
    )
    session.add(case)
    await session.flush()
    return case


async def _create_checklist_item(
    session: AsyncSession,
    case_id,
    required=True,
    status="approved",
) -> PreAdmissionChecklistItemModel:
    """Create a checklist item."""
    item = PreAdmissionChecklistItemModel(
        id=uuid4(),
        case_id=case_id,
        title="Test Document",
        item_type="cpf",
        required=required,
        status=status,
    )
    session.add(item)
    await session.flush()
    return item


async def _create_document(
    session: AsyncSession,
    *,
    case_id,
    checklist_item_id,
    candidate_id,
    status: str = "approved",
    original_filename: str = "doc.pdf",
    uploaded_at: datetime | None = None,
) -> PreAdmissionDocumentModel:
    document = PreAdmissionDocumentModel(
        id=uuid4(),
        case_id=case_id,
        checklist_item_id=checklist_item_id,
        candidate_id=candidate_id,
        original_filename=original_filename,
        stored_filename=original_filename,
        storage_key=f"tests/{uuid4()}-{original_filename}",
        mime_type="application/pdf",
        size_bytes=1024,
        status=status,
        uploaded_at=uploaded_at or datetime.now(UTC),
        reviewed_at=datetime.now(UTC) if status == "approved" else None,
    )
    session.add(document)
    await session.flush()
    return document


async def _create_approved_item_with_document(
    session: AsyncSession,
    *,
    case_id,
    candidate_id,
    required: bool = True,
    title: str = "Test Document",
) -> tuple[PreAdmissionChecklistItemModel, PreAdmissionDocumentModel]:
    item = await _create_checklist_item(session, case_id, required=required, status="approved")
    item.title = title
    document = await _create_document(
        session,
        case_id=case_id,
        checklist_item_id=item.id,
        candidate_id=candidate_id,
        status="approved",
        original_filename=f"{title.lower().replace(' ', '-')}.pdf",
    )
    return item, document


async def _create_hiring_decision(
    session: AsyncSession,
    job_id,
    candidate_id,
) -> CandidateJobHiringDecisionModel:
    """Create a hiring decision."""
    user = await _create_user(session)
    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        job_id=job_id,
        candidate_id=candidate_id,
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="strong_fit",
        decided_by=user.id,
        notes="Decisão humana de contratação",
        submitted_at=datetime.now(UTC),
    )
    session.add(decision)
    await session.flush()
    return decision


# Tests


@pytest.mark.asyncio
async def test_post_creates_package_when_case_ready(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST creates package when case status is ready_for_admission."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    response = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "ready_for_review"
    assert data["case_id"] == str(case.id)


@pytest.mark.asyncio
async def test_post_blocks_case_not_ready(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST blocks package creation when case status is not ready_for_admission."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(
        db_session,
        candidate.id,
        job.id,
        decision.id,
        status="documents_pending",
    )
    await db_session.commit()

    response = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_returns_existing_package(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET returns existing package."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})

    # Get package
    response = await client.get(f"/api/v1/pre-admission/{case.id}/admission-package")
    assert response.status_code == 200
    data = response.json()
    assert data is not None
    assert data["status"] == "ready_for_review"


@pytest.mark.asyncio
async def test_get_returns_404_when_no_package(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET returns null when no package exists."""
    client.headers.update(await _auth_headers(client, db_session))
    case_id = uuid4()

    response = await client.get(f"/api/v1/pre-admission/{case_id}/admission-package")
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_approve_ready_for_review(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST approve works for ready_for_review status."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Approve
    response = await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved_for_export"
    assert data["approved_by"] is not None


@pytest.mark.asyncio
async def test_approve_blocks_draft_with_errors(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST approve blocks draft status with validation errors."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_checklist_item(db_session, case.id, required=True, status="pending")
    await db_session.commit()

    # Create package (will be draft with errors)
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "draft"

    # Try to approve (should fail)
    response = await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_cancel_before_exported(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST cancel works before exported."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Cancel
    response = await client.post(
        f"/api/v1/admission-packages/{package_id}/cancel",
        json={"reason": "Test cancel"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_blocks_exported(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST cancel blocks exported status."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Approve
    await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})

    # Mark exported explicitly; download alone must not change business state.
    await AdmissionPackageService(db_session).export_package(UUID(package_id))
    await db_session.commit()

    # Try to cancel (should fail)
    response = await client.post(f"/api/v1/admission-packages/{package_id}/cancel", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_export_json_blocks_without_approval(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET export-json blocks without approval."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_checklist_item(db_session, case.id, required=True, status="pending")
    await db_session.commit()

    # Create draft package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Try to export (should fail — draft status)
    response = await client.get(f"/api/v1/admission-packages/{package_id}/export-json")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_export_json_returns_payload(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET export-json returns JSON payload."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Approve
    await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})

    # Export JSON
    response = await client.get(f"/api/v1/admission-packages/{package_id}/export-json")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    data = json.loads(response.text)
    assert "candidate" in data
    assert "job" in data
    assert "pre_admission" in data
    assert "documents" in data
    assert "decision" in data


@pytest.mark.asyncio
async def test_package_snapshot_uses_only_current_approved_document(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    item = await _create_checklist_item(db_session, case.id, required=True, status="approved")
    now = datetime.now(UTC).replace(microsecond=0)
    await _create_document(
        db_session,
        case_id=case.id,
        checklist_item_id=item.id,
        candidate_id=candidate.id,
        status="approved",
        original_filename="old-approved.pdf",
        uploaded_at=now - timedelta(minutes=4),
    )
    current = await _create_document(
        db_session,
        case_id=case.id,
        checklist_item_id=item.id,
        candidate_id=candidate.id,
        status="approved",
        original_filename="current-approved.pdf",
        uploaded_at=now,
    )
    await db_session.commit()

    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    assert create_resp.status_code == 201, create_resp.text
    data = create_resp.json()

    assert data["status"] == "ready_for_review"
    assert data["payload"]["documents"] == [
        {
            "checklist_item_id": str(item.id),
            "title": item.title,
            "item_status": "approved",
            "status": "approved",
            "document_id": str(current.id),
            "original_filename": "current-approved.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 1024,
            "uploaded_at": current.uploaded_at.isoformat(),
            "reviewed_at": current.reviewed_at.isoformat() if current.reviewed_at else None,
        }
    ]


@pytest.mark.asyncio
async def test_package_creation_does_not_use_stale_approved_document_when_latest_is_rejected(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    item = await _create_checklist_item(db_session, case.id, required=True, status="approved")
    now = datetime.now(UTC).replace(microsecond=0)
    await _create_document(
        db_session,
        case_id=case.id,
        checklist_item_id=item.id,
        candidate_id=candidate.id,
        status="approved",
        original_filename="stale-approved.pdf",
        uploaded_at=now - timedelta(minutes=8),
    )
    await _create_document(
        db_session,
        case_id=case.id,
        checklist_item_id=item.id,
        candidate_id=candidate.id,
        status="rejected",
        original_filename="latest-rejected.pdf",
        uploaded_at=now,
    )
    await db_session.commit()

    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    assert create_resp.status_code == 201, create_resp.text
    data = create_resp.json()

    assert data["status"] == "draft"
    assert data["payload"]["documents"] == []
    assert any(
        "current approved document" in error["message"]
        for error in data["validation_errors"]
    )


@pytest.mark.asyncio
async def test_recruiter_cannot_export_or_use_protheus_endpoints(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    hr_headers = await _auth_headers(client, db_session, role="hr")
    client.headers.update(hr_headers)
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    assert create_resp.status_code == 201
    package_id = create_resp.json()["id"]
    approve_resp = await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})
    assert approve_resp.status_code == 200

    recruiter_headers = await _auth_headers(client, db_session, role="recruiter")
    export_response = await client.get(
        f"/api/v1/admission-packages/{package_id}/export-json",
        headers=recruiter_headers,
    )
    capabilities_response = await client.get(
        "/api/v1/admission-packages/erp/protheus/capabilities",
        headers=recruiter_headers,
    )
    dry_run_response = await client.post(
        f"/api/v1/admission-packages/{package_id}/erp/protheus/dry-run",
        headers=recruiter_headers,
    )

    assert export_response.status_code == 403
    assert capabilities_response.status_code == 403
    assert dry_run_response.status_code == 403


@pytest.mark.asyncio
async def test_export_csv_returns_csv(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET export-csv returns CSV payload."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Approve
    await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})

    # Export CSV
    response = await client.get(f"/api/v1/admission-packages/{package_id}/export-csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "Test Candidate" in response.text
    assert "Test Job" in response.text


@pytest.mark.asyncio
async def test_export_json_does_not_mark_package_as_exported(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """GET export-json marks package as exported."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Approve
    await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})

    # Export JSON should not transition package state
    response = await client.get(f"/api/v1/admission-packages/{package_id}/export-json")
    assert response.status_code == 200

    # Check status remains approved_for_export
    get_resp = await client.get(f"/api/v1/pre-admission/{case.id}/admission-package")
    assert get_resp.json()["status"] == "approved_for_export"
    assert get_resp.json()["exported_at"] is None


@pytest.mark.asyncio
async def test_events_are_registered(
    client: httpx.AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that events are registered in pre_admission_events."""
    client.headers.update(await _auth_headers(client, db_session))
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    await _create_approved_item_with_document(
        db_session,
        case_id=case.id,
        candidate_id=candidate.id,
    )
    await db_session.commit()

    # Create package
    create_resp = await client.post(f"/api/v1/pre-admission/{case.id}/admission-package", json={})
    package_id = create_resp.json()["id"]

    # Check events were created
    import sqlalchemy as sa

    stmt = (
        sa.select(PreAdmissionEventModel)
        .where(PreAdmissionEventModel.case_id == case.id)
        .order_by(PreAdmissionEventModel.created_at.asc())
    )
    result = await db_session.execute(stmt)
    events = result.scalars().all()

    # Should have package_created event
    assert any(e.event_type == "package_created" for e in events)

    # Approve and check for approval event
    await client.post(f"/api/v1/admission-packages/{package_id}/approve", json={})

    result = await db_session.execute(stmt)
    events = result.scalars().all()
    assert any(e.event_type == "package_approved" for e in events)
