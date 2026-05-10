from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_ranking_service import CandidateRankingService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AnalysisResultModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


def _assert_clean_public_contract(candidate_payload: dict[str, object]) -> None:
    assert "job_fit_score" in candidate_payload
    assert "final_score" not in candidate_payload
    assert "match_score" not in candidate_payload
    assert "ranking_score" not in candidate_payload
    assert "reason_tags" in candidate_payload
    assert "score_factors" in candidate_payload
    assert "reason_codes" not in candidate_payload
    assert "ranking_summary_text" in candidate_payload
    assert "data_confidence_score" in candidate_payload
    assert "explanation_text" not in candidate_payload
    assert "ranking_freshness_status" in candidate_payload
    assert "match_freshness_status" in candidate_payload
    assert "freshness_status" not in candidate_payload
    assert "final_score_before_cap" not in candidate_payload.get("score_breakdown", {})
    assert "final_score_after_cap" not in candidate_payload.get("score_breakdown", {})


async def _prepare_ranked_candidate(
    db_session: AsyncSession,
    *,
    recruiter_id,
    deal_breakers: list[dict[str, object]],
    candidate_location_city: str | None = None,
    candidate_internal_notes: str | None = None,
    extracted_data: dict[str, object] | None = None,
) -> tuple[UUID, UUID]:
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter_id,
        job_title=f"Deal Breaker Ranking {uuid4().hex[:6]}",
    )

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    candidate = await db_session.scalar(sa.select(CandidateModel).where(CandidateModel.id == candidate_id))
    match = await db_session.scalar(sa.select(CandidateJobMatchModel).where(CandidateJobMatchModel.id == match_id))
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    profile = await db_session.scalar(
        sa.select(CandidateProfileAnalysisModel).where(
            CandidateProfileAnalysisModel.candidate_id == candidate_id,
            CandidateProfileAnalysisModel.resume_version_id == pipeline.resume_version_id,
        )
    )

    assert job is not None
    assert candidate is not None
    assert match is not None
    assert pipeline is not None
    assert pipeline.current_analysis_id is not None
    assert profile is not None

    analysis_result = await db_session.scalar(
        sa.select(AnalysisResultModel).where(
            AnalysisResultModel.analysis_id == pipeline.current_analysis_id,
        )
    )
    assert analysis_result is not None

    job.deal_breakers = deal_breakers
    candidate.location_city = candidate_location_city
    candidate.internal_notes = candidate_internal_notes

    analysis_result.extracted_data = extracted_data or {}
    profile.raw_response_json = {"analysis_result_fields": extracted_data or {}}

    match.skill_evidence_breakdown = {
        "mandatory_score_weighted": 100.0,
        "optional_score_weighted": 0.0,
        "optional_score_raw_weighted": 0.0,
        "validation_reasons": [],
        "missing_required_skills": [],
    }
    match.updated_at = datetime.now(UTC)

    await db_session.execute(sa.update(ScoreModelVersionModel).values(is_active=False))
    version = ScoreModelVersionModel(
        version=f"deal-breaker-{uuid4().hex[:6]}",
        is_active=True,
        weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.flush()
    await db_session.commit()

    compute_result = await CandidateRankingService(db_session).compute_single_candidate(job_id, candidate_id)
    await db_session.commit()
    assert compute_result is not None
    return job_id, candidate_id


@pytest.mark.asyncio
async def test_ranking_applies_location_deal_breaker(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-location-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id = await _prepare_ranked_candidate(
        db_session,
        recruiter_id=recruiter.id,
        candidate_location_city="Rio de Janeiro",
        deal_breakers=[
            {
                "field": "location",
                "operator": "equals",
                "value": "São Paulo",
                "reason": "Presencial em São Paulo",
                "is_active": True,
            }
        ],
    )

    persisted = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
        )
    )
    assert persisted is not None
    assert Decimal(str(persisted.final_score)) == Decimal("0.00")

    response = await client.get(f"/api/v1/jobs/{job_id}/ranking", headers=headers)
    assert response.status_code == 200
    candidate = response.json()["candidates"][0]
    assert candidate["candidate_id"] == str(candidate_id)
    assert Decimal(str(candidate["job_fit_score"])) == Decimal("0.00")
    _assert_clean_public_contract(candidate)


@pytest.mark.asyncio
async def test_ranking_applies_work_model_deal_breaker(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-work-model-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id = await _prepare_ranked_candidate(
        db_session,
        recruiter_id=recruiter.id,
        extracted_data={"work_model": "onsite"},
        deal_breakers=[
            {
                "field": "work_model",
                "operator": "equals",
                "value": "remote",
                "reason": "A vaga exige trabalho remoto",
                "is_active": True,
            }
        ],
    )

    response = await client.get(f"/api/v1/jobs/{job_id}/ranking", headers=headers)
    assert response.status_code == 200
    candidate = response.json()["candidates"][0]
    assert candidate["candidate_id"] == str(candidate_id)
    assert Decimal(str(candidate["job_fit_score"])) == Decimal("0.00")
    _assert_clean_public_contract(candidate)


@pytest.mark.asyncio
async def test_ranking_applies_language_deal_breaker(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-language-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id = await _prepare_ranked_candidate(
        db_session,
        recruiter_id=recruiter.id,
        extracted_data={"languages": [{"language": "English", "level": "advanced"}]},
        deal_breakers=[
            {
                "field": "language",
                "operator": "equals",
                "value": "Spanish",
                "reason": "Espanhol é obrigatório",
                "is_active": True,
            }
        ],
    )

    response = await client.get(f"/api/v1/jobs/{job_id}/ranking", headers=headers)
    assert response.status_code == 200
    candidate = response.json()["candidates"][0]
    assert candidate["candidate_id"] == str(candidate_id)
    assert Decimal(str(candidate["job_fit_score"])) == Decimal("0.00")
    _assert_clean_public_contract(candidate)


@pytest.mark.asyncio
async def test_ranking_missing_deal_breaker_data_forces_review_instead_of_silent_pass(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-missing-data-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id = await _prepare_ranked_candidate(
        db_session,
        recruiter_id=recruiter.id,
        extracted_data={},
        deal_breakers=[
            {
                "field": "availability",
                "operator": "equals",
                "value": "immediate",
                "reason": "Disponibilidade imediata é obrigatória",
                "is_active": True,
            }
        ],
    )

    persisted = await db_session.scalar(
        sa.select(CandidateJobScoreModel).where(
            CandidateJobScoreModel.job_id == job_id,
            CandidateJobScoreModel.candidate_id == candidate_id,
        )
    )
    assert persisted is not None
    assert Decimal(str(persisted.final_score)) == Decimal("83.00")
    assert persisted.decision_suggestion == "review"

    response = await client.get(f"/api/v1/jobs/{job_id}/ranking", headers=headers)
    assert response.status_code == 200
    candidate = response.json()["candidates"][0]
    assert candidate["candidate_id"] == str(candidate_id)
    assert Decimal(str(candidate["job_fit_score"])) == Decimal("83.00")
    assert candidate["decision_suggestion"] == "review"
    _assert_clean_public_contract(candidate)
