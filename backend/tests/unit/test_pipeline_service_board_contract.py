from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.application.services.pipeline_service import KANBAN_STAGES, PipelineService
from src.interface.api.schemas.pipeline_schemas import (
    JobMatchCandidateResponse,
    PipelineBoardFilters,
    PipelineBoardResponse,
)


def test_row_to_match_response_preserves_job_fit_score_for_board() -> None:
    row = {
        "candidate_id": uuid4(),
        "candidate_name": "Lecino Lucas",
        "job_id": uuid4(),
        "stage": "entry",
        "status": "active",
        "entered_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "top_skills": '["Protheus", "ADVPL", "SQL"]',
        "ai_status": "completed",
        "job_fit_score": Decimal("84.50"),
    }

    result = PipelineService._row_to_match_response(row)

    assert result.job_fit_score == Decimal("84.50")
    assert result.ai_status == "completed"
    assert result.top_skills == ["Protheus", "ADVPL", "SQL"]
    assert set(result.model_dump().keys()) == {
        "candidate_id",
        "candidate_name",
        "job_id",
        "stage",
        "candidate_status",
        "status",
        "entered_at",
        "top_skills",
        "updated_at",
        "ai_status",
        "job_fit_score",
        "requires_behavioral_assessment",
        "requires_behavioral_ai_evaluation",
        "requires_interview",
        "requires_scorecard",
        "behavioral_assessment_status",
        "behavioral_submitted_at",
        "behavioral_ai_evaluation_status",
        "interview_status",
        "interview_scheduled_start",
        "interview_scorecard_status",
    }


def test_row_to_match_response_preserves_waiting_extraction_ai_status() -> None:
    row = {
        "candidate_id": uuid4(),
        "candidate_name": "Ana Waiting",
        "job_id": uuid4(),
        "stage": "entry",
        "status": "active",
        "entered_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "top_skills": "[]",
        "ai_status": "waiting_extraction",
        "job_fit_score": None,
    }

    result = PipelineService._row_to_match_response(row)

    assert result.ai_status == "waiting_extraction"
    assert result.model_dump()["ai_status"] == "waiting_extraction"


# ---------------------------------------------------------------------------
# get_board truncation (B-CRIT-05 — AUDIT-FIX-2)
# ---------------------------------------------------------------------------

def _make_match(stage: str = "entry") -> JobMatchCandidateResponse:
    return JobMatchCandidateResponse(
        candidate_id=uuid4(),
        candidate_name="Test",
        job_id=uuid4(),
        stage=stage,  # type: ignore[arg-type]
        candidate_status="active",
        top_skills=[],
        updated_at=datetime.now(UTC),
    )


def _make_service_with_matches(matches: list[JobMatchCandidateResponse]) -> PipelineService:
    repo = MagicMock()
    session = AsyncMock()
    service = PipelineService(repo, session)
    service.list_job_matches = AsyncMock(return_value=matches)  # type: ignore[method-assign]
    return service


@pytest.mark.asyncio
async def test_get_board_not_truncated_when_below_limit() -> None:
    matches = [_make_match("entry") for _ in range(10)]
    service = _make_service_with_matches(matches)

    with patch("src.application.services.pipeline_service.settings") as mock_settings:
        mock_settings.PIPELINE_BOARD_MAX_ROWS = 500
        board = await service.get_board(uuid4())

    assert isinstance(board, PipelineBoardResponse)
    assert board.truncated is False
    assert len(board.columns) == len(KANBAN_STAGES)
    entry_col = next(c for c in board.columns if c.stage == "entry")
    assert len(entry_col.candidates) == 10


@pytest.mark.asyncio
async def test_get_board_not_truncated_when_exactly_at_limit() -> None:
    # Exactly max_rows rows → no truncation (no extra row came back from DB).
    max_rows = 5
    matches = [_make_match("entry") for _ in range(max_rows)]
    service = _make_service_with_matches(matches)

    with patch("src.application.services.pipeline_service.settings") as mock_settings:
        mock_settings.PIPELINE_BOARD_MAX_ROWS = max_rows
        board = await service.get_board(uuid4())

    assert board.truncated is False
    entry_col = next(c for c in board.columns if c.stage == "entry")
    assert len(entry_col.candidates) == max_rows


@pytest.mark.asyncio
async def test_get_board_truncated_when_above_limit() -> None:
    # max_rows + 1 sentinel row came back → truncated, response capped to max_rows.
    max_rows = 5
    matches = [_make_match("entry") for _ in range(max_rows + 1)]
    service = _make_service_with_matches(matches)

    with patch("src.application.services.pipeline_service.settings") as mock_settings:
        mock_settings.PIPELINE_BOARD_MAX_ROWS = max_rows
        board = await service.get_board(uuid4())

    assert board.truncated is True
    entry_col = next(c for c in board.columns if c.stage == "entry")
    assert len(entry_col.candidates) == max_rows  # sliced to max_rows


@pytest.mark.asyncio
async def test_get_board_passes_max_rows_plus_one_to_list_job_matches() -> None:
    # Service must pass max_rows + 1 so it can detect truncation without false positives.
    service = _make_service_with_matches([])
    job_id = uuid4()

    with patch("src.application.services.pipeline_service.settings") as mock_settings:
        mock_settings.PIPELINE_BOARD_MAX_ROWS = 42
        await service.get_board(job_id)

    service.list_job_matches.assert_awaited_once_with(  # type: ignore[attr-defined]
        job_id, None, max_rows=43
    )


@pytest.mark.asyncio
async def test_get_board_distributes_candidates_to_correct_columns() -> None:
    matches = [
        _make_match("screening"),
        _make_match("screening"),
        _make_match("hr_interview"),
    ]
    service = _make_service_with_matches(matches)

    with patch("src.application.services.pipeline_service.settings") as mock_settings:
        mock_settings.PIPELINE_BOARD_MAX_ROWS = 500
        board = await service.get_board(uuid4())

    col_screening = next(c for c in board.columns if c.stage == "screening")
    col_hr = next(c for c in board.columns if c.stage == "hr_interview")
    col_entry = next(c for c in board.columns if c.stage == "entry")

    assert len(col_screening.candidates) == 2
    assert len(col_hr.candidates) == 1
    assert len(col_entry.candidates) == 0


@pytest.mark.asyncio
async def test_pipeline_board_response_includes_truncated_field() -> None:
    board_not_truncated = PipelineBoardResponse(job_id=uuid4(), columns=[])
    board_truncated = PipelineBoardResponse(job_id=uuid4(), columns=[], truncated=True)

    assert board_not_truncated.truncated is False
    assert board_truncated.truncated is True
    assert "truncated" in board_not_truncated.model_dump()
