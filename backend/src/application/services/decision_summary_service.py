from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from src.application.services.candidate_score_status_deriver import derive_candidate_score_status
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
)
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.repositories.sqlalchemy_decision_summary_repository import SQLAlchemyDecisionSummaryRepository
from src.interface.api.schemas.decision_summary_schemas import (
    CandidateDecisionSummaryResponse,
    DecisionReadinessResponse,
    DecisionSummaryActiveJobDecisionResponse,
    DecisionSummaryBehavioralAssessmentResponse,
    DecisionSummaryInterviewResponse,
    DecisionSummaryInterviewScorecardResponse,
)


class DecisionSummaryService:
    def __init__(self, repository: SQLAlchemyDecisionSummaryRepository) -> None:
        self._repository = repository

    async def get_summary(self, *, candidate_id: UUID, job_id: UUID) -> CandidateDecisionSummaryResponse:
        job = await self._repository.get_job(job_id)
        pipeline = await self._repository.get_active_pipeline(candidate_id=candidate_id, job_id=job_id)
        latest_analysis = await self._repository.get_latest_analysis(candidate_id=candidate_id, job_id=job_id)

        score = None
        if latest_analysis is not None:
            score = await self._repository.get_active_score_for_analysis(
                candidate_id=candidate_id,
                job_id=job_id,
                analysis_id=latest_analysis.id,
            )

        score_status = derive_candidate_score_status(
            active_job_id=job_id if pipeline is not None else None,
            pipeline_current_analysis_id=pipeline["current_analysis_id"] if pipeline is not None else None,
            latest_analysis_id=latest_analysis.id if latest_analysis is not None else None,
            latest_analysis_status=latest_analysis.status if latest_analysis is not None else None,
            latest_analysis_job_id=latest_analysis.job_id if latest_analysis is not None else None,
            has_fresh_score=score is not None,
            match_score=float(score.final_score) if score is not None else None,
        )
        has_stale_score = score is None and await self._repository.has_stale_score(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        active_job_decision = DecisionSummaryActiveJobDecisionResponse(
            score_status=(
                "score_stale"
                if has_stale_score and score_status.score_status != "score_ready"
                else score_status.score_status
            ),
            match_score=score_status.match_score,
            freshness_status=self._freshness_status(score_status.score_status, has_stale_score),
            warnings=score_status.warnings
            + (["score_stale"] if has_stale_score and "score_stale" not in score_status.warnings else []),
        )

        behavioral = await self._build_behavioral(
            job.behavioral_template_id if job is not None else None,
            candidate_id,
            job_id,
        )
        scorecard_model = await self._repository.get_latest_scorecard(candidate_id=candidate_id, job_id=job_id)
        interview_model = await self._repository.get_latest_interview(candidate_id=candidate_id, job_id=job_id)
        scorecard = self._scorecard_response(scorecard_model)
        readiness = self._readiness(active_job_decision, behavioral, scorecard)

        return CandidateDecisionSummaryResponse(
            candidate_id=candidate_id,
            job_id=job_id,
            active_job_decision=active_job_decision,
            behavioral_assessment=behavioral,
            interview=(
                DecisionSummaryInterviewResponse(
                    id=interview_model.id,
                    status=interview_model.status,
                    interview_type=interview_model.interview_type,
                    scheduled_start=interview_model.scheduled_start,
                    scheduled_end=interview_model.scheduled_end,
                )
                if interview_model is not None
                else DecisionSummaryInterviewResponse()
            ),
            interview_scorecard=scorecard,
            decision_readiness=readiness,
        )

    async def _build_behavioral(
        self,
        template_id: UUID | None,
        candidate_id: UUID,
        job_id: UUID,
    ) -> DecisionSummaryBehavioralAssessmentResponse:
        if template_id is None:
            return DecisionSummaryBehavioralAssessmentResponse(template_required=False)

        assignment = await self._repository.get_latest_assignment(
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
        )
        question_count = await self._repository.count_template_questions(template_id)
        if assignment is None:
            return DecisionSummaryBehavioralAssessmentResponse(
                template_required=True,
                assignment_status=None,
                question_count=question_count,
            )

        ai_evaluation = await self._repository.get_ai_evaluation(assignment.id)
        return DecisionSummaryBehavioralAssessmentResponse(
            template_required=True,
            assignment_status=assignment.status,
            answered_count=await self._repository.count_assignment_answers(assignment.id),
            question_count=question_count,
            submitted_at=assignment.submitted_at,
            ai_evaluation_status=ai_evaluation.status if ai_evaluation is not None else None,
            ai_confidence=ai_evaluation.confidence if ai_evaluation is not None else None,
            ai_summary=self._short_summary(ai_evaluation),
        )

    @staticmethod
    def _short_summary(evaluation: BehavioralAssessmentAIEvaluationModel | None) -> str | None:
        if evaluation is None or evaluation.summary is None:
            return None
        summary = evaluation.summary.strip()
        return summary[:280] if len(summary) > 280 else summary

    @staticmethod
    def _freshness_status(score_status: str, has_stale_score: bool) -> str:
        if score_status == "score_ready":
            return "current"
        if score_status == "score_stale" or has_stale_score:
            return "stale"
        return "missing"

    @staticmethod
    def _scorecard_response(scorecard: InterviewScorecardModel | None) -> DecisionSummaryInterviewScorecardResponse:
        if scorecard is None:
            return DecisionSummaryInterviewScorecardResponse()

        rated_items = [item for item in scorecard.items if item.rating is not None]
        average_rating = None
        if rated_items:
            total_weight = sum((Decimal(item.weight) for item in rated_items), Decimal("0"))
            if total_weight > 0:
                weighted = sum(
                    (Decimal(item.rating or 0) * Decimal(item.weight) for item in rated_items),
                    Decimal("0"),
                )
                average_rating = round(float(weighted / total_weight), 2)
            else:
                average_rating = round(sum(float(item.rating or 0) for item in rated_items) / len(rated_items), 2)

        return DecisionSummaryInterviewScorecardResponse(
            status=scorecard.status,
            final_recommendation=scorecard.final_recommendation,
            average_rating=average_rating,
            submitted_at=scorecard.submitted_at,
        )

    @staticmethod
    def _readiness(
        active_job_decision: DecisionSummaryActiveJobDecisionResponse,
        behavioral: DecisionSummaryBehavioralAssessmentResponse,
        scorecard: DecisionSummaryInterviewScorecardResponse,
    ) -> DecisionReadinessResponse:
        missing_items: list[str] = []
        warnings = list(active_job_decision.warnings)

        if active_job_decision.score_status == "score_stale" or active_job_decision.freshness_status == "stale":
            return DecisionReadinessResponse(
                status="needs_attention",
                missing_items=["job_match_current"],
                warnings=warnings,
                next_action="refresh_job_match",
            )

        if active_job_decision.score_status != "score_ready":
            return DecisionReadinessResponse(
                status="missing_job_match",
                missing_items=["job_match_current"],
                warnings=warnings,
                next_action="request_or_wait_job_match",
            )

        if behavioral.template_required and behavioral.assignment_status != "submitted":
            missing_items.append("behavioral_assessment")
            return DecisionReadinessResponse(
                status="waiting_behavioral_assessment",
                missing_items=missing_items,
                warnings=warnings,
                next_action="wait_candidate_behavioral_submission",
            )

        if behavioral.template_required and behavioral.ai_evaluation_status != "completed":
            missing_items.append("behavioral_ai_evaluation")
            return DecisionReadinessResponse(
                status="waiting_behavioral_ai",
                missing_items=missing_items,
                warnings=warnings,
                next_action="run_or_wait_behavioral_ai",
            )

        if scorecard.status != "submitted":
            missing_items.append("interview_scorecard")
            return DecisionReadinessResponse(
                status="waiting_interview_scorecard",
                missing_items=missing_items,
                warnings=warnings,
                next_action="complete_interview_scorecard",
            )

        return DecisionReadinessResponse(
            status="ready_for_human_decision",
            missing_items=[],
            warnings=warnings,
            next_action="review_and_move_pipeline",
        )
