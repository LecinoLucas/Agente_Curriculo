from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import Mock
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services import candidate_ranking_service as ranking_service_module
from src.application.services import strict_payload as strict_payload_module
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


def _contains_forbidden_key(value: object, forbidden_keys: set[str]) -> bool:
    if isinstance(value, dict):
        if any(key in forbidden_keys for key in value):
            return True
        return any(_contains_forbidden_key(item, forbidden_keys) for item in value.values())
    if isinstance(value, list):
        return any(_contains_forbidden_key(item, forbidden_keys) for item in value)
    return False


@pytest.mark.asyncio
async def test_candidate_ranking_entry_without_score_returns_semantic_409(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-not-ready-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    candidate = CandidateModel(
        email=f"ranking-not-ready-candidate-{uuid4().hex[:6]}@test.com",
        full_name="Ranking Not Ready Candidate",
        created_by=recruiter.id,
    )
    job = JobModel(
        title="Ranking Not Ready Job",
        description="Pipeline sem score persistido.",
        requirements="Python",
        status="published",
        job_profile_hash=f"ranking-not-ready-{uuid4().hex[:8]}",
        created_by=recruiter.id,
    )
    db_session.add_all([candidate, job])
    await db_session.flush()
    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=job.id,
            link_status="active",
            relationship_status="active",
            pipeline_status="active",
            pipeline_stage="entry",
        )
    )
    active_version = await db_session.scalar(
        sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
    )
    if active_version is None:
        db_session.add(
            ScoreModelVersionModel(
                version=f"ranking-not-ready-{uuid4().hex[:6]}",
                is_active=True,
                weights={"skill_match": 0.4},
                thresholds={"high": 70, "low": 45},
            )
        )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/jobs/{job.id}/ranking/{candidate.id}",
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "candidate_score_not_ready",
        "message": "Score ainda não disponível para este candidato nesta vaga.",
        "action": "request_analysis",
    }


@pytest.mark.asyncio
async def test_get_job_ranking_uses_job_fit_score_contract(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"ranking-contract-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Ranking Contract Job",
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

    await db_session.execute(
        sa.update(ScoreModelVersionModel).values(is_active=False)
    )
    version = ScoreModelVersionModel(
        version=f"ranking-contract-{uuid4().hex[:6]}",
        is_active=True,
        weights={"skill_match": 0.4},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add(version)
    await db_session.flush()

    match.skill_evidence_breakdown = {
        "priority_score_weighted": 100.0,
        "complementary_score_weighted": 0.0,
        "optional_score_raw_weighted": 0.0,
        "validation_reasons": [],
        "missing_required_skills": [],
    }
    match.updated_at = datetime.now(UTC)

    now = datetime.now(UTC)
    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            source_analysis_id=pipeline.current_analysis_id,
            source_analysis_created_at=now,
            input_hash=f"ranking-contract-{uuid4().hex}",
            score_model_version=version.version,
            explainability_version="exp-v1",
            final_score=Decimal("82.50"),
            decision_suggestion="approved",
            breakdown={
                "skill_match_score": 80,
                "experience_match_score": 75,
                "seniority_match_score": 70,
                "education_score": 85,
                "confidence_score": 90,
                "penalty_score": 0,
                "validation_penalty_score": 0,
                "priority_score_weighted": 100.0,
            },
            reason_codes=[
                {
                    "code": "strong_skill_match",
                    "label": "Forte alinhamento de skills",
                    "impact": 12.5,
                }
            ],
            explanation_text="Resumo oficial do ranking.",
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

    ranking_warning = Mock()
    strict_payload_warning = Mock()
    monkeypatch.setattr(ranking_service_module.logger, "warning", ranking_warning)
    monkeypatch.setattr(strict_payload_module.logger, "warning", strict_payload_warning)

    response = await client.get(f"/api/v1/jobs/{job_id}/ranking", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["candidates"]
    candidate = payload["candidates"][0]
    assert candidate["candidate_id"] == str(candidate_id)
    assert "job_fit_score" in candidate
    assert "final_score" not in candidate
    assert "match_score" not in candidate
    assert "ranking_score" not in candidate
    assert "reason_tags" in candidate
    assert "score_factors" in candidate
    assert "reason_codes" not in candidate
    assert "ranking_summary_text" in candidate
    assert "data_confidence_score" in candidate
    assert "explanation_text" not in candidate
    assert "ranking_freshness_status" in candidate
    assert "match_freshness_status" in candidate
    assert candidate["score_model_version"] == version.version
    assert "freshness_status" not in candidate
    assert Decimal(str(candidate["job_fit_score"])) == Decimal("82.50")
    assert Decimal(str(candidate["score_breakdown"]["job_fit_score"])) == Decimal("82.50")
    assert Decimal(str(candidate["score_breakdown"]["priority_score_weighted"])) == Decimal("100.00")
    assert "final_score_before_cap" not in candidate["score_breakdown"]
    assert "final_score_after_cap" not in candidate["score_breakdown"]
    assert not any(call.args and call.args[0] == "ranking.score_breakdown_missing_keys" for call in ranking_warning.call_args_list)
    assert not any(call.args and call.args[0] == "strict_payload.optional_dict_invalid" for call in strict_payload_warning.call_args_list)
    assert _contains_forbidden_key(
        payload,
        {
            "final_score",
            "match_score",
            "ranking_score",
            "final_score_before_cap",
            "final_score_after_cap",
            "explanation_text",
            "reason_codes",
            "freshness_status",
        },
    ) is False
