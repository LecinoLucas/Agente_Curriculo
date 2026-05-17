from __future__ import annotations

import io
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4
from unittest.mock import AsyncMock, patch

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisResponse
from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.ai.factory import AIServiceFactory
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.communication_model import CommunicationTemplateModel
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
    PreAdmissionEventModel,
)
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel
from src.infrastructure.storage.pre_admission_documents import (
    build_pre_admission_storage_key,
    write_pre_admission_document,
)
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio

PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
SENSITIVE_COMMUNICATION_TERMS = (
    "score",
    "ranking",
    "parecer ia",
    "parecer interno",
    "strong_fit",
    "job_fit_score",
)


async def _user_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    email: str,
    role: UserRole,
) -> tuple[object, dict[str, str]]:
    user = await _create_active_user(db_session, email, "SenhaSegura123", role)
    headers = await _auth_headers(client, email, "SenhaSegura123")
    return user, headers


async def _seed_safe_communication_templates(db_session: AsyncSession) -> None:
    templates = [
        (
            "interview_scheduled",
            "candidate",
            "Entrevista agendada",
            "Olá {candidate_name}, sua entrevista para a vaga {job_title} foi agendada para {scheduled_start}.",
        ),
        (
            "interview_awaiting_feedback",
            "recruiter",
            "Aguardando feedback da entrevista",
            "Entrevista com {candidate_name} para a vaga {job_title} realizada. Aguardando feedback.",
        ),
        (
            "hiring_decision_submitted",
            "hr",
            "Decisão de contratação registrada",
            "Uma decisão de contratação foi registrada para {candidate_name} na vaga {job_title}.",
        ),
        (
            "pre_admission_created",
            "candidate",
            "Processo de pré-admissão iniciado",
            "Olá {candidate_name}, o seu processo de pré-admissão foi iniciado. Verifique os documentos necessários.",
        ),
        (
            "admission_package_approved",
            "hr",
            "Pacote admissional aprovado",
            "O pacote admissional para {candidate_name} na vaga {job_title} foi aprovado.",
        ),
    ]
    for key, audience, subject, body in templates:
        db_session.add(
            CommunicationTemplateModel(
                key=key,
                channel="internal",
                audience=audience,
                subject_template=subject,
                body_template=body,
                status="active",
            )
        )
    await db_session.commit()


def _assert_ok(response, expected_status: int, context: str) -> dict:
    assert response.status_code == expected_status, f"{context}: {response.status_code} {response.text}"
    if response.content:
        return response.json()
    return {}


async def _active_pipeline(
    db_session: AsyncSession,
    *,
    candidate_id: str | UUID,
    job_id: str | UUID,
) -> SimpleNamespace:
    row = (
        await db_session.execute(
            sa.select(
                CandidateJobPipelineModel.pipeline_stage,
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.link_status,
                CandidateJobPipelineModel.relationship_status,
            ).where(
                CandidateJobPipelineModel.candidate_id == UUID(str(candidate_id)),
                CandidateJobPipelineModel.job_id == UUID(str(job_id)),
                CandidateJobPipelineModel.pipeline_status == "active",
            )
        )
    ).one_or_none()
    assert row is not None
    return SimpleNamespace(
        pipeline_stage=row.pipeline_stage,
        pipeline_status=row.pipeline_status,
        link_status=row.link_status,
        relationship_status=row.relationship_status,
    )


async def _decision_count(
    db_session: AsyncSession,
    *,
    candidate_id: str | UUID,
    job_id: str | UUID,
) -> int:
    return int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobHiringDecisionModel.id)).where(
                CandidateJobHiringDecisionModel.candidate_id == UUID(str(candidate_id)),
                CandidateJobHiringDecisionModel.job_id == UUID(str(job_id)),
            )
        )
        or 0
    )


async def _score_count(
    db_session: AsyncSession,
    *,
    candidate_id: str | UUID,
    job_id: str | UUID,
) -> int:
    return int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == UUID(str(candidate_id)),
                CandidateJobScoreModel.job_id == UUID(str(job_id)),
            )
        )
        or 0
    )


async def _seed_other_candidate_document(
    db_session: AsyncSession,
    *,
    job_id: str | UUID,
    actor_id: str | UUID,
) -> UUID:
    now = datetime.now(UTC)
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Outro Candidato Demo",
        email=f"outro-candidato-{uuid4().hex}@example.com",
        cpf=f"{uuid4().int % 10**11:011d}",
        phone="11911112222",
        created_by=UUID(str(actor_id)),
        created_at=now,
        updated_at=now,
    )
    db_session.add(candidate)
    await db_session.flush()

    pipeline = CandidateJobPipelineModel(
        candidate_job_pipeline_id=uuid4(),
        candidate_id=candidate.id,
        job_id=UUID(str(job_id)),
        pipeline_stage="entry",
        pipeline_status="active",
        link_status="active",
        relationship_status="active",
        is_terminal=False,
        source="manual",
        created_at=now,
        updated_at=now,
    )
    db_session.add(pipeline)

    decision = CandidateJobHiringDecisionModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=UUID(str(job_id)),
        decided_by=UUID(str(actor_id)),
        decision_status="submitted",
        decision_outcome="hire",
        reason_code="other",
        notes="Decisão fake para validar isolamento documental.",
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(decision)
    await db_session.flush()

    case = PreAdmissionCaseModel(
        id=uuid4(),
        candidate_id=candidate.id,
        job_id=UUID(str(job_id)),
        hiring_decision_id=decision.id,
        status="documents_pending",
        created_by=UUID(str(actor_id)),
        created_at=now,
        updated_at=now,
    )
    db_session.add(case)
    await db_session.flush()

    item = PreAdmissionChecklistItemModel(
        id=uuid4(),
        case_id=case.id,
        item_type="rg",
        title="RG",
        status="approved",
        required=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(item)
    await db_session.flush()

    document_id = uuid4()
    storage_key, stored_filename = build_pre_admission_storage_key(
        candidate_id=candidate.id,
        case_id=case.id,
        item_id=item.id,
        document_id=document_id,
        extension=".pdf",
    )
    write_pre_admission_document(storage_key, PDF_BYTES)
    document = PreAdmissionDocumentModel(
        id=document_id,
        case_id=case.id,
        checklist_item_id=item.id,
        candidate_id=candidate.id,
        original_filename="rg-outro-candidato.pdf",
        stored_filename=stored_filename,
        storage_key=storage_key,
        mime_type="application/pdf",
        size_bytes=len(PDF_BYTES),
        status="approved",
        uploaded_at=now,
        reviewed_at=now,
        reviewed_by=UUID(str(actor_id)),
        created_at=now,
        updated_at=now,
    )
    db_session.add(document)
    await db_session.commit()
    return document.id


def _assert_no_sensitive_terms(payload: object) -> None:
    serialized = json.dumps(payload, ensure_ascii=False).lower()
    for term in SENSITIVE_COMMUNICATION_TERMS:
        assert term not in serialized, f"Comunicação expôs termo sensível: {term}"


async def test_demo_full_flow_20_1(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    executed_steps: list[str] = []

    await _seed_safe_communication_templates(db_session)
    admin, admin_headers = await _user_headers(
        client,
        db_session,
        email="demo-admin-20-1@example.com",
        role=UserRole.ADMIN,
    )
    recruiter, recruiter_headers = await _user_headers(
        client,
        db_session,
        email="demo-recruiter-20-1@example.com",
        role=UserRole.RECRUITER,
    )
    manager, manager_headers = await _user_headers(
        client,
        db_session,
        email="demo-manager-20-1@example.com",
        role=UserRole.MANAGER,
    )
    _viewer, viewer_headers = await _user_headers(
        client,
        db_session,
        email="demo-viewer-20-1@example.com",
        role=UserRole.VIEWER,
    )
    executed_steps.append("1-2. usuários admin/recruiter, manager e viewer criados")

    template = _assert_ok(
        await client.post(
            "/api/v1/admin/behavioral/templates",
            json={"name": "Template Demo Fase 20.1", "description": "Template fake para E2E demo"},
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "criar template comportamental",
    )
    competency = _assert_ok(
        await client.post(
            f"/api/v1/admin/behavioral/templates/{template['id']}/competencies",
            json={
                "name": "Comunicação",
                "description": "Comunicação clara em contexto de trabalho",
                "weight": 1.0,
                "display_order": 1,
            },
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "criar competência comportamental",
    )
    question = _assert_ok(
        await client.post(
            f"/api/v1/admin/behavioral/templates/{template['id']}/competencies/{competency['id']}/questions",
            json={
                "question_text": "Conte uma situação em que você alinhou áreas com interesses diferentes.",
                "answer_type": "text",
                "is_required": True,
                "weight": 1.0,
                "display_order": 1,
            },
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "criar pergunta comportamental",
    )
    _assert_ok(
        await client.post(
            f"/api/v1/admin/behavioral/templates/{template['id']}/activate",
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "ativar template comportamental",
    )
    executed_steps.append("3. template comportamental criado e ativado")

    job_payload = {
        "title": "Pessoa Desenvolvedora Demo Fase 20.1",
        "description": (
            "Vaga fake de demonstração para pessoa desenvolvedora com atuação em Python, "
            "React, PostgreSQL, APIs, testes automatizados e colaboração com produto."
        ),
        "requirements": (
            "Experiência com Python, FastAPI, React, SQL, testes automatizados, revisão de código "
            "e comunicação com stakeholders técnicos e não técnicos."
        ),
        "location": "São Paulo",
        "work_model": "hybrid",
        "salary_min": 9000.0,
        "salary_max": 14000.0,
        "job_area": "engineering",
        "seniority_level": "senior",
        "minimum_education_level": "bachelor",
        "minimum_years_experience": 5,
        "responsibilities": (
            "Evoluir APIs, colaborar com frontend, orientar decisões técnicas e manter qualidade "
            "do fluxo principal do produto."
        ),
        "experience_context": "Produto SaaS com backend Python e frontend React.",
        "behavioral_requirements": ["Comunicação", "Colaboração"],
        "status": "draft",
        "skill_requirements": {
            "priority": ["Python", "React", "SQL"],
            "complementary": ["Docker"],
            "eliminatory": [],
        },
    }
    job = _assert_ok(
        await client.post("/api/v1/jobs", json=job_payload, headers=recruiter_headers),
        status.HTTP_201_CREATED,
        "criar vaga",
    )
    job_id = job["id"]
    for skill_name, priority_level in (
        ("Python", "priority"),
        ("React", "priority"),
        ("SQL", "priority"),
        ("Docker", "complementary"),
    ):
        skill = await client.post(
            "/api/v1/skills",
            json={"name": f"{skill_name} Demo 20.1", "category": "technology"},
            headers=recruiter_headers,
        )
        assert skill.status_code in {status.HTTP_201_CREATED, status.HTTP_409_CONFLICT}, skill.text
        _assert_ok(
            await client.post(
                f"/api/v1/jobs/{job_id}/skills",
                json={
                    "skill_name": f"{skill_name} Demo 20.1",
                    "priority_level": priority_level,
                    "weight": 1.0,
                },
                headers=recruiter_headers,
            ),
            status.HTTP_201_CREATED,
            f"vincular skill {skill_name}",
        )
    _assert_ok(
        await client.patch(
            f"/api/v1/jobs/{job_id}/behavioral-template",
            json={"behavioral_template_id": template["id"]},
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "vincular template à vaga",
    )
    _assert_ok(
        await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=recruiter_headers),
        status.HTTP_200_OK,
        "publicar vaga",
    )
    executed_steps.append("4. vaga fake publicada e vinculada ao template")

    application = _assert_ok(
        await client.post(
            "/api/v1/public/candidates/apply",
            files={"resume_file": ("curriculo-demo.pdf", io.BytesIO(PDF_BYTES), "application/pdf")},
            data={
                "full_name": "Candidata Demo Fluxo Principal",
                "email": "candidata.demo.20.1@example.com",
                "phone": "11987654321",
                "cpf": "390.533.447-05",
                "city": "São Paulo",
                "state": "SP",
                "salary_expectation": "8000",
                "desired_contract_type": "CLT",
                "works_at_marajo_group": "false",
                "job_id": job_id,
                "password": "SenhaSegura123",
                "confirm_password": "SenhaSegura123",
                "lgpd_consent": "true",
            },
        ),
        status.HTTP_201_CREATED,
        "candidatura pública",
    )
    candidate_id = application["candidate_id"]
    candidate_portal_token = client.cookies.get("candidate_portal_token")
    assert candidate_portal_token
    assert application["pipeline_id"] is not None
    assert application["analysis_auto_requested"] is False

    pipeline = await _active_pipeline(db_session, candidate_id=candidate_id, job_id=job_id)
    initial_pipeline_stage = pipeline.pipeline_stage
    initial_score_count = await _score_count(db_session, candidate_id=candidate_id, job_id=job_id)
    executed_steps.append("5-6. candidatura pública criou pipeline ativo sem análise automática de IA")

    assessments = _assert_ok(
        await client.get("/api/v1/candidate-portal/behavioral-assessments"),
        status.HTTP_200_OK,
        "listar avaliações do candidato",
    )
    assert len(assessments) == 1
    assignment_id = assessments[0]["id"]
    assert assessments[0]["job_id"] == job_id
    executed_steps.append("7. assignment comportamental criado para a candidatura")

    _assert_ok(
        await client.post(f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/start"),
        status.HTTP_200_OK,
        "iniciar avaliação comportamental",
    )
    _assert_ok(
        await client.post(
            f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/submit",
            json={
                "answers": [
                    {
                        "question_id": question["id"],
                        "answer_text": (
                            "Alinhei produto, engenharia e atendimento em um incidente crítico, "
                            "organizando prioridades, responsáveis e comunicação diária."
                        ),
                        "answer_value": None,
                        "selected_options_json": None,
                    }
                ]
            },
        ),
        status.HTTP_200_OK,
        "submeter respostas comportamentais",
    )
    recruiter_assessment = _assert_ok(
        await client.get(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment",
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "recrutador visualizar respostas",
    )
    assert recruiter_assessment is not None
    executed_steps.append("8-9. candidato respondeu avaliação e recruiter visualizou respostas")

    assert await _decision_count(db_session, candidate_id=candidate_id, job_id=job_id) == 0
    mock_ai = AsyncMock()
    mock_ai.analyze.return_value = AIAnalysisResponse(
        content=json.dumps(
            {
                "confidence": "medium",
                "summary": "Há evidências de comunicação estruturada e colaboração entre áreas.",
                "competency_signals": [
                    {
                        "competency": "Comunicação",
                        "signal": "strong",
                        "evidence": "Resposta descreve alinhamento, responsáveis e cadência.",
                        "concerns": [],
                    }
                ],
                "strengths": ["Comunicação objetiva"],
                "concerns": ["Validar profundidade técnica em entrevista"],
                "suggested_interview_questions": [
                    "Como você priorizou as demandas conflitantes no incidente?"
                ],
                "risk_flags": [],
            }
        ),
        input_tokens=100,
        output_tokens=60,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=42,
    )
    with patch.object(AIServiceFactory, "create", return_value=mock_ai):
        evaluation_trigger = _assert_ok(
            await client.post(
                f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluate",
                headers=recruiter_headers,
            ),
            status.HTTP_202_ACCEPTED,
            "gerar análise IA assistiva",
        )
        assert evaluation_trigger["status"] in {"processing", "completed"}
        evaluation = _assert_ok(
            await client.get(
                f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluation",
                headers=recruiter_headers,
            ),
            status.HTTP_200_OK,
            "obter análise IA assistiva",
        )
    assert mock_ai.analyze.await_count == 1
    assert evaluation["status"] == "completed"
    assert "aprovado" not in evaluation["summary"].lower()
    assert "reprovado" not in evaluation["summary"].lower()
    assert await _decision_count(db_session, candidate_id=candidate_id, job_id=job_id) == 0
    assert (
        await _active_pipeline(db_session, candidate_id=candidate_id, job_id=job_id)
    ).pipeline_stage == initial_pipeline_stage
    executed_steps.append("10. IA assistiva mockada gerou parecer sem aprovar/reprovar ou mover pipeline")

    interview_start = datetime.now(UTC) + timedelta(days=7)
    interview = _assert_ok(
        await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews",
            headers=recruiter_headers,
            json={
                "title": "Entrevista Demo",
                "interview_type": "hr",
                "interview_format": "online",
                "scheduled_start": interview_start.isoformat(),
                "scheduled_end": (interview_start + timedelta(hours=1)).isoformat(),
                "timezone": "America/Sao_Paulo",
                "interviewer_name": "Gestor Demo",
                "interviewer_email": manager.email,
                "create_google_event": False,
                "create_google_meet": False,
            },
        ),
        status.HTTP_201_CREATED,
        "criar entrevista",
    )
    completed_interview = _assert_ok(
        await client.post(
            f"/api/v1/interviews/{interview['id']}/complete",
            headers=recruiter_headers,
            json={"internal_notes": "Entrevista realizada em ambiente controlado."},
        ),
        status.HTTP_200_OK,
        "marcar entrevista como realizada",
    )
    assert completed_interview["status"] == "awaiting_feedback"
    executed_steps.append("11-12. entrevista criada e marcada como awaiting_feedback")

    scorecard = _assert_ok(
        await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
            headers=recruiter_headers,
            json={
                "interview_id": interview["id"],
                "items": [
                    {
                        "competency_name": "Comunicação",
                        "question_text": "Como você priorizou demandas conflitantes?",
                        "display_order": 1,
                    }
                ],
            },
        ),
        status.HTTP_201_CREATED,
        "criar scorecard vinculado à entrevista",
    )
    db_scorecard = await db_session.get(InterviewScorecardModel, UUID(scorecard["id"]))
    assert db_scorecard is not None
    db_scorecard.evaluator_id = manager.id
    await db_session.commit()

    patched_scorecard = _assert_ok(
        await client.patch(
            f"/api/v1/interview-scorecards/{scorecard['id']}",
            headers=recruiter_headers,
            json={
                "final_recommendation": "yes",
                "overall_notes": "Scorecard humano favorável, sem ação automática de pipeline.",
                "items": [
                    {
                        "competency_name": "Comunicação",
                        "question_text": "Como você priorizou demandas conflitantes?",
                        "rating": 4,
                        "evidence": "Trouxe contexto, tradeoffs e responsáveis de forma verificável.",
                        "display_order": 1,
                    }
                ],
            },
        ),
        status.HTTP_200_OK,
        "preencher scorecard",
    )
    assert patched_scorecard["evaluator_id"] == str(manager.id)
    _assert_ok(
        await client.post(
            f"/api/v1/interview-scorecards/{scorecard['id']}/submit",
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "submeter scorecard",
    )
    assert (
        await _active_pipeline(db_session, candidate_id=candidate_id, job_id=job_id)
    ).pipeline_stage == initial_pipeline_stage
    assert await _score_count(db_session, candidate_id=candidate_id, job_id=job_id) == initial_score_count
    executed_steps.append("13. scorecard submetido sem mover pipeline nem alterar score/ranking")

    manager_feedback = _assert_ok(
        await client.post(
            f"/api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/feedback",
            headers=manager_headers,
            json={
                "message": "Recomendo seguir, mantendo decisão final com recrutamento/RH.",
                "recommendation": "advance",
            },
        ),
        status.HTTP_200_OK,
        "manager adicionar feedback",
    )
    assert manager_feedback["author_role"] == "manager"
    assert (
        await _active_pipeline(db_session, candidate_id=candidate_id, job_id=job_id)
    ).pipeline_stage == initial_pipeline_stage
    executed_steps.append("14. feedback do manager registrado sem mover pipeline")

    pre_hire = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        json={"notes": "Tentativa antes da decisão hire."},
        headers=recruiter_headers,
    )
    assert pre_hire.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    decision = _assert_ok(
        await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
            json={
                "decision_outcome": "hire",
                "reason_code": "strong_fit",
                "notes": "Decisão humana de contratação registrada para a demo.",
                "submit": True,
                "pipeline_action": {"enabled": False},
            },
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "registrar decisão hire",
    )
    assert decision["decision_outcome"] == "hire"
    assert decision["decided_by"] == str(recruiter.id)
    assert decision["decision_status"] == "submitted"
    assert decision["pipeline_transition_id"] is None
    assert (
        await _active_pipeline(db_session, candidate_id=candidate_id, job_id=job_id)
    ).pipeline_stage == initial_pipeline_stage
    executed_steps.append("15. decisão hire criada por ação humana sem pipeline automático")

    pre_admission = _assert_ok(
        await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
            json={
                "salary_offer": "11000.00",
                "start_date": "2026-06-01",
                "work_model": "CLT",
                "notes": "Pré-admissão fake para demo.",
            },
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "criar pré-admissão após hire",
    )
    case_id = pre_admission["id"]
    assert pre_admission["hiring_decision_id"] == decision["id"]
    executed_steps.append("16. pré-admissão criada somente após hire")

    checklist_item = _assert_ok(
        await client.post(
            f"/api/v1/pre-admission/{case_id}/checklist-items",
            json={"item_type": "rg", "title": "RG fake controlado", "required": True},
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "criar checklist documental",
    )
    blocked_package = await client.post(
        f"/api/v1/pre-admission/{case_id}/admission-package",
        headers=recruiter_headers,
    )
    assert blocked_package.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    executed_steps.append("17. checklist criado e pacote bloqueado enquanto documento não está aprovado/waived")

    document = _assert_ok(
        await client.post(
            f"/api/v1/candidate-portal/pre-admission/{case_id}/checklist-items/{checklist_item['id']}/documents",
            files={"document_file": ("rg-demo.pdf", io.BytesIO(PDF_BYTES), "application/pdf")},
        ),
        status.HTTP_201_CREATED,
        "candidato envia documento fake válido",
    )
    approved_document = _assert_ok(
        await client.post(
            f"/api/v1/pre-admission/documents/{document['id']}/approve",
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "RH/admin aprova documento",
    )
    assert approved_document["status"] == "approved"
    executed_steps.append("18-19. documento fake enviado pelo candidato e aprovado por usuário interno")

    ready_case = _assert_ok(
        await client.patch(
            f"/api/v1/pre-admission/{case_id}",
            json={"status": "ready_for_admission"},
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "marcar pré-admissão ready_for_admission",
    )
    assert ready_case["status"] == "ready_for_admission"
    executed_steps.append("20. pré-admissão marcada como ready_for_admission")

    package = _assert_ok(
        await client.post(
            f"/api/v1/pre-admission/{case_id}/admission-package",
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "gerar pacote admissional",
    )
    package_id = package["id"]
    assert package["status"] == "ready_for_review"
    assert package["payload"]["candidate"]["id"] == candidate_id
    approved_package = _assert_ok(
        await client.post(
            f"/api/v1/admission-packages/{package_id}/approve",
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "aprovar pacote admissional",
    )
    assert approved_package["status"] == "approved_for_export"
    executed_steps.append("21-22. pacote admissional gerado e aprovado")

    export_json = await client.get(
        f"/api/v1/admission-packages/{package_id}/export-json",
        headers=recruiter_headers,
    )
    assert export_json.status_code == status.HTTP_200_OK, export_json.text
    exported_payload = json.loads(export_json.text)
    assert exported_payload["candidate"]["id"] == candidate_id
    assert exported_payload["job"]["id"] == job_id
    assert exported_payload["decision"]["decision_outcome"] == "hire"

    export_csv = await client.get(
        f"/api/v1/admission-packages/{package_id}/export-csv",
        headers=recruiter_headers,
    )
    assert export_csv.status_code == status.HTTP_200_OK, export_csv.text
    assert export_csv.headers.get("content-type", "").startswith("text/csv")
    assert "CANDIDATO" in export_csv.text
    executed_steps.append("23. export JSON e CSV validados com dados fake controlados")

    monkeypatch.setattr(settings, "ERP_INTEGRATION_MODE", "dry_run")
    dry_run = _assert_ok(
        await client.post(
            f"/api/v1/admission-packages/{package_id}/erp/protheus/dry-run",
            headers=recruiter_headers,
        ),
        status.HTTP_201_CREATED,
        "executar ERP dry-run",
    )
    assert dry_run["provider"] == "protheus"
    assert dry_run["mode"] == "dry_run"
    assert dry_run["status"] in {"ready", "validation_failed"}
    assert dry_run["http_status"] is None
    assert dry_run["response_payload_json"] is None

    if dry_run["status"] == "ready":
        simulated = _assert_ok(
            await client.post(
                f"/api/v1/erp-integration-attempts/{dry_run['id']}/simulate",
                headers=recruiter_headers,
            ),
            status.HTTP_200_OK,
            "simular ERP dry-run",
        )
        assert simulated["status"] == "simulated"
        assert simulated["response_payload_json"]["message"].lower().find("nenhum dado foi enviado") >= 0
    executed_steps.append("24. ERP dry-run/simulação executado sem chamada externa real")

    candidate_decision = await client.get(f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary")
    assert candidate_decision.status_code == status.HTTP_401_UNAUTHORIZED
    candidate_scorecard = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        params={"interview_id": interview["id"]},
    )
    assert candidate_scorecard.status_code == status.HTTP_401_UNAUTHORIZED

    other_document_id = await _seed_other_candidate_document(
        db_session,
        job_id=job_id,
        actor_id=admin.id,
    )
    client.cookies.set("candidate_portal_token", candidate_portal_token)
    other_download = await client.get(f"/api/v1/candidate-portal/pre-admission/documents/{other_document_id}/download")
    assert other_download.status_code == status.HTTP_404_NOT_FOUND

    manager_documents = await client.get(
        f"/api/v1/pre-admission/{case_id}/documents",
        headers=manager_headers,
    )
    assert manager_documents.status_code == status.HTTP_403_FORBIDDEN
    manager_erp = await client.get(
        f"/api/v1/erp-integration-attempts/{dry_run['id']}",
        headers=manager_headers,
    )
    assert manager_erp.status_code == status.HTTP_403_FORBIDDEN
    viewer_decision = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
        headers=viewer_headers,
    )
    assert viewer_decision.status_code == status.HTTP_403_FORBIDDEN
    viewer_documents = await client.get(
        f"/api/v1/pre-admission/{case_id}/documents",
        headers=viewer_headers,
    )
    assert viewer_documents.status_code == status.HTTP_403_FORBIDDEN
    executed_steps.append("segurança. candidato/manager/viewer bloqueados nas rotas sensíveis")

    candidate_comms = _assert_ok(
        await client.get("/api/v1/candidate-portal/communications"),
        status.HTTP_200_OK,
        "listar comunicações do candidato",
    )
    recruiter_comms = _assert_ok(
        await client.get(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/communications",
            headers=recruiter_headers,
        ),
        status.HTTP_200_OK,
        "listar comunicações internas",
    )
    _assert_no_sensitive_terms(candidate_comms)
    _assert_no_sensitive_terms(recruiter_comms)
    executed_steps.append("segurança. comunicações não expõem score/ranking/parecer IA sensível")

    pre_admission_events = _assert_ok(
        await client.get(f"/api/v1/pre-admission/{case_id}/events", headers=recruiter_headers),
        status.HTTP_200_OK,
        "validar eventos de pré-admissão",
    )
    event_types = {event["event_type"] for event in pre_admission_events["events"]}
    assert {
        "case_created",
        "checklist_item_created",
        "document_uploaded",
        "document_approved",
        "status_changed",
        "erp_dry_run_attempt_created",
    }.issubset(event_types)

    assert application["status"] == "entered_pipeline"

    db_events = (
        await db_session.execute(
            sa.select(PreAdmissionEventModel).where(
                PreAdmissionEventModel.case_id == UUID(case_id),
            )
        )
    ).scalars().all()
    assert len(db_events) >= len(event_types)

    access_audit_count = int(
        await db_session.scalar(
            sa.select(sa.func.count(AuditLogModel.id)).where(AuditLogModel.action == "http.error")
        )
        or 0
    )
    assert access_audit_count >= 3
    executed_steps.append("25. eventos/auditoria principais validados")

    final_pipeline = await _active_pipeline(db_session, candidate_id=candidate_id, job_id=job_id)
    assert final_pipeline.pipeline_stage == initial_pipeline_stage
    assert final_pipeline.pipeline_status == "active"
    assert await _score_count(db_session, candidate_id=candidate_id, job_id=job_id) == initial_score_count

    print("\nRelatório Fase 20.1 - E2E Demo Full Flow")
    for step in executed_steps:
        print(f"- {step}")
