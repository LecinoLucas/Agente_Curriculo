from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.application.services.job_score_explanation_service import (
    CandidateScoreExplanationNotReadyError,
    JobScoreExplanationService,
)
from src.domain.entities.user import UserRole


def _score_head(*, analysis_id):
    return SimpleNamespace(
        source_analysis_id=analysis_id,
        final_score=Decimal("82.50"),
        freshness_status="fresh",
        score_model_version="v2",
        explainability_version="exp-v2",
        computed_at=datetime(2026, 5, 9, tzinfo=UTC),
        decision_suggestion="strong_yes",
        explanation_text="Resumo canônico persistido.",
        breakdown={
            "skill_match_score": 80,
            "experience_match_score": 75,
            "seniority_match_score": 70,
            "confidence_score": 88,
        },
        factor_summary_json={
            "positive": [
                {
                    "factor_type": "required_skill_match",
                    "factor_key": "python",
                    "factor_label": "Python aderente",
                    "impact_score": 14.5,
                    "direction": "positive",
                }
            ],
            "negative": [
                {
                    "factor_type": "data_confidence_penalty",
                    "factor_key": "confidence",
                    "factor_label": "Baixa confiança em evidências recentes",
                    "impact_score": -6.0,
                    "direction": "negative",
                }
            ],
            "contextual": [],
        },
        delta_summary_json={
            "previous_score": 79.0,
            "current_score": 82.5,
            "score_change": 3.5,
            "change_reason": "manual_recompute_same_inputs",
            "top_changes": [],
        },
    )


def _service(session):
    service = JobScoreExplanationService(session)
    service._pipeline_repo.find_active_entry = AsyncMock(return_value=SimpleNamespace())
    service._observability_service.record_snapshot = AsyncMock()
    service._observability_service.get_feedback = AsyncMock(return_value=None)
    return service


@pytest.mark.asyncio
async def test_get_returns_canonical_payload_without_persisted_match():
    session = AsyncMock()
    analysis_id = uuid4()
    session.scalar = AsyncMock(
        side_effect=[
            SimpleNamespace(id=uuid4(), version="v2"),
            _score_head(analysis_id=analysis_id),
            None,
        ]
    )
    session.execute = AsyncMock()

    service = _service(session)
    service._analysis_repo.find_candidate_job_match_for_candidate_job = AsyncMock(return_value=None)
    service._analysis_repo.find_latest_completed_for_version = AsyncMock()

    payload = await service.get(
        job_id=uuid4(),
        candidate_id=uuid4(),
        role=UserRole.RECRUITER,
    )

    assert payload.final_score == 82.5
    assert payload.analysis_id == analysis_id
    assert payload.recommendation == "strong_yes"
    assert payload.gaps == []
    service._analysis_repo.find_latest_completed_for_version.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_returns_canonical_payload_without_completed_analysis():
    session = AsyncMock()
    analysis_id = uuid4()
    session.scalar = AsyncMock(
        side_effect=[
            SimpleNamespace(id=uuid4(), version="v2"),
            _score_head(analysis_id=analysis_id),
            None,
        ]
    )
    session.execute = AsyncMock()

    service = _service(session)
    service._analysis_repo.find_candidate_job_match_for_candidate_job = AsyncMock(
        return_value=SimpleNamespace(
            resume_version_id=uuid4(),
            recommendation="strong_yes",
            missing_skills_json=["Kubernetes"],
            matched_skills_json=["Python"],
        )
    )
    service._analysis_repo.find_latest_completed_for_version = AsyncMock(return_value=None)

    payload = await service.get(
        job_id=uuid4(),
        candidate_id=uuid4(),
        role=UserRole.RECRUITER,
    )

    assert payload.final_score == 82.5
    assert payload.analysis_id == analysis_id
    assert payload.recommendation == "strong_yes"
    assert payload.gaps == ["Kubernetes"]
    service._analysis_repo.find_latest_completed_for_version.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_still_fails_when_official_score_head_is_missing():
    session = AsyncMock()
    session.scalar = AsyncMock(
        side_effect=[
            SimpleNamespace(id=uuid4(), version="v2"),
            None,
        ]
    )

    service = _service(session)
    service._analysis_repo.find_candidate_job_match_for_candidate_job = AsyncMock(return_value=None)
    service._analysis_repo.find_latest_completed_for_version = AsyncMock()

    with pytest.raises(CandidateScoreExplanationNotReadyError):
        await service.get(
            job_id=uuid4(),
            candidate_id=uuid4(),
            role=UserRole.RECRUITER,
        )
