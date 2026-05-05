import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel

from .test_job_endpoints import _auth_headers, _create_active_user


def _bulk_payload(*jobs: dict, **options: dict) -> dict:
    return {
        "jobs": list(jobs),
        "options": {
            "dry_run": False,
            "skip_duplicates": True,
            "default_status": "draft",
            **options,
        },
    }


def _job_seed(**overrides) -> dict:
    payload = {
        "title": "Analista Financeiro",
        "status": "draft",
        "job_area": "financial",
        "priority": "normal",
        "seniority_level": "mid",
        "minimum_education_level": "bachelor",
        "minimum_years_experience": 2,
        "work_model": "onsite",
        "location": "São Paulo",
        "salary_currency": "BRL",
        "description": "Atuar com rotinas financeiras, controles, conciliações e suporte ao fechamento mensal.",
        "responsibilities": "Realizar conciliações, apoiar fechamento financeiro e acompanhar controles da área.",
        "requirements": "Experiência com contas a pagar, contas a receber e conciliação bancária.",
        "experience_context": "Vivência em rotina financeira corporativa com controles e fechamento.",
        "behavioral_requirements": ["Organização", "Comunicação"],
        "skills": [
            {"name": "Contas a pagar", "is_mandatory": True, "weight": 10, "minimum_level": "mid", "minimum_years": 2},
            {"name": "Conciliação bancária", "is_mandatory": True, "weight": 8, "minimum_level": "junior", "minimum_years": 1},
        ],
        "deal_breakers": [],
    }
    payload.update(overrides)
    return payload


async def _create_skill(session: AsyncSession, name: str, normalized_name: str | None = None) -> SkillModel:
    key = normalized_name or name.lower()
    existing = await session.scalar(sa.select(SkillModel).where(SkillModel.normalized_name == key))
    if existing is not None:
        return existing

    skill = SkillModel(
        name=name,
        normalized_name=key,
        category="Financeiro",
        aliases=[],
        is_verified=True,
    )
    session.add(skill)
    await session.commit()
    return skill


async def _create_skill_with_aliases(
    session: AsyncSession,
    name: str,
    normalized_name: str,
    aliases: list[str],
    category: str = "Tecnologia",
) -> SkillModel:
    existing = await session.scalar(sa.select(SkillModel).where(SkillModel.normalized_name == normalized_name))
    if existing is not None:
        return existing

    skill = SkillModel(
        name=name,
        normalized_name=normalized_name,
        category=category,
        aliases=aliases,
        is_verified=True,
    )
    session.add(skill)
    await session.commit()
    return skill


@pytest.mark.asyncio
async def test_bulk_import_creates_valid_job_and_links_skills(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    await _create_active_user(db_session, "bulk-import@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-import@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(_job_seed(title="Analista Financeiro Importação Válida", location="São Paulo A")),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["total"] == 1
    assert body["created"] == 1
    assert body["skipped"] == 0
    assert body["failed"] == 0
    assert body["results"][0]["status"] == "created"
    assert body["results"][0]["quality_score"] is not None
    assert body["results"][0]["quality_status"] in {"weak", "acceptable", "good"}

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Analista Financeiro Importação Válida"))
    assert job is not None
    assert job.status == "draft"
    assert job.quality_score is not None
    assert job.quality_status in {"weak", "acceptable", "good"}
    assert job.job_profile_json is not None
    assert job.job_profile_hash is not None

    link_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(JobRequiredSkillModel).where(JobRequiredSkillModel.job_id == job.id)
    )
    assert link_count == 2


@pytest.mark.asyncio
async def test_bulk_import_skips_duplicate_when_configured(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    recruiter = await _create_active_user(db_session, "bulk-duplicate@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-duplicate@test.com", "password123")

    existing_job = JobModel(
        title="Analista Financeiro Duplicado",
        description="Descrição existente suficientemente longa para a vaga financeira.",
        status="draft",
        job_area="financial",
        location="São Paulo B",
        salary_currency="BRL",
        created_by=recruiter.id,
    )
    db_session.add(existing_job)
    await db_session.commit()

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(_job_seed(title="Analista Financeiro Duplicado", location="São Paulo B")),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 0
    assert body["skipped"] == 1
    assert body["failed"] == 0
    assert body["results"][0]["status"] == "skipped"

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(JobModel).where(JobModel.title == "Analista Financeiro Duplicado")
    )
    assert count == 1


@pytest.mark.asyncio
async def test_bulk_import_fails_when_skill_does_not_exist(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(db_session, "bulk-missing-skill@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-missing-skill@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Analista Financeiro Skill Ausente",
                location="São Paulo C",
                skills=[{"name": "Skill Inexistente", "is_mandatory": True, "weight": 10}],
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 0
    assert body["skipped"] == 0
    assert body["failed"] == 1
    assert "Skills não encontradas" in body["results"][0]["errors"][0]

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(JobModel).where(JobModel.title == "Analista Financeiro Skill Ausente")
    )
    assert count == 0


@pytest.mark.asyncio
async def test_bulk_import_dry_run_validates_without_persisting(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    await _create_active_user(db_session, "bulk-dry-run@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-dry-run@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(_job_seed(title="Analista Financeiro Dry Run", location="São Paulo D"), dry_run=True),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1
    assert body["results"][0]["status"] == "created"
    assert body["results"][0]["job_id"] is None
    assert any("Dry run" in warning for warning in body["results"][0]["warnings"])

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(JobModel).where(JobModel.title == "Analista Financeiro Dry Run")
    )
    assert count == 0


@pytest.mark.asyncio
async def test_bulk_import_returns_aggregated_report(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    recruiter = await _create_active_user(db_session, "bulk-report@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-report@test.com", "password123")

    existing_job = JobModel(
        title="Assistente Financeiro",
        description="Descrição existente suficientemente longa para duplicidade em relatório.",
        status="draft",
        job_area="financial",
        location="Campinas",
        salary_currency="BRL",
        created_by=recruiter.id,
    )
    db_session.add(existing_job)
    await db_session.commit()

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(title="Analista Financeiro Importado", location="Campinas A"),
            _job_seed(title="Assistente Financeiro", location="Campinas"),
            _job_seed(
                title="Coordenador Financeiro",
                location="Campinas B",
                skills=[{"name": "Skill Inexistente", "is_mandatory": True, "weight": 10}],
            ),
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["total"] == 3
    assert body["created"] == 1
    assert body["skipped"] == 1
    assert body["failed"] == 1
    assert [item["status"] for item in body["results"]] == ["created", "skipped", "failed"]


@pytest.mark.asyncio
async def test_bulk_import_normalizes_non_standard_json_payload(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    await _create_active_user(db_session, "bulk-import-normalized@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-import-normalized@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=[
            {
                "titulo": "Analista Financeiro JSON Flexível",
                "área": "financial",
                "prioridade": "alta",
                "senioridade": "pleno",
                "educacao_minima": "superior",
                "anos_experiencia": "2 anos",
                "modelo_trabalho": "presencial",
                "cidade": "São Paulo Z",
                "responsabilidades": "Realizar conciliações e apoiar o fechamento financeiro.",
                "requisitos": "Experiência com contas a pagar e conciliação bancária.",
                "contexto": "Vivência em rotina financeira corporativa.",
                "soft_skills": "Organização, Comunicação",
                "skills_obrigatorias": ["Contas a pagar", "Conciliação bancária"],
                "salário": {"currency": "brl"},
            }
        ],
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1
    assert body["failed"] == 0

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Analista Financeiro JSON Flexível"))
    assert job is not None
    assert job.job_area == "financial"
    assert job.priority == "high"
    assert job.seniority_level == "mid"
    assert job.minimum_education_level == "bachelor"
    assert str(job.minimum_years_experience) in {"2", "2.0", "2.00"}
    assert job.work_model == "onsite"
    assert job.location == "São Paulo Z"
    assert job.description.startswith("Realizar conciliações")

    links = await db_session.execute(
        sa.select(SkillModel.name)
        .join(JobRequiredSkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
        .where(JobRequiredSkillModel.job_id == job.id)
        .order_by(SkillModel.name.asc())
    )
    assert [name for (name,) in links.all()] == ["Conciliação bancária", "Contas a pagar"]


@pytest.mark.asyncio
async def test_bulk_import_resolves_postgresql_as_sql(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill_with_aliases(db_session, "SQL", "sql", ["postgresql", "mysql", "sql server", "t-sql"], category="Dados")
    await _create_active_user(db_session, "bulk-import-sql-equivalence@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-import-sql-equivalence@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Engenheiro Dados PostgreSQL",
                location="São Paulo PG",
                job_area="data",
                skills=[{"name": "PostgreSQL", "is_mandatory": True, "weight": 10}],
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1
    assert body["results"][0]["resolved_skills"] == ["SQL"]
    assert body["results"][0]["unresolved_skills"] == []

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Engenheiro Dados PostgreSQL"))
    assert job is not None
    links = await db_session.execute(
        sa.select(SkillModel.name)
        .join(JobRequiredSkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
        .where(JobRequiredSkillModel.job_id == job.id)
    )
    assert [name for (name,) in links.all()] == ["SQL"]


@pytest.mark.asyncio
async def test_bulk_import_resolves_apis_rest_as_api_rest(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill_with_aliases(db_session, "API REST", "api rest", ["rest", "rest api"], category="Tecnologia")
    await _create_active_user(db_session, "bulk-import-rest-equivalence@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-import-rest-equivalence@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Backend APIs REST",
                location="São Paulo REST",
                job_area="technology",
                skills=[{"name": "APIs REST", "is_mandatory": True, "weight": 10}],
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["results"][0]["resolved_skills"] == ["API REST"]
    assert body["results"][0]["unresolved_skills"] == []


@pytest.mark.asyncio
async def test_bulk_import_resolves_catalog_alias(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill_with_aliases(db_session, "Node.js", "node js", ["node", "nodejs"], category="Tecnologia")
    await _create_active_user(db_session, "bulk-import-alias@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-import-alias@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Backend Node Alias",
                location="São Paulo Alias",
                job_area="technology",
                skills=[{"name": "Node", "is_mandatory": True, "weight": 10}],
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["results"][0]["resolved_skills"] == ["Node.js"]


@pytest.mark.asyncio
async def test_bulk_import_unknown_skill_with_fallback_becomes_requirement(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_skill_with_aliases(db_session, "SQL", "sql", ["postgresql"], category="Dados")
    await _create_active_user(db_session, "bulk-import-fallback@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-import-fallback@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Backend Fallback Skill",
                location="São Paulo FB",
                job_area="technology",
                requirements="Base original.",
                skills=[
                    {"name": "SQL", "is_mandatory": True, "weight": 10},
                    {"name": "Skill Inexistente", "is_mandatory": False, "weight": 5},
                ],
            ),
            fallback_unknown_skills_to_requirements=True,
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1
    assert body["results"][0]["resolved_skills"] == ["SQL"]
    assert body["results"][0]["unresolved_skills"] == ["Skill Inexistente"]
    assert any("mantidas apenas em requirements" in warning for warning in body["results"][0]["warnings"])

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Backend Fallback Skill"))
    assert job is not None
    assert "Skill Inexistente" in (job.requirements or "")
    link_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(JobRequiredSkillModel).where(JobRequiredSkillModel.job_id == job.id)
    )
    assert link_count == 1


@pytest.mark.asyncio
async def test_bulk_import_normalizes_job_area_english_value(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test that job_area='data' (English) is accepted and stored as 'data'."""
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    await _create_active_user(db_session, "bulk-job-area-en@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-job-area-en@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Data Scientist English",
                location="São Paulo DATA-EN",
                job_area="data",
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Data Scientist English"))
    assert job is not None
    assert job.job_area == "data"


@pytest.mark.asyncio
async def test_bulk_import_normalizes_job_area_portuguese_value(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test that job_area='Dados' (Portuguese) is accepted and normalized to 'data'."""
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    await _create_active_user(db_session, "bulk-job-area-pt@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-job-area-pt@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Data Scientist Portuguese",
                location="São Paulo DATA-PT",
                job_area="Dados",
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Data Scientist Portuguese"))
    assert job is not None
    assert job.job_area == "data"


@pytest.mark.asyncio
async def test_bulk_import_normalizes_job_area_portuguese_lowercase(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test that job_area='dados' (lowercase Portuguese) is also normalized to 'data'."""
    await _create_skill(db_session, "Contas a pagar", "contas a pagar")
    await _create_skill(db_session, "Conciliação bancária", "conciliacao bancaria")
    await _create_active_user(db_session, "bulk-job-area-pt-lower@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-job-area-pt-lower@test.com", "password123")

    response = await client.post(
        "/api/v1/jobs/bulk-import",
        json=_bulk_payload(
            _job_seed(
                title="Data Scientist Portuguese Lower",
                location="São Paulo DATA-PT-LOWER",
                job_area="dados",
            )
        ),
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] == 1

    job = await db_session.scalar(sa.select(JobModel).where(JobModel.title == "Data Scientist Portuguese Lower"))
    assert job is not None
    assert job.job_area == "data"
