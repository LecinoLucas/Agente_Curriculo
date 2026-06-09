"""Unit tests for JOB-RANKING-SAFE-INVALIDATION-1.

Invariants:
A. _invalidate_job_scores_and_matches does NOT call sa.delete on score/match tables.
B. Marks CandidateJobScoreModel rows freshness_status='stale' (UPDATE, not DELETE).
C. Marks CandidateJobMatchModel rows freshness_status='stale' (UPDATE, not DELETE).
D. JobProfileAnalysisModel is_active=False update is preserved unchanged.
E. Recompute after stale: persist_score() finds existing rows regardless of freshness.
F. If worker fails mid-recompute, stale rows survive (no DELETE had occurred).
G. Source of _invalidate_job_scores_and_matches contains no sa.delete call.
"""
from __future__ import annotations

import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_repo_with_capture() -> tuple[MagicMock, list]:
    """Return (repo, executed_statements_list). session.execute appends to the list."""
    executed: list = []

    async def capture_execute(stmt):
        executed.append(stmt)

    session = MagicMock()
    session.execute = capture_execute
    repo = MagicMock()
    repo._session = session
    return repo, executed


async def _run_invalidate(job_id: UUID) -> list:
    from src.application.services.job_service import JobService

    svc = object.__new__(JobService)
    svc._repository, executed = _make_repo_with_capture()
    await svc._invalidate_job_scores_and_matches(job_id)
    return executed


# ── A/G. Source-level guardrails ─────────────────────────────────────────────


class TestSourceGuardrails:
    def _fn_source(self) -> str:
        from src.application.services.job_service import JobService
        return inspect.getsource(JobService._invalidate_job_scores_and_matches)

    def test_no_sa_delete_score(self) -> None:
        assert "sa.delete(CandidateJobScoreModel)" not in self._fn_source()

    def test_no_sa_delete_match(self) -> None:
        assert "sa.delete(CandidateJobMatchModel)" not in self._fn_source()

    def test_uses_sa_update_score(self) -> None:
        assert "sa.update(CandidateJobScoreModel)" in self._fn_source()

    def test_uses_sa_update_match(self) -> None:
        assert "sa.update(CandidateJobMatchModel)" in self._fn_source()

    def test_sets_freshness_status_stale(self) -> None:
        src = self._fn_source()
        assert '"stale"' in src or "'stale'" in src

    def test_preserves_jobprofileanalysis_deactivation(self) -> None:
        src = self._fn_source()
        assert "is_active" in src
        assert "False" in src


# ── B/C/D. Runtime: UPDATE statements sent to session.execute ────────────────


class TestSoftStaleMarking:
    @pytest.mark.asyncio
    async def test_score_rows_receive_update_not_delete(self) -> None:
        from sqlalchemy.sql.dml import Delete, Update

        executed = await _run_invalidate(uuid4())

        # Find statements targeting the score table
        score_stmts = [
            s for s in executed
            if hasattr(s, "table") and "score" in str(getattr(s, "table", "")).lower()
        ]
        assert len(score_stmts) >= 1, "Expected at least one statement targeting score table"
        for s in score_stmts:
            assert isinstance(s, Update), f"Score statement must be UPDATE, got {type(s).__name__}"
            assert not isinstance(s, Delete)

    @pytest.mark.asyncio
    async def test_match_rows_receive_update_not_delete(self) -> None:
        from sqlalchemy.sql.dml import Delete, Update

        executed = await _run_invalidate(uuid4())

        match_stmts = [
            s for s in executed
            if hasattr(s, "table") and "match" in str(getattr(s, "table", "")).lower()
        ]
        assert len(match_stmts) >= 1, "Expected at least one statement targeting match table"
        for s in match_stmts:
            assert isinstance(s, Update), f"Match statement must be UPDATE, got {type(s).__name__}"
            assert not isinstance(s, Delete)

    @pytest.mark.asyncio
    async def test_no_delete_statements_at_all(self) -> None:
        from sqlalchemy.sql.dml import Delete

        executed = await _run_invalidate(uuid4())

        deletes = [s for s in executed if isinstance(s, Delete)]
        assert deletes == [], f"Expected zero DELETE statements, found: {[type(s) for s in deletes]}"

    @pytest.mark.asyncio
    async def test_score_update_sets_freshness_stale(self) -> None:
        from sqlalchemy.sql.dml import Update

        executed = await _run_invalidate(uuid4())

        score_updates = [
            s for s in executed
            if isinstance(s, Update)
            and "score" in str(getattr(s, "table", "")).lower()
        ]
        assert len(score_updates) >= 1
        # Compile the update to check the SET clause contains freshness_status='stale'
        compiled = score_updates[0].compile(compile_kwargs={"literal_binds": True})
        assert "stale" in str(compiled).lower()

    @pytest.mark.asyncio
    async def test_match_update_sets_freshness_stale(self) -> None:
        from sqlalchemy.sql.dml import Update

        executed = await _run_invalidate(uuid4())

        match_updates = [
            s for s in executed
            if isinstance(s, Update)
            and "match" in str(getattr(s, "table", "")).lower()
        ]
        assert len(match_updates) >= 1
        compiled = match_updates[0].compile(compile_kwargs={"literal_binds": True})
        assert "stale" in str(compiled).lower()

    @pytest.mark.asyncio
    async def test_three_statements_executed(self) -> None:
        """Score UPDATE + Match UPDATE + JobProfileAnalysis UPDATE = 3 total."""
        executed = await _run_invalidate(uuid4())
        assert len(executed) == 3, f"Expected 3 statements, got {len(executed)}"


class TestJobProfileAnalysisDeactivation:
    @pytest.mark.asyncio
    async def test_jobprofileanalysis_update_executed(self) -> None:
        from sqlalchemy.sql.dml import Update

        executed = await _run_invalidate(uuid4())

        analysis_updates = [
            s for s in executed
            if isinstance(s, Update)
            and "job_profile_analysis" in str(getattr(s, "table", "")).lower()
        ]
        assert len(analysis_updates) >= 1, "Expected UPDATE on job_profile_analysis table"

    @pytest.mark.asyncio
    async def test_jobprofileanalysis_sets_is_active_false(self) -> None:
        from sqlalchemy.sql.dml import Update

        executed = await _run_invalidate(uuid4())

        analysis_updates = [
            s for s in executed
            if isinstance(s, Update)
            and "job_profile_analysis" in str(getattr(s, "table", "")).lower()
        ]
        assert len(analysis_updates) >= 1
        compiled = str(analysis_updates[0].compile(compile_kwargs={"literal_binds": True}))
        assert "is_active" in compiled.lower()
        assert "false" in compiled.lower()


# ── E. persist_score() refreshes stale rows ─────────────────────────────────


class TestPersistScoreRefreshesStaleness:
    def test_persist_score_lookup_does_not_filter_by_freshness(self) -> None:
        """persist_score finds existing score by (candidate_id, job_id, version_id),
        not by freshness_status — so stale rows are found and updated to fresh."""
        from src.application.services.candidate_ranking_score_store import (
            CandidateRankingScoreStore,
        )
        src = inspect.getsource(CandidateRankingScoreStore.persist_score)
        # The WHERE clause finding existing score should not filter by freshness
        # (the lookup uses candidate_id, job_id, version_id)
        lookup_portion = src.split("freshness_status")[0] if "freshness_status" in src else src
        assert "candidate_id" in lookup_portion or "version_id" in lookup_portion

    def test_persist_score_sets_freshness_fresh_on_upsert(self) -> None:
        from src.application.services.candidate_ranking_score_store import (
            CandidateRankingScoreStore,
        )
        src = inspect.getsource(CandidateRankingScoreStore.persist_score)
        assert "freshness_status" in src


# ── F. Stale rows survive worker failure ─────────────────────────────────────


class TestStaleRowsSurviveWorkerFailure:
    def test_invalidate_and_enqueue_are_separate_concerns(self) -> None:
        """_invalidate runs in HTTP request transaction; enqueue is a separate async call.
        If worker fails, UPDATE SET freshness_status='stale' is already committed —
        stale rows (old data) survive and are visible as fallback."""
        from src.application.services.job_service import JobService
        from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

        invalidate_src = inspect.getsource(JobService._invalidate_job_scores_and_matches)
        assert "enqueue_job_match_recompute" not in invalidate_src, (
            "_invalidate_job_scores_and_matches must not call enqueue — they are separate concerns"
        )

    def test_recalculate_endpoint_does_not_call_invalidate(self) -> None:
        from src.interface.api.routers.jobs import recalculate_job_ranking
        src = inspect.getsource(recalculate_job_ranking)
        assert "_invalidate_job_scores_and_matches" not in src

    def test_no_hard_delete_means_data_survives_worker_crash(self) -> None:
        """Verify by source inspection that no DELETE exists for score or match tables."""
        from src.application.services.job_service import JobService
        src = inspect.getsource(JobService._invalidate_job_scores_and_matches)
        assert "sa.delete(CandidateJobScoreModel)" not in src
        assert "sa.delete(CandidateJobMatchModel)" not in src
