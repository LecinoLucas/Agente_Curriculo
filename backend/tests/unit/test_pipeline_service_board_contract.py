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
