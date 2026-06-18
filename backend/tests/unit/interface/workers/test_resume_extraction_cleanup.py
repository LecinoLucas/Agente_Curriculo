"""Unit tests for resume_extraction_cleanup_tasks."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.interface.workers.resume_extraction_cleanup_tasks import (
    _CLEANUP_BATCH_SIZE,
    _STUCK_THRESHOLD_SECONDS,
    _cleanup_stuck_extractions_async,
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


def _fake_version(*, age_seconds: int = _STUCK_THRESHOLD_SECONDS + 60) -> MagicMock:
    v = MagicMock()
    v.id = uuid4()
    v.extraction_status = "processing"
    v.extraction_error = "prior error"
    v.uploaded_at = datetime.now(UTC) - timedelta(seconds=age_seconds)
    return v


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

    return fake_engine, mock_sessionmaker, captured_stmts, fake_session


@pytest.mark.asyncio
async def test_cleanup_query_applies_batch_limit() -> None:
    fake_engine, mock_sessionmaker, captured_stmts, _ = _make_sessionmaker(rows=[])

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    assert result == {"reset": 0, "enqueued": 0}
    assert captured_stmts, "execute() was not called"
    compiled = str(captured_stmts[0].compile(compile_kwargs={"literal_binds": True}))
    assert f"LIMIT {_CLEANUP_BATCH_SIZE}" in compiled


@pytest.mark.asyncio
async def test_cleanup_resets_stuck_processing_to_pending() -> None:
    version = _fake_version(age_seconds=_STUCK_THRESHOLD_SECONDS + 60)
    fake_engine, mock_sessionmaker, _, fake_session = _make_sessionmaker(rows=[version])

    enqueued: list = []

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
            side_effect=lambda vid: enqueued.append(vid),
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    assert result == {"reset": 1, "enqueued": 1}
    assert version.extraction_status == "pending"
    assert version.extraction_error is None
    fake_session.commit.assert_called_once()
    assert enqueued == [version.id]


@pytest.mark.asyncio
async def test_cleanup_does_not_commit_when_nothing_stuck() -> None:
    fake_engine, mock_sessionmaker, _, fake_session = _make_sessionmaker(rows=[])

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    assert result == {"reset": 0, "enqueued": 0}
    fake_session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_cleanup_reenqueue_failure_does_not_raise_and_tracks_count() -> None:
    version = _fake_version()
    fake_engine, mock_sessionmaker, _, _ = _make_sessionmaker(rows=[version])

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
            side_effect=RuntimeError("broker down"),
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    # reset happened but enqueue failed — counts must reflect reality
    assert result["reset"] == 1
    assert result["enqueued"] == 0
    assert version.extraction_status == "pending"


@pytest.mark.asyncio
async def test_cleanup_resets_multiple_stuck_versions() -> None:
    versions = [_fake_version() for _ in range(3)]
    fake_engine, mock_sessionmaker, _, fake_session = _make_sessionmaker(rows=versions)

    enqueued: list = []

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
            side_effect=lambda vid: enqueued.append(vid),
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    assert result == {"reset": 3, "enqueued": 3}
    assert all(v.extraction_status == "pending" for v in versions)
    assert all(v.extraction_error is None for v in versions)
    assert len(enqueued) == 3
    fake_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_cleanup_query_filters_by_threshold_not_recent_processing() -> None:
    """The SELECT must include a cutoff on uploaded_at — recent versions are not returned
    by the DB query, so the cleanup must not touch them."""
    recent_version = _fake_version(age_seconds=60)  # well under threshold
    # The fake sessionmaker returns an empty list to simulate the DB not returning
    # the recent version (the WHERE clause filters it out).
    fake_engine, mock_sessionmaker, captured_stmts, fake_session = _make_sessionmaker(rows=[])

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    assert result == {"reset": 0, "enqueued": 0}
    fake_session.commit.assert_not_called()
    # Verify the query contains uploaded_at comparison (threshold guard is present)
    assert captured_stmts
    compiled = str(captured_stmts[0].compile(compile_kwargs={"literal_binds": True}))
    assert "uploaded_at" in compiled


@pytest.mark.asyncio
async def test_cleanup_partial_enqueue_failure_counts_correctly() -> None:
    """If some enqueues fail and some succeed, counts must reflect exactly that."""
    versions = [_fake_version() for _ in range(3)]
    fake_engine, mock_sessionmaker, _, _ = _make_sessionmaker(rows=versions)

    call_count = 0

    def _enqueue_side_effect(vid):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise RuntimeError("transient error")

    with (
        patch(
            "src.infrastructure.database.connection.create_celery_async_sessionmaker",
            new=AsyncMock(return_value=(fake_engine, mock_sessionmaker)),
        ),
        patch(
            "src.interface.workers.resume_extraction_cleanup_tasks.enqueue_resume_extraction",
            side_effect=_enqueue_side_effect,
        ),
    ):
        result = await _cleanup_stuck_extractions_async()

    assert result["reset"] == 3
    assert result["enqueued"] == 2  # one failed
