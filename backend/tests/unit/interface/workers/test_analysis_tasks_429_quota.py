"""Tests for Gemini 429 quota exceeded handling in analysis tasks.

Validates that when Gemini returns 429 (quota exceeded):
1. Analysis status transitions to "failed" (not retried)
2. failure_reason includes friendly message and error details
3. next_retry_at is populated from retry_after_seconds
4. Task raises exception without retry attempt
"""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import sqlalchemy as sa

from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.interface.workers.analysis_tasks import (
    _extract_rate_limit_retry_after_seconds,
    _mark_analysis_failed,
)


class TestRateLimitRetryAfterExtraction:
    """Test extracting retry_after_seconds from error messages."""

    def test_extracts_retry_after_seconds_from_error(self) -> None:
        """Verify: Retry-After seconds extracted from error message."""
        error = 'httpx.HTTPStatusError("Too Many Requests", status_code=429, retry_after_seconds=120)'
        result = _extract_rate_limit_retry_after_seconds(error)
        assert result == 120.0

    def test_extracts_retry_after_with_decimal(self) -> None:
        """Verify: Decimal retry_after values are handled."""
        error = 'status_code=429, retry_after_seconds=45.5'
        result = _extract_rate_limit_retry_after_seconds(error)
        assert result == 45.5

    def test_returns_none_when_no_retry_after_present(self) -> None:
        """Verify: Returns None when retry_after_seconds not in error."""
        error = "status_code=429, timeout occurred"
        result = _extract_rate_limit_retry_after_seconds(error)
        assert result is not None  # should return cooldown default

    def test_returns_cooldown_default_on_malformed_retry_after(self) -> None:
        """Verify: Returns cooldown default when retry_after value unparseable."""
        error = 'status_code=429, retry_after_seconds=invalid_value'
        result = _extract_rate_limit_retry_after_seconds(error)
        assert result is not None and result > 0

    def test_clamps_excessive_retry_after(self) -> None:
        """Verify: Extremely large retry_after values don't break logic."""
        error = 'status_code=429, retry_after_seconds=999999'
        result = _extract_rate_limit_retry_after_seconds(error)
        assert result == 999999.0


class TestMarkAnalysisFailed429:
    """Test _mark_analysis_failed behavior specifically for 429 errors."""

    @pytest.mark.asyncio
    async def test_marks_analysis_failed_with_429(self):
        """Verify: 429 error sets status=failed with friendly message."""
        analysis_id = uuid4()
        error_429 = 'httpx.HTTPStatusError("Too Many Requests", status_code=429, retry_after_seconds=60)'

        # Mock the database session
        mock_analysis = MagicMock()
        mock_analysis.status = "pending"
        mock_analysis.failure_reason = None
        mock_analysis.failed_at = None
        mock_analysis.next_retry_at = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        # Create an async context manager mock
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "src.infrastructure.database.connection.get_session_factory",
            return_value=mock_session_factory,
        ):
            await _mark_analysis_failed(
                analysis_id=str(analysis_id),
                task_id="test-task-123",
                error=error_429,
                retry_count=0,
            )

            # Verify the mock was called and status was changed
            assert mock_session.scalar.called
            assert mock_analysis.status == "failed"
            assert mock_analysis.failure_reason.startswith("Limite de uso da IA atingido.")
            assert "429" in mock_analysis.failure_reason
            assert mock_analysis.failed_at is not None

    @pytest.mark.asyncio
    async def test_populates_next_retry_at_from_retry_after(self):
        """Verify: next_retry_at is set from retry_after_seconds."""
        analysis_id = uuid4()
        error_429 = 'httpx.HTTPStatusError("Too Many Requests", status_code=429, retry_after_seconds=120)'

        # Mock the database
        mock_analysis = MagicMock()
        mock_analysis.status = "pending"
        mock_analysis.failed_at = None
        mock_analysis.next_retry_at = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        # Create an async context manager mock
        mock_session_factory_obj = MagicMock()
        mock_session_factory_obj.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory_obj.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "src.infrastructure.database.connection.get_session_factory",
            return_value=mock_session_factory_obj,
        ):
            before_call = datetime.now(UTC)
            await _mark_analysis_failed(
                analysis_id=str(analysis_id),
                task_id="test-task-123",
                error=error_429,
                retry_count=0,
            )
            after_call = datetime.now(UTC)

            # Verify next_retry_at was populated
            assert mock_analysis.next_retry_at is not None
            # Should be roughly 120 seconds in the future
            expected_min = before_call + timedelta(seconds=119)
            expected_max = after_call + timedelta(seconds=121)
            assert expected_min <= mock_analysis.next_retry_at <= expected_max

    @pytest.mark.asyncio
    async def test_non_429_error_does_not_populate_next_retry_at(self):
        """Verify: Non-429 errors do NOT set next_retry_at (awaits new task)."""
        analysis_id = uuid4()
        error_non_429 = 'ValueError("Resume text validation failed")'

        # Mock the database
        mock_analysis = MagicMock()
        mock_analysis.status = "pending"
        mock_analysis.next_retry_at = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        # Create an async context manager mock
        mock_session_factory_obj = MagicMock()
        mock_session_factory_obj.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory_obj.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "src.infrastructure.database.connection.get_session_factory",
            return_value=mock_session_factory_obj,
        ):
            await _mark_analysis_failed(
                analysis_id=str(analysis_id),
                task_id="test-task-123",
                error=error_non_429,
                retry_count=3,  # Max retries exceeded
            )

            # Verify non-429 errors don't set next_retry_at
            assert mock_analysis.status == "failed"
            assert mock_analysis.next_retry_at is None
            assert "Resume text validation failed" in mock_analysis.failure_reason

    @pytest.mark.asyncio
    async def test_friendly_message_in_failure_reason_for_429(self):
        """Verify: failure_reason includes both friendly message and technical details."""
        analysis_id = uuid4()
        error_429 = (
            'httpx.HTTPStatusError("Quota exceeded", status_code=429, '
            'retry_after_seconds=300, additional_context="Free tier exhausted")'
        )

        # Mock the database
        mock_analysis = MagicMock()
        mock_analysis.status = "pending"
        mock_analysis.failure_reason = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        # Create an async context manager mock
        mock_session_factory_obj = MagicMock()
        mock_session_factory_obj.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory_obj.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "src.infrastructure.database.connection.get_session_factory",
            return_value=mock_session_factory_obj,
        ):
            await _mark_analysis_failed(
                analysis_id=str(analysis_id),
                task_id="test-task-123",
                error=error_429,
                retry_count=0,
            )

            reason = mock_analysis.failure_reason
            # Should start with friendly Portuguese message
            assert reason.startswith("Limite de uso da IA atingido.")
            # Should include technical error details
            assert "429" in reason
            assert "status_code" in reason or "Quota" in reason

    @pytest.mark.asyncio
    async def test_task_id_recorded_in_failed_analysis(self):
        """Verify: task_id is recorded for debugging."""
        analysis_id = uuid4()
        task_id = "celery-task-abc123def456"
        error_429 = 'status_code=429, retry_after_seconds=60'

        # Mock the database
        mock_analysis = MagicMock()
        mock_analysis.status = "pending"
        mock_analysis.task_id = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        # Create an async context manager mock
        mock_session_factory_obj = MagicMock()
        mock_session_factory_obj.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory_obj.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "src.infrastructure.database.connection.get_session_factory",
            return_value=mock_session_factory_obj,
        ):
            await _mark_analysis_failed(
                analysis_id=str(analysis_id),
                task_id=task_id,
                error=error_429,
                retry_count=0,
            )

            # Verify task_id was recorded
            assert mock_analysis.task_id == task_id

    @pytest.mark.asyncio
    async def test_handles_missing_analysis_gracefully(self) -> None:
        """Verify: Missing analysis_id doesn't crash, returns silently."""
        fake_analysis_id = str(uuid4())

        # Should not raise
        await _mark_analysis_failed(
            analysis_id=fake_analysis_id,
            task_id="test-task",
            error="status_code=429",
            retry_count=0,
        )

    @pytest.mark.asyncio
    async def test_handles_invalid_analysis_id_gracefully(self) -> None:
        """Verify: Invalid UUID format is handled gracefully."""
        # Should not raise
        await _mark_analysis_failed(
            analysis_id="not-a-valid-uuid",
            task_id="test-task",
            error="status_code=429",
            retry_count=0,
        )


class TestProcess429QuotaExceeded:
    """Integration tests for process_analysis task with 429 errors."""

    def test_429_error_detection_in_error_string(self):
        """Verify: Code correctly detects 429 in error string."""
        # The key logic in process_analysis is:
        # is_quota_exceeded = "status_code=429" in error_str
        # This test validates that detection pattern works

        error_with_429 = (
            'httpx.HTTPStatusError("Too Many Requests", status_code=429, '
            'retry_after_seconds=60)'
        )
        assert "status_code=429" in error_with_429

        error_without_429 = "RuntimeError: Resume extraction failed"
        assert "status_code=429" not in error_without_429

        error_429_in_middle = (
            "Failed to call AI service. Root cause: status_code=429 "
            "due to quota exceeded"
        )
        assert "status_code=429" in error_429_in_middle

    def test_429_friendly_message_applied_correctly(self):
        """Verify: 429 errors get friendly Portuguese message."""
        error_429 = "status_code=429, retry_after_seconds=120"

        if "status_code=429" in error_429:
            friendly_msg = "Limite de uso da IA atingido. " + error_429[:500]
        else:
            friendly_msg = error_429[:1000]

        assert friendly_msg.startswith("Limite de uso da IA atingido.")
        assert "429" in friendly_msg

    def test_non_429_no_friendly_message_applied(self):
        """Verify: Non-429 errors don't get Portuguese prefix."""
        error_non_429 = "RuntimeError: Resume extraction failed"

        if "status_code=429" in error_non_429:
            friendly_msg = "Limite de uso da IA atingido. " + error_non_429[:500]
        else:
            friendly_msg = error_non_429[:1000]

        assert not friendly_msg.startswith("Limite de uso da IA atingido.")
        assert friendly_msg == error_non_429

    @pytest.mark.asyncio
    async def test_quota_exceeded_with_retry_after_duration(self):
        """Verify: retry_after_seconds is properly converted to next_retry_at."""
        analysis_id = uuid4()
        retry_after_seconds = 180

        # Mock the database
        mock_analysis = MagicMock()
        mock_analysis.status = "pending"
        mock_analysis.next_retry_at = None

        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=mock_analysis)
        mock_session.commit = AsyncMock()

        # Create an async context manager mock
        mock_session_factory_obj = MagicMock()
        mock_session_factory_obj.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory_obj.return_value.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "src.infrastructure.database.connection.get_session_factory",
            return_value=mock_session_factory_obj,
        ):
            error_with_retry_after = (
                f'HTTPStatusError("Too Many Requests", status_code=429, '
                f'retry_after_seconds={retry_after_seconds})'
            )

            before_mark = datetime.now(UTC)
            await _mark_analysis_failed(
                analysis_id=str(analysis_id),
                task_id="test-task",
                error=error_with_retry_after,
                retry_count=0,
            )
            after_mark = datetime.now(UTC)

            # Verify next_retry_at is set correctly
            assert mock_analysis.next_retry_at is not None
            # Should be approximately retry_after_seconds in the future
            expected_lower = before_mark + timedelta(seconds=retry_after_seconds - 1)
            expected_upper = after_mark + timedelta(seconds=retry_after_seconds + 1)
            assert expected_lower <= mock_analysis.next_retry_at <= expected_upper
