"""Phase 2 — multi-branch unit visibility: public endpoint + pipeline filter.

Backend integration tests (7 required):
1. GET /public/jobs/{job_id} returns job_units
2. Apply with 2+ units requires preferred_unit_id
3. Apply rejects wrong preferred_unit_id
4. Apply with 1 unit auto-fills preferred_unit_id in pipeline row
5. Apply without units continues working (no unit validation)
6. Pipeline filters by operational_unit_id
7. Pipeline without filter returns all candidates
"""
from __future__ import annotations

import io
from uuid import uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobUnitModel
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DUMMY_USER = uuid4()

_MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
    b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n9\n%%EOF"
)


def _pdf() -> tuple[str, io.BytesIO, str]:
    return ("resume.pdf", io.BytesIO(_MINIMAL_PDF), "application/pdf")


def _apply_data(
    *,
    job_id: str | None = None,
    preferred_unit_id: str | None = None,
    email: str | None = None,
) -> dict:
    data: dict = {
        "full_name": "Candidato Teste",
        "cpf": f"{uuid4().int % 10**11:011d}",
        "email": email or f"cand_{uuid4().hex[:8]}@phase2test.com",
        "phone": "11999998888",
        "city": "São Paulo",
        "state": "SP",
        "salary_expectation": "3500.00",
        "desired_contract_type": "CLT",
        "works_at_marajo_group": "false",
        "lgpd_consent": "true",
        "password": "Senha12345",
        "confirm_password": "Senha12345",
    }
    if job_id:
        data["job_id"] = job_id
    if preferred_unit_id:
        data["preferred_unit_id"] = preferred_unit_id
    return data


async def _make_published_job(db_session: AsyncSession) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=f"Job Phase2 {uuid4().hex[:6]}",
        description="Phase 2 test job",
        status="published",
        created_by=_DUMMY_USER,
    )
    db_session.add(job)
    await db_session.flush()
    return job


async def _make_unit(
    db_session: AsyncSession,
    *,
    name: str | None = None,
    public_name: str | None = None,
) -> OperationalUnitModel:
    suffix = uuid4().hex[:8]
    group = OperationalGroupModel(
        code=f"GRP-{suffix}",
        name=f"Grupo {suffix}",
        normalized_name=f"grupo-{suffix}",
        is_active=True,
    )
    location = LocationGroupModel(
        name=f"Loc {suffix}",
        normalized_name=f"loc-{suffix}",
        state="SP",
        city="São Paulo",
        type="city",
        is_active=True,
    )
    db_session.add_all([group, location])
    await db_session.flush()

    unit = OperationalUnitModel(
        group_id=group.id,
        location_group_id=location.id,
        code=f"UNIT-{suffix}",
        name=name or f"Unidade {suffix}",
        normalized_name=f"unidade-{suffix}",
        public_name=public_name,
        type="gas_station",
        city="São Paulo",
        state="SP",
        is_active=True,
    )
    db_session.add(unit)
    await db_session.flush()
    return unit


async def _link_unit_to_job(
    db_session: AsyncSession,
    job: JobModel,
    unit: OperationalUnitModel,
    *,
    priority: int = 0,
) -> JobUnitModel:
    ju = JobUnitModel(
        job_id=job.id,
        operational_unit_id=unit.id,
        is_active=True,
        priority=priority,
    )
    db_session.add(ju)
    await db_session.flush()
    return ju


async def _make_pipeline_row(
    db_session: AsyncSession,
    job_id,
    *,
    operational_unit_id=None,
) -> CandidateJobPipelineModel:
    candidate = CandidateModel(
        full_name=f"Candidato {uuid4().hex[:6]}",
        email=f"pipe_{uuid4().hex[:8]}@test.com",
        created_by=_DUMMY_USER,
    )
    db_session.add(candidate)
    await db_session.flush()

    row = CandidateJobPipelineModel(
        candidate_id=candidate.id,
        job_id=job_id,
        pipeline_stage="entry",
        link_status="active",
        pipeline_status="active",
        relationship_status="active",
        is_terminal=False,
        operational_unit_id=operational_unit_id,
    )
    db_session.add(row)
    await db_session.flush()
    return row


# ---------------------------------------------------------------------------
# Test 1 — public detail returns job_units
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_public_job_detail_returns_job_units(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await _make_published_job(db_session)
    unit = await _make_unit(db_session, name="Posto Centro", public_name="Centro")
    await _link_unit_to_job(db_session, job, unit)
    await db_session.commit()

    r = await client.get(f"/api/v1/public/jobs/{job.id}")
    assert r.status_code == status.HTTP_200_OK, r.text
    body = r.json()
    assert "job_units" in body
    assert len(body["job_units"]) == 1
    u = body["job_units"][0]
    assert u["id"] == str(unit.id)
    assert u["public_name"] == "Centro"


# ---------------------------------------------------------------------------
# Test 2 — apply with 2+ units requires preferred_unit_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_2_units_requires_preferred_unit_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await _make_published_job(db_session)
    unit_a = await _make_unit(db_session, name="Unidade A")
    unit_b = await _make_unit(db_session, name="Unidade B")
    await _link_unit_to_job(db_session, job, unit_a, priority=0)
    await _link_unit_to_job(db_session, job, unit_b, priority=1)
    await db_session.commit()

    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_data(job_id=str(job.id)),
        files={"resume_file": _pdf()},
    )
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text
    assert "posto" in r.text.lower() or "unidade" in r.text.lower()


# ---------------------------------------------------------------------------
# Test 3 — apply rejects wrong preferred_unit_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_rejects_wrong_preferred_unit_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await _make_published_job(db_session)
    unit_a = await _make_unit(db_session, name="Unidade A")
    unit_b = await _make_unit(db_session, name="Unidade B")
    await _link_unit_to_job(db_session, job, unit_a, priority=0)
    await _link_unit_to_job(db_session, job, unit_b, priority=1)
    await db_session.commit()

    wrong_id = str(uuid4())
    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_data(job_id=str(job.id), preferred_unit_id=wrong_id),
        files={"resume_file": _pdf()},
    )
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text
    assert "unidade" in r.text.lower()


# ---------------------------------------------------------------------------
# Test 4 — apply with 1 unit auto-fills preferred_unit_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_1_unit_autofills_preferred_unit_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await _make_published_job(db_session)
    unit = await _make_unit(db_session, name="Única Unidade")
    await _link_unit_to_job(db_session, job, unit)
    await db_session.commit()

    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_data(job_id=str(job.id)),
        files={"resume_file": _pdf()},
    )
    assert r.status_code == status.HTTP_201_CREATED, r.text

    pipeline_row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.job_id == job.id,
            CandidateJobPipelineModel.is_terminal.is_(False),
        )
    )
    assert pipeline_row is not None
    assert pipeline_row.operational_unit_id == unit.id


# ---------------------------------------------------------------------------
# Test 5 — apply without units continues working
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_apply_without_units_works(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    job = await _make_published_job(db_session)
    await db_session.commit()

    r = await client.post(
        "/api/v1/public/candidates/apply",
        data=_apply_data(job_id=str(job.id)),
        files={"resume_file": _pdf()},
    )
    assert r.status_code == status.HTTP_201_CREATED, r.text

    pipeline_row = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.job_id == job.id,
            CandidateJobPipelineModel.is_terminal.is_(False),
        )
    )
    assert pipeline_row is not None
    assert pipeline_row.operational_unit_id is None


# ---------------------------------------------------------------------------
# Tests 6 & 7 — pipeline filter
# (use repository directly — no auth setup needed)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pipeline_filter_by_operational_unit_id(
    db_session: AsyncSession,
) -> None:
    from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository
    from src.application.services.pipeline_service import PipelineService

    job = await _make_published_job(db_session)
    unit_a = await _make_unit(db_session, name="Unidade Filtro A")
    unit_b = await _make_unit(db_session, name="Unidade Filtro B")

    row_a = await _make_pipeline_row(db_session, job.id, operational_unit_id=unit_a.id)
    await _make_pipeline_row(db_session, job.id, operational_unit_id=unit_b.id)
    await db_session.commit()

    repo = SQLAlchemyPipelineRepository(db_session)
    svc = PipelineService(repo, db_session)

    from src.interface.api.schemas.pipeline_schemas import PipelineBoardFilters
    filters = PipelineBoardFilters(operational_unit_id=unit_a.id)
    matches = await svc.list_job_matches(job.id, filters=filters)

    candidate_ids = {m.candidate_id for m in matches}
    assert row_a.candidate_id in candidate_ids
    # All returned rows must belong to unit_a
    for m in matches:
        assert m.operational_unit_id == unit_a.id


@pytest.mark.asyncio
async def test_pipeline_no_filter_returns_all(
    db_session: AsyncSession,
) -> None:
    from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository
    from src.application.services.pipeline_service import PipelineService

    job = await _make_published_job(db_session)
    unit_a = await _make_unit(db_session, name="Unidade All A")
    unit_b = await _make_unit(db_session, name="Unidade All B")

    row_a = await _make_pipeline_row(db_session, job.id, operational_unit_id=unit_a.id)
    row_b = await _make_pipeline_row(db_session, job.id, operational_unit_id=unit_b.id)
    await db_session.commit()

    repo = SQLAlchemyPipelineRepository(db_session)
    svc = PipelineService(repo, db_session)

    from src.interface.api.schemas.pipeline_schemas import PipelineBoardFilters
    matches = await svc.list_job_matches(job.id, filters=PipelineBoardFilters())

    candidate_ids = {m.candidate_id for m in matches}
    assert row_a.candidate_id in candidate_ids
    assert row_b.candidate_id in candidate_ids
