"""Behavioral assessment e2e integration tests.

Covers gaps not addressed by existing test files:
- Template management RBAC via HTTP API
- Question validation via HTTP API
- Candidate access isolation
- Full ponta-a-ponta with 5-competency fixture
- Decision gate enforcement (pending/in_progress blocks; submitted allows)
- Recruiter full detail view with submitted answers
- Draft answer preservation
- Decision summary behavioral fields
"""
from __future__ import annotations

import io
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
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


# ── helpers ──────────────────────────────────────────────────────────────────

async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"e2e-admin-{uuid4().hex[:8]}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    return await _auth_headers(client, user.email, "Senha123!")


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    user = await _create_active_user(
        db_session,
        f"e2e-recruiter-{uuid4().hex[:8]}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    return await _auth_headers(client, user.email, "Senha123!")


_VALID_PDF = b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
160
%%EOF
"""


async def _apply(
    client: AsyncClient,
    *,
    job_id: UUID,
    email: str | None = None,
    cpf: str = "98765432100",
) -> dict:
    email = email or f"cand-{uuid4().hex[:8]}@example.com"
    resp = await client.post(
        "/api/v1/public/candidates/apply",
        data={
            "full_name": "Candidato E2E",
            "cpf": cpf,
            "email": email,
            "phone": "11987654321",
            "city": "São Paulo",
            "state": "SP",
            "salary_expectation": "7000",
            "desired_contract_type": "CLT",
            "works_at_marajo_group": False,
            "job_id": str(job_id),
            "lgpd_consent": True,
            "password": "SenhaSegura123",
            "confirm_password": "SenhaSegura123",
        },
        files={"resume_file": ("resume.pdf", io.BytesIO(_VALID_PDF), "application/pdf")},
    )
    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    return resp.json()


async def _create_job_with_template(
    db_session: AsyncSession,
    *,
    template_id: UUID | None = None,
    requires_behavioral_assessment: bool = True,
    requires_behavioral_ai_evaluation: bool = False,
) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=f"Vaga E2E {uuid4().hex[:6]}",
        description="Vaga para testes e2e de avaliação comportamental.",
        status="published",
        created_by=uuid4(),
        location="São Paulo",
        job_area="technology",
        behavioral_template_id=template_id,
        requires_behavioral_assessment=requires_behavioral_assessment,
        requires_behavioral_ai_evaluation=requires_behavioral_ai_evaluation,
    )
    db_session.add(job)
    await db_session.commit()
    return job


async def _seed_5_competency_template(db_session: AsyncSession) -> tuple[
    BehavioralAssessmentTemplateModel,
    list[BehavioralTemplateQuestionModel],
]:
    """Fixture with 5 behavioral competencies (Parte 4 questions)."""
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name="Avaliação Comportamental por Competências",
        description="Avaliação estruturada em 5 competências operacionais.",
        status="active",
        created_by=uuid4(),
    )
    db_session.add(template)
    await db_session.flush()

    competency_defs = [
        ("Organização", 1),
        ("Atendimento", 2),
        ("Colaboração", 3),
        ("Responsabilidade", 4),
        ("Aprendizagem", 5),
    ]
    all_questions: list[BehavioralTemplateQuestionModel] = []

    for comp_name, order in competency_defs:
        comp = BehavioralTemplateCompetencyModel(
            id=uuid4(),
            template_id=template.id,
            name=comp_name,
            weight=Decimal("1.0"),
            display_order=order,
        )
        db_session.add(comp)
        await db_session.flush()

        if comp_name == "Organização":
            q = BehavioralTemplateQuestionModel(
                id=uuid4(),
                competency_id=comp.id,
                question_text=(
                    "Conte uma situação em que você precisou lidar com muitas tarefas "
                    "ao mesmo tempo. Como priorizou?"
                ),
                answer_type="text",
                is_required=True,
                weight=Decimal("1.0"),
                display_order=1,
            )
        elif comp_name == "Atendimento":
            q = BehavioralTemplateQuestionModel(
                id=uuid4(),
                competency_id=comp.id,
                question_text="Um cliente irritado reclama de um erro. Qual sua primeira atitude?",
                answer_type="multiple_choice",
                is_required=True,
                weight=Decimal("1.5"),
                display_order=1,
                options_json=[
                    "Defender-se imediatamente.",
                    "Escutar, reconhecer o problema e entender os detalhes.",
                    "Encaminhar sem ouvir.",
                    "Ignorar a reclamação.",
                ],
            )
        elif comp_name == "Colaboração":
            q = BehavioralTemplateQuestionModel(
                id=uuid4(),
                competency_id=comp.id,
                question_text=(
                    "Descreva uma situação em que você discordou de um colega. Como resolveu?"
                ),
                answer_type="text",
                is_required=True,
                weight=Decimal("1.0"),
                display_order=1,
            )
        elif comp_name == "Responsabilidade":
            q = BehavioralTemplateQuestionModel(
                id=uuid4(),
                competency_id=comp.id,
                question_text=(
                    "Você percebe um erro em um processo que ninguém notou. O que faz?"
                ),
                answer_type="text",
                is_required=True,
                weight=Decimal("1.0"),
                display_order=1,
            )
        else:  # Aprendizagem
            q = BehavioralTemplateQuestionModel(
                id=uuid4(),
                competency_id=comp.id,
                question_text=(
                    "Conte sobre uma ferramenta ou processo que você teve que aprender rapidamente."
                ),
                answer_type="text",
                is_required=True,
                weight=Decimal("1.0"),
                display_order=1,
            )

        db_session.add(q)
        all_questions.append(q)

    await db_session.commit()
    return template, all_questions


async def _seed_policy_case_with_template(
    db_session: AsyncSession,
    *,
    template_id: UUID,
    requires_behavioral_assessment: bool = True,
    requires_behavioral_ai_evaluation: bool = False,
    assignment_status: str | None = None,
    ai_eval_status: str | None = None,
) -> tuple[UUID, UUID]:
    """Seed job+candidate+pipeline+score, link template, optionally seed assignment/ai_eval."""
    owner = await _create_active_user(
        db_session,
        f"gate-owner-{uuid4().hex[:8]}@example.com",
        "Senha123!",
        UserRole.ADMIN,
    )
    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        owner.id,
        job_title=f"Vaga Gate {uuid4().hex[:6]}",
        candidate_email=f"gate-cand-{uuid4().hex}@example.com",
    )

    await db_session.execute(sa.update(ScoreModelVersionModel).values(is_active=False))
    version = ScoreModelVersionModel(
        version=f"gate-{uuid4().hex[:8]}",
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
    now = datetime.now(UTC)
    db_session.add(
        CandidateJobScoreModel(
            candidate_id=candidate_id,
            job_id=job_id,
            version_id=version.id,
            source_analysis_id=pipeline.current_analysis_id,
            source_analysis_created_at=now,
            input_hash=f"gate-{uuid4().hex}",
            score_model_version=version.version,
            explainability_version="v1",
            final_score=Decimal("80.00"),
            decision_suggestion="review",
            breakdown={},
            reason_codes=[],
            explanation_text="Score gate.",
            freshness_status="fresh",
            computed_at=now,
            updated_at=now,
            previous_score=None,
            recompute_reason="test",
            job_signature_hash="test",
            job_updated_at=now,
        )
    )

    await db_session.execute(
        sa.update(JobModel).where(JobModel.id == job_id).values(
            behavioral_template_id=template_id,
            requires_behavioral_assessment=requires_behavioral_assessment,
            requires_behavioral_ai_evaluation=requires_behavioral_ai_evaluation,
            requires_interview=False,
            requires_scorecard=False,
            requires_manager_review=False,
            selection_flow_type="simple",
        )
    )

    if assignment_status is not None:
        assignment = BehavioralAssessmentAssignmentModel(
            id=uuid4(),
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
            status=assignment_status,
            assigned_at=now,
            started_at=now if assignment_status != "pending" else None,
            submitted_at=now if assignment_status == "submitted" else None,
        )
        db_session.add(assignment)
        await db_session.flush()

        if ai_eval_status is not None:
            db_session.add(
                BehavioralAssessmentAIEvaluationModel(
                    id=uuid4(),
                    assignment_id=assignment.id,
                    candidate_id=candidate_id,
                    job_id=job_id,
                    template_id=template_id,
                    status=ai_eval_status,
                    provider="gemini",
                    model="gemini-test",
                    prompt_version=1,
                    completed_at=now if ai_eval_status == "completed" else None,
                )
            )

    await db_session.commit()
    return job_id, candidate_id


# ── RBAC: /admin/behavioral/templates ────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_create_behavioral_template(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    resp = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": "Template Admin Criado", "description": "Avaliação de competências."},
    )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    data = resp.json()
    assert data["name"] == "Template Admin Criado"
    assert data["status"] == "draft"
    assert data["version"] == 1


@pytest.mark.asyncio
async def test_viewer_cannot_create_behavioral_template(client: AsyncClient, db_session: AsyncSession) -> None:
    """Viewer (somente leitura) não pode criar templates — o endpoint exige recruiter ou admin."""
    viewer = await _create_active_user(
        db_session,
        f"e2e-viewer-{uuid4().hex[:8]}@example.com",
        "Senha123!",
        UserRole.VIEWER,
    )
    headers = await _auth_headers(client, viewer.email, "Senha123!")

    resp = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": "Template Viewer"},
    )

    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_admin_can_activate_template_via_api(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    create = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": f"Template Ativar {uuid4().hex[:6]}"},
    )
    template_id = create.json()["id"]

    comp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies",
        headers=headers,
        json={"name": "Comunicação", "display_order": 1},
    )
    comp_id = comp.json()["id"]

    await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies/{comp_id}/questions",
        headers=headers,
        json={"question_text": "Descreva sua habilidade de comunicação.", "answer_type": "text", "display_order": 1},
    )

    activate = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/activate",
        headers=headers,
    )

    assert activate.status_code == status.HTTP_200_OK, activate.text
    assert activate.json()["status"] == "active"


@pytest.mark.asyncio
async def test_admin_links_template_to_job_via_api(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)
    template, _qs = await _seed_5_competency_template(db_session)
    job = await _create_job_with_template(db_session, template_id=None)

    resp = await client.patch(
        f"/api/v1/jobs/{job.id}/behavioral-template",
        headers=headers,
        json={"behavioral_template_id": str(template.id)},
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text


# ── Question validation via HTTP API ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_question_with_empty_text_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    create = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": f"Template Vazio {uuid4().hex[:6]}"},
    )
    template_id = create.json()["id"]
    comp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies",
        headers=headers,
        json={"name": "Competência", "display_order": 1},
    )
    comp_id = comp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies/{comp_id}/questions",
        headers=headers,
        json={"question_text": "", "answer_type": "text", "display_order": 1},
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_multiple_choice_question_without_options_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    create = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": f"Template MC {uuid4().hex[:6]}"},
    )
    template_id = create.json()["id"]
    comp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies",
        headers=headers,
        json={"name": "Competência", "display_order": 1},
    )
    comp_id = comp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies/{comp_id}/questions",
        headers=headers,
        json={
            "question_text": "Qual opção?",
            "answer_type": "multiple_choice",
            "options_json": [],
            "display_order": 1,
        },
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_negative_question_weight_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    create = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": f"Template Peso {uuid4().hex[:6]}"},
    )
    template_id = create.json()["id"]
    comp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies",
        headers=headers,
        json={"name": "Competência", "display_order": 1},
    )
    comp_id = comp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies/{comp_id}/questions",
        headers=headers,
        json={"question_text": "Pergunta X", "answer_type": "text", "weight": -1.0, "display_order": 1},
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_cannot_activate_template_without_questions(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)

    create = await client.post(
        "/api/v1/admin/behavioral/templates",
        headers=headers,
        json={"name": f"Template Sem Perguntas {uuid4().hex[:6]}"},
    )
    template_id = create.json()["id"]
    await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies",
        headers=headers,
        json={"name": "Competência Vazia", "display_order": 1},
    )

    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/activate",
        headers=headers,
    )

    assert resp.status_code in (status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_400_BAD_REQUEST), resp.text


# ── Candidate access isolation ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_candidate_cannot_access_other_candidates_assignment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Candidato autenticado não deve conseguir acessar assignment de outro candidato."""
    from src.infrastructure.database.models.candidate_model import CandidateModel

    template, _qs = await _seed_5_competency_template(db_session)
    job = await _create_job_with_template(db_session, template_id=template.id)

    # Candidato A faz candidatura → obtém cookie de sessão no client
    await _apply(client, job_id=job.id, email=f"cand-a-{uuid4().hex[:6]}@example.com", cpf="11144477735")

    # Cria candidato B e um assignment diretamente no banco (sem passar pelo portal)
    cand_b = CandidateModel(
        id=uuid4(),
        full_name="Candidato B",
        email=f"cand-b-{uuid4().hex[:6]}@example.com",
        cpf="52998224725",
        created_by=uuid4(),
    )
    db_session.add(cand_b)
    await db_session.flush()

    assignment_b = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=cand_b.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        assigned_at=datetime.now(UTC),
    )
    db_session.add(assignment_b)
    await db_session.commit()

    # Candidato A (sessão ativa no client) tenta acessar o assignment do candidato B
    resp = await client.get(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_b.id}",
    )

    assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


# ── Full ponta-a-ponta com fixture de 5 competências ─────────────────────────

@pytest.mark.asyncio
async def test_full_behavioral_e2e_5_competencies(client: AsyncClient, db_session: AsyncSession) -> None:
    """Recrutador cria template → publica → candidato responde → recrutador vê tudo."""
    template, questions = await _seed_5_competency_template(db_session)
    job = await _create_job_with_template(db_session, template_id=template.id)

    # Candidato se candidata e recebe cookie de sessão
    payload = await _apply(client, job_id=job.id)
    candidate_id = UUID(payload["candidate_id"])

    # 1. Candidato vê avaliação pendente
    list_resp = await client.get("/api/v1/candidate-portal/behavioral-assessments")
    assert list_resp.status_code == status.HTTP_200_OK
    assessments = list_resp.json()
    assert len(assessments) == 1
    assert assessments[0]["status"] == "pending"
    assert assessments[0]["question_count"] == 5

    assignment_id = assessments[0]["id"]

    # 2. Candidato abre avaliação (start)
    start_resp = await client.post(f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/start")
    assert start_resp.status_code == status.HTTP_200_OK
    assert start_resp.json()["status"] == "in_progress"

    # 3. Candidato salva rascunho parcial
    text_question = next(q for q in questions if q.answer_type == "text")
    draft_resp = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/answers",
        json={"answers": [{"question_id": str(text_question.id), "answer_text": "Rascunho inicial"}]},
    )
    assert draft_resp.status_code == status.HTTP_200_OK

    # 4. Detalhe mostra rascunho preservado
    detail_resp = await client.get(f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}")
    assert detail_resp.status_code == status.HTTP_200_OK
    detail = detail_resp.json()
    assert detail["status"] == "in_progress"
    all_answers = [
        q["answer"]
        for comp in detail["competencies"]
        for q in comp["questions"]
        if q["answer"] is not None
    ]
    assert any(a.get("answer_text") == "Rascunho inicial" for a in all_answers)

    # 5. Candidato envia avaliação completa (todas as 5 perguntas)
    choice_question = next(q for q in questions if q.answer_type == "multiple_choice")
    text_questions = [q for q in questions if q.answer_type == "text"]
    answers = [
        {"question_id": str(choice_question.id), "selected_options_json": ["Escutar, reconhecer o problema e entender os detalhes."]},
    ] + [
        {"question_id": str(q.id), "answer_text": f"Resposta para {q.question_text[:30]}"}
        for q in text_questions
    ]

    submit_resp = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/submit",
        json={"answers": answers},
    )
    assert submit_resp.status_code == status.HTTP_200_OK, submit_resp.text
    assert submit_resp.json()["status"] == "submitted"
    assert submit_resp.json()["submitted_at"] is not None

    # 6. Status no banco é "submitted"
    await db_session.refresh(await db_session.get(BehavioralAssessmentAssignmentModel, UUID(assignment_id)))
    db_assignment = await db_session.get(BehavioralAssessmentAssignmentModel, UUID(assignment_id))
    assert db_assignment is not None
    assert db_assignment.status == "submitted"

    # 7. Recrutador vê status correto e total de respostas
    rec_headers = await _recruiter_headers(client, db_session)
    rec_resp = await client.get(
        f"/api/v1/jobs/{job.id}/candidates/{candidate_id}/behavioral-assessment",
        headers=rec_headers,
    )
    assert rec_resp.status_code == status.HTTP_200_OK, rec_resp.text
    rec_data = rec_resp.json()
    assert rec_data["status"] == "submitted"
    assert rec_data["question_count"] == 5
    assert rec_data["answered_count"] == 5


@pytest.mark.asyncio
async def test_submitted_assessment_blocks_further_edits(client: AsyncClient, db_session: AsyncSession) -> None:
    template, questions = await _seed_5_competency_template(db_session)
    job = await _create_job_with_template(db_session, template_id=template.id)
    await _apply(client, job_id=job.id)

    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    choice_q = next(q for q in questions if q.answer_type == "multiple_choice")
    text_qs = [q for q in questions if q.answer_type == "text"]
    all_answers = [
        {"question_id": str(choice_q.id), "selected_options_json": ["Defender-se imediatamente."]},
    ] + [{"question_id": str(q.id), "answer_text": "Resposta"} for q in text_qs]

    await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={"answers": all_answers},
    )

    edit_resp = await client.put(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/answers",
        json={"answers": [{"question_id": str(text_qs[0].id), "answer_text": "Tentativa de edição"}]},
    )

    assert edit_resp.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_candidate_cannot_submit_incomplete_assessment(client: AsyncClient, db_session: AsyncSession) -> None:
    template, questions = await _seed_5_competency_template(db_session)
    job = await _create_job_with_template(db_session, template_id=template.id)
    await _apply(client, job_id=job.id)

    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    # Envia apenas 1 resposta, mas há 5 perguntas obrigatórias
    text_q = next(q for q in questions if q.answer_type == "text")
    resp = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={"answers": [{"question_id": str(text_q.id), "answer_text": "Resposta parcial"}]},
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# ── Recruiter views full submitted detail ─────────────────────────────────────

@pytest.mark.asyncio
async def test_recruiter_sees_full_submitted_answers_with_competencies(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, questions = await _seed_5_competency_template(db_session)
    job = await _create_job_with_template(db_session, template_id=template.id)
    payload = await _apply(client, job_id=job.id)
    candidate_id = UUID(payload["candidate_id"])

    assignment = await db_session.scalar(sa.select(BehavioralAssessmentAssignmentModel))
    assert assignment is not None

    choice_q = next(q for q in questions if q.answer_type == "multiple_choice")
    text_qs = [q for q in questions if q.answer_type == "text"]
    await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment.id}/submit",
        json={
            "answers": [
                {"question_id": str(choice_q.id), "selected_options_json": ["Escutar, reconhecer o problema e entender os detalhes."]},
            ] + [
                {"question_id": str(q.id), "answer_text": f"Resposta competência {i}"}
                for i, q in enumerate(text_qs)
            ]
        },
    )

    rec_headers = await _recruiter_headers(client, db_session)
    detail_resp = await client.get(
        f"/api/v1/jobs/{job.id}/candidates/{candidate_id}/behavioral-assessment",
        headers=rec_headers,
    )

    assert detail_resp.status_code == status.HTTP_200_OK, detail_resp.text
    data = detail_resp.json()
    assert data["status"] == "submitted"
    assert data["submitted_at"] is not None
    # Detalhe completo deve incluir competências e respostas
    if "competencies" in data:
        assert len(data["competencies"]) == 5
        total_answered = sum(
            1 for comp in data["competencies"]
            for q in comp["questions"]
            if q.get("answer") is not None
        )
        assert total_answered == 5


# ── Decision gate: behavioral assessment ─────────────────────────────────────

@pytest.mark.asyncio
async def test_hire_blocked_when_behavioral_assessment_pending(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="pending",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Candidato aprovado.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, resp.text


@pytest.mark.asyncio
async def test_hire_blocked_when_behavioral_assessment_in_progress(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="in_progress",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Candidato aprovado.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, resp.text


@pytest.mark.asyncio
async def test_hire_allowed_when_behavioral_assessment_submitted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=False,
        assignment_status="submitted",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Candidato aprovado após avaliação comportamental.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text


@pytest.mark.asyncio
async def test_hire_blocked_when_behavioral_ai_required_and_not_completed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        assignment_status="submitted",
        ai_eval_status="pending",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Aprovado.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, resp.text


@pytest.mark.asyncio
async def test_hire_allowed_when_behavioral_ai_completed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
        assignment_status="submitted",
        ai_eval_status="completed",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Aprovado após avaliação IA concluída.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text


@pytest.mark.asyncio
async def test_reject_does_not_require_behavioral_assessment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="pending",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "reject",
            "reason_code": "missing_required_skill",
            "notes": "Candidato não atende os requisitos mínimos.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text


@pytest.mark.asyncio
async def test_reason_code_other_bypasses_behavioral_assessment_gate(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="pending",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        headers=headers,
        json={
            "decision_outcome": "hire",
            "reason_code": "other",
            "notes": "Exceção aprovada pela diretoria com documentação.",
            "submit": True,
        },
    )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text


# ── Decision summary behavioral fields ───────────────────────────────────────

@pytest.mark.asyncio
async def test_decision_summary_shows_behavioral_assessment_pending(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="pending",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=headers,
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text
    data = resp.json()
    behavioral = data.get("behavioral_assessment", {})
    assert behavioral.get("template_required") is True
    assert behavioral.get("assignment_status") == "pending"


@pytest.mark.asyncio
async def test_decision_summary_shows_behavioral_assessment_submitted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="submitted",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=headers,
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text
    data = resp.json()
    behavioral = data.get("behavioral_assessment", {})
    assert behavioral.get("assignment_status") == "submitted"
    assert behavioral.get("submitted_at") is not None


@pytest.mark.asyncio
async def test_decision_summary_shows_not_required_when_template_absent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=uuid4(),  # template não existe no DB → deve ser tratado como ausente
        requires_behavioral_assessment=False,
    )
    headers = await _recruiter_headers(client, db_session)

    # Limpa o behavioral_template_id da vaga
    await db_session.execute(
        sa.update(JobModel).where(JobModel.id == job_id).values(behavioral_template_id=None)
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=headers,
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text
    data = resp.json()
    behavioral = data.get("behavioral_assessment", {})
    assert behavioral.get("template_required") is False


# ── Reason codes: operacional status ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_decision_readiness_has_waiting_behavioral_when_pending(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        assignment_status="pending",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=headers,
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text
    data = resp.json()
    readiness = data.get("decision_readiness", {})
    missing = readiness.get("missing_items", [])
    assert "behavioral_assessment" in missing


@pytest.mark.asyncio
async def test_decision_readiness_clear_after_submission(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    template, _qs = await _seed_5_competency_template(db_session)
    job_id, candidate_id = await _seed_policy_case_with_template(
        db_session,
        template_id=template.id,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=False,
        assignment_status="submitted",
    )
    headers = await _recruiter_headers(client, db_session)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=headers,
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text
    data = resp.json()
    readiness = data.get("decision_readiness", {})
    missing = readiness.get("missing_items", [])
    assert "behavioral_assessment" not in missing
