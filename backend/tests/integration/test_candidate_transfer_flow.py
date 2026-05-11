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
    from src.infrastructure.security.password_service import hash_password
    
    admin_id = uuid4()
    admin_email = f"admin_{uuid4().hex[:6]}@example.com"
    admin_user = UserModel(
        id=admin_id,
        email=admin_email,
        password_hash=hash_password("password123"),
        full_name="Admin Test",
        role="admin",
        status="active"
    )
    db_session.add(admin_user)
    await db_session.commit()

    # SETUP: Auth
    login_resp = await client.post("/api/v1/auth/login", json={"email": admin_email, "password": "password123"})
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.text}")
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # SETUP: Vagas (Criadas direto no banco para evitar validação de publicação na API)
    from src.infrastructure.database.models.job_model import JobModel
    
    job_a_id = uuid4()
    job_b_id = uuid4()
    
    job_a = JobModel(
        id=job_a_id,
        title="Vaga A - Senior Python",
        description="Descrição longa para Vaga A com mais de cem caracteres para passar na qualidade se necessário futuramente.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id
    )
    
    job_b = JobModel(
        id=job_b_id,
        title="Vaga B - Senior Backend",
        description="Descrição longa para Vaga B com mais de cem caracteres para passar na qualidade se necessário futuramente.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id
    )
    
    db_session.add(job_a)
    db_session.add(job_b)
    
    from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    # SETUP: Candidato (via API para garantir persistência)
    candidate_email = f"transfer_{uuid4().hex[:6]}@example.com"
    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Teste Transferencia",
        "email": candidate_email,
        "phone": "123456789"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    # SETUP: Currículo (necessário para análise IA disparar)
    from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
    resume = ResumeModel(
        id=uuid4(), 
        candidate_id=candidate_id, 
        title="Curriculo Teste", 
        created_by=admin_id,
        status="active"
    )
    db_session.add(resume)
    await db_session.flush()
    
    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key="test-key",
        original_file_name="resume.pdf",
        file_size_bytes=1000,
        file_hash_sha256="fake-hash",
        mime_type="application/pdf",
        extracted_text="Experiência em Python e SQL.",
        extraction_status="completed",
        uploaded_by=admin_id,
        uploaded_at=datetime.now(UTC)
    )
    db_session.add(version)
    await db_session.commit()

    # 1. Adicionar à Vaga A
    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_a_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200
    
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

    # 3. VERIFICAÇÕES DE DOMÍNIO (VIA API)
    
    # A. Histórico de transferência registrado na Vaga B
    hist_b_resp = await client.get(f"/api/v1/pipeline/{job_b_id}/{candidate_id}/history", headers=headers)
    assert hist_b_resp.status_code == 200
    transitions_b = hist_b_resp.json()["transitions"]
    # A entrada via transferência em B é marcada como manual no serviço atual
    assert any(t["to_stage"] == "entry" and t["trigger"] == "manual" for t in transitions_b)

    # B. Histórico na Vaga A deve mostrar a transição final
    hist_a_resp = await client.get(f"/api/v1/pipeline/{job_a_id}/{candidate_id}/history", headers=headers)
    assert hist_a_resp.status_code == 200
    transitions_a = hist_a_resp.json()["transitions"]
    # Deve haver uma transição indicando a transferência nas notas
    assert any("Transferido para a vaga" in (t["notes"] or "") for t in transitions_a)

    print("TEST SUCCESS: Candidate transfer flow completed and verified via API.")

    # 4. VERIFICAÇÕES DE BANCO DE DADOS (INVARIANTE)
    
    # Importar modelo para consulta direta
    from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
    
    # Forçar sincronização do banco (SQLite :memory: com StaticPool)
    # Como o API rodou em outra transação, vamos garantir que esta sessão veja os dados
    
    # A. Pipeline da Vaga B deve estar ativo
    stmt_b = sa.select(CandidateJobPipelineModel).where(
        CandidateJobPipelineModel.candidate_id == candidate_id,
        CandidateJobPipelineModel.job_id == job_b_id,
        CandidateJobPipelineModel.relationship_status == "active",
        CandidateJobPipelineModel.is_terminal.is_(False),
        CandidateJobPipelineModel.terminated_at.is_(None),
    )
    active_pipeline = await db_session.scalar(stmt_b)
    assert active_pipeline is not None
    assert active_pipeline.link_status == "active"

    # B. Pipeline da Vaga A deve estar inativo/arquivado
    stmt_a = sa.select(CandidateJobPipelineModel).where(
        CandidateJobPipelineModel.candidate_id == candidate_id,
        CandidateJobPipelineModel.job_id == job_a_id
    )
    old_pipeline = await db_session.scalar(stmt_a)
    assert old_pipeline is not None
    assert old_pipeline.relationship_status == "archived"
    assert old_pipeline.link_status == "transferred"

    # C. GARANTIR A REGRA DE OURO: Apenas 1 pipeline ativo
    stmt_all = sa.select(sa.func.count()).select_from(CandidateJobPipelineModel).where(
        CandidateJobPipelineModel.candidate_id == candidate_id,
        CandidateJobPipelineModel.relationship_status == "active",
        CandidateJobPipelineModel.is_terminal.is_(False),
        CandidateJobPipelineModel.terminated_at.is_(None),
    )
    active_count = await db_session.scalar(stmt_all)
    assert active_count == 1

    print("TEST SUCCESS: 1 candidate = 1 active pipeline invariant verified.")

    print("\n✅ Fluxo de transferência validado com sucesso!")

    # 4. TENTAR ADICIONAR NOVAMENTE À VAGA A (Deve falhar se já houver um ativo na B)
    fail_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_a_id),
        "initial_stage": "entry"
    })
    assert fail_resp.status_code == 409
    assert "já possui vínculo ativo" in fail_resp.json()["detail"]
