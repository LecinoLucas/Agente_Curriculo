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
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"hiring-decision-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    return await _auth_headers(client, user.email, "Senha123!")


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"hiring-decision-admin-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    return await _auth_headers(client, user.email, "Senha123!")


async def _seed_candidate_job(db_session: AsyncSession) -> tuple[UUID, UUID]:
    owner = await _create_active_user(
        db_session,
        f"hiring-owner-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        owner.id,
        job_title=f"Vaga decisão final {uuid4().hex[:6]}",
        candidate_email=f"hiring-candidate-{uuid4().hex}@example.com",
        include_ranking_row=False,
    )
    await db_session.execute(sa.update(ScoreModelVersionModel).values(is_active=False))
    version = ScoreModelVersionModel(
        version=f"hiring-{uuid4().hex[:8]}",
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
    if pipeline.candidate_job_pipeline_id is None:
        pipeline.candidate_job_pipeline_id = uuid4()
        await db_session.flush()
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            source_analysis_id=pipeline.current_analysis_id,
            source_analysis_created_at=now,
            input_hash=f"hiring-{uuid4().hex}",
            score_model_version=version.version,
            explainability_version="v1",
            final_score=Decimal("88.00"),
            decision_suggestion="review",
            breakdown={
                "skill_match_score": 90,
                "experience_match_score": 85,
                "seniority_match_score": 80,
                "education_score": 70,
                "confidence_score": 90,
                "penalty_score": 0,
                "job_fit_score": 88,
            },
            reason_codes=[],
            explanation_text="Score atual para decisão final.",
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
    return job_id, candidate_id


async def _add_completed_interview(
    db_session: AsyncSession, *, job_id: UUID, candidate_id: UUID
) -> InterviewScheduleModel:
    from datetime import timedelta

    now = datetime.now(UTC)
    pipeline_id = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    interview = InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_id=pipeline_id,
        title="Entrevista técnica",
        interview_type="technical",
        status="completed",
        scheduled_start=now,
        scheduled_end=now + timedelta(hours=1),
    )
    db_session.add(interview)
    await db_session.commit()
    return interview


async def _add_submitted_scorecard(
    db_session: AsyncSession, *, job_id: UUID, candidate_id: UUID
) -> InterviewScorecardModel:
    pipeline_id = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_id=pipeline_id,
        status="submitted",
        final_recommendation="yes",
        overall_notes="Scorecard humano favorável.",
        submitted_at=datetime.now(UTC),
    )
    scorecard.items = [
        InterviewScorecardItemModel(
            id=uuid4(),
            competency_name="Comunicação",
            rating=5,
            evidence="Evidência consistente.",
            weight=Decimal("1.00"),
            display_order=1,
        )
    ]
    db_session.add(scorecard)
    await db_session.commit()
    return scorecard


async def seed_candidate_ready_for_hire(
    db_session: AsyncSession,
    *,
    job_id: UUID | None = None,
    candidate_id: UUID | None = None,
) -> tuple[UUID, UUID]:
    if (job_id is None) != (candidate_id is None):
        raise ValueError("job_id e candidate_id devem ser informados juntos.")
    if job_id is None or candidate_id is None:
        job_id, candidate_id = await _seed_candidate_job(db_session)
    await _add_completed_interview(db_session, job_id=job_id, candidate_id=candidate_id)
    await _add_submitted_scorecard(db_session, job_id=job_id, candidate_id=candidate_id)
    return job_id, candidate_id


async def _create_decision(
    client: AsyncClient,
    headers: dict[str, str],
    job_id: UUID,
    candidate_id: UUID,
    *,
    outcome: str = "hold",
    reason_code: str = "partial_fit",
    notes: str | None = "Decisão humana registrada.",
    pipeline_action: dict | None = None,
    submit: bool = True,
) -> dict:
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": outcome,
            "reason_code": reason_code,
            "notes": notes,
            "submit": submit,
            "pipeline_action": pipeline_action,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio
async def test_creates_submitted_human_decision(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)

    payload = await _create_decision(client, headers, job_id, candidate_id)

    assert payload["decision_status"] == "submitted"
    assert payload["decision_outcome"] == "hold"
    assert payload["reason_code"] == "partial_fit"
    assert payload["submitted_at"] is not None


@pytest.mark.asyncio
async def test_create_decision_requires_active_candidate_job_link(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    pipeline.relationship_status = "archived"
    pipeline.pipeline_status = "terminal"
    pipeline.is_terminal = True
    pipeline.terminated_at = datetime.now(UTC)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hold",
            "reason_code": "partial_fit",
            "notes": "Tentativa fora do vínculo ativo.",
            "submit": True,
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_create_decision_records_audit_log(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)

    payload = await _create_decision(client, headers, job_id, candidate_id, submit=False)

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "hiring_decision.created",
            AuditLogModel.resource_id == UUID(payload["id"]),
        )
    )
    assert audit is not None
    assert audit.resource_type == "hiring_decision"
    assert audit.metadata_["candidate_id"] == str(candidate_id)
    assert audit.metadata_["job_id"] == str(job_id)
    assert audit.after_state == {"decision_status": "draft", "decision_outcome": "hold"}
    assert "Decisão humana registrada" not in str(audit.metadata_)
    assert "Decisão humana registrada" not in str(audit.after_state)


@pytest.mark.asyncio
async def test_decision_saves_decision_summary_snapshot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)

    payload = await _create_decision(client, headers, job_id, candidate_id)

    snapshot = payload["based_on_decision_summary_snapshot"]
    assert snapshot["candidate_id"] == str(candidate_id)
    assert snapshot["job_id"] == str(job_id)
    assert "decision_readiness" in snapshot


@pytest.mark.asyncio
async def test_new_decision_supersedes_previous_and_history_keeps_old(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    first = await _create_decision(client, headers, job_id, candidate_id, outcome="hold")
    second = await _create_decision(
        client,
        headers,
        job_id,
        candidate_id,
        outcome="advance",
        reason_code="strong_fit",
        notes="Nova decisão humana após revisão.",
    )

    current = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
    )
    history = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision/history",
        headers=headers,
    )

    assert current.status_code == status.HTTP_200_OK
    assert current.json()["decision"]["id"] == second["id"]
    assert history.status_code == status.HTTP_200_OK
    decisions = history.json()["decisions"]
    assert len(decisions) == 2
    assert any(
        item["id"] == first["id"] and item["decision_status"] == "superseded" for item in decisions
    )


@pytest.mark.asyncio
async def test_decision_without_reason_code_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={"decision_outcome": "hold", "notes": "Sem motivo."},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_hire_or_reject_without_notes_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await _add_submitted_scorecard(db_session, job_id=job_id, candidate_id=candidate_id)

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={"decision_outcome": "hire", "reason_code": "strong_fit", "submit": True},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_hire_without_submitted_scorecard_fails_unless_other_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)

    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Contratar sem scorecard.",
            "submit": True,
        },
    )
    fallback = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "other",
            "notes": "Exceção humana registrada com contexto.",
            "submit": True,
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert fallback.status_code == status.HTTP_201_CREATED, fallback.text


@pytest.mark.asyncio
async def test_pipeline_action_false_does_not_move_pipeline(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    before_stage = pipeline.pipeline_stage

    await _create_decision(
        client,
        headers,
        job_id,
        candidate_id,
        pipeline_action={"enabled": False, "target_stage": "hired", "reason": "Não mover."},
    )

    await db_session.refresh(pipeline)
    assert pipeline.pipeline_stage == before_stage


@pytest.mark.asyncio
async def test_pipeline_action_true_is_ignored_by_hiring_decision(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    await seed_candidate_ready_for_hire(db_session, job_id=job_id, candidate_id=candidate_id)
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    before_stage = pipeline.pipeline_stage

    payload = await _create_decision(
        client,
        headers,
        job_id,
        candidate_id,
        outcome="hire",
        reason_code="strong_fit",
        notes="Candidato aprovado em decisão humana.",
        pipeline_action={
            "enabled": True,
            "target_stage": "hired",
            "reason": "Decisão final humana registrada.",
        },
    )

    await db_session.refresh(pipeline)
    assert payload["pipeline_transition_id"] is None
    assert pipeline.pipeline_stage == before_stage
    assert pipeline.relationship_status == "active"
    assert pipeline.is_terminal is False
    assert pipeline.terminated_at is None


@pytest.mark.asyncio
async def test_candidate_user_cannot_access_hiring_decision(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    candidate_user = await _create_active_user(
        db_session,
        f"hiring-portal-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate_user.email, "Senha123!")
    job_id, candidate_id = await _seed_candidate_job(db_session)

    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_decision_does_not_change_ranking_match_or_active_job_decision(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    overview_before = await client.get(
        f"/api/v1/candidates/{candidate_id}/overview", headers=headers
    )
    assert overview_before.status_code == status.HTTP_200_OK
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

    await _create_decision(client, headers, job_id, candidate_id)
    overview_after = await client.get(
        f"/api/v1/candidates/{candidate_id}/overview", headers=headers
    )
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

    assert overview_after.status_code == status.HTTP_200_OK
    assert score_count_after == score_count_before
    assert final_score_after == final_score_before
    assert (
        overview_after.json()["active_job_decision"]
        == overview_before.json()["active_job_decision"]
    )


@pytest.mark.asyncio
async def test_submitted_decision_cannot_be_edited_directly(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    decision = await _create_decision(client, headers, job_id, candidate_id)

    response = await client.patch(
        f"/api/v1/hiring-decisions/{decision['id']}",
        headers=headers,
        json={"notes": "Tentativa de edição direta."},
    )

    assert response.status_code == status.HTTP_409_CONFLICT

    persisted = await db_session.scalar(
        sa.select(CandidateJobHiringDecisionModel).where(
            CandidateJobHiringDecisionModel.id == UUID(decision["id"])
        )
    )
    assert persisted is not None
    assert persisted.decision_status == "submitted"


@pytest.mark.asyncio
async def test_patch_missing_decision_returns_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)

    response = await client.patch(
        f"/api/v1/hiring-decisions/{uuid4()}",
        headers=headers,
        json={"notes": "Tentativa em decisão inexistente."},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_recruiter_cannot_patch_decision_outside_active_pipeline_scope(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    payload = await _create_decision(client, headers, job_id, candidate_id, submit=False)
    decision = await db_session.scalar(
        sa.select(CandidateJobHiringDecisionModel).where(
            CandidateJobHiringDecisionModel.id == UUID(payload["id"])
        )
    )
    assert decision is not None
    decision.pipeline_id = uuid4()
    await db_session.commit()

    response = await client.patch(
        f"/api/v1/hiring-decisions/{payload['id']}",
        headers=headers,
        json={"notes": "Tentativa fora do pipeline ativo."},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_admin_can_patch_valid_draft_decision(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    recruiter_headers = await _recruiter_headers(client, db_session)
    admin_headers = await _admin_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    payload = await _create_decision(client, recruiter_headers, job_id, candidate_id, submit=False)

    response = await client.patch(
        f"/api/v1/hiring-decisions/{payload['id']}",
        headers=admin_headers,
        json={
            "decision_outcome": "advance",
            "reason_code": "strong_fit",
            "notes": "Revisão administrativa.",
        },
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json()["decision_outcome"] == "advance"
    assert response.json()["decision_status"] == "draft"


@pytest.mark.asyncio
async def test_patch_decision_records_update_audit_log(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    payload = await _create_decision(client, headers, job_id, candidate_id, submit=False)

    response = await client.patch(
        f"/api/v1/hiring-decisions/{payload['id']}",
        headers=headers,
        json={
            "decision_outcome": "advance",
            "reason_code": "strong_fit",
            "notes": "Atualização de decisão.",
        },
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "hiring_decision.updated",
            AuditLogModel.resource_id == UUID(payload["id"]),
        )
    )
    assert audit is not None
    assert audit.metadata_["candidate_id"] == str(candidate_id)
    assert audit.metadata_["job_id"] == str(job_id)
    assert audit.before_state == {"decision_status": "draft", "decision_outcome": "hold"}
    assert audit.after_state == {"decision_status": "draft", "decision_outcome": "advance"}
    assert "Atualização de decisão" not in str(audit.metadata_)
    assert "Atualização de decisão" not in str(audit.after_state)


@pytest.mark.asyncio
async def test_patch_submit_decision_records_submission_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session)
    payload = await _create_decision(client, headers, job_id, candidate_id, submit=False)

    response = await client.patch(
        f"/api/v1/hiring-decisions/{payload['id']}",
        headers=headers,
        json={"submit": True},
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "hiring_decision.submitted",
            AuditLogModel.resource_id == UUID(payload["id"]),
        )
    )
    assert audit is not None
    assert audit.metadata_["candidate_id"] == str(candidate_id)
    assert audit.metadata_["job_id"] == str(job_id)
    assert audit.before_state == {"decision_status": "draft", "decision_outcome": "hold"}
    assert audit.after_state == {"decision_status": "submitted", "decision_outcome": "hold"}
