from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.interface.workers.matching_dispatcher import enqueue_published_job_matches


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_dispatcher_enqueues_matching_tasks_for_published_jobs(
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[dict] = []
    jobs = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]

    monkeypatch.setattr("src.core.settings.settings.ENABLE_DEV_MOCK", False)
    monkeypatch.setattr("src.core.settings.settings.MATCHING_AUTO_FANOUT_LIMIT", 25)
    monkeypatch.setattr(
        "src.infrastructure.database.connection.get_session_factory",
        lambda: (lambda: _FakeSessionContext()),
    )

    async def _fake_list_unmatched_published_jobs(self, analysis_id, limit):
        assert limit == 25
        return jobs

    monkeypatch.setattr(
        "src.infrastructure.repositories.sqlalchemy_analysis_repository.SQLAlchemyAnalysisRepository.list_unmatched_published_jobs",
        _fake_list_unmatched_published_jobs,
    )

    def _fake_apply_async(*, args, queue, task_id):
        calls.append({"args": args, "queue": queue, "task_id": task_id})

    monkeypatch.setattr(
        "src.interface.workers.matching_tasks.match_analysis_to_job.apply_async",
        _fake_apply_async,
    )

    analysis_id = uuid4()
    count = await enqueue_published_job_matches(analysis_id)

    assert count == 2
    assert len(calls) == 2
    assert all(call["queue"] == "matching" for call in calls)
    assert all(call["args"][0] == str(analysis_id) for call in calls)
    assert all(call["task_id"].startswith(f"matching:{analysis_id}:") for call in calls)


@pytest.mark.asyncio
async def test_dispatcher_returns_zero_when_no_unmatched_published_jobs(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("src.core.settings.settings.ENABLE_DEV_MOCK", False)
    monkeypatch.setattr("src.core.settings.settings.MATCHING_AUTO_FANOUT_LIMIT", 10)
    monkeypatch.setattr(
        "src.infrastructure.database.connection.get_session_factory",
        lambda: (lambda: _FakeSessionContext()),
    )

    async def _fake_list_unmatched_published_jobs(self, analysis_id, limit):
        assert limit == 10
        return []

    monkeypatch.setattr(
        "src.infrastructure.repositories.sqlalchemy_analysis_repository.SQLAlchemyAnalysisRepository.list_unmatched_published_jobs",
        _fake_list_unmatched_published_jobs,
    )

    analysis_id = uuid4()
    count = await enqueue_published_job_matches(analysis_id)

    assert count == 0
