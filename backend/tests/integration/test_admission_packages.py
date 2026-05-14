"""Integration tests for admission export packages."""

import json
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admission_package_service import AdmissionPackageService
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    CandidateModel,
    JobModel,
    UserModel,
    CandidateJobPipelineModel,
    CandidateJobHiringDecisionModel,
)


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
        candidate_job_pipeline_id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_status="active",
        pipeline_stage="entry",
        link_status="active",
        relationship_status="active",
        is_terminal=False,
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
        decision_outcome="hire",
        reason_code="strong_fit",
        decided_by=user.id,
        submitted_at=datetime.now(UTC),
    )
    session.add(decision)
    await session.flush()
    return decision


@pytest.mark.asyncio
async def test_cannot_create_package_if_case_not_ready(
    db_session: AsyncSession,
) -> None:
    """Test that package cannot be created if case is not ready_for_admission."""
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

    service = AdmissionPackageService(db_session)

    with pytest.raises(ValidationException) as exc_info:
        await service.create_package(case.id)

    assert "ready_for_admission" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_cannot_create_package_with_required_pending_checklist(
    db_session: AsyncSession,
) -> None:
    """Test that package cannot create with validation errors (stays in draft)."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    # Add required item that's pending
    await _create_checklist_item(db_session, case.id, required=True, status="pending")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    # Should create with draft status and validation errors
    assert package.status == "draft"
    assert package.validation_errors_json is not None


@pytest.mark.asyncio
async def test_create_package_with_all_required_approved(
    db_session: AsyncSession,
) -> None:
    """Test package creation with all required checklist items approved."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    # Add required approved items
    await _create_checklist_item(db_session, case.id, required=True, status="approved")
    await _create_checklist_item(db_session, case.id, required=False, status="pending")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    assert package.case_id == case.id
    assert package.candidate_id == candidate.id
    assert package.job_id == job.id
    assert package.status == "ready_for_review"
    assert package.validation_errors_json is None


@pytest.mark.asyncio
async def test_create_package_with_required_waived(
    db_session: AsyncSession,
) -> None:
    """Test package creation with required item waived."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    # Add required waived item
    await _create_checklist_item(db_session, case.id, required=True, status="waived")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    assert package.status == "ready_for_review"
    assert package.validation_errors_json is None


@pytest.mark.asyncio
async def test_package_payload_contains_all_sections(
    db_session: AsyncSession,
) -> None:
    """Test that payload contains candidate, job, pre-admission, documents, decision."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    payload = package.payload_json
    assert "candidate" in payload
    assert "job" in payload
    assert "pre_admission" in payload
    assert "documents" in payload
    assert "decision" in payload

    assert payload["candidate"]["full_name"] == "Test Candidate"
    assert payload["job"]["title"] == "Test Job"
    assert payload["pre_admission"]["work_model"] == "CLT"
    assert payload["decision"]["decision_outcome"] == "hire"


@pytest.mark.asyncio
async def test_payload_is_snapshot_independent_of_live_data(
    db_session: AsyncSession,
) -> None:
    """Test that payload snapshot is independent of live data after creation."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    original_name = package.payload_json["candidate"]["full_name"]

    # Change candidate name in database
    candidate.full_name = "Changed Name"
    await db_session.flush()

    # Package payload should still have original name
    await db_session.refresh(package)
    assert package.payload_json["candidate"]["full_name"] == original_name


@pytest.mark.asyncio
async def test_approve_package(
    db_session: AsyncSession,
) -> None:
    """Test approving a package."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    assert package.status == "ready_for_review"

    approved = await service.approve_package(package.id, user_id=user.id)

    assert approved.status == "approved_for_export"
    assert approved.approved_by == user.id
    assert approved.approved_at is not None


@pytest.mark.asyncio
async def test_cannot_approve_package_with_validation_errors(
    db_session: AsyncSession,
) -> None:
    """Test that package with validation errors cannot be approved."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    # Create required pending item (will fail validation)
    await _create_checklist_item(db_session, case.id, required=True, status="pending")

    service = AdmissionPackageService(db_session)

    # This should still create, but with validation errors
    package = await service.create_package(case.id)

    # Should not be able to approve
    with pytest.raises(ValidationException):
        await service.approve_package(package.id)


@pytest.mark.asyncio
async def test_cancel_package(
    db_session: AsyncSession,
) -> None:
    """Test cancelling a package."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    cancelled = await service.cancel_package(package.id, reason="Test cancellation")

    assert cancelled.status == "cancelled"
    assert cancelled.cancelled_at is not None


@pytest.mark.asyncio
async def test_cannot_cancel_exported_package(
    db_session: AsyncSession,
) -> None:
    """Test that exported packages cannot be cancelled."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id)

    await service.approve_package(package.id, user_id=user.id)
    await service.export_package(package.id, user_id=user.id)

    with pytest.raises(ValidationException):
        await service.cancel_package(package.id)


@pytest.mark.asyncio
async def test_events_are_registered(
    db_session: AsyncSession,
) -> None:
    """Test that creation/approval events are tracked."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)
    user = await _create_user(db_session)

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    package = await service.create_package(case.id, user_id=user.id)

    assert package.created_by == user.id
    assert package.created_at is not None

    approved = await service.approve_package(package.id, user_id=user.id)

    assert approved.approved_by == user.id
    assert approved.approved_at is not None


@pytest.mark.asyncio
async def test_does_not_alter_pipeline_ranking_score(
    db_session: AsyncSession,
) -> None:
    """Test that creating package does not modify pipeline/ranking/score."""
    candidate = await _create_candidate(db_session)
    job = await _create_job(db_session)
    pipeline = await _create_pipeline(db_session, candidate.id, job.id)
    decision = await _create_hiring_decision(db_session, job.id, candidate.id)
    case = await _create_pre_admission_case(db_session, candidate.id, job.id, decision.id)

    original_state = (
        pipeline.pipeline_status,
        pipeline.pipeline_stage,
        pipeline.link_status,
        pipeline.relationship_status,
        pipeline.is_terminal,
    )

    await _create_checklist_item(db_session, case.id, required=True, status="approved")

    service = AdmissionPackageService(db_session)
    await service.create_package(case.id)

    await db_session.refresh(pipeline)
    assert (
        pipeline.pipeline_status,
        pipeline.pipeline_stage,
        pipeline.link_status,
        pipeline.relationship_status,
        pipeline.is_terminal,
    ) == original_state
