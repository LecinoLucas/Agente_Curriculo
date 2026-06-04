from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.interface.workers.analysis_tasks import (
    AnalysisFailureDetails,
    _persist_completed_analysis,
    _upsert_failure_result,
)


def _mock_sessionmaker(mock_session: AsyncMock) -> MagicMock:
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory


def _completed_result_fields() -> dict:
    return {
        "candidate_summary": "Perfil backend.",
        "seniority_level": "senior",
        "total_experience_years": 6.0,
        "highest_education_level": "bachelor",
        "highest_education_field": "Computação",
        "strengths": ["Python"],
        "weaknesses": [],
        "recommendations": [],
        "keywords": ["python"],
        "extracted_data": {"skills": [{"name": "Python"}]},
    }


@pytest.mark.asyncio
async def test_completed_analysis_persists_redacted_raw_llm_response() -> None:
    analysis_id = uuid4()
    mock_analysis = MagicMock()
    mock_analysis.status = "processing"
    mock_analysis.worker_claim_id = "task-123"
    mock_result = MagicMock()

    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(side_effect=[mock_analysis, mock_result])
    mock_session.commit = AsyncMock()

    persisted = await _persist_completed_analysis(
        analysis_id=analysis_id,
        result_fields=_completed_result_fields(),
        raw_response=(
            '{"candidate_summary":"CPF 529.982.247-25, email ana@example.com, '
            'telefone 11999998888, RG 12.345.678-9, CEP 74000-000, '
            'Data de nascimento 02/01/1990, Rua das Flores, 123, diagnostico"}'
        ),
        input_tokens=10,
        output_tokens=20,
        cache_read=0,
        cache_write=0,
        processing_ms=100,
        prompt_version_used="7:gemini_minimal_compact_v2",
        finish_reason="STOP",
        max_tokens_used=1200,
        system_prompt_chars=42,
        user_prompt_chars=120,
        prompt_chars_total=162,
        expected_worker_claim_id="task-123",
        sessionmaker=_mock_sessionmaker(mock_session),
    )

    assert persisted is True
    assert mock_analysis.status == "completed"
    assert mock_result.raw_llm_response is not None
    assert "529.982.247-25" not in mock_result.raw_llm_response
    assert "ana@example.com" not in mock_result.raw_llm_response
    assert "11999998888" not in mock_result.raw_llm_response
    assert "12.345.678-9" not in mock_result.raw_llm_response
    assert "74000-000" not in mock_result.raw_llm_response
    assert "02/01/1990" not in mock_result.raw_llm_response
    assert "Rua das Flores" not in mock_result.raw_llm_response
    assert "diagnostico" not in mock_result.raw_llm_response.lower()
    assert "[cpf_removido]" in mock_result.raw_llm_response
    assert "[email_removido]" in mock_result.raw_llm_response


@pytest.mark.asyncio
async def test_failure_result_persists_redacted_raw_llm_response() -> None:
    analysis_id = uuid4()
    mock_result = MagicMock()

    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(return_value=mock_result)

    await _upsert_failure_result(
        session=mock_session,
        analysis_id=analysis_id,
        failure_details=AnalysisFailureDetails(
            raw_llm_response=(
                '{"summary":"CPF 529.982.247-25, email ana@example.com, '
                'telefone 11999998888"}'
            ),
            finish_reason="INVALID_JSON",
            prompt_version_used="7:gemini_minimal_compact_v2",
            provider="google",
            model_id="gemini-2.5-flash",
        ),
    )

    assert "529.982.247-25" not in mock_result.raw_llm_response
    assert "ana@example.com" not in mock_result.raw_llm_response
    assert "11999998888" not in mock_result.raw_llm_response
    assert "[cpf_removido]" in mock_result.raw_llm_response
    assert "[email_removido]" in mock_result.raw_llm_response
    assert mock_result.finish_reason == "INVALID_JSON"


@pytest.mark.asyncio
async def test_completed_analysis_keeps_scoring_fields_unchanged() -> None:
    analysis_id = uuid4()
    now = datetime.now(UTC)
    mock_analysis = MagicMock()
    mock_analysis.status = "processing"
    mock_analysis.worker_claim_id = "task-456"
    mock_analysis.completed_at = None
    mock_analysis.updated_at = now
    mock_result = MagicMock()

    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(side_effect=[mock_analysis, mock_result])
    mock_session.commit = AsyncMock()

    result_fields = _completed_result_fields()
    await _persist_completed_analysis(
        analysis_id=analysis_id,
        result_fields=result_fields,
        raw_response='{"candidate_summary":"ok"}',
        input_tokens=10,
        output_tokens=20,
        cache_read=0,
        cache_write=0,
        processing_ms=100,
        prompt_version_used="7:gemini_minimal_compact_v2",
        expected_worker_claim_id="task-456",
        sessionmaker=_mock_sessionmaker(mock_session),
    )

    assert mock_result.candidate_summary == result_fields["candidate_summary"]
    assert mock_result.seniority_level == result_fields["seniority_level"]
    assert mock_result.total_experience_years == result_fields["total_experience_years"]
    assert mock_result.extracted_data == result_fields["extracted_data"]
    assert mock_analysis.status == "completed"
