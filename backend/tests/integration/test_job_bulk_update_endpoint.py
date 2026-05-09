import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel

from .test_job_endpoints import _auth_headers, _create_active_user


async def _create_skill(session: AsyncSession, name: str, normalized_name: str | None = None) -> SkillModel:
    key = normalized_name or name.lower()
    existing = await session.scalar(sa.select(SkillModel).where(SkillModel.normalized_name == key))
    if existing is not None:
        return existing

    skill = SkillModel(
        name=name,
        normalized_name=key,
    )
    session.add(skill)
    await session.commit()
    return skill


async def _create_job(session: AsyncSession, created_by, **overrides) -> JobModel:
    payload = {
        "title": "Analista de Dados",
        "description": "Descrição suficientemente longa para permitir atualização em lote com segurança.",
        "status": "draft",
        "job_area": "data",
        "location": "São Paulo",
        "salary_currency": "BRL",
        "created_by": created_by,
    }
    payload.update(overrides)
    job = JobModel(**payload)
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


def _payload(*jobs: dict) -> dict:
    return {"jobs": list(jobs)}


@pytest.mark.asyncio
async def test_bulk_update_updates_job_by_job_id(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(db_session, "bulk-update-id@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-id@test.com", "password123")
    job = await _create_job(db_session, recruiter.id)

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=_payload(
            {
                "job_id": str(job.id),
                "data": {
                    "title": "Analista de Dados Sênior",
                    "priority": "high",
                    "responsibilities": "Construir dashboards, métricas e análises para stakeholders.",
                },
            }
        ),
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 1
    assert body["failed"] == 0
    assert body["results"][0]["status"] == "updated"

    updated = await db_session.get(JobModel, job.id)
    assert updated.title == "Analista de Dados Sênior"
    assert updated.priority == "high"
    assert updated.responsibilities == "Construir dashboards, métricas e análises para stakeholders."
    assert updated.quality_score is not None
    assert updated.quality_status in {"weak", "acceptable", "good"}


@pytest.mark.asyncio
async def test_bulk_update_updates_job_by_match_key(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(db_session, "bulk-update-key@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-key@test.com", "password123")
    job = await _create_job(db_session, recruiter.id, title="Assistente Administrativo", job_area="administrative", location="Campinas")

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=_payload(
            {
                "match_key": {
                    "title": "Assistente Administrativo",
                    "job_area": "administrative",
                    "location": "Campinas",
                },
                "data": {
                    "experience_context": "Vivência em rotinas administrativas e atendimento interno.",
                },
            }
        ),
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 1
    assert body["results"][0]["job_id"] == str(job.id)

    updated = await db_session.get(JobModel, job.id)
    assert updated.experience_context == "Vivência em rotinas administrativas e atendimento interno."


@pytest.mark.asyncio
async def test_bulk_update_partial_update_preserves_absent_fields(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(db_session, "bulk-update-partial@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-partial@test.com", "password123")
    job = await _create_job(
        db_session,
        recruiter.id,
        title="Engenheiro Backend",
        location="Brasil",
        responsibilities="Texto original",
    )

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=_payload(
            {
                "job_id": str(job.id),
                "data": {
                    "priority": "urgent",
                },
            }
        ),
        headers=headers,
    )

    assert response.status_code == 200
    updated = await db_session.get(JobModel, job.id)
    assert updated.priority == "urgent"
    assert updated.title == "Engenheiro Backend"
    assert updated.location == "Brasil"
    assert updated.responsibilities == "Texto original"


@pytest.mark.asyncio
async def test_bulk_update_fails_when_skill_does_not_exist(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(db_session, "bulk-update-skill@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-skill@test.com", "password123")
    job = await _create_job(db_session, recruiter.id, title="Analista Protheus", job_area="Tecnologia", location="Goiânia")

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=_payload(
            {
                "job_id": str(job.id),
                "data": {
                    "skills": [
                        {"name": "Skill Inexistente", "is_mandatory": True, "weight": 10},
                    ]
                },
            }
        ),
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 0
    assert body["failed"] == 1
    assert "Skill não encontrada" in body["results"][0]["errors"][0]


@pytest.mark.asyncio
async def test_bulk_update_fails_when_job_is_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(db_session, "bulk-update-missing@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-missing@test.com", "password123")

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=_payload(
            {
                "match_key": {
                    "title": "Vaga Inexistente",
                    "job_area": "data",
                    "location": "Recife",
                },
                "data": {
                    "priority": "high",
                },
            }
        ),
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 0
    assert body["failed"] == 1
    assert body["results"][0]["errors"] == ["Vaga não encontrada."]


@pytest.mark.asyncio
async def test_bulk_update_replaces_skills_when_sent(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(db_session, "bulk-update-replace@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-replace@test.com", "password123")
    sql = await _create_skill(db_session, "SQL", "sql")
    power_bi = await _create_skill(db_session, "Power BI", "power bi")
    etl = await _create_skill(db_session, "ETL", "etl")
    job = await _create_job(db_session, recruiter.id, title="Analista BI", job_area="Dados", location="Curitiba")

    db_session.add(
        JobRequiredSkillModel(
            job_id=job.id,
            skill_id=sql.id,
            is_mandatory=True,
            weight=8,
        )
    )
    await db_session.commit()

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=_payload(
            {
                "job_id": str(job.id),
                "data": {
                    "skills": [
                        {"name": "Power BI", "is_mandatory": True, "weight": 9},
                        {"name": "ETL", "is_mandatory": False, "weight": 6},
                    ]
                },
            }
        ),
        headers=headers,
    )

    assert response.status_code == 200
    rows = await db_session.execute(
        sa.select(JobRequiredSkillModel.skill_id, SkillModel.name)
        .join(SkillModel, SkillModel.id == JobRequiredSkillModel.skill_id)
        .where(JobRequiredSkillModel.job_id == job.id)
        .order_by(SkillModel.name.asc())
    )
    linked = rows.all()
    assert linked == [(etl.id, "ETL"), (power_bi.id, "Power BI")]


@pytest.mark.asyncio
async def test_bulk_update_normalizes_flattened_non_standard_payload(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_active_user(db_session, "bulk-update-normalized@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "bulk-update-normalized@test.com", "password123")
    power_bi = await _create_skill(db_session, "Power BI", "power bi")
    etl = await _create_skill(db_session, "ETL", "etl")
    job = await _create_job(db_session, recruiter.id, title="Analista BI Flexível", job_area="data", location="Campinas Z")

    response = await client.patch(
        "/api/v1/jobs/bulk-update",
        json=[
            {
                "titulo": "Analista BI Flexível",
                "área": "dados",
                "cidade": "Campinas Z",
                "prioridade": "urgente",
                "contexto": "Vivência com indicadores e dashboards.",
                "habilidades_obrigatorias": [
                    {"nome": "Power BI", "peso": "9", "nivel": "pleno", "anos_mínimos": "1 ano"}
                ],
                "skills_desejaveis": ["ETL"],
            }
        ],
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 1
    assert body["failed"] == 0
    assert body["results"][0]["status"] == "updated"

    updated = await db_session.get(JobModel, job.id)
    assert updated is not None
    assert updated.priority == "urgent"
    assert updated.experience_context == "Vivência com indicadores e dashboards."

    rows = await db_session.execute(
        sa.select(JobRequiredSkillModel.is_mandatory, JobRequiredSkillModel.weight, SkillModel.name)
        .join(SkillModel, SkillModel.id == JobRequiredSkillModel.skill_id)
        .where(JobRequiredSkillModel.job_id == job.id)
        .order_by(SkillModel.name.asc())
    )
    linked = rows.all()
    assert {name for _, _, name in linked} == {"Power BI", "ETL"}

    power_bi_row = next(row for row in linked if row[2] == "Power BI")
    etl_row = next(row for row in linked if row[2] == "ETL")

    assert power_bi_row[0] is True
    assert str(power_bi_row[1]) in {"9", "9.00"}
    assert etl_row[0] is False
    assert str(etl_row[1]) in {"5", "5.00"}
