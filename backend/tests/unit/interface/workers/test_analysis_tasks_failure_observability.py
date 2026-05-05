from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.interface.workers.analysis_tasks import (
    AnalysisExecutionError,
    AnalysisFailureDetails,
    _mark_analysis_failed,
)


def test_analysis_execution_error_flags_truncation_as_non_retryable() -> None:
    error = AnalysisExecutionError(
        "Gemini model output was truncated (finishReason=MAX_TOKENS)",
        details=AnalysisFailureDetails(finish_reason="MAX_TOKENS"),
    )

    assert error.is_non_retryable is True


@pytest.mark.asyncio
async def test_mark_analysis_failed_persists_failure_metadata_to_existing_result() -> None:
    analysis_id = uuid4()
    mock_analysis = MagicMock()
    mock_analysis.worker_claim_id = "task-1"
    mock_result = MagicMock()

    mock_session = AsyncMock()
    mock_session.scalar = AsyncMock(side_effect=[mock_analysis, mock_result])
    mock_session.commit = AsyncMock()

    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch(
        "src.infrastructure.database.connection.get_session_factory",
        return_value=mock_session_factory,
    ):
        await _mark_analysis_failed(
            analysis_id=str(analysis_id),
            task_id="task-1",
            error="Gemini model output was truncated (finishReason=MAX_TOKENS)",
            retry_count=0,
            failure_details=AnalysisFailureDetails(
                finish_reason="MAX_TOKENS",
                raw_llm_response='{"overall_score": 90,',
                input_tokens=444,
                output_tokens=300,
                max_tokens_used=1400,
                system_prompt_chars=41,
                user_prompt_chars=1200,
                prompt_chars_total=1241,
                prompt_version_used="5:gemini_minimal_compact_v2",
            ),
            expected_worker_claim_id="task-1",
        )

    assert mock_result.finish_reason == "MAX_TOKENS"
    assert mock_result.raw_llm_response == '{"overall_score": 90,'
    assert mock_result.input_tokens == 444
    assert mock_result.output_tokens == 300
    assert mock_result.max_tokens_used == 1400
    assert mock_result.prompt_chars_total == 1241
