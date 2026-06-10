"""Unit tests for SmartRefreshUseCase.

Invariants:
  P1. preview: job not found raises JobNotFoundForSmartRefreshError.
  P2. preview: completed analysis → ranking_recalculation.
  P3. preview: failed analysis → ai_analysis.
  P4. preview: no analysis (None) → ai_analysis.
  P5. preview: pending/processing → skipped_already_processing.
  P6. preview: no resume → skipped_no_resume.
  P7. preview: never calls any AI provider.
  E1. execute: ranking_recalculation candidates → enqueue_job_match_recompute called once.
  E2. execute: ai_analysis candidates → request_auto_analysis called per candidate.
  E3. execute: pending/processing candidates → not passed to dispatcher.
  E4. execute: no-resume candidates → skipped and counted.
  E5. execute: never calls Gemini directly (provider_calls_now=0).
  E6. execute: completed analysis not re-dispatched to AI.
  E7. execute: job not found raises JobNotFoundForSmartRefreshError.
  R1. router: preview job not found → HTTP 404.
  R2. router: execute job not found → HTTP 404.
"""
from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from src.application.use_cases.smart_refresh_use_case import (
    JobNotFoundForSmartRefreshError,
    SmartRefreshUseCase,
    _classify,
    _CandidateRow,
)


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_row(
    *,
    analysis_status: str | None = None,
    has_resume: bool = True,
    candidate_id: UUID | None = None,
) -> _CandidateRow:
    return _CandidateRow(
        candidate_id=candidate_id or uuid4(),
        analysis_status=analysis_status,
        has_resume=has_resume,
    )


def _mock_db(job_found: bool = True, rows: list[_CandidateRow] | None = None) -> AsyncMock:
    """Build a mock AsyncSession for use case tests.

    db.scalar → job object (or None)
    db.execute → mapping rows
    """
    db = AsyncMock()

    job_obj = MagicMock() if job_found else None
    db.scalar = AsyncMock(return_value=job_obj)

    mapping_rows = []
    for r in (rows or []):
        m = MagicMock()
        m.candidate_id = r.candidate_id
        m.analysis_status = r.analysis_status
        m.has_resume = r.has_resume
        mapping_rows.append(m)

    mock_result = MagicMock()
    mock_result.mappings.return_value = iter(mapping_rows)
    db.execute = AsyncMock(return_value=mock_result)

    return db


@contextmanager
def _patch_sa_select():
    """Patch sa.select in the use case so SQLAlchemy doesn't validate MagicMock objects."""
    with patch("src.application.use_cases.smart_refresh_use_case.sa.select", return_value=MagicMock()):
        yield


@contextmanager
def _patch_job_model():
    with patch("src.infrastructure.database.models.job_model.JobModel", new=MagicMock()):
        yield


@contextmanager
def _patch_enqueue(calls: list | None = None):
    _calls = calls if calls is not None else []

    async def _fake(jid):
        _calls.append(jid)

    with patch(
        "src.interface.workers.matching_dispatcher.enqueue_job_match_recompute",
        new=_fake,
    ):
        yield _calls


@contextmanager
def _patch_dispatcher(decision_created: bool = True):
    async def _fake_dispatch(*, candidate_id, job_id, requested_by, trigger_source):
        d = MagicMock()
        d.created = decision_created
        return d

    with patch(
        "src.application.services.analysis_dispatch_service.CandidateJobAnalysisDispatcher",
    ) as MockDispatcher:
        instance = MockDispatcher.return_value
        instance.request_auto_analysis = AsyncMock(side_effect=_fake_dispatch)
        yield instance


# ── _classify unit tests ──────────────────────────────────────────────────────


class TestClassify:
    def test_no_resume_is_skipped(self):
        assert _classify(_make_row(has_resume=False, analysis_status="completed")) == "skipped_no_resume"

    def test_completed_is_ranking_recalculation(self):
        assert _classify(_make_row(has_resume=True, analysis_status="completed")) == "ranking_recalculation"

    def test_failed_is_ai_analysis(self):
        assert _classify(_make_row(has_resume=True, analysis_status="failed")) == "ai_analysis"

    def test_cancelled_is_ai_analysis(self):
        assert _classify(_make_row(has_resume=True, analysis_status="cancelled")) == "ai_analysis"

    def test_no_analysis_is_ai_analysis(self):
        assert _classify(_make_row(has_resume=True, analysis_status=None)) == "ai_analysis"

    def test_pending_is_skipped_already_processing(self):
        assert _classify(_make_row(has_resume=True, analysis_status="pending")) == "skipped_already_processing"

    def test_processing_is_skipped_already_processing(self):
        assert _classify(_make_row(has_resume=True, analysis_status="processing")) == "skipped_already_processing"

    def test_retry_scheduled_is_skipped_already_processing(self):
        assert _classify(_make_row(has_resume=True, analysis_status="retry_scheduled")) == "skipped_already_processing"

    def test_waiting_extraction_is_skipped_already_processing(self):
        assert _classify(_make_row(has_resume=True, analysis_status="waiting_extraction")) == "skipped_already_processing"


# ── Preview tests ─────────────────────────────────────────────────────────────


class TestPreview:
    @pytest.mark.asyncio
    async def test_p1_job_not_found_raises(self):
        db = _mock_db(job_found=False)
        job_id = uuid4()
        with _patch_job_model(), _patch_sa_select():
            with pytest.raises(JobNotFoundForSmartRefreshError):
                await SmartRefreshUseCase(db).preview(job_id)

    @pytest.mark.asyncio
    async def test_p2_completed_classified_as_ranking_recalculation(self):
        db = _mock_db(rows=[_make_row(analysis_status="completed")])
        with _patch_job_model(), _patch_sa_select():
            data = await SmartRefreshUseCase(db).preview(uuid4())
        assert data.ranking_recalculation_count == 1
        assert data.ai_analysis_count == 0

    @pytest.mark.asyncio
    async def test_p3_failed_classified_as_ai_analysis(self):
        db = _mock_db(rows=[_make_row(analysis_status="failed")])
        with _patch_job_model(), _patch_sa_select():
            data = await SmartRefreshUseCase(db).preview(uuid4())
        assert data.ai_analysis_count == 1
        assert data.ranking_recalculation_count == 0

    @pytest.mark.asyncio
    async def test_p4_no_analysis_classified_as_ai_analysis(self):
        db = _mock_db(rows=[_make_row(analysis_status=None)])
        with _patch_job_model(), _patch_sa_select():
            data = await SmartRefreshUseCase(db).preview(uuid4())
        assert data.ai_analysis_count == 1

    @pytest.mark.asyncio
    async def test_p5_pending_and_processing_classified_as_skipped(self):
        db = _mock_db(rows=[
            _make_row(analysis_status="pending"),
            _make_row(analysis_status="processing"),
        ])
        with _patch_job_model(), _patch_sa_select():
            data = await SmartRefreshUseCase(db).preview(uuid4())
        assert data.skipped_already_processing_count == 2

    @pytest.mark.asyncio
    async def test_p6_no_resume_classified_as_skipped_no_resume(self):
        db = _mock_db(rows=[_make_row(has_resume=False, analysis_status="completed")])
        with _patch_job_model(), _patch_sa_select():
            data = await SmartRefreshUseCase(db).preview(uuid4())
        assert data.skipped_no_resume_count == 1
        assert data.ranking_recalculation_count == 0

    @pytest.mark.asyncio
    async def test_p7_preview_does_not_call_any_provider(self):
        db = _mock_db(rows=[
            _make_row(analysis_status="completed"),
            _make_row(analysis_status=None),
        ])
        with _patch_job_model(), _patch_sa_select(), _patch_dispatcher() as mock_instance:
            await SmartRefreshUseCase(db).preview(uuid4())
            mock_instance.request_auto_analysis.assert_not_called()

    @pytest.mark.asyncio
    async def test_total_candidates_correct(self):
        db = _mock_db(rows=[
            _make_row(analysis_status="completed"),
            _make_row(analysis_status="failed"),
            _make_row(analysis_status="pending"),
            _make_row(has_resume=False, analysis_status=None),
        ])
        with _patch_job_model(), _patch_sa_select():
            data = await SmartRefreshUseCase(db).preview(uuid4())
        assert data.total_candidates == 4
        assert data.ranking_recalculation_count == 1
        assert data.ai_analysis_count == 1
        assert data.skipped_already_processing_count == 1
        assert data.skipped_no_resume_count == 1


# ── Execute tests ─────────────────────────────────────────────────────────────


class TestExecute:
    @pytest.mark.asyncio
    async def test_e1_ranking_candidates_enqueue_recompute_once(self):
        job_id = uuid4()
        db = _mock_db(rows=[
            _make_row(analysis_status="completed"),
            _make_row(analysis_status="completed"),
        ])
        enqueue_calls: list = []
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(enqueue_calls), _patch_dispatcher():
            data = await SmartRefreshUseCase(db).execute(job_id, requested_by=uuid4())

        assert data.ranking_recalculation_enqueued is True
        assert len(enqueue_calls) == 1
        assert enqueue_calls[0] == job_id

    @pytest.mark.asyncio
    async def test_e2_ai_analysis_candidates_dispatch_per_candidate(self):
        cid1, cid2 = uuid4(), uuid4()
        db = _mock_db(rows=[
            _make_row(analysis_status=None, candidate_id=cid1),
            _make_row(analysis_status="failed", candidate_id=cid2),
        ])
        dispatched: list[UUID] = []

        async def _fake_dispatch(*, candidate_id, job_id, requested_by, trigger_source):
            dispatched.append(candidate_id)
            d = MagicMock()
            d.created = True
            return d

        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), \
             patch("src.application.services.analysis_dispatch_service.CandidateJobAnalysisDispatcher") as MockD:
            MockD.return_value.request_auto_analysis = AsyncMock(side_effect=_fake_dispatch)
            data = await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())

        assert set(dispatched) == {cid1, cid2}
        assert data.ai_analysis_enqueued == 2

    @pytest.mark.asyncio
    async def test_e3_pending_not_passed_to_dispatcher(self):
        db = _mock_db(rows=[
            _make_row(analysis_status="pending"),
            _make_row(analysis_status="processing"),
        ])
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), _patch_dispatcher() as mock_instance:
            data = await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())
            mock_instance.request_auto_analysis.assert_not_called()

        assert data.skipped_already_processing == 2

    @pytest.mark.asyncio
    async def test_e4_no_resume_skipped_and_counted(self):
        db = _mock_db(rows=[_make_row(has_resume=False, analysis_status=None)])
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), _patch_dispatcher() as mock_instance:
            data = await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())
            mock_instance.request_auto_analysis.assert_not_called()

        assert data.skipped_no_resume == 1

    @pytest.mark.asyncio
    async def test_e5_provider_calls_now_always_zero(self):
        db = _mock_db(rows=[
            _make_row(analysis_status="completed"),
            _make_row(analysis_status=None),
        ])
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), _patch_dispatcher(decision_created=True):
            data = await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())

        assert data.provider_calls_now == 0

    @pytest.mark.asyncio
    async def test_e6_completed_not_re_dispatched_to_ai(self):
        db = _mock_db(rows=[_make_row(analysis_status="completed")])
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), _patch_dispatcher() as mock_instance:
            await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())
            mock_instance.request_auto_analysis.assert_not_called()

    @pytest.mark.asyncio
    async def test_e7_job_not_found_raises(self):
        db = _mock_db(job_found=False)
        with _patch_job_model(), _patch_sa_select():
            with pytest.raises(JobNotFoundForSmartRefreshError):
                await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())

    @pytest.mark.asyncio
    async def test_may_use_provider_later_true_when_ai_enqueued(self):
        db = _mock_db(rows=[_make_row(analysis_status=None)])
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), _patch_dispatcher(decision_created=True):
            data = await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())

        assert data.may_use_provider_later is True

    @pytest.mark.asyncio
    async def test_may_use_provider_later_false_when_no_ai_enqueued(self):
        db = _mock_db(rows=[_make_row(analysis_status="completed")])
        with _patch_job_model(), _patch_sa_select(), _patch_enqueue(), _patch_dispatcher():
            data = await SmartRefreshUseCase(db).execute(uuid4(), requested_by=uuid4())

        assert data.may_use_provider_later is False


# ── Router endpoint tests ─────────────────────────────────────────────────────


class TestRouterEndpoints:
    @pytest.mark.asyncio
    async def test_r1_preview_404_when_job_not_found(self):
        from fastapi import HTTPException

        from src.interface.api.routers.jobs import smart_refresh_preview

        user = SimpleNamespace(id=uuid4(), role="recruiter")
        job_id = uuid4()
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=None)

        with _patch_job_model(), \
             patch("src.application.use_cases.smart_refresh_use_case.sa.select", return_value=MagicMock()):
            with pytest.raises(HTTPException) as exc_info:
                await smart_refresh_preview(job_id=job_id, current_user=user, db=db)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_r2_execute_404_when_job_not_found(self):
        from fastapi import HTTPException

        from src.interface.api.routers.jobs import smart_refresh_execute

        user = SimpleNamespace(id=uuid4(), role="recruiter")
        job_id = uuid4()
        db = AsyncMock()
        db.scalar = AsyncMock(return_value=None)

        with _patch_job_model(), \
             patch("src.application.use_cases.smart_refresh_use_case.sa.select", return_value=MagicMock()):
            with pytest.raises(HTTPException) as exc_info:
                await smart_refresh_execute(job_id=job_id, current_user=user, db=db)

        assert exc_info.value.status_code == 404
