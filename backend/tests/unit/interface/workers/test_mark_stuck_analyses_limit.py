"""Unit tests verifying B-02 fix: mark_stuck_analyses_as_failed applies batch limit."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.interface.workers.analysis_tasks import (
    _STUCK_CLEANUP_BATCH_SIZE,
    mark_stuck_analyses_as_failed,
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


def _fake_analysis(*, status: str = "processing", stale_at=None) -> MagicMock:
    now = datetime.now(UTC)
    obj = MagicMock()
    obj.id = "fake-id"
    obj.status = status
    obj.stale_at = stale_at or (now - timedelta(minutes=5))
    obj.started_at = now - timedelta(minutes=35)
    obj.created_at = now - timedelta(hours=3)
    return obj


def _make_sessionmaker(processing_rows: list, pending_rows: list):
    captured_stmts: list = []
    call_count = 0

    async def fake_execute(stmt, *_a, **_kw) -> _ExecuteResult:
        nonlocal call_count
        captured_stmts.append(stmt)
        rows = processing_rows if call_count == 0 else pending_rows
        call_count += 1
        return _ExecuteResult(rows)

    fake_session = AsyncMock()
    fake_session.execute.side_effect = fake_execute
    fake_session.commit = AsyncMock()

    session_cm = AsyncMock()
    session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    session_cm.__aexit__ = AsyncMock(return_value=False)

    mock_sessionmaker = MagicMock(return_value=session_cm)

    return mock_sessionmaker, captured_stmts, fake_session


@pytest.mark.asyncio
async def test_processing_bucket_query_applies_batch_limit() -> None:
    """processing_stuck SELECT must include LIMIT _STUCK_CLEANUP_BATCH_SIZE (B-02 fix)."""
    mock_sessionmaker, captured_stmts, _ = _make_sessionmaker(
        processing_rows=[], pending_rows=[]
    )

    await mark_stuck_analyses_as_failed(sessionmaker=mock_sessionmaker)

    assert len(captured_stmts) >= 1, "execute() was not called for processing bucket"
    compiled_processing = str(captured_stmts[0].compile(compile_kwargs={"literal_binds": True}))
    assert f"LIMIT {_STUCK_CLEANUP_BATCH_SIZE}" in compiled_processing


@pytest.mark.asyncio
async def test_pending_bucket_query_applies_batch_limit() -> None:
    """pending_stuck SELECT must include LIMIT _STUCK_CLEANUP_BATCH_SIZE (B-02 fix)."""
    mock_sessionmaker, captured_stmts, _ = _make_sessionmaker(
        processing_rows=[], pending_rows=[]
    )

    await mark_stuck_analyses_as_failed(sessionmaker=mock_sessionmaker)

    assert len(captured_stmts) >= 2, "execute() was not called for pending bucket"
    compiled_pending = str(captured_stmts[1].compile(compile_kwargs={"literal_binds": True}))
    assert f"LIMIT {_STUCK_CLEANUP_BATCH_SIZE}" in compiled_pending


@pytest.mark.asyncio
async def test_mark_stuck_marks_processing_analyses_as_failed() -> None:
    """Processing stuck analyses must be marked as failed."""
    analysis = _fake_analysis(status="processing")
    mock_sessionmaker, _, fake_session = _make_sessionmaker(
        processing_rows=[analysis], pending_rows=[]
    )

    count = await mark_stuck_analyses_as_failed(sessionmaker=mock_sessionmaker)

    assert count == 1
    assert analysis.status == "failed"
    assert analysis.failure_reason in {
        "analysis_worker_claim_expired",
        "analysis_stuck_processing_timeout",
    }
    fake_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_mark_stuck_marks_pending_analyses_as_failed() -> None:
    """Pending stuck analyses must be marked as failed."""
    analysis = _fake_analysis(status="pending", stale_at=None)
    analysis.stale_at = None

    mock_sessionmaker, _, fake_session = _make_sessionmaker(
        processing_rows=[], pending_rows=[analysis]
    )

    count = await mark_stuck_analyses_as_failed(sessionmaker=mock_sessionmaker)

    assert count == 1
    assert analysis.status == "failed"
    assert analysis.failure_reason == "analysis_stuck_pending_timeout"
    fake_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_mark_stuck_no_commit_when_nothing_to_mark() -> None:
    """commit() must not be called when both buckets are empty."""
    mock_sessionmaker, _, fake_session = _make_sessionmaker(
        processing_rows=[], pending_rows=[]
    )

    count = await mark_stuck_analyses_as_failed(sessionmaker=mock_sessionmaker)

    assert count == 0
    fake_session.commit.assert_not_called()
