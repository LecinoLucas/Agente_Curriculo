"""Unit tests verifying B-03 fix: _cleanup_stale_processing_analyses_async applies limit."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.interface.workers.stale_analysis_cleanup_tasks import (
    _STALE_CLEANUP_BATCH_SIZE,
    _cleanup_stale_processing_analyses_async,
)


class _ScalarResult:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def all(self) -> list:
        return self._rows


class _ExecuteResult:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def scalars(self) -> _ScalarResult:
        return _ScalarResult(self._rows)


def _fake_analysis(*, status: str = "processing") -> MagicMock:
    obj = MagicMock()
    obj.status = status
    obj.created_at = datetime.now(UTC) - timedelta(minutes=10)
    return obj


def _make_sessionmaker(rows: list):
    captured_stmts: list = []

    async def fake_execute(stmt, *_a, **_kw) -> _ExecuteResult:
        captured_stmts.append(stmt)
        return _ExecuteResult(rows)

    fake_session = AsyncMock()
    fake_session.execute.side_effect = fake_execute
    fake_session.commit = AsyncMock()

    session_cm = AsyncMock()
    session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    session_cm.__aexit__ = AsyncMock(return_value=False)

    mock_sessionmaker = MagicMock(return_value=session_cm)
    fake_engine = AsyncMock()
    fake_engine.dispose = AsyncMock()

    return fake_engine, mock_sessionmaker, captured_stmts


@pytest.mark.asyncio
async def test_stale_cleanup_query_applies_batch_limit() -> None:
    """SELECT must include LIMIT _STALE_CLEANUP_BATCH_SIZE (B-03 fix)."""
    fake_engine, mock_sessionmaker, captured_stmts = _make_sessionmaker(rows=[])

    with patch(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
    ):
        result = await _cleanup_stale_processing_analyses_async(timeout_seconds=120)

    assert result["cleaned"] == 0
    assert captured_stmts, "execute() was not called"
    compiled = str(captured_stmts[0].compile(compile_kwargs={"literal_binds": True}))
    assert f"LIMIT {_STALE_CLEANUP_BATCH_SIZE}" in compiled


@pytest.mark.asyncio
async def test_stale_cleanup_resets_processing_analyses_to_pending() -> None:
    """Stale analyses must be reset to pending with the correct error_message."""
    analysis = _fake_analysis()
    fake_engine, mock_sessionmaker, _ = _make_sessionmaker(rows=[analysis])

    with patch(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
    ):
        result = await _cleanup_stale_processing_analyses_async(timeout_seconds=120)

    assert result == {"cleaned": 1, "timeout_seconds": 120}
    assert analysis.status == "pending"
    assert analysis.error_message == "reset_from_stale_processing"


@pytest.mark.asyncio
async def test_stale_cleanup_does_not_commit_when_no_stale_found() -> None:
    """commit() must not be called when no stale analyses are found."""
    fake_engine, mock_sessionmaker, _ = _make_sessionmaker(rows=[])

    fake_session = mock_sessionmaker.return_value.__aenter__.return_value

    with patch(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
    ):
        result = await _cleanup_stale_processing_analyses_async(timeout_seconds=60)

    assert result["cleaned"] == 0
    fake_session.commit.assert_not_called()
