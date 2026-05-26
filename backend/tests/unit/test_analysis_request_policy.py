from uuid import uuid4

from src.application.services.analysis_dispatch_service import AnalysisRequestPolicy


def test_auto_analysis_allowed_on_entry() -> None:
    decision = AnalysisRequestPolicy.decide(
        trigger_source="automatic",
        stage="entry",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=uuid4(),
        existing_active_status=None,
        has_reusable_completed=False,
    )

    assert decision.blocked is False
    assert decision.reused is False
    assert decision.reason == "auto_analysis_allowed_entry"


def test_auto_analysis_blocked_after_screening() -> None:
    decision = AnalysisRequestPolicy.decide(
        trigger_source="automatic",
        stage="hr_interview",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=uuid4(),
        existing_active_status=None,
        has_reusable_completed=False,
    )

    assert decision.blocked is True
    assert decision.reason == "auto_analysis_blocked_after_screening"


def test_auto_analysis_blocked_for_terminal_pipeline() -> None:
    decision = AnalysisRequestPolicy.decide(
        trigger_source="automatic",
        stage="rejected",
        pipeline_status="terminal",
        link_status="rejected",
        requested_by_user_id=uuid4(),
        existing_active_status=None,
        has_reusable_completed=False,
    )

    assert decision.blocked is True
    assert decision.reason == "auto_analysis_blocked_terminal_pipeline"


def test_auto_analysis_reuses_waiting_pending_and_processing() -> None:
    waiting = AnalysisRequestPolicy.decide(
        trigger_source="automatic",
        stage="screening",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=uuid4(),
        existing_active_status="waiting_extraction",
        has_reusable_completed=False,
    )
    pending = AnalysisRequestPolicy.decide(
        trigger_source="automatic",
        stage="screening",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=uuid4(),
        existing_active_status="pending",
        has_reusable_completed=False,
    )
    processing = AnalysisRequestPolicy.decide(
        trigger_source="automatic",
        stage="screening",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=uuid4(),
        existing_active_status="processing",
        has_reusable_completed=False,
    )

    assert waiting.reused is True
    assert waiting.reason == "auto_analysis_skipped_waiting_extraction"
    assert pending.reused is True
    assert pending.reason == "auto_analysis_skipped_duplicate_pending"
    assert processing.reused is True
    assert processing.reason == "auto_analysis_skipped_duplicate_processing"


def test_manual_reanalysis_requires_user_and_is_allowed_in_advanced_stage() -> None:
    denied = AnalysisRequestPolicy.decide(
        trigger_source="manual",
        stage="hr_interview",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=None,
        existing_active_status=None,
        has_reusable_completed=False,
    )
    allowed = AnalysisRequestPolicy.decide(
        trigger_source="manual",
        stage="hr_interview",
        pipeline_status="active",
        link_status="active",
        requested_by_user_id=uuid4(),
        existing_active_status=None,
        has_reusable_completed=False,
    )

    assert denied.blocked is True
    assert denied.reason == "manual_reanalysis_denied_missing_user"
    assert allowed.blocked is False
    assert allowed.reason == "manual_reanalysis_allowed"
