import pytest
from uuid import UUID, uuid4
from datetime import UTC, datetime
import sqlalchemy as sa
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_candidate_transfer_flow_complete(client: AsyncClient, db_session):
    """
    Testa o fluxo completo de transferência de candidato:
    1. Cria candidato e duas vagas.
    2. Adiciona candidato à Vaga A.
    3. Faz upload de currículo (necessário para análise IA).
    4. Transfere para Vaga B.
    5. Verifica invariantes e disparo de análise.
    """
    # SETUP: Create Admin User
    from src.infrastructure.database.models.user_model import UserModel
    from src.infrastructure.security.password_service import PasswordService
    
    admin_id = uuid4()
    admin_user = UserModel(
        id=admin_id,
        email="admin@example.com",
        password_hash=PasswordService.hash_password("password123"),
        full_name="Admin Test",
        role="admin",
        is_active=True
    )
    db_session.add(admin_user)
    await db_session.commit()

    # SETUP: Auth
    login_resp = await client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "password123"})
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.text}")
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # SETUP: Vagas
    job_a_id = uuid4()
    job_b_id = uuid4()
    
    # Criar Vaga A
    await client.post("/api/v1/jobs", headers=headers, json={
        "id": str(job_a_id),
        "title": "Vaga A",
        "description": "Descrição A",
        "status": "published"
    })
    
    # Criar Vaga B
    await client.post("/api/v1/jobs", headers=headers, json={
        "id": str(job_b_id),
        "title": "Vaga B",
        "description": "Descrição B",
        "status": "published"
    })

    # SETUP: Candidato
    candidate_id = uuid4()
    await client.post("/api/v1/candidates", headers=headers, json={
        "id": str(candidate_id),
        "full_name": "Candidato Teste Transferencia",
        "email": f"transfer_{uuid4().hex[:6]}@example.com"
    })

    # SETUP: Currículo (necessário para análise IA disparar)
    # Criamos um resume_version mockado diretamente no banco para simplificar
    from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
    resume = ResumeModel(id=uuid4(), candidate_id=candidate_id)
    db_session.add(resume)
    await db_session.flush()
    
    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        extracted_text="Experiência em Python e SQL.",
        extraction_status="completed"
    )
    db_session.add(version)
    await db_session.commit()

    # 1. Adicionar à Vaga A
    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_a_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200
    
    # Verifica que está ativo na Vaga A
    stats_a = await client.get("/api/v1/dashboard/stats", headers=headers)
    # Aqui poderíamos verificar as métricas, mas vamos focar no estado direto
    
    # 2. Transferir para Vaga B
    transfer_resp = await client.patch(f"/api/v1/pipeline/{candidate_id}/transfer-job", headers=headers, json={
        "from_job_id": str(job_a_id),
        "to_job_id": str(job_b_id),
        "reason": "Melhor fit com a Vaga B"
    })
    assert transfer_resp.status_code == 200
    data = transfer_resp.json()
    assert data["from_job_id"] == str(job_a_id)
    assert data["to_job_id"] == str(job_b_id)
    assert data["destination_status"] == "active"

    # 3. VERIFICAÇÕES DE DOMÍNIO
    
    from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel, CandidateJobPipelineEventModel
    
    # A. Apenas 1 pipeline ativo (o da Vaga B)
    active_pipelines = await db_session.scalars(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.relationship_status == "active"
        )
    )
    active_list = active_pipelines.all()
    assert len(active_list) == 1
    assert active_list[0].job_id == job_b_id

    # B. Pipeline da Vaga A está inativo/arquivado
    old_pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_a_id
        )
    )
    assert old_pipeline.relationship_status == "archived"
    assert old_pipeline.link_status == "transferred"
    assert old_pipeline.is_terminal is True
    assert old_pipeline.terminated_at is not None

    # C. Histórico registrado
    events = await db_session.scalars(
        sa.select(CandidateJobPipelineEventModel).where(
            CandidateJobPipelineEventModel.candidate_id == candidate_id
        ).order_by(CandidateJobPipelineEventModel.created_at.asc())
    )
    event_list = events.all()
    # Esperado: candidate_added (Vaga A), job_transferred_out (Vaga A), job_transferred_in (Vaga B)
    types = [e.event_type for e in event_list]
    assert "job_transferred_out" in types
    assert "job_transferred_in" in types

    # D. Nova análise IA criada para Vaga B
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    analysis_b = await db_session.scalar(
        sa.select(AnalysisModel).where(
            AnalysisModel.job_id == job_b_id,
            AnalysisModel.resume_version_id == version.id
        )
    )
    assert analysis_b is not None
    assert analysis_b.status == "pending"

    # 4. TENTAR ADICIONAR NOVAMENTE À VAGA A (Deve falhar se já houver um ativo na B)
    fail_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_a_id),
        "initial_stage": "entry"
    })
    assert fail_resp.status_code == 409
    assert "já possui vínculo ativo" in fail_resp.json()["detail"]
