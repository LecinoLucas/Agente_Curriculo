"""Unit tests for POST /{job_id}/recalculate-ranking.

Invariants:
A. Job found + hash present → queued=True, provider_calls=0.
B. Job not found → 404.
C. Job without job_profile_hash → 409.
D. enqueue_job_match_recompute is called with the job_id.
E. Function source has no Gemini, AnalysisService, or _invalidate reference.
F. RankingRecalculateResponse schema carries provider_calls field.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.interface.api.routers.jobs import recalculate_job_ranking
from src.interface.api.schemas.ranking_schemas import RankingRecalculateResponse


# ── helpers ──────────────────────────────────────────────────────────────────

def _mock_job(*, has_hash: bool = True) -> MagicMock:
    job = MagicMock()
    job.id = uuid4()
    job.job_profile_hash = "abc123hash" if has_hash else None
    return job


def _mock_db(return_value) -> AsyncMock:
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=return_value)
    return db


def _mock_user() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), role="admin")


def _patch_lazy_imports(job=None, enqueue_calls: list | None = None):
    """Patch the two lazy imports inside recalculate_job_ranking."""
    _calls = enqueue_calls if enqueue_calls is not None else []

    async def fake_enqueue(jid):
        _calls.append(jid)

    mock_job_model = MagicMock()

    return (
        patch("src.infrastructure.database.models.job_model.JobModel", new=mock_job_model),
        patch(
            "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
            new=fake_enqueue,
        ),
    )


# ── A. Valid job ──────────────────────────────────────────────────────────────


class TestValidJob:
    @pytest.mark.asyncio
    async def test_returns_queued_true(self) -> None:
        job = _mock_job(has_hash=True)
        enqueue_calls: list = []

        async def fake_enqueue(jid):
            enqueue_calls.append(jid)

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
            new=fake_enqueue,
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(job)
            result = await recalculate_job_ranking(
                job_id=job.id,
                current_user=_mock_user(),
                db=db,
            )

        assert result.queued is True

    @pytest.mark.asyncio
    async def test_provider_calls_is_zero(self) -> None:
        job = _mock_job(has_hash=True)

        async def fake_enqueue(_jid):
            pass

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
            new=fake_enqueue,
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(job)
            result = await recalculate_job_ranking(
                job_id=job.id,
                current_user=_mock_user(),
                db=db,
            )

        assert result.provider_calls == 0

    @pytest.mark.asyncio
    async def test_returns_correct_job_id(self) -> None:
        job = _mock_job(has_hash=True)

        async def fake_enqueue(_jid):
            pass

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
            new=fake_enqueue,
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(job)
            result = await recalculate_job_ranking(
                job_id=job.id,
                current_user=_mock_user(),
                db=db,
            )

        assert result.job_id == job.id

    @pytest.mark.asyncio
    async def test_enqueue_called_with_job_id(self) -> None:
        job = _mock_job(has_hash=True)
        enqueue_calls: list = []

        async def fake_enqueue(jid):
            enqueue_calls.append(jid)

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
            new=fake_enqueue,
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(job)
            await recalculate_job_ranking(
                job_id=job.id,
                current_user=_mock_user(),
                db=db,
            )

        assert len(enqueue_calls) == 1
        assert enqueue_calls[0] == job.id

    @pytest.mark.asyncio
    async def test_message_is_non_empty(self) -> None:
        job = _mock_job(has_hash=True)

        async def fake_enqueue(_jid):
            pass

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
            new=fake_enqueue,
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(job)
            result = await recalculate_job_ranking(
                job_id=job.id,
                current_user=_mock_user(),
                db=db,
            )

        assert isinstance(result.message, str)
        assert len(result.message) > 0


# ── B. Job not found → 404 ────────────────────────────────────────────────────


class TestJobNotFound:
    @pytest.mark.asyncio
    async def test_raises_404(self) -> None:
        from fastapi import HTTPException

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(None)
            with pytest.raises(HTTPException) as exc_info:
                await recalculate_job_ranking(
                    job_id=uuid4(),
                    current_user=_mock_user(),
                    db=db,
                )

        assert exc_info.value.status_code == 404


# ── C. Job without hash → 409 ─────────────────────────────────────────────────


class TestJobWithoutHash:
    @pytest.mark.asyncio
    async def test_raises_409(self) -> None:
        from fastapi import HTTPException

        job = _mock_job(has_hash=False)

        with patch(
            "src.infrastructure.database.models.job_model.JobModel", new=MagicMock()
        ), patch(
            "src.interface.api.routers.jobs.sa.select", return_value=MagicMock()
        ):
            db = _mock_db(job)
            with pytest.raises(HTTPException) as exc_info:
                await recalculate_job_ranking(
                    job_id=job.id,
                    current_user=_mock_user(),
                    db=db,
                )

        assert exc_info.value.status_code == 409


# ── E. Source-level guardrails ────────────────────────────────────────────────


class TestSourceGuardrails:
    def _fn_source(self) -> str:
        import inspect
        return inspect.getsource(recalculate_job_ranking)

    def test_no_gemini_reference(self) -> None:
        assert "gemini" not in self._fn_source().lower()

    def test_no_ai_service_reference(self) -> None:
        assert "ai_service" not in self._fn_source().lower()

    def test_no_analyze_call(self) -> None:
        assert ".analyze(" not in self._fn_source()

    def test_no_analysis_service_import(self) -> None:
        assert "AnalysisService" not in self._fn_source()

    def test_no_request_analysis_use_case(self) -> None:
        assert "RequestAnalysisUseCase" not in self._fn_source()

    def test_no_invalidate_call(self) -> None:
        assert "_invalidate_job_scores_and_matches" not in self._fn_source()

    def test_uses_enqueue_job_match_recompute(self) -> None:
        assert "enqueue_job_match_recompute" in self._fn_source()


# ── F. Schema ─────────────────────────────────────────────────────────────────


class TestRankingRecalculateResponseSchema:
    def test_schema_has_provider_calls_zero(self) -> None:
        r = RankingRecalculateResponse(
            job_id=uuid4(),
            queued=True,
            provider_calls=0,
            message="Recálculo enfileirado.",
        )
        assert r.provider_calls == 0
        assert r.queued is True

    def test_schema_queued_and_message(self) -> None:
        r = RankingRecalculateResponse(
            job_id=uuid4(),
            queued=True,
            provider_calls=0,
            message="ok",
        )
        assert isinstance(r.message, str)
        assert r.queued is True
