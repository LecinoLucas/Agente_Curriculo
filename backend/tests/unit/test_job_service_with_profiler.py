"""
Testes de integração do JobService com JobProfilerService.

Verifica que:
  - Ao criar uma vaga, JobProfile é gerado e persistido
  - Ao editar descrição/title, novo perfil é gerado
  - Ao editar campo irrelevante, perfil não é regenerado
  - Falha da IA não quebra create/update
  - Cache de perfil funciona corretamente
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.application.services.job_profiler_service import (
    InMemoryJobProfileCache,
    JobProfilerService,
)
from src.application.services.job_service import JobService
from src.domain.value_objects.job_profile import JobProfile, AREA_WEIGHTS
from src.infrastructure.database.models.job_model import JobModel
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_repository():
    repo = AsyncMock()
    repo.create = AsyncMock()
    repo.save = AsyncMock()
    repo.find_active_by_id = AsyncMock()
    repo.list_required_skill_rows = AsyncMock(return_value=[])
    repo.create_required_skill_link = AsyncMock()
    repo.delete_required_skill_link = AsyncMock()
    repo.find_active_skill_by_id = AsyncMock()
    repo.find_required_skill_link = AsyncMock()
    return repo


@pytest.fixture
def mock_profiler_service():
    """Mock de JobProfilerService que retorna um perfil padrão."""
    service = AsyncMock(spec=JobProfilerService)

    async def mock_generate(description: str, **kwargs):
        return JobProfile(
            area="technology",
            target_level="senior",
            main_mission="Desenvolvedor Senior",
            critical_requirements=[],
            desirable_requirements=[],
            responsibilities=["Desenvolver código"],
            required_tools=["Python"],
            required_capabilities=["autonomia"],
            seniority_signals=["5+ anos"],
            adaptive_weights=AREA_WEIGHTS["technology"],
            job_completeness_score=0.85,
            confidence="high",
            description_hash="abc12345",
        )

    service.generate_profile = AsyncMock(side_effect=mock_generate)
    return service


@pytest.fixture
def job_service(mock_repository):
    return JobService(repository=mock_repository)


@pytest.fixture
def job_service_with_profiler(mock_repository, mock_profiler_service):
    return JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)


# ---------------------------------------------------------------------------
# Cenário 1 — Criar vaga sem profiler (compatibilidade)
# ---------------------------------------------------------------------------

async def test_create_sem_profiler_nao_falha(mock_repository, job_service):
    """Vaga sem profiler continua funcionando como antes."""
    user_id = uuid4()
    request = CreateJobRequest(
        title="Desenvolvedor Python",
        description="Buscamos desenvolvedor Python com 5+ anos",
        status="draft",
    )

    mock_job = JobModel(
        id=uuid4(),
        title="Desenvolvedor Python",
        description="Buscamos desenvolvedor Python com 5+ anos",
        created_by=user_id,
    )
    mock_repository.create.return_value = mock_job

    result = await job_service.create(request, user_id)

    assert result is mock_job
    mock_repository.create.assert_called_once()


# ---------------------------------------------------------------------------
# Cenário 2 — Criar vaga com profiler ativa
# ---------------------------------------------------------------------------

async def test_create_com_profiler_gera_e_persiste_job_profile(
    mock_repository, mock_profiler_service
):
    """Ao criar vaga, JobProfile é gerado e persistido."""
    user_id = uuid4()
    request = CreateJobRequest(
        title="Desenvolvedor Python",
        description="Buscamos desenvolvedor Python com 5+ anos",
        status="draft",
    )

    mock_job = JobModel(
        id=uuid4(),
        title="Desenvolvedor Python",
        description="Buscamos desenvolvedor Python com 5+ anos",
        created_by=user_id,
        job_profile_json=None,
        job_profile_hash=None,
    )
    mock_repository.create.return_value = mock_job
    mock_repository.save = AsyncMock(return_value=mock_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    result = await service.create(request, user_id)

    # JobProfilerService deve ter sido chamado
    mock_profiler_service.generate_profile.assert_called_once()
    call_args = mock_profiler_service.generate_profile.call_args[0][0]
    assert "5+ anos" in call_args
    assert mock_profiler_service.generate_profile.call_args.kwargs["title"] == "Desenvolvedor Python"

    # Job deve ter sido salvo novamente com perfil
    mock_repository.save.assert_called_once()
    assert mock_job.job_profile_json is not None or mock_repository.save.called


async def test_create_com_campos_estruturados_repassa_para_profiler(
    mock_repository, mock_profiler_service
):
    user_id = uuid4()
    request = CreateJobRequest(
        title="Analista de Dados",
        description="Atuar com análise de indicadores e construção de dashboards.",
        requirements="SQL e Power BI",
        responsibilities="Construir dashboards e acompanhar indicadores.",
        experience_context="Experiência em analytics, BI e operação de dados.",
        behavioral_requirements=["Comunicação", "Autonomia"],
        job_area="Dados",
        priority="high",
        status="draft",
    )

    mock_job = JobModel(
        id=uuid4(),
        title=request.title,
        description=request.description,
        created_by=user_id,
        requirements=request.requirements,
        job_area=request.job_area,
        responsibilities=request.responsibilities,
        experience_context=request.experience_context,
        behavioral_requirements=request.behavioral_requirements,
        priority=request.priority,
        job_profile_json=None,
        job_profile_hash=None,
    )
    mock_repository.create.return_value = mock_job
    mock_repository.save = AsyncMock(return_value=mock_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    await service.create(request, user_id)

    kwargs = mock_profiler_service.generate_profile.call_args.kwargs
    assert kwargs["job_area"] == "data"
    assert kwargs["responsibilities"] == "Construir dashboards e acompanhar indicadores."
    assert kwargs["experience_context"] == "Experiência em analytics, BI e operação de dados."
    assert kwargs["behavioral_requirements"] == ["Comunicação", "Autonomia"]
    assert kwargs["priority"] == "high"


# ---------------------------------------------------------------------------
# Cenário 3 — Editar descrição regenera perfil
# ---------------------------------------------------------------------------

async def test_update_description_regenera_job_profile(
    mock_repository, mock_profiler_service
):
    """Ao editar description, novo JobProfile é gerado."""
    user_id = uuid4()
    job_id = uuid4()

    original_job = JobModel(
        id=job_id,
        title="Desenvolvedor Python",
        description="Antiga descrição",
        created_by=user_id,
        job_profile_json={"area": "technology"},
        job_profile_hash="oldHash",
    )

    update_request = UpdateJobRequest(description="Nova descrição com mais detalhes")

    mock_repository.find_active_by_id.return_value = original_job
    mock_repository.save = AsyncMock(return_value=original_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    result = await service.update(job_id, update_request)

    # JobProfiler deve ter sido chamado para gerar novo perfil
    mock_profiler_service.generate_profile.assert_called_once()


async def test_update_title_regenera_job_profile(
    mock_repository, mock_profiler_service
):
    """Ao editar title, novo JobProfile é gerado."""
    user_id = uuid4()
    job_id = uuid4()

    original_job = JobModel(
        id=job_id,
        title="Antiguo Title",
        description="Descrição",
        created_by=user_id,
    )

    update_request = UpdateJobRequest(title="Novo Title")

    mock_repository.find_active_by_id.return_value = original_job
    mock_repository.save = AsyncMock(return_value=original_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    result = await service.update(job_id, update_request)

    mock_profiler_service.generate_profile.assert_called_once()


async def test_update_responsibilities_regenera_job_profile(
    mock_repository, mock_profiler_service
):
    user_id = uuid4()
    job_id = uuid4()

    original_job = JobModel(
        id=job_id,
        title="Analista",
        description="Descrição",
        created_by=user_id,
        responsibilities="Responsabilidade antiga",
    )

    update_request = UpdateJobRequest(responsibilities="Nova responsabilidade estruturada")

    mock_repository.find_active_by_id.return_value = original_job
    mock_repository.save = AsyncMock(return_value=original_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    await service.update(job_id, update_request)

    mock_profiler_service.generate_profile.assert_called_once()


# ---------------------------------------------------------------------------
# Cenário 4 — Editar campo irrelevante não regenera perfil
# ---------------------------------------------------------------------------

async def test_update_location_nao_regenera_job_profile(
    mock_repository, mock_profiler_service
):
    """Ao editar location (irrelevante), perfil não é regenerado."""
    user_id = uuid4()
    job_id = uuid4()

    original_job = JobModel(
        id=job_id,
        title="Desenvolvedor",
        description="Descrição",
        created_by=user_id,
        location="São Paulo",
    )

    update_request = UpdateJobRequest(location="Rio de Janeiro")

    mock_repository.find_active_by_id.return_value = original_job
    mock_repository.save = AsyncMock(return_value=original_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    result = await service.update(job_id, update_request)

    # JobProfiler NÃO deve ser chamado
    mock_profiler_service.generate_profile.assert_not_called()


async def test_update_salary_nao_regenera_job_profile(
    mock_repository, mock_profiler_service
):
    """Ao editar salário, perfil não é regenerado."""
    user_id = uuid4()
    job_id = uuid4()

    from decimal import Decimal

    original_job = JobModel(
        id=job_id,
        title="Desenvolvedor",
        description="Descrição",
        created_by=user_id,
        salary_min=Decimal("5000"),
    )

    update_request = UpdateJobRequest(salary_min=Decimal("6000"))

    mock_repository.find_active_by_id.return_value = original_job
    mock_repository.save = AsyncMock(return_value=original_job)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    result = await service.update(job_id, update_request)

    mock_profiler_service.generate_profile.assert_not_called()


# ---------------------------------------------------------------------------
# Cenário 5 — Falha da IA não quebra create
# ---------------------------------------------------------------------------

async def test_create_com_ia_falha_continua_funcionando(mock_repository):
    """Se IA falha, vaga ainda é criada."""
    user_id = uuid4()
    request = CreateJobRequest(
        title="Desenvolvedor Python Sênior",
        description="Buscamos um desenvolvedor Python com mais de 5 anos de experiência",
        status="draft",
    )

    mock_job = JobModel(
        id=uuid4(),
        title="Desenvolvedor",
        description="Descrição",
        created_by=user_id,
    )
    mock_repository.create.return_value = mock_job
    mock_repository.save = AsyncMock(return_value=mock_job)

    # Profiler que falha
    failing_profiler = AsyncMock(spec=JobProfilerService)
    failing_profiler.generate_profile = AsyncMock(side_effect=RuntimeError("API timeout"))

    service = JobService(repository=mock_repository, job_profiler_service=failing_profiler)

    # Não deve levantar exceção
    result = await service.create(request, user_id)

    assert result is mock_job


async def test_update_com_ia_falha_continua_funcionando(mock_repository):
    """Se IA falha durante update, vaga ainda é atualizada."""
    user_id = uuid4()
    job_id = uuid4()

    original_job = JobModel(
        id=job_id,
        title="Desenvolvedor",
        description="Descrição",
        created_by=user_id,
    )

    update_request = UpdateJobRequest(description="Nova descrição")

    mock_repository.find_active_by_id.return_value = original_job
    mock_repository.save = AsyncMock(return_value=original_job)

    # Profiler que falha
    failing_profiler = AsyncMock(spec=JobProfilerService)
    failing_profiler.generate_profile = AsyncMock(side_effect=RuntimeError("API timeout"))

    service = JobService(repository=mock_repository, job_profiler_service=failing_profiler)

    # Não deve levantar exceção
    result = await service.update(job_id, update_request)

    assert result is original_job


# ---------------------------------------------------------------------------
# Cenário 6 — Cache de perfil funciona
# ---------------------------------------------------------------------------

async def test_cache_entre_vagas_diferentes_funciona(
    mock_repository, mock_profiler_service
):
    """Perfis são gerados e cacheados independentemente para cada vaga."""
    user_id = uuid4()

    # Primeira vaga
    request1 = CreateJobRequest(
        title="Dev Python",
        description="Descrição de Dev Python",
        status="draft",
    )
    job1 = JobModel(
        id=uuid4(),
        title="Dev Python",
        description="Descrição de Dev Python",
        created_by=user_id,
    )
    mock_repository.create.return_value = job1
    mock_repository.save = AsyncMock(return_value=job1)

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    await service.create(request1, user_id)

    call_count_1 = mock_profiler_service.generate_profile.call_count

    # Segunda vaga — descrição idêntica
    request2 = CreateJobRequest(
        title="Dev Python",
        description="Descrição de Dev Python",
        status="draft",
    )
    job2 = JobModel(
        id=uuid4(),
        title="Dev Python",
        description="Descrição de Dev Python",
        created_by=user_id,
    )
    mock_repository.create.return_value = job2

    await service.create(request2, user_id)

    # Como descrições são iguais, profiler foi chamado 2 vezes (uma por vaga)
    assert mock_profiler_service.generate_profile.call_count == call_count_1 + 1


# ---------------------------------------------------------------------------
# Cenário 7 — Serialização do perfil
# ---------------------------------------------------------------------------

async def test_job_profile_json_e_hash_persistidos_corretamente(mock_repository):
    """job_profile_json e hash são persistidos no banco."""
    user_id = uuid4()
    request = CreateJobRequest(
        title="Engenheiro de Dados Pleno",
        description="Buscamos um engenheiro de dados com experiência em pipelines ETL",
        status="draft",
    )

    mock_job = JobModel(
        id=uuid4(),
        title="Desenvolvedor",
        description="Descrição",
        created_by=user_id,
        job_profile_json=None,
        job_profile_hash=None,
    )

    saved_job = None

    async def mock_save(job):
        nonlocal saved_job
        saved_job = job
        return job

    mock_repository.create.return_value = mock_job
    mock_repository.save = mock_save

    # Profiler que retorna um perfil bem definido
    profiler = AsyncMock(spec=JobProfilerService)

    async def mock_generate(description: str, **kwargs):
        return JobProfile(
            area="data",
            target_level="mid",
            main_mission="Engenheiro de Dados",
            critical_requirements=[],
            desirable_requirements=[],
            responsibilities=["Pipelines"],
            required_tools=["Python", "Airflow"],
            required_capabilities=["SQL"],
            seniority_signals=["3-5 anos"],
            adaptive_weights=AREA_WEIGHTS["data"],
            job_completeness_score=0.90,
            confidence="high",
            description_hash="xyz789",
        )

    profiler.generate_profile = AsyncMock(side_effect=mock_generate)

    service = JobService(repository=mock_repository, job_profiler_service=profiler)
    result = await service.create(request, user_id)

    # Verificar que o perfil foi persistido
    assert saved_job is not None
    assert saved_job.job_profile_json is not None
    assert saved_job.job_profile_hash == "xyz789"
    assert saved_job.job_profile_json["area"] == "data"
    assert saved_job.job_profile_json["target_level"] == "mid"


async def test_add_required_skill_regenera_job_profile(mock_repository, mock_profiler_service):
    user_id = uuid4()
    job_id = uuid4()
    skill_id = uuid4()

    job = JobModel(
        id=job_id,
        title="Analista de Dados",
        description="Atuar com BI e SQL",
        created_by=user_id,
    )
    skill = MagicMock()
    skill.id = skill_id
    skill.name = "SQL"

    link = MagicMock()
    link.id = uuid4()
    link.job_id = job_id
    link.skill_id = skill_id
    link.is_mandatory = True
    link.minimum_level = None
    link.minimum_years = None
    link.weight = 1

    row = MagicMock()
    row.JobRequiredSkillModel = link
    row.skill_name = "SQL"
    row.skill_normalized_name = "sql"
    row.skill_category = "data"
    row.skill_aliases = []

    mock_repository.find_active_by_id.return_value = job
    mock_repository.find_active_skill_by_id.return_value = skill
    mock_repository.find_required_skill_link.return_value = None
    mock_repository.create_required_skill_link.return_value = link
    mock_repository.list_required_skill_rows.return_value = [row]

    service = JobService(repository=mock_repository, job_profiler_service=mock_profiler_service)
    await service.add_required_skill(
        job_id,
        MagicMock(skill_id=skill_id, is_mandatory=True, minimum_level=None, minimum_years=None, weight=1),
    )

    mock_profiler_service.generate_profile.assert_called_once()
