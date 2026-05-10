from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from src.application.services.pipeline_service import PipelineService


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
