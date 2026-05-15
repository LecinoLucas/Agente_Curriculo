"""Integration tests for job assessment policy and configurable decision gates."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
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
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"policy-recruiter-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    return await _auth_headers(client, user.email, "Senha123!")


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"policy-admin-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    return await _auth_headers(client, user.email, "Senha123!")


async def _seed_policy_case(
    db_session: AsyncSession,
    *,
    selection_flow_type: str = "standard",
    requires_behavioral_assessment: bool | None = None,
    requires_behavioral_ai_evaluation: bool | None = None,
    requires_interview: bool | None = None,
    requires_scorecard: bool | None = None,
    requires_manager_review: bool | None = None,
    include_score: bool = True,
) -> tuple[UUID, UUID, dict[str, str]]:
    """Seed a job+candidate pair with custom policy and optionally a score."""
    owner = await _create_active_user(
        db_session,
        f"policy-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        owner.id,
        job_title=f"Vaga Policy {uuid4().hex[:6]}",
        candidate_email=f"candidate-policy-{uuid4().hex}@example.com",
        include_ranking_row=False,
    )

    policy_updates: dict[str, object] = {"selection_flow_type": selection_flow_type}
    if requires_behavioral_assessment is not None:
        policy_updates["requires_behavioral_assessment"] = requires_behavioral_assessment
    if requires_behavioral_ai_evaluation is not None:
        policy_updates["requires_behavioral_ai_evaluation"] = requires_behavioral_ai_evaluation
    if requires_interview is not None:
        policy_updates["requires_interview"] = requires_interview
    if requires_scorecard is not None:
        policy_updates["requires_scorecard"] = requires_scorecard
    if requires_manager_review is not None:
        policy_updates["requires_manager_review"] = requires_manager_review

    await db_session.execute(sa.update(JobModel).where(JobModel.id == job_id).values(**policy_updates))

    if include_score:
        await db_session.execute(sa.update(ScoreModelVersionModel).values(is_active=False))
        version = ScoreModelVersionModel(
            version=f"policy-{uuid4().hex[:8]}",
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
        assert pipeline is not None
        assert pipeline.current_analysis_id is not None
        now = datetime.now(UTC)
        db_session.add(
            CandidateJobScoreModel(
                candidate_id=candidate_id,
                job_id=job_id,
                version_id=version.id,
                source_analysis_id=pipeline.current_analysis_id,
                source_analysis_created_at=now,
                input_hash=f"policy-{uuid4().hex}",
                score_model_version=version.version,
                explainability_version="v1",
                final_score=Decimal("82.00"),
                decision_suggestion="review",
                breakdown={},
                reason_codes=[],
                explanation_text="Score política de avaliação.",
                freshness_status="fresh",
                computed_at=now,
                updated_at=now,
                previous_score=None,
                recompute_reason="test",
                job_signature_hash="test",
                job_updated_at=now,
            )
        )

    await db_session.commit()
    return job_id, candidate_id, {"owner_id": owner.id}


async def _add_submitted_scorecard(db_session: AsyncSession, *, job_id: UUID, candidate_id: UUID) -> None:
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        status="submitted",
        final_recommendation="yes",
        overall_notes="Scorecard aprovado.",
        submitted_at=datetime.now(UTC),
    )
    scorecard.items = [
        InterviewScorecardItemModel(
            id=uuid4(),
            competency_name="Comunicação",
            rating=4,
            evidence="Evidência positiva.",
            weight=Decimal("1.00"),
            display_order=1,
        )
    ]
    db_session.add(scorecard)
    await db_session.commit()


async def _add_completed_interview(
    db_session: AsyncSession,
    *,
    job_id: UUID,
    candidate_id: UUID,
    interview_status: str = "completed",
) -> InterviewScheduleModel:
    interview = InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        title="Entrevista Técnica",
        scheduled_start=datetime.now(UTC) - timedelta(days=1),
        scheduled_end=datetime.now(UTC) - timedelta(days=1, hours=-1),
        interview_type="technical",
        interview_format="online",
        status=interview_status,
    )
    db_session.add(interview)
    await db_session.commit()
    return interview


async def _add_manager_comment(
    db_session: AsyncSession,
    *,
    job_id: UUID,
    candidate_id: UUID,
    author_role: str = "manager",
    comment_type: str = "manager_feedback",
) -> CollaborationCommentModel:
    comment = CollaborationCommentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        author_id=uuid4(),
        author_role=author_role,
        comment_type=comment_type,
        message="Feedback do gestor sobre o candidato.",
    )
    db_session.add(comment)
    await db_session.commit()
    return comment


async def _create_hire_decision(
    client: AsyncClient,
    headers: dict[str, str],
    job_id: UUID,
    candidate_id: UUID,
    *,
    reason_code: str = "strong_fit",
    notes: str = "Contratação aprovada.",
) -> tuple[int, dict]:
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": reason_code,
            "notes": notes,
            "submit": True,
        },
    )
    return response.status_code, response.json()


@pytest.mark.asyncio
async def test_simple_job_has_all_gates_false(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Vaga Simples",
            "description": "Descrição simples sem gates obrigatórios.",
            "selection_flow_type": "simple",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data["selection_flow_type"] == "simple"
    assert data["requires_behavioral_assessment"] is False
    assert data["requires_behavioral_ai_evaluation"] is False
    assert data["requires_interview"] is False
    assert data["requires_scorecard"] is False
    assert data["requires_manager_review"] is False


@pytest.mark.asyncio
async def test_standard_job_has_correct_gates(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Vaga Standard",
            "description": "Descrição vaga com fluxo padrão de avaliação.",
            "selection_flow_type": "standard",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data["selection_flow_type"] == "standard"
    assert data["requires_behavioral_assessment"] is True
    assert data["requires_behavioral_ai_evaluation"] is True
    assert data["requires_interview"] is True
    assert data["requires_scorecard"] is True
    assert data["requires_manager_review"] is False


@pytest.mark.asyncio
async def test_technical_job_requires_interview_scorecard_manager(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Vaga Técnica",
            "description": "Vaga para posição técnica sênior.",
            "selection_flow_type": "technical",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data["selection_flow_type"] == "technical"
    assert data["requires_behavioral_assessment"] is False
    assert data["requires_behavioral_ai_evaluation"] is False
    assert data["requires_interview"] is True
    assert data["requires_scorecard"] is True
    assert data["requires_manager_review"] is True


@pytest.mark.asyncio
async def test_leadership_job_requires_all(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Vaga Liderança",
            "description": "Posição de liderança estratégica.",
            "selection_flow_type": "leadership",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data["selection_flow_type"] == "leadership"
    assert data["requires_behavioral_assessment"] is True
    assert data["requires_behavioral_ai_evaluation"] is True
    assert data["requires_interview"] is True
    assert data["requires_scorecard"] is True
    assert data["requires_manager_review"] is True


@pytest.mark.asyncio
async def test_new_job_via_form_standard_has_requires_interview_true(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Vaga Standard Nova",
            "description": "Vaga criada pelo formulário com fluxo padrão.",
            "selection_flow_type": "standard",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    assert response.json()["requires_interview"] is True


@pytest.mark.asyncio
async def test_job_without_explicit_policy_gets_standard_defaults(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    response = await client.post(
        "/api/v1/jobs",
        headers=headers,
        json={
            "title": "Vaga Sem Policy Explícita",
            "description": "Criada sem informar selection_flow_type.",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data["selection_flow_type"] == "standard"
    assert data["requires_behavioral_assessment"] is True
    assert data["requires_interview"] is True
    assert data["requires_scorecard"] is True


@pytest.mark.asyncio
async def test_hire_allowed_for_simple_job_without_any_gates(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=False,
        requires_scorecard=False,
        requires_manager_review=False,
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_201_CREATED, data


@pytest.mark.asyncio
async def test_hire_blocked_when_requires_scorecard_and_missing(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=False,
        requires_scorecard=True,
        requires_manager_review=False,
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, data


@pytest.mark.asyncio
async def test_hire_blocked_when_requires_interview_and_missing(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=True,
        requires_scorecard=False,
        requires_manager_review=False,
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, data


@pytest.mark.asyncio
async def test_hire_allowed_when_requires_interview_and_completed(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=True,
        requires_scorecard=False,
        requires_manager_review=False,
    )
    await _add_completed_interview(db_session, job_id=job_id, candidate_id=candidate_id, interview_status="completed")

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_201_CREATED, data


@pytest.mark.asyncio
async def test_no_show_does_not_satisfy_interview_gate(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=True,
        requires_scorecard=False,
        requires_manager_review=False,
    )
    await _add_completed_interview(db_session, job_id=job_id, candidate_id=candidate_id, interview_status="no_show")

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, data


@pytest.mark.asyncio
async def test_awaiting_feedback_satisfies_interview_gate(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=True,
        requires_scorecard=False,
        requires_manager_review=False,
    )
    await _add_completed_interview(db_session, job_id=job_id, candidate_id=candidate_id, interview_status="awaiting_feedback")

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_201_CREATED, data


@pytest.mark.asyncio
async def test_hire_blocked_when_requires_manager_review_and_missing(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=False,
        requires_scorecard=False,
        requires_manager_review=True,
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, data


@pytest.mark.asyncio
async def test_recruiter_comment_does_not_satisfy_manager_gate(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=False,
        requires_scorecard=False,
        requires_manager_review=True,
    )
    await _add_manager_comment(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        author_role="recruiter",
        comment_type="comment",
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, data


@pytest.mark.asyncio
async def test_recruiter_with_manager_feedback_comment_type_does_not_satisfy_manager_gate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=False,
        requires_scorecard=False,
        requires_manager_review=True,
    )
    await _add_manager_comment(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        author_role="recruiter",
        comment_type="manager_feedback",
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, data


@pytest.mark.asyncio
async def test_manager_comment_satisfies_manager_gate(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=False,
        requires_scorecard=False,
        requires_manager_review=True,
    )
    await _add_manager_comment(
        db_session,
        job_id=job_id,
        candidate_id=candidate_id,
        author_role="manager",
        comment_type="manager_feedback",
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_201_CREATED, data


@pytest.mark.asyncio
async def test_reason_code_other_bypasses_all_gates(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="standard",
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        requires_interview=True,
        requires_scorecard=True,
        requires_manager_review=True,
    )

    status_code, data = await _create_hire_decision(
        client, headers, job_id, candidate_id,
        reason_code="other",
        notes="Exceção aprovada pela liderança com justificativa documentada.",
    )

    assert status_code == status.HTTP_201_CREATED, data


@pytest.mark.asyncio
async def test_reject_does_not_require_gates(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="standard",
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        requires_interview=True,
        requires_scorecard=True,
        requires_manager_review=True,
    )

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "reject",
            "reason_code": "missing_required_skill",
            "notes": "Candidato não atende requisitos mínimos.",
            "submit": True,
        },
    )

    assert response.status_code == status.HTTP_201_CREATED, response.text


@pytest.mark.asyncio
async def test_behavioral_ai_does_not_block_when_behavioral_assessment_not_required(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=True,
        requires_interview=False,
        requires_scorecard=False,
        requires_manager_review=False,
    )

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_201_CREATED, data


@pytest.mark.asyncio
async def test_hire_allowed_when_all_standard_gates_present(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id, _ = await _seed_policy_case(
        db_session,
        selection_flow_type="simple",
        requires_behavioral_assessment=False,
        requires_behavioral_ai_evaluation=False,
        requires_interview=True,
        requires_scorecard=True,
        requires_manager_review=False,
    )
    await _add_completed_interview(db_session, job_id=job_id, candidate_id=candidate_id)
    await _add_submitted_scorecard(db_session, job_id=job_id, candidate_id=candidate_id)

    status_code, data = await _create_hire_decision(client, headers, job_id, candidate_id)

    assert status_code == status.HTTP_201_CREATED, data
