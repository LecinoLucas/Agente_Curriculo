from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"decision-summary-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    return await _auth_headers(client, user.email, "Senha123!")


async def _seed_candidate_job(
    db_session: AsyncSession,
    *,
    include_ranking_row: bool = True,
) -> tuple[UUID, UUID]:
    owner = await _create_active_user(
        db_session,
        f"decision-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        owner.id,
        job_title=f"Vaga Decisão {uuid4().hex[:6]}",
        candidate_email=f"candidate-decision-{uuid4().hex}@example.com",
        include_ranking_row=False,
    )
    if include_ranking_row:
        await db_session.execute(sa.update(ScoreModelVersionModel).values(is_active=False))
        version = ScoreModelVersionModel(
            version=f"decision-{uuid4().hex[:8]}",
            is_active=True,
            weights={"skill_match": 0.4},
            thresholds={"high": 70, "low": 45},
        )
        db_session.add(version)
        await db_session.flush()
        pipeline = await db_session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
            )
        )
        job = await db_session.get(JobModel, job_id)
        assert pipeline is not None
        assert pipeline.current_analysis_id is not None
        assert job is not None
        now = datetime.now(UTC)
        db_session.add(
            CandidateJobScoreModel(
                candidate_id=candidate_id,
                job_id=job_id,
                version_id=version.id,
                source_analysis_id=pipeline.current_analysis_id,
                source_analysis_created_at=now,
                input_hash=f"decision-{uuid4().hex}",
                score_model_version=version.version,
                explainability_version="v1",
                final_score=Decimal("86.00"),
                decision_suggestion="review",
                breakdown={
                    "skill_match_score": 90,
                    "experience_match_score": 85,
                    "seniority_match_score": 80,
                    "education_score": 70,
                    "confidence_score": 90,
                    "penalty_score": 0,
                    "job_fit_score": 86,
                },
                reason_codes=[],
                explanation_text="Score atual para decisão consolidada.",
                freshness_status="fresh",
                computed_at=now,
                updated_at=now,
                previous_score=None,
                recompute_reason="test",
                job_signature_hash=str(job.job_profile_hash),
                job_updated_at=job.updated_at,
            )
        )
        await db_session.commit()
    return job_id, candidate_id


async def _add_behavioral_template(
    db_session: AsyncSession,
    job_id: UUID,
) -> tuple[BehavioralAssessmentTemplateModel, list[BehavioralTemplateQuestionModel]]:
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Template decisão {uuid4().hex[:6]}",
        status="active",
        created_by=uuid4(),
    )
    db_session.add(template)
    await db_session.flush()

    competency = BehavioralTemplateCompetencyModel(
        id=uuid4(),
        template_id=template.id,
        name="Comunicação",
        weight=Decimal("1.00"),
        display_order=1,
    )
    db_session.add(competency)
    await db_session.flush()

    questions = [
        BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Conte uma situação difícil.",
            answer_type="text",
            display_order=1,
        ),
        BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Como alinhou expectativas?",
            answer_type="text",
            display_order=2,
        ),
    ]
    db_session.add_all(questions)

    job = await db_session.get(JobModel, job_id)
    assert job is not None
    job.behavioral_template_id = template.id
    await db_session.flush()
    return template, questions


async def _add_behavioral_assignment(
    db_session: AsyncSession,
    *,
    job_id: UUID,
    candidate_id: UUID,
    template_id: UUID,
    questions: list[BehavioralTemplateQuestionModel],
    assignment_status: str = "submitted",
    ai_status: str | None = "completed",
) -> BehavioralAssessmentAssignmentModel:
    assignment = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template_id,
        status=assignment_status,
        assigned_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        submitted_at=datetime.now(UTC) if assignment_status == "submitted" else None,
    )
    db_session.add(assignment)
    await db_session.flush()

    if assignment_status == "submitted":
        db_session.add_all(
            [
                BehavioralAssessmentAnswerModel(
                    id=uuid4(),
                    assignment_id=assignment.id,
                    question_id=question.id,
                    answer_text=f"Resposta {idx}",
                )
                for idx, question in enumerate(questions, start=1)
            ]
        )

    if ai_status is not None:
        db_session.add(
            BehavioralAssessmentAIEvaluationModel(
                id=uuid4(),
                assignment_id=assignment.id,
                candidate_id=candidate_id,
                job_id=job_id,
                template_id=template_id,
                status=ai_status,
                provider="gemini",
                model="gemini-test",
                prompt_version=1,
                confidence="medium" if ai_status == "completed" else None,
                summary="Resumo operacional da avaliação comportamental.",
                completed_at=datetime.now(UTC) if ai_status == "completed" else None,
            )
        )
    await db_session.commit()
    return assignment


async def _add_submitted_scorecard(db_session: AsyncSession, *, job_id: UUID, candidate_id: UUID) -> InterviewScorecardModel:
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        status="submitted",
        final_recommendation="yes",
        overall_notes="Recomendação humana registrada.",
        submitted_at=datetime.now(UTC),
    )
    scorecard.items = [
        InterviewScorecardItemModel(
            id=uuid4(),
            competency_name="Comunicação",
            rating=4,
            evidence="Trouxe exemplo claro.",
            weight=Decimal("1.00"),
            display_order=1,
        ),
        InterviewScorecardItemModel(
            id=uuid4(),
            competency_name="Colaboração",
            rating=5,
            evidence="Evidenciou colaboração.",
            weight=Decimal("1.00"),
            display_order=2,
        ),
    ]
    db_session.add(scorecard)
    await db_session.commit()
    return scorecard


async def _get_summary(client: AsyncClient, headers: dict[str, str], job_id: UUID, candidate_id: UUID) -> dict:
    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    return response.json()


@pytest.mark.asyncio
async def test_without_current_match_returns_missing_job_match(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session, include_ranking_row=False)

    payload = await _get_summary(client, headers, job_id, candidate_id)

    assert payload["decision_readiness"]["status"] == "missing_job_match"
    assert payload["active_job_decision"]["score_status"] != "score_ready"


@pytest.mark.asyncio
async def test_pending_behavioral_returns_waiting_behavioral_assessment(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    template, _questions = await _add_behavioral_template(db_session, job_id)
    await db_session.commit()

    payload = await _get_summary(client, headers, job_id, candidate_id)

    assert template.id is not None
    assert payload["behavioral_assessment"]["template_required"] is True
    assert payload["decision_readiness"]["status"] == "waiting_behavioral_assessment"


@pytest.mark.asyncio
async def test_pending_ai_returns_waiting_behavioral_ai(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    template, questions = await _add_behavioral_template(db_session, job_id)
    await _add_behavioral_assignment(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        template_id=template.id,
        questions=questions,
        ai_status="processing",
    )

    payload = await _get_summary(client, headers, job_id, candidate_id)

    assert payload["behavioral_assessment"]["assignment_status"] == "submitted"
    assert payload["behavioral_assessment"]["ai_evaluation_status"] == "processing"
    assert payload["decision_readiness"]["status"] == "waiting_behavioral_ai"


@pytest.mark.asyncio
async def test_pending_scorecard_returns_waiting_interview_scorecard(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    template, questions = await _add_behavioral_template(db_session, job_id)
    await _add_behavioral_assignment(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        template_id=template.id,
        questions=questions,
    )

    payload = await _get_summary(client, headers, job_id, candidate_id)

    assert payload["decision_readiness"]["status"] == "waiting_interview_scorecard"


@pytest.mark.asyncio
async def test_completed_inputs_returns_ready_for_human_decision(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    template, questions = await _add_behavioral_template(db_session, job_id)
    await _add_behavioral_assignment(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        template_id=template.id,
        questions=questions,
    )
    await _add_submitted_scorecard(db_session, job_id=job_id, candidate_id=candidate_id)

    payload = await _get_summary(client, headers, job_id, candidate_id)

    assert payload["decision_readiness"]["status"] == "ready_for_human_decision"
    assert payload["decision_readiness"]["next_action"] == "review_and_move_pipeline"
    assert payload["interview_scorecard"]["final_recommendation"] == "yes"
    assert payload["interview_scorecard"]["average_rating"] == 4.5
    assert payload["behavioral_assessment"]["answered_count"] == 2
    assert payload["behavioral_assessment"]["ai_confidence"] == "medium"


@pytest.mark.asyncio
async def test_stale_score_returns_needs_attention(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await db_session.execute(
        sa.update(CandidateJobScoreModel)
        .where(CandidateJobScoreModel.candidate_id == candidate_id, CandidateJobScoreModel.job_id == job_id)
        .values(freshness_status="stale")
    )
    await db_session.commit()

    payload = await _get_summary(client, headers, job_id, candidate_id)

    assert payload["decision_readiness"]["status"] == "needs_attention"
    assert payload["active_job_decision"]["freshness_status"] == "stale"
    assert "score_stale" in payload["decision_readiness"]["warnings"]


@pytest.mark.asyncio
async def test_get_does_not_change_pipeline_ranking_or_decision_state(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    pipeline_before = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline_before is not None
    before_stage = pipeline_before.pipeline_stage
    before_status = pipeline_before.pipeline_status
    before_relationship = pipeline_before.relationship_status
    before_analysis_id = pipeline_before.current_analysis_id
    score_count_before = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
            )
        )
        or 0
    )
    final_score_before = await db_session.scalar(
        sa.select(CandidateJobScoreModel.final_score).where(
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.job_id == job_id,
        )
    )
    event_count_before = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobPipelineEventModel.id)).where(
                CandidateJobPipelineEventModel.candidate_id == candidate_id,
                CandidateJobPipelineEventModel.job_id == job_id,
            )
        )
        or 0
    )

    first_payload = await _get_summary(client, headers, job_id, candidate_id)
    second_payload = await _get_summary(client, headers, job_id, candidate_id)

    await db_session.refresh(pipeline_before)
    score_count_after = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
            )
        )
        or 0
    )
    final_score_after = await db_session.scalar(
        sa.select(CandidateJobScoreModel.final_score).where(
            CandidateJobScoreModel.candidate_id == candidate_id,
            CandidateJobScoreModel.job_id == job_id,
        )
    )
    event_count_after = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobPipelineEventModel.id)).where(
                CandidateJobPipelineEventModel.candidate_id == candidate_id,
                CandidateJobPipelineEventModel.job_id == job_id,
            )
        )
        or 0
    )

    assert first_payload["active_job_decision"] == second_payload["active_job_decision"]
    assert pipeline_before.pipeline_stage == before_stage
    assert pipeline_before.pipeline_status == before_status
    assert pipeline_before.relationship_status == before_relationship
    assert pipeline_before.current_analysis_id == before_analysis_id
    assert score_count_after == score_count_before
    assert final_score_after == final_score_before
    assert event_count_after == event_count_before
