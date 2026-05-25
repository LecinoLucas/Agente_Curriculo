from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.test_pipeline_stage_gates import (
    _active_pipeline_id,
    _add_behavioral_assignment,
    _add_behavioral_template,
    _add_hiring_decision,
    _add_interview,
    _add_scorecard,
    _add_to_job,
    _create_candidate,
    _create_job,
    _force_stage,
    _setup_recruiter,
)


@pytest.mark.asyncio
async def test_process_history_separates_current_and_previous_cycles(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    template_id = await _add_behavioral_template(db_session)
    job_id = await _create_job(
        client,
        headers,
        db_session,
        requires_interview=True,
        requires_scorecard=True,
        requires_behavioral_assessment=True,
        behavioral_template_id=template_id,
    )
    candidate_id = await _create_candidate(
        client,
        headers,
        "Histórico Ciclos",
        f"history-{uuid4().hex[:6]}@test.com",
    )
    await _add_to_job(client, headers, candidate_id, job_id)
    old_pipeline_id = await _active_pipeline_id(db_session, candidate_id=candidate_id, job_id=job_id)

    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    interview = await _add_interview(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="completed",
    )
    await _add_scorecard(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        interview_id=interview.id,
        status="submitted",
        final_recommendation="yes",
    )
    await _add_behavioral_assignment(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template_id,
        status="submitted",
    )
    await _add_hiring_decision(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        decision_status="submitted",
        decision_outcome="reject",
    )

    rejected = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "rejected", "notes": "", "reason": "Perfil fora do momento da vaga."},
        headers=headers,
    )
    assert rejected.status_code == 200, rejected.text

    reconsidered = await client.post(
        f"/api/v1/pipeline/{candidate_id}/reconsider-job",
        json={"job_id": str(job_id), "initial_stage": "entry", "reason": "Novo ciclo."},
        headers=headers,
    )
    assert reconsidered.status_code == 200, reconsidered.text
    new_pipeline_id = await _active_pipeline_id(db_session, candidate_id=candidate_id, job_id=job_id)
    assert new_pipeline_id != old_pipeline_id

    response = await client.get(
        f"/api/v1/candidates/{candidate_id}/process-history?job_id={job_id}",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    processes = response.json()["processes"]
    assert {item["pipeline_id"] for item in processes} == {str(old_pipeline_id), str(new_pipeline_id)}

    current = next(item for item in processes if item["is_current"])
    previous = next(item for item in processes if not item["is_current"])
    assert current["pipeline_id"] == str(new_pipeline_id)
    assert current["result_label"] == "Em andamento"
    assert current["interviews"] == []
    assert current["scorecards"] == []

    assert previous["pipeline_id"] == str(old_pipeline_id)
    assert previous["result_label"] == "Não selecionado"
    assert previous["current_or_final_stage"] == "rejected"
    assert previous["closure_reason"] == "Perfil fora do momento da vaga."
    assert previous["interviews"][0]["status"] == "completed"
    assert previous["interviews"][0]["scorecard_status"] == "submitted"
    assert previous["scorecards"][0]["status"] == "submitted"
    assert previous["behavioral_assessment"]["status"] == "submitted"
    assert previous["hiring_decision"]["outcome"] == "reject"

    await _force_stage(db_session, candidate_id=candidate_id, job_id=job_id, stage="technical_interview")
    blocked = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "final", "notes": "", "reason": ""},
        headers=headers,
    )
    assert blocked.status_code == 409, blocked.text
    gate_codes = {gate["code"] for gate in blocked.json()["missing_gates"]}
    assert {"technical_interview_not_completed", "scorecard_not_submitted"} <= gate_codes


@pytest.mark.asyncio
async def test_process_history_does_not_return_other_candidate_data(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(client, headers, "Candidato A", f"a-{uuid4().hex[:6]}@test.com")
    other_candidate_id = await _create_candidate(client, headers, "Candidato B", f"b-{uuid4().hex[:6]}@test.com")
    await _add_to_job(client, headers, candidate_id, job_id)
    await _add_to_job(client, headers, other_candidate_id, job_id)
    other_pipeline_id = await _active_pipeline_id(
        db_session,
        candidate_id=other_candidate_id,
        job_id=job_id,
    )
    interview = await _add_interview(
        db_session,
        candidate_id=other_candidate_id,
        job_id=job_id,
        interview_type="technical",
        status="completed",
    )

    response = await client.get(
        f"/api/v1/candidates/{candidate_id}/process-history",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["candidate_id"] == str(candidate_id)
    assert all(process["pipeline_id"] != str(other_pipeline_id) for process in payload["processes"])
    assert all(
        interview["id"] != str(interview.id)
        for process in payload["processes"]
        for interview in process["interviews"]
    )


@pytest.mark.asyncio
async def test_process_history_requires_staff_auth(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _, headers = await _setup_recruiter(db_session, client)
    candidate_id = await _create_candidate(client, headers, "Sem Auth", f"auth-{uuid4().hex[:6]}@test.com")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/process-history")
    assert response.status_code in {401, 403}
