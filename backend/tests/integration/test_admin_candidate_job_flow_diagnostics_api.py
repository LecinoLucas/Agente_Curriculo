from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


async def _create_admin_and_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"admin-diagnostics-{uuid4().hex[:8]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.ADMIN)
    return await _auth_headers(client, email, "password123")


async def _ensure_active_version(db_session: AsyncSession) -> ScoreModelVersionModel:
    version = await db_session.scalar(
        sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
    )
    if version is not None:
        return version
    version = ScoreModelVersionModel(
        version=f"diag-{uuid4().hex[:8]}",
        is_active=True,
        weights={"skill_match": 0.4},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.flush()
    return version


async def _build_consistent_case(db_session: AsyncSession) -> tuple[str, str]:
    recruiter = await _create_active_user(
        db_session,
        f"diag-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Diagnostics Consistent Job",
        include_ranking_row=False,
    )
    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    match = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(CandidateJobMatchModel.id == match_id)
    )
    assert job is not None
    assert pipeline is not None
    assert pipeline.current_analysis_id is not None
    assert match is not None

    match.skill_evidence_breakdown = {
        "priority_score_weighted": 100.0,
        "complementary_score_weighted": 0.0,
        "optional_score_raw_weighted": 0.0,
        "validation_reasons": [],
        "missing_required_skills": [],
    }
    match.freshness_status = "fresh"
    match.job_signature_hash = str(job.job_profile_hash)
    match.updated_at = datetime.now(UTC)

    version = await _ensure_active_version(db_session)
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            source_analysis_id=pipeline.current_analysis_id,
            source_analysis_created_at=now,
            input_hash=f"diag-{uuid4().hex}",
            score_model_version=version.version,
            explainability_version="diag-v1",
            final_score=Decimal("81.20"),
            decision_suggestion="approved",
            breakdown={
                "skill_match_score": 80,
                "experience_match_score": 78,
                "seniority_match_score": 75,
                "education_score": 70,
                "confidence_score": 82,
                "penalty_score": 0,
                "validation_penalty_score": 0,
                "job_fit_score": 81.2,
            },
            reason_codes=[],
            explanation_text="consistent",
            freshness_status="fresh",
            computed_at=now,
            updated_at=now,
            previous_score=None,
            recompute_reason="test",
            job_signature_hash=str(job.job_profile_hash),
            job_updated_at=job.updated_at,
        )
    )
    await db_session.commit()
    return str(candidate_id), str(job_id)


@pytest.mark.asyncio
async def test_candidate_job_flow_diagnostics_returns_ok_for_consistent_flow(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _create_admin_and_headers(client, db_session)
    candidate_id, job_id = await _build_consistent_case(db_session)

    response = await client.get(
        "/api/v1/admin/diagnostics/candidate-job-flow",
        params={"candidate_id": candidate_id, "job_id": job_id},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reason_code"] == "flow_consistent"
    assert body["candidate_in_ranking"] is True
    assert body["score_source_analysis_matches_current"] is True
    assert body["score_exists"] is True


@pytest.mark.asyncio
async def test_candidate_job_flow_diagnostics_detects_completed_without_score(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _create_admin_and_headers(client, db_session)
    recruiter = await _create_active_user(
        db_session,
        f"diag-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Diagnostics Missing Score Job",
        include_ranking_row=False,
    )
    await _ensure_active_version(db_session)
    await db_session.commit()

    response = await client.get(
        "/api/v1/admin/diagnostics/candidate-job-flow",
        params={"candidate_id": str(candidate_id), "job_id": str(job_id)},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["current_analysis_status"] == "completed"
    assert body["score_exists"] is False
    assert body["reason_code"] == "completed_analysis_missing_score"


@pytest.mark.asyncio
async def test_candidate_job_flow_diagnostics_detects_score_source_mismatch(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _create_admin_and_headers(client, db_session)
    recruiter = await _create_active_user(
        db_session,
        f"diag-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Diagnostics Mismatch Job",
        include_ranking_row=False,
    )
    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert job is not None
    assert pipeline is not None
    assert pipeline.current_analysis_id is not None

    version = await _ensure_active_version(db_session)
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            source_analysis_id=uuid4(),
            source_analysis_created_at=now,
            input_hash=f"diag-{uuid4().hex}",
            score_model_version=version.version,
            explainability_version="diag-v1",
            final_score=Decimal("74.40"),
            decision_suggestion="review",
            breakdown={
                "skill_match_score": 70,
                "experience_match_score": 70,
                "seniority_match_score": 70,
                "education_score": 70,
                "confidence_score": 70,
                "penalty_score": 0,
                "validation_penalty_score": 0,
                "job_fit_score": 74.4,
            },
            reason_codes=[],
            explanation_text="mismatch",
            freshness_status="fresh",
            computed_at=now,
            updated_at=now,
            previous_score=None,
            recompute_reason="test",
            job_signature_hash=str(job.job_profile_hash),
            job_updated_at=job.updated_at,
        )
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/admin/diagnostics/candidate-job-flow",
        params={"candidate_id": str(candidate_id), "job_id": str(job_id)},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["score_exists"] is True
    assert body["score_source_analysis_matches_current"] is False
    assert body["reason_code"] == "score_source_analysis_mismatch"


@pytest.mark.asyncio
async def test_candidate_job_flow_diagnostics_detects_match_with_inactive_profile(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _create_admin_and_headers(client, db_session)
    recruiter = await _create_active_user(
        db_session,
        f"diag-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Diagnostics Inactive Match Job",
        include_ranking_row=False,
    )
    match = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(CandidateJobMatchModel.id == match_id)
    )
    assert match is not None

    current_profile = await db_session.scalar(
        sa.select(JobProfileAnalysisModel).where(JobProfileAnalysisModel.id == match.job_profile_analysis_id)
    )
    assert current_profile is not None
    current_profile.is_active = False
    db_session.add(
        JobProfileAnalysisModel(
            job_id=current_profile.job_id,
            provider=current_profile.provider,
            model_id=current_profile.model_id,
            prompt_version=f"{current_profile.prompt_version}-next",
            job_signature_hash=current_profile.job_signature_hash,
            job_area=current_profile.job_area,
            seniority_required=current_profile.seniority_required,
            education_required=current_profile.education_required,
            experience_required=current_profile.experience_required,
            responsibilities_json=current_profile.responsibilities_json,
            raw_response_json=current_profile.raw_response_json,
            is_active=True,
        )
    )
    await db_session.commit()

    response = await client.get(
        "/api/v1/admin/diagnostics/candidate-job-flow",
        params={"candidate_id": str(candidate_id), "job_id": str(job_id)},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["active_job_profile_exists"] is True
    assert body["match_exists"] is True
    assert body["match_points_to_active_job_profile"] is False
    assert body["reason_code"] == "match_points_to_inactive_job_profile"


@pytest.mark.asyncio
async def test_candidate_job_flow_diagnostics_does_not_expose_sensitive_data(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _create_admin_and_headers(client, db_session)
    candidate_id, job_id = await _build_consistent_case(db_session)

    response = await client.get(
        "/api/v1/admin/diagnostics/candidate-job-flow",
        params={"candidate_id": candidate_id, "job_id": job_id},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.text
    forbidden_fragments = [
        "raw_llm_response",
        "input_tokens",
        "output_tokens",
        "prompt_template_id",
        "user_prompt_template",
        "system_prompt",
        "extracted_data",
        "candidate_summary",
    ]
    for fragment in forbidden_fragments:
        assert fragment not in body


@pytest.mark.asyncio
async def test_candidate_job_flow_repair_fixes_completed_analysis_missing_score(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _create_admin_and_headers(client, db_session)
    recruiter = await _create_active_user(
        db_session,
        f"diag-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Diagnostics Repair Missing Score",
        include_ranking_row=False,
    )
    await _ensure_active_version(db_session)
    await db_session.commit()

    before = await client.get(
        "/api/v1/admin/diagnostics/candidate-job-flow",
        params={"candidate_id": str(candidate_id), "job_id": str(job_id)},
        headers=headers,
    )
    assert before.status_code == 200
    assert before.json()["reason_code"] == "completed_analysis_missing_score"

    repair = await client.post(
        "/api/v1/admin/diagnostics/candidate-job-flow/repair",
        json={"candidate_id": str(candidate_id), "job_id": str(job_id)},
        headers=headers,
    )
    assert repair.status_code == 200
    payload = repair.json()
    assert payload["before"]["reason_code"] == "completed_analysis_missing_score"
    assert payload["after"]["reason_code"] == "flow_consistent"
    assert payload["repaired"] is True
    assert payload["after"]["score_exists"] is True
    assert payload["after"]["score_source_analysis_matches_current"] is True
