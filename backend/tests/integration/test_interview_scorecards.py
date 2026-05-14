from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> tuple[dict[str, str], UUID]:
    user = await _create_active_user(
        db_session,
        f"recruiter-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "Senha123!")
    return headers, user.id


async def _seed_candidate_job(db_session: AsyncSession, *, include_ranking_row: bool = False) -> tuple[UUID, UUID, UUID]:
    owner = await _create_active_user(
        db_session,
        f"owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    return await _seed_scoring_case(
        db_session,
        owner.id,
        job_title=f"Vaga Scorecard {uuid4().hex[:6]}",
        candidate_email=f"candidate-{uuid4().hex}@example.com",
        include_ranking_row=include_ranking_row,
    )


async def _create_scorecard(client: AsyncClient, headers: dict[str, str], job_id: UUID, candidate_id: UUID) -> dict:
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
        json={
            "items": [
                {
                    "competency_name": "Comunicação",
                    "question_text": "Conte uma situação de alinhamento difícil.",
                    "display_order": 1,
                }
            ]
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio
async def test_creates_scorecard_as_draft(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)

    payload = await _create_scorecard(client, headers, job_id, candidate_id)

    assert payload["status"] == "draft"
    assert payload["candidate_id"] == str(candidate_id)
    assert payload["job_id"] == str(job_id)
    assert payload["evaluator_id"] == str(evaluator_id)
    assert payload["items"][0]["competency_name"] == "Comunicação"


@pytest.mark.asyncio
async def test_edits_draft_and_adds_items(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)
    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)

    response = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={
            "overall_notes": "Bom repertório para a vaga.",
            "items": [
                {"competency_name": "Comunicação", "rating": 4, "evidence": "Explicou com clareza.", "display_order": 1},
                {"competency_name": "Colaboração", "rating": 5, "evidence": "Trouxe exemplos de parceria.", "display_order": 2},
            ],
        },
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["overall_notes"] == "Bom repertório para a vaga."
    assert len(payload["items"]) == 2
    assert payload["items"][1]["competency_name"] == "Colaboração"


@pytest.mark.asyncio
async def test_rating_outside_1_to_5_fails(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)
    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)

    response = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={"items": [{"competency_name": "Comunicação", "rating": 6}]},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_submit_without_final_recommendation_fails(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)
    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)

    response = await client.post(f"/api/v1/interview-scorecards/{scorecard['id']}/submit", headers=headers)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_submit_with_rated_item_without_evidence_fails(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)
    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)
    patch = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={
            "final_recommendation": "yes",
            "items": [{"competency_name": "Comunicação", "rating": 4}],
        },
    )
    assert patch.status_code == status.HTTP_200_OK, patch.text

    response = await client.post(f"/api/v1/interview-scorecards/{scorecard['id']}/submit", headers=headers)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_valid_submit_changes_status_to_submitted(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)
    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)
    patch = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={
            "final_recommendation": "strong_yes",
            "overall_notes": "Recomendação humana favorável.",
            "items": [{"competency_name": "Comunicação", "rating": 5, "evidence": "Resposta estruturada.", "display_order": 1}],
        },
    )
    assert patch.status_code == status.HTTP_200_OK, patch.text

    response = await client.post(f"/api/v1/interview-scorecards/{scorecard['id']}/submit", headers=headers)

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["status"] == "submitted"
    assert payload["submitted_at"] is not None
    assert payload["final_recommendation"] == "strong_yes"


@pytest.mark.asyncio
async def test_submitted_scorecard_cannot_be_edited(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)
    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)
    await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={
            "final_recommendation": "yes",
            "items": [{"competency_name": "Comunicação", "rating": 4, "evidence": "Boa escuta."}],
        },
    )
    submit = await client.post(f"/api/v1/interview-scorecards/{scorecard['id']}/submit", headers=headers)
    assert submit.status_code == status.HTTP_200_OK, submit.text

    response = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={"overall_notes": "Tentativa de alteração"},
    )

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_candidate_user_cannot_access_scorecard(client: AsyncClient, db_session: AsyncSession) -> None:
    candidate_user = await _create_active_user(
        db_session,
        f"portal-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate_user.email, "Senha123!")
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_submit_does_not_change_pipeline_or_ranking(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session, include_ranking_row=True)

    pipeline_before = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
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
    assert pipeline_before is not None
    before_stage = pipeline_before.pipeline_stage
    before_status = pipeline_before.pipeline_status

    scorecard = await _create_scorecard(client, headers, job_id, candidate_id)
    await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=headers,
        json={
            "final_recommendation": "no",
            "items": [{"competency_name": "Comunicação", "rating": 2, "evidence": "Exemplo pouco aderente."}],
        },
    )
    response = await client.post(f"/api/v1/interview-scorecards/{scorecard['id']}/submit", headers=headers)
    assert response.status_code == status.HTTP_200_OK, response.text

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
    assert pipeline_before.pipeline_stage == before_stage
    assert pipeline_before.pipeline_status == before_status
    assert score_count_after == score_count_before
    assert final_score_after == final_score_before


@pytest.mark.asyncio
async def test_get_includes_behavioral_ai_questions_as_support_only(client: AsyncClient, db_session: AsyncSession) -> None:
    headers, _evaluator_id = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _match_id = await _seed_candidate_job(db_session)

    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name="Template comportamental",
        status="active",
        created_by=uuid4(),
    )
    db_session.add(template)
    await db_session.flush()
    assignment = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template.id,
        status="submitted",
        assigned_at=datetime.now(UTC),
        submitted_at=datetime.now(UTC),
    )
    db_session.add(assignment)
    await db_session.flush()
    db_session.add(
        BehavioralAssessmentAIEvaluationModel(
            id=uuid4(),
            assignment_id=assignment.id,
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template.id,
            status="completed",
            provider="gemini",
            model="gemini-test",
            prompt_version=1,
            suggested_interview_questions_json=["Como você valida alinhamento?", "Quando escalou um conflito?"],
            completed_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["scorecard"] is None
    assert payload["suggested_behavioral_questions"] == [
        "Como você valida alinhamento?",
        "Quando escalou um conflito?",
    ]
