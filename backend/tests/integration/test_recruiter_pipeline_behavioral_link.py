import pytest
from uuid import UUID, uuid4
from datetime import UTC, datetime
import sqlalchemy as sa
from httpx import AsyncClient

from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
)
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAssignmentModel,
)

async def _setup_admin_auth(client: AsyncClient, db_session) -> dict[str, str]:
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

    login_resp = await client.post("/api/v1/auth/login", json={"email": admin_email, "password": "password123"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "admin_id": str(admin_id)}

async def _create_active_behavioral_template(db_session, admin_id: UUID) -> BehavioralAssessmentTemplateModel:
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Template Comportamental {uuid4().hex[:6]}",
        description="Template para testes de vinculo manual",
        status="active",
        created_by=admin_id,
    )
    db_session.add(template)
    await db_session.flush()

    competency = BehavioralTemplateCompetencyModel(
        id=uuid4(),
        template_id=template.id,
        name="Comunicação",
        display_order=1,
    )
    db_session.add(competency)
    await db_session.commit()
    return template

@pytest.mark.asyncio
async def test_manual_add_candidate_to_job_with_behavioral_template(client: AsyncClient, db_session):
    """
    Testa que ao adicionar manualmente um candidato a uma vaga que possui
    template comportamental ativo configurado, o vinculo (assignment) é criado.
    """
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    # 1. Criar template comportamental ativo
    template = await _create_active_behavioral_template(db_session, admin_id)

    # 2. Criar vaga publicada vinculada ao template
    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Manual com Template",
        description="Descrição longa para a vaga manual com template para passar na qualidade.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
        behavioral_template_id=template.id,
    )
    db_session.add(job)

    # Criar versão de scoring ativa necessária
    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    # 3. Criar Candidato
    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Manual Test",
        "email": f"manual_{uuid4().hex[:6]}@example.com",
        "phone": "999999999"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    # 4. Adicionar manualmente o candidato à vaga via pipeline API
    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200

    # 5. Verificar que o assignment comportamental foi criado automaticamente no banco
    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assignment = await db_session.scalar(stmt)
    assert assignment is not None
    assert assignment.template_id == template.id
    assert assignment.status == "pending"

@pytest.mark.asyncio
async def test_manual_transfer_candidate_to_job_with_behavioral_template(client: AsyncClient, db_session):
    """
    Testa que ao transferir manualmente um candidato para outra vaga que possui
    template comportamental ativo configurado, o vinculo (assignment) é criado.
    """
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    template = await _create_active_behavioral_template(db_session, admin_id)

    # Criar Vaga A (sem template) e Vaga B (com template)
    job_a_id = uuid4()
    job_a = JobModel(
        id=job_a_id,
        title="Vaga A - Sem Template",
        description="Descrição longa para a vaga A para passar nas validações necessárias de qualidade.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
    )
    job_b_id = uuid4()
    job_b = JobModel(
        id=job_b_id,
        title="Vaga B - Com Template",
        description="Descrição longa para a vaga B para passar nas validações de qualidade necessárias.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
        behavioral_template_id=template.id,
    )
    db_session.add(job_a)
    db_session.add(job_b)

    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    # Criar Candidato
    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Transfer Test",
        "email": f"transfer_{uuid4().hex[:6]}@example.com",
        "phone": "999999999"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    # Adicionar à Vaga A
    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_a_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200

    # Verificar que nenhum assignment foi criado para a Vaga A (não tem template)
    stmt_a = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_a_id,
    )
    assert (await db_session.scalar(stmt_a)) is None

    # Transferir para a Vaga B
    transfer_resp = await client.patch(f"/api/v1/pipeline/{candidate_id}/transfer-job", headers=headers, json={
        "from_job_id": str(job_a_id),
        "to_job_id": str(job_b_id),
        "reason": "Transferência para vaga com avaliação comportamental"
    })
    assert transfer_resp.status_code == 200

    # Verificar que o assignment foi criado automaticamente para a Vaga B
    stmt_b = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_b_id,
    )
    assignment = await db_session.scalar(stmt_b)
    assert assignment is not None
    assert assignment.template_id == template.id
    assert assignment.status == "pending"

@pytest.mark.asyncio
async def test_link_template_creates_assignment_for_active_candidate(client: AsyncClient, db_session):
    """
    Candidato ativo (não terminal) deve receber assignment
    retroativo ao vincular template à vaga.
    """
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Retroativa Early",
        description="Descrição longa para vaga retroativa early para validações de qualidade.",
        status="published",
        job_area="Engineering",
        seniority_level="junior",
        minimum_years_experience=1,
        created_by=admin_id,
    )
    db_session.add(job)
    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Early Stage",
        "email": f"early_{uuid4().hex[:6]}@example.com",
        "phone": "999999999"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200

    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assert (await db_session.scalar(stmt)) is None

    template = await _create_active_behavioral_template(db_session, admin_id)
    link_resp = await client.patch(
        f"/api/v1/jobs/{job_id}/behavioral-template",
        headers=headers,
        json={"behavioral_template_id": str(template.id)},
    )
    assert link_resp.status_code == 200

    assignment = await db_session.scalar(stmt)
    assert assignment is not None
    assert assignment.template_id == template.id
    assert assignment.status == "pending"


@pytest.mark.asyncio
async def test_link_template_creates_assignment_for_interview_stage_candidate(client: AsyncClient, db_session):
    """
    Candidato em etapa avançada, mas ainda ativa (ex.: hr_interview), deve receber assignment
    retroativo ao vincular template à vaga.
    """
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Retroativa Advanced",
        description="Descrição longa para vaga retroativa advanced para validações de qualidade.",
        status="published",
        job_area="Engineering",
        seniority_level="junior",
        minimum_years_experience=1,
        created_by=admin_id,
    )
    db_session.add(job)
    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Advanced Stage",
        "email": f"advanced_{uuid4().hex[:6]}@example.com",
        "phone": "999999999"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200

    # Avançar o candidato para etapa avançada diretamente no banco
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(pipeline_stage="hr_interview")
    )
    await db_session.commit()

    template = await _create_active_behavioral_template(db_session, admin_id)
    link_resp = await client.patch(
        f"/api/v1/jobs/{job_id}/behavioral-template",
        headers=headers,
        json={"behavioral_template_id": str(template.id)},
    )
    assert link_resp.status_code == 200

    # Candidato avançado ativo deve receber assignment
    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assignment = await db_session.scalar(stmt)
    assert assignment is not None
    assert assignment.template_id == template.id
    assert assignment.status == "pending"


@pytest.mark.asyncio
async def test_link_template_skips_assignment_for_terminal_candidate(client: AsyncClient, db_session):
    """
    Candidato terminal (relationship_status != active / is_terminal=true) não deve receber assignment retroativo.
    """
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Retroativa Terminal",
        description="Descrição longa para vaga retroativa terminal para validações de qualidade.",
        status="published",
        job_area="Engineering",
        seniority_level="junior",
        minimum_years_experience=1,
        created_by=admin_id,
    )
    db_session.add(job)
    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Terminal Stage",
        "email": f"terminal_{uuid4().hex[:6]}@example.com",
        "phone": "999999999"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200

    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
        .values(
            relationship_status="rejected",
            pipeline_status="terminal",
            is_terminal=True,
            terminated_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    template = await _create_active_behavioral_template(db_session, admin_id)
    link_resp = await client.patch(
        f"/api/v1/jobs/{job_id}/behavioral-template",
        headers=headers,
        json={"behavioral_template_id": str(template.id)},
    )
    assert link_resp.status_code == 200

    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assert (await db_session.scalar(stmt)) is None


@pytest.mark.asyncio
async def test_manual_reconsider_candidate_with_behavioral_template(client: AsyncClient, db_session):
    """
    Testa que ao reconsiderar manualmente um candidato reprovado/removido de uma vaga
    que possui template comportamental ativo configurado, o vinculo (assignment) é criado.
    """
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    template = await _create_active_behavioral_template(db_session, admin_id)

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Reconsiderada com Template",
        description="Descrição longa para a vaga reconsiderada com template para fins de qualidade.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
        behavioral_template_id=template.id,
    )
    db_session.add(job)

    scoring_version = ScoreModelVersionModel(
        id=uuid4(),
        version=f"v_{uuid4().hex[:6]}",
        weights={"experience": 0.3, "skills": 0.7},
        thresholds={"high": 80, "low": 40},
        is_active=True
    )
    db_session.add(scoring_version)
    await db_session.commit()

    # Criar Candidato
    cand_resp = await client.post("/api/v1/candidates", headers=headers, json={
        "full_name": "Candidato Reconsiderado Test",
        "email": f"reconsider_{uuid4().hex[:6]}@example.com",
        "phone": "999999999"
    })
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    # Adicionar à Vaga
    add_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/add-to-job", headers=headers, json={
        "job_id": str(job_id),
        "initial_stage": "entry"
    })
    assert add_resp.status_code == 200

    # Rejeitar o candidato (colocar em status terminal/reprovado para permitir reconsideração)
    remove_resp = await client.patch(f"/api/v1/pipeline/{job_id}/{candidate_id}/stage", headers=headers, json={
        "stage": "rejected",
        "notes": "Desistência",
        "reason": "Desistência"
    })
    assert remove_resp.status_code == 200

    # Deletar o assignment existente para simular um cenário onde o candidato não possui assignment ativo
    # ou testar que a reconsideração garante a existência do vinculo perfeitamente.
    await db_session.execute(sa.delete(BehavioralAssessmentAssignmentModel))
    await db_session.commit()

    # Reconsiderar candidato
    reconsider_resp = await client.post(f"/api/v1/pipeline/{candidate_id}/reconsider-job", headers=headers, json={
        "job_id": str(job_id),
        "initial_stage": "entry",
        "reason": "Reabertura de processo seletivo"
    })
    assert reconsider_resp.status_code == 200

    # Verificar que o assignment foi recriado/garantido com sucesso
    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assignment = await db_session.scalar(stmt)
    assert assignment is not None
    assert assignment.template_id == template.id
    assert assignment.status == "pending"


@pytest.mark.asyncio
async def test_manual_add_does_not_create_assignment_when_behavioral_not_required(client: AsyncClient, db_session):
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])
    template = await _create_active_behavioral_template(db_session, admin_id)

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Manual Sem Obrigatoriedade",
        description="Descrição longa para vaga sem obrigatoriedade de comportamental.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
        behavioral_template_id=template.id,
        requires_behavioral_assessment=False,
    )
    db_session.add(job)
    db_session.add(
        ScoreModelVersionModel(
            id=uuid4(),
            version=f"v_{uuid4().hex[:6]}",
            weights={"experience": 0.3, "skills": 0.7},
            thresholds={"high": 80, "low": 40},
            is_active=True,
        )
    )
    await db_session.commit()

    cand_resp = await client.post(
        "/api/v1/candidates",
        headers=headers,
        json={"full_name": "Candidato No Required", "email": f"norequired_{uuid4().hex[:6]}@example.com", "phone": "999999999"},
    )
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        headers=headers,
        json={"job_id": str(job_id), "initial_stage": "entry"},
    )
    assert add_resp.status_code == 200

    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assert (await db_session.scalar(stmt)) is None


@pytest.mark.asyncio
async def test_transfer_does_not_create_assignment_when_destination_behavioral_not_required(client: AsyncClient, db_session):
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])
    template = await _create_active_behavioral_template(db_session, admin_id)

    job_a_id = uuid4()
    job_a = JobModel(
        id=job_a_id,
        title="Vaga Origem",
        description="Descrição longa para vaga de origem.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
    )
    job_b_id = uuid4()
    job_b = JobModel(
        id=job_b_id,
        title="Vaga Destino Sem Obrigatoriedade",
        description="Descrição longa para vaga de destino sem obrigatoriedade comportamental.",
        status="published",
        job_area="Engineering",
        seniority_level="senior",
        minimum_years_experience=5,
        created_by=admin_id,
        behavioral_template_id=template.id,
        requires_behavioral_assessment=False,
    )
    db_session.add_all([job_a, job_b])
    db_session.add(
        ScoreModelVersionModel(
            id=uuid4(),
            version=f"v_{uuid4().hex[:6]}",
            weights={"experience": 0.3, "skills": 0.7},
            thresholds={"high": 80, "low": 40},
            is_active=True,
        )
    )
    await db_session.commit()

    cand_resp = await client.post(
        "/api/v1/candidates",
        headers=headers,
        json={"full_name": "Candidato Transfer Sem Required", "email": f"transfer_no_required_{uuid4().hex[:6]}@example.com", "phone": "999999999"},
    )
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        headers=headers,
        json={"job_id": str(job_a_id), "initial_stage": "entry"},
    )
    assert add_resp.status_code == 200

    transfer_resp = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        headers=headers,
        json={
            "from_job_id": str(job_a_id),
            "to_job_id": str(job_b_id),
            "reason": "Transferência para vaga sem obrigatoriedade comportamental",
        },
    )
    assert transfer_resp.status_code == 200

    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_b_id,
    )
    assert (await db_session.scalar(stmt)) is None


@pytest.mark.asyncio
async def test_link_template_retroactive_does_not_duplicate_existing_assignment(client: AsyncClient, db_session):
    from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
    from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
        SQLAlchemyBehavioralAssignmentRepository,
    )

    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])
    template = await _create_active_behavioral_template(db_session, admin_id)

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Retroativa Idempotente",
        description="Descrição longa para vaga de retroativo idempotente.",
        status="published",
        job_area="Engineering",
        seniority_level="junior",
        minimum_years_experience=1,
        created_by=admin_id,
    )
    db_session.add(job)
    db_session.add(
        ScoreModelVersionModel(
            id=uuid4(),
            version=f"v_{uuid4().hex[:6]}",
            weights={"experience": 0.3, "skills": 0.7},
            thresholds={"high": 80, "low": 40},
            is_active=True,
        )
    )
    await db_session.commit()

    cand_resp = await client.post(
        "/api/v1/candidates",
        headers=headers,
        json={"full_name": "Candidato Retroativo Idempotente", "email": f"retro_idem_{uuid4().hex[:6]}@example.com", "phone": "999999999"},
    )
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        headers=headers,
        json={"job_id": str(job_id), "initial_stage": "entry"},
    )
    assert add_resp.status_code == 200

    assignment_service = BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db_session))
    preexisting = await assignment_service.ensure_assignment_for_application(
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template.id,
    )
    assert preexisting is not None
    await db_session.commit()

    link_resp = await client.patch(
        f"/api/v1/jobs/{job_id}/behavioral-template",
        headers=headers,
        json={"behavioral_template_id": str(template.id)},
    )
    assert link_resp.status_code == 200

    rows = (
        await db_session.execute(
            sa.select(BehavioralAssessmentAssignmentModel).where(
                BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                BehavioralAssessmentAssignmentModel.job_id == job_id,
                BehavioralAssessmentAssignmentModel.template_id == template.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_link_template_retroactive_skips_when_behavioral_not_required(client: AsyncClient, db_session):
    auth_data = await _setup_admin_auth(client, db_session)
    headers = {"Authorization": auth_data["Authorization"]}
    admin_id = UUID(auth_data["admin_id"])

    job_id = uuid4()
    job = JobModel(
        id=job_id,
        title="Vaga Retroativa Sem Obrigatoriedade",
        description="Descrição longa para vaga de retroativo sem obrigatoriedade.",
        status="published",
        job_area="Engineering",
        seniority_level="junior",
        minimum_years_experience=1,
        created_by=admin_id,
        requires_behavioral_assessment=False,
    )
    db_session.add(job)
    db_session.add(
        ScoreModelVersionModel(
            id=uuid4(),
            version=f"v_{uuid4().hex[:6]}",
            weights={"experience": 0.3, "skills": 0.7},
            thresholds={"high": 80, "low": 40},
            is_active=True,
        )
    )
    await db_session.commit()

    cand_resp = await client.post(
        "/api/v1/candidates",
        headers=headers,
        json={"full_name": "Candidato Retroativo Sem Required", "email": f"retro_no_required_{uuid4().hex[:6]}@example.com", "phone": "999999999"},
    )
    assert cand_resp.status_code == 201
    candidate_id = UUID(cand_resp.json()["id"])

    add_resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        headers=headers,
        json={"job_id": str(job_id), "initial_stage": "entry"},
    )
    assert add_resp.status_code == 200

    template = await _create_active_behavioral_template(db_session, admin_id)
    link_resp = await client.patch(
        f"/api/v1/jobs/{job_id}/behavioral-template",
        headers=headers,
        json={"behavioral_template_id": str(template.id)},
    )
    assert link_resp.status_code == 200

    stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
        BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        BehavioralAssessmentAssignmentModel.job_id == job_id,
    )
    assert (await db_session.scalar(stmt)) is None
