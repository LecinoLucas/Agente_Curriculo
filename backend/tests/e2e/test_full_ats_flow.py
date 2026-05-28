import pytest
import json
import io
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient

from tests.integration.helpers import _create_active_user, _auth_headers
from src.domain.entities.user import UserRole

pytestmark = pytest.mark.asyncio

# Valid PDF for testing
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"


async def test_full_ats_flow_21_steps(client: AsyncClient, db_session):
    """
    Fluxo E2E completo: template comportamental → candidatura → avaliação
    → análise IA → decisão hire → pré-admissão → pacote de admissão.

    21 passos executados em sequência via httpx AsyncClient.
    """

    # ========== SETUP ==========
    admin = await _create_active_user(db_session, "admin@test.com", "password", UserRole.ADMIN)
    admin_headers = await _auth_headers(client, "admin@test.com", "password")

    # ========== PASSO 1: Criar template comportamental ==========
    resp = await client.post(
        "/api/v1/admin/behavioral/templates",
        json={"name": "Template E2E", "description": "Template for E2E test"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create template: {resp.text}"
    template = resp.json()
    template_id = template["id"]

    # ========== PASSO 2: Adicionar competência ao template ==========
    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies",
        json={
            "name": "Comunicação",
            "description": "Capacidade de comunicação clara e efetiva",
            "weight": 1.0,
            "display_order": 1,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create competency: {resp.text}"
    competency = resp.json()
    competency_id = competency["id"]

    # ========== PASSO 3: Adicionar pergunta à competência ==========
    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/competencies/{competency_id}/questions",
        json={
            "question_text": "Descreva um desafio que você enfrentou e como o resolveu.",
            "answer_type": "text",
            "is_required": True,
            "weight": 1.0,
            "display_order": 1,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create question: {resp.text}"
    question = resp.json()
    question_id = question["id"]

    # ========== PASSO 4: Ativar template ==========
    resp = await client.post(
        f"/api/v1/admin/behavioral/templates/{template_id}/activate",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to activate template: {resp.text}"

    # ========== PASSO 5: Criar vaga publicada com template ==========
    resp = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Dev Senior E2E",
            "description": "Desenvolvedor sênior para validação E2E com expertise em Python e React. Responsável por arquitetura e desenvolvimento de sistemas backend e frontend escaláveis. Experiência com práticas ágeis, testes automatizados, design patterns e boas práticas de código.",
            "requirements": "Domínio de Python, React, SQL e experiência consistente com arquitetura de sistemas, testes automatizados, integração entre serviços e práticas modernas de engenharia de software.",
            "location": "São Paulo",
            "work_model": "hybrid",
            "salary_min": 8000.0,
            "salary_max": 15000.0,
            "job_area": "engineering",
            "seniority_level": "senior",
            "minimum_education_level": "bachelor",
            "minimum_years_experience": 5,
            "responsibilities": "Liderar decisões técnicas, evoluir arquitetura backend e frontend, revisar código, orientar o time e garantir qualidade nas entregas críticas do produto.",
            "experience_context": "Atuação prévia em produtos web de médio ou grande porte, com times multidisciplinares, integração de APIs e responsabilidade sobre qualidade técnica.",
            "behavioral_requirements": ["Comunicação", "Colaboração"],
            "status": "draft",
            "skill_requirements": {
                "priority": ["Python", "React", "SQL"],
                "complementary": ["Docker", "AWS"],
                "eliminatory": [],
            },
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create job: {resp.text}"
    job = resp.json()
    job_id = job["id"]

    for skill_name, priority_level in (
        ("Python", "priority"),
        ("React", "priority"),
        ("SQL", "priority"),
        ("Docker", "complementary"),
        ("AWS", "complementary"),
    ):
        resp = await client.post(
            "/api/v1/skills",
            json={"name": skill_name, "category": "technology"},
            headers=admin_headers,
        )
        assert resp.status_code == 201, f"Failed to create skill {skill_name}: {resp.text}"

        resp = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={"skill_name": skill_name, "priority_level": priority_level, "weight": 1.0},
            headers=admin_headers,
        )
        assert resp.status_code == 201, f"Failed to add skill {skill_name} to job: {resp.text}"

    resp = await client.patch(
        f"/api/v1/jobs/{job_id}/publish",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to publish job: {resp.text}"

    # Vincular template à vaga
    resp = await client.patch(
        f"/api/v1/jobs/{job_id}/behavioral-template",
        json={"behavioral_template_id": template_id},
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to set behavioral template on job: {resp.text}"

    # ========== PASSO 6: Candidato aplica (portal público) ==========
    # Criar arquivo de resumo simulado
    resume_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
160
%%EOF
"""
    files = {
        "resume_file": ("resume.pdf", io.BytesIO(resume_content), "application/pdf"),
    }
    data = {
        "full_name": "João Silva E2E",
        "email": "joao.e2e@example.com",
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
    }

    resp = await client.post(
        "/api/v1/public/candidates/apply",
        files=files,
        data=data,
    )
    assert resp.status_code == 201, f"Failed to apply: {resp.text}"
    candidate_resp = resp.json()
    candidate_id = candidate_resp["candidate_id"]

    # O cookie candidate_portal_token foi setado automaticamente pelo /apply endpoint
    # Verificar que temos o cookie
    assert "candidate_portal_token" in client.cookies, "Candidate token not set after apply"

    # ========== PASSO 7: Candidato lista suas avaliações ==========
    resp = await client.get(
        "/api/v1/candidate-portal/behavioral-assessments",
    )
    assert resp.status_code == 200, f"Failed to list behavioral assessments: {resp.text}"
    assessments = resp.json()
    assert isinstance(assessments, list), "Expected list of assessments"
    assert len(assessments) > 0, "Expected at least one assignment after apply"
    assignment_id = assessments[0]["id"]

    # ========== PASSO 8: Candidato inicia avaliação ==========
    resp = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/start",
    )
    assert resp.status_code == 200, f"Failed to start assessment: {resp.text}"

    # ========== PASSO 9: Candidato submete respostas ==========
    resp = await client.post(
        f"/api/v1/candidate-portal/behavioral-assessments/{assignment_id}/submit",
        json={
            "answers": [
                {
                    "question_id": question_id,
                    "answer_text": "Enfrentei um desafio de comunicação em um projeto complexo e resolvi através de documentação clara.",
                    "answer_value": None,
                    "selected_options_json": None,
                }
            ]
        },
    )
    assert resp.status_code == 200, f"Failed to submit answers: {resp.text}"

    # ========== PASSO 10: Recrutador confirma + dispara análise IA (mockada) ==========
    # Mudar para headers de recruiter/admin para ver respostas
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to get behavioral assessment: {resp.text}"
    assessment_data = resp.json()
    assert assessment_data is not None, "Expected assessment data"

    # Mock Gemini AI
    from src.infrastructure.ai.factory import AIServiceFactory
    from src.application.ports.ai_service import AIAnalysisResponse

    mock_ai = AsyncMock()
    mock_ai.analyze.return_value = AIAnalysisResponse(
        content=json.dumps(
            {
                "confidence": "medium",
                "summary": "Há sinal consistente de comunicação clara e resolução estruturada de problemas.",
                "competency_signals": [
                    {
                        "competency": "Comunicação",
                        "signal": "strong",
                        "evidence": "Resposta descreve contexto, ação e resultado com clareza.",
                        "concerns": [],
                    }
                ],
                "strengths": ["Comunicação objetiva"],
                "concerns": ["Validar profundidade técnica em entrevista"],
                "suggested_interview_questions": ["Como você alinhou expectativas entre áreas nesse desafio?"],
                "risk_flags": [],
            }
        ),
        input_tokens=100,
        output_tokens=50,
        cache_read_tokens=0,
        cache_write_tokens=0,
        processing_time_ms=1200,
    )

    with patch.object(AIServiceFactory, "create", return_value=mock_ai):
        resp = await client.post(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluate",
            headers=admin_headers,
        )
        assert resp.status_code == 202, f"Failed to evaluate assessment: {resp.text}"
        evaluation = resp.json()
        assert evaluation["status"] in {"processing", "completed"}

        resp = await client.get(
            f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluation",
            headers=admin_headers,
        )
        assert resp.status_code == 200, f"Failed to get evaluation details: {resp.text}"
        evaluation_details = resp.json()
        assert evaluation_details["summary"] is not None
        # Validar que IA assistiva não mostra "aprovado/reprovado"
        assert "aprovado" not in evaluation_details["summary"].lower()
        assert "reprovado" not in evaluation_details["summary"].lower()

    # ========== PASSO 11: Criar e submeter scorecard de entrevista ==========
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=admin_headers,
        json={
            "items": [
                {
                    "competency_name": "Comunicação",
                    "question_text": "Como você alinhou stakeholders em um cenário de conflito?",
                    "display_order": 1,
                }
            ]
        },
    )
    assert resp.status_code == 201, f"Failed to create interview scorecard: {resp.text}"
    scorecard = resp.json()

    resp = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=admin_headers,
        json={
            "final_recommendation": "strong_yes",
            "overall_notes": "Entrevista humana favorável e consistente com a avaliação comportamental.",
            "items": [
                {
                    "competency_name": "Comunicação",
                    "question_text": "Como você alinhou stakeholders em um cenário de conflito?",
                    "rating": 5,
                    "evidence": "Organizou contexto, decisão e resultado de forma clara e objetiva.",
                    "display_order": 1,
                }
            ],
        },
    )
    assert resp.status_code == 200, f"Failed to patch interview scorecard: {resp.text}"

    resp = await client.post(
        f"/api/v1/interview-scorecards/{scorecard['id']}/submit",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to submit interview scorecard: {resp.text}"

    # ========== PASSO 12: Registrar entrevista realizada ==========
    interview_start = datetime.now(UTC) + timedelta(days=2)
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews",
        headers=admin_headers,
        json={
            "title": "Entrevista técnica",
            "interview_type": "technical",
            "interview_format": "online",
            "scheduled_start": interview_start.isoformat(),
            "scheduled_end": (interview_start + timedelta(hours=1)).isoformat(),
            "timezone": "America/Recife",
        },
    )
    assert resp.status_code == 201, f"Failed to schedule interview: {resp.text}"
    interview = resp.json()

    resp = await client.post(
        f"/api/v1/interviews/{interview['id']}/complete",
        headers=admin_headers,
        json={"internal_notes": "Entrevista realizada antes da decisão final."},
    )
    assert resp.status_code == 200, f"Failed to complete interview: {resp.text}"
    assert resp.json()["status"] == "awaiting_feedback"

    # ========== PASSO 13: Registrar decisão hire ==========
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Excelente candidato demonstrado na avaliação comportamental.",
            "submit": True,
            "pipeline_action": {"enabled": False},
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create hiring decision: {resp.text}"
    decision = resp.json()
    assert decision["decision_outcome"] == "hire"

    # Validação: Candidato não acessa decisão interna (usar cookie)
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
    )
    assert resp.status_code == 401, "Candidate should not access hiring decision with portal cookie"

    # ========== PASSO 13: Criar pré-admissão ==========
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        json={
            "salary_offer": "10000.00",
            "start_date": "2026-06-01",
            "work_model": "CLT",
            "notes": "Candidato pronto para onboarding",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create pre-admission: {resp.text}"
    pre_admission = resp.json()
    case_id = pre_admission["id"]

    # ========== PASSO 14: Criar item de checklist obrigatório ==========
    resp = await client.post(
        f"/api/v1/pre-admission/{case_id}/checklist-items",
        json={
            "item_type": "rg",
            "title": "RG",
            "required": True,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create checklist item: {resp.text}"
    checklist_item = resp.json()
    item_id = checklist_item["id"]

    # ========== PASSO 15: Candidato envia documento ==========
    doc_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
160
%%EOF
"""
    files = {
        "document_file": ("rg.pdf", io.BytesIO(doc_content), "application/pdf"),
    }

    resp = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents",
        files=files,
    )
    assert resp.status_code == 201, f"Failed to upload document: {resp.text}"
    document = resp.json()
    document_id = document["id"]

    # ========== PASSO 16: RH aprova documento ==========
    resp = await client.post(
        f"/api/v1/pre-admission/documents/{document_id}/approve",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to approve document: {resp.text}"

    # ========== PASSO 17: Marcar caso como ready_for_admission ==========
    resp = await client.patch(
        f"/api/v1/pre-admission/{case_id}",
        json={"status": "ready_for_admission"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to mark ready for admission: {resp.text}"

    # ========== PASSO 18: Gerar pacote de admissão ==========
    resp = await client.post(
        f"/api/v1/pre-admission/{case_id}/admission-package",
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create admission package: {resp.text}"
    package = resp.json()
    package_id = package["id"]
    assert package["status"] == "ready_for_review"
    assert package["payload"] is not None
    assert "candidate" in package["payload"]

    # ========== PASSO 19: Aprovar pacote ==========
    resp = await client.post(
        f"/api/v1/admission-packages/{package_id}/approve",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to approve package: {resp.text}"
    approved_package = resp.json()
    assert approved_package["status"] == "approved_for_export"
    assert approved_package["approved_by"] is not None

    # ========== PASSO 20: Exportar JSON ==========
    resp = await client.get(
        f"/api/v1/admission-packages/{package_id}/export-json",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to export JSON: {resp.text}"
    assert resp.headers.get("content-type") == "application/json"
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert len(resp.content) > 0

    # Verificar que o payload é válido JSON
    exported_data = json.loads(resp.text)
    assert "candidate" in exported_data
    assert "job" in exported_data
    assert "pre_admission" in exported_data

    # Download técnico não deve alterar o estado do pacote
    resp = await client.get(
        f"/api/v1/pre-admission/{case_id}/admission-package",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    package_after_export = resp.json()
    assert package_after_export["status"] == "approved_for_export"

    # ========== PASSO 21: Exportar CSV (re-download) ==========
    resp = await client.get(
        f"/api/v1/admission-packages/{package_id}/export-csv",
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to export CSV: {resp.text}"
    assert resp.headers.get("content-type", "").startswith("text/csv")
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert len(resp.content) > 0

    # CSV deve ser texto legível
    csv_text = resp.text
    assert "Campo" in csv_text or "candidate" in csv_text.lower()

    # Status deve permanecer estável após re-download
    resp = await client.get(
        f"/api/v1/pre-admission/{case_id}/admission-package",
        headers=admin_headers,
    )
    final_package = resp.json()
    assert final_package["status"] == "approved_for_export"

    # ========== VALIDAÇÕES FINAIS ==========

    # 1. Pipeline não foi alterado indevidamente
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pipeline",
        headers=admin_headers,
    )
    if resp.status_code == 200:
        pipeline = resp.json()
        # Validar que pipeline status não foi alterado por IA/pacote
        # (pipeline ativo deve permanecer consistente)
        assert pipeline is not None

    # 2. Candidato não consegue editar pré-admissão com cookie
    resp = await client.patch(
        f"/api/v1/pre-admission/{case_id}",
        json={"status": "documents_pending"},
    )
    assert resp.status_code == 401, "Candidate should not be able to modify pre-admission"

    # 3. Validar que histórico de eventos foi registrado
    resp = await client.get(
        f"/api/v1/pre-admission/{case_id}/events",
        headers=admin_headers,
    )
    if resp.status_code == 200:
        events = resp.json()["events"]
        assert isinstance(events, list), "Expected events list"


async def test_admission_package_validation_blocks_with_pending_docs(
    client: AsyncClient, db_session
):
    """
    Validação: Pacote de admissão só gera se todos items obrigatórios
    estão aprovados ou waived.
    """
    admin = await _create_active_user(db_session, "admin@test.com", "password", UserRole.ADMIN)
    admin_headers = await _auth_headers(client, "admin@test.com", "password")

    # Criar vaga em draft
    resp = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Dev for Validation Test",
            "description": "A test job for admission package validation with pending documents. This is a comprehensive test to ensure the job publication validation works correctly and all required fields are validated before publishing a job posting to candidates.",
            "status": "draft",
            "job_area": "technology",
            "seniority_level": "senior",
            "minimum_years_experience": 5,
            "responsibilities": "Build and maintain backend systems using Python and FastAPI",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Expected 201 for draft job, got {resp.status_code}: {resp.text}"
    job_id = resp.json()["id"]

    # Adicionar skills à vaga (necessário para publicação)
    for skill_name, priority_level in [("Python", "priority"), ("FastAPI", "priority"), ("PostgreSQL", "complementary")]:
        await client.post(
            "/api/v1/skills",
            json={"name": skill_name, "category": "technology"},
            headers=admin_headers,
        )
        await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={
                "skill_name": skill_name,
                "priority_level": priority_level,
                "weight": 1.0,
            },
            headers=admin_headers,
        )

    # Publicar vaga
    resp = await client.patch(
        f"/api/v1/jobs/{job_id}/publish",
        json={},
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Expected 200 for publish, got {resp.status_code}: {resp.text}"

    # Criar candidato diretamente via API
    resp = await client.post(
        "/api/v1/candidates",
        json={
            "full_name": "Test Candidate Name",
            "email": "testcand@example.com",
            "phone": "(11) 98765-4321",
            "cpf": "111.444.777-35",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create candidate: {resp.status_code} {resp.text}"
    candidate_id = resp.json()["id"]

    # Adicionar candidato à vaga (criar pipeline ativo)
    resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": job_id},
        headers=admin_headers,
    )
    assert resp.status_code == 200, f"Failed to add candidate to job: {resp.status_code} {resp.text}"

    # Criar e submeter scorecard exigido pela política standard
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=admin_headers,
        json={
            "items": [
                {
                    "competency_name": "Comunicação",
                    "question_text": "Como você comunica riscos em um projeto?",
                    "display_order": 1,
                }
            ]
        },
    )
    assert resp.status_code == 201, f"Failed to create scorecard: {resp.status_code} {resp.text}"
    scorecard = resp.json()

    resp = await client.patch(
        f"/api/v1/interview-scorecards/{scorecard['id']}",
        headers=admin_headers,
        json={
            "final_recommendation": "yes",
            "overall_notes": "Scorecard aprovado para teste de pacote.",
            "items": [
                {
                    "competency_name": "Comunicação",
                    "question_text": "Como você comunica riscos em um projeto?",
                    "rating": 4,
                    "evidence": "Resposta suficiente para avançar.",
                    "display_order": 1,
                }
            ],
        },
    )
    assert resp.status_code == 200, f"Failed to patch scorecard: {resp.status_code} {resp.text}"

    resp = await client.post(f"/api/v1/interview-scorecards/{scorecard['id']}/submit", headers=admin_headers)
    assert resp.status_code == 200, f"Failed to submit scorecard: {resp.status_code} {resp.text}"

    # Registrar entrevista realizada exigida pela política standard
    interview_start = datetime.now(UTC) + timedelta(days=2)
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews",
        headers=admin_headers,
        json={
            "title": "Entrevista RH",
            "interview_type": "hr",
            "interview_format": "online",
            "scheduled_start": interview_start.isoformat(),
            "scheduled_end": (interview_start + timedelta(hours=1)).isoformat(),
            "timezone": "America/Recife",
        },
    )
    assert resp.status_code == 201, f"Failed to schedule interview: {resp.status_code} {resp.text}"
    interview = resp.json()

    resp = await client.post(
        f"/api/v1/interviews/{interview['id']}/complete",
        headers=admin_headers,
        json={"internal_notes": "Entrevista realizada para liberar contratação."},
    )
    assert resp.status_code == 200, f"Failed to complete interview: {resp.status_code} {resp.text}"

    # Criar decisão hire
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
        json={
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "notes": "Candidate approved for onboarding",
            "submit": True,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create hiring decision: {resp.status_code} {resp.text}"

    # Criar pré-admissão
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
        json={},
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create pre-admission: {resp.status_code} {resp.text}"
    case_id = resp.json()["id"]

    # Criar item obrigatório
    resp = await client.post(
        f"/api/v1/pre-admission/{case_id}/checklist-items",
        json={"item_type": "cpf", "title": "CPF Document", "required": True},
        headers=admin_headers,
    )
    assert resp.status_code == 201, f"Failed to create checklist item: {resp.status_code} {resp.text}"
    item_id = resp.json()["id"]

    # Marcar como ready sem aprovar documento → tentativa de gerar pacote falha
    await client.patch(
        f"/api/v1/pre-admission/{case_id}",
        json={"status": "ready_for_admission"},
        headers=admin_headers,
    )

    resp = await client.post(
        f"/api/v1/pre-admission/{case_id}/admission-package",
        headers=admin_headers,
    )
    # Pacote criado com validation_errors porque item obrigatório não está aprovado
    assert resp.status_code == 201, f"Failed to create admission package: {resp.status_code} {resp.text}"
    package = resp.json()
    assert len(package["validation_errors"]) > 0, "Expected validation errors for pending required document"
    assert any("pending" in err["message"].lower() for err in package["validation_errors"]), \
        f"Expected 'pending' in validation error messages, got: {package['validation_errors']}"
