import pytest
from uuid import uuid4

from src.application.services.candidate_score_status_deriver import (
    derive_candidate_score_status,
)


class TestDeriveScoreStatus:
    """Test suite for candidate score status derivation."""

    def test_no_active_job(self):
        """When no active job: no_active_job status with no next action."""
        result = derive_candidate_score_status(
            active_job_id=None,
            pipeline_current_analysis_id=None,
            latest_analysis_id=None,
            latest_analysis_status=None,
            latest_analysis_job_id=None,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "no_active_job"
        assert result.analysis_status is None
        assert result.current_analysis_id is None
        assert result.match_score is None
        assert result.warnings == []
        assert result.next_action == "none"

    def test_waiting_analysis_no_pipeline_analysis(self):
        """Active job but no current_analysis_id in pipeline: waiting_analysis."""
        active_job_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=None,
            latest_analysis_id=None,
            latest_analysis_status=None,
            latest_analysis_job_id=None,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "waiting_analysis"
        assert result.current_analysis_id is None
        assert result.next_action == "request_analysis"

    def test_analysis_processing_pending(self):
        """Analysis status is pending: analysis_processing."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="pending",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "analysis_processing"
        assert result.analysis_status == "pending"
        assert result.current_analysis_id == analysis_id
        assert result.next_action == "wait_analysis"

    def test_analysis_processing_processing(self):
        """Analysis status is processing: analysis_processing."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="processing",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "analysis_processing"
        assert result.analysis_status == "processing"
        assert result.next_action == "wait_analysis"

    def test_analysis_processing_retry_scheduled(self):
        """Analysis status is retry_scheduled: analysis_processing."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="retry_scheduled",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "analysis_processing"
        assert result.analysis_status == "retry_scheduled"

    def test_analysis_failed(self):
        """Analysis status is failed: analysis_failed."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="failed",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "analysis_failed"
        assert result.analysis_status == "failed"
        assert result.next_action == "request_analysis"

    def test_analysis_cancelled(self):
        """Analysis status is cancelled: analysis_failed."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="cancelled",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "analysis_failed"
        assert result.analysis_status == "cancelled"

    def test_score_ready(self):
        """Analysis is valid, completed, and has fresh score: score_ready."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="completed",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=True,
            match_score=0.85,
        )
        assert result.score_status == "score_ready"
        assert result.analysis_status == "completed"
        assert result.match_score == 0.85
        assert result.current_analysis_id == analysis_id
        assert result.warnings == []
        assert result.next_action == "review_candidate"

    def test_score_stale_from_different_job(self):
        """Score exists but analysis is from different job: score_stale."""
        active_job_id = uuid4()
        other_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="completed",
            latest_analysis_job_id=other_job_id,  # Different from active_job_id
            has_fresh_score=True,
            match_score=0.72,
        )
        assert result.score_status == "score_stale"
        assert result.analysis_status == "completed"
        assert result.match_score == 0.72
        assert "analysis_from_different_job" in result.warnings
        assert "analysis_not_current_pipeline" not in result.warnings
        assert result.next_action == "wait_analysis"

    def test_score_stale_not_current_pipeline(self):
        """Score exists but analysis is not current pipeline: score_stale."""
        active_job_id = uuid4()
        pipeline_analysis_id = uuid4()
        old_analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=pipeline_analysis_id,
            latest_analysis_id=old_analysis_id,  # Different from pipeline_current
            latest_analysis_status="completed",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=True,
            match_score=0.68,
        )
        assert result.score_status == "score_stale"
        assert result.analysis_status == "completed"
        assert result.match_score == 0.68
        assert "analysis_not_current_pipeline" in result.warnings
        assert "analysis_from_different_job" not in result.warnings
        assert result.next_action == "wait_analysis"

    def test_score_stale_both_mismatches(self):
        """Score exists but analysis fails both validation checks: score_stale with both warnings."""
        active_job_id = uuid4()
        other_job_id = uuid4()
        pipeline_analysis_id = uuid4()
        old_analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=pipeline_analysis_id,
            latest_analysis_id=old_analysis_id,  # Different from pipeline
            latest_analysis_status="completed",
            latest_analysis_job_id=other_job_id,  # Different from active job
            has_fresh_score=True,
            match_score=0.55,
        )
        assert result.score_status == "score_stale"
        assert result.match_score == 0.55
        assert "analysis_not_current_pipeline" in result.warnings
        assert "analysis_from_different_job" in result.warnings
        assert result.next_action == "wait_analysis"

    def test_analysis_processing_completed_no_fresh_score(self):
        """Analysis is valid, completed, but no fresh score yet: analysis_processing."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="completed",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,  # Ranker still running
            match_score=None,
        )
        assert result.score_status == "analysis_processing"
        assert result.analysis_status == "completed"
        assert result.match_score is None
        assert result.warnings == []
        assert result.next_action == "wait_analysis"

    def test_analysis_processing_completed_invalid_no_score(self):
        """Analysis is invalid and has no score: analysis_processing."""
        active_job_id = uuid4()
        other_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="completed",
            latest_analysis_job_id=other_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "analysis_processing"
        assert result.analysis_status == "completed"
        assert "analysis_from_different_job" in result.warnings

    def test_needs_repair_unknown_status(self):
        """Analysis status is unknown: needs_repair."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status="unknown_status",
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "needs_repair"
        assert result.analysis_status == "unknown_status"
        assert "unknown_analysis_status" in result.warnings
        assert result.next_action == "run_repair"

    def test_needs_repair_null_status_with_analysis(self):
        """Analysis status is null: needs_repair."""
        active_job_id = uuid4()
        analysis_id = uuid4()
        result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=analysis_id,
            latest_analysis_id=analysis_id,
            latest_analysis_status=None,
            latest_analysis_job_id=active_job_id,
            has_fresh_score=False,
            match_score=None,
        )
        assert result.score_status == "needs_repair"
        assert result.analysis_status is None
        assert "unknown_analysis_status" in result.warnings
