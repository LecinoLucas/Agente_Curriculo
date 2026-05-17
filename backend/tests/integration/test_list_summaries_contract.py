"""Contract tests for GET /api/v1/candidates/summaries (list_summaries).

These tests pin the current behavior of the query BEFORE any refactoring.
If all 12 tests pass before and after a refactor, the contract is preserved.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4, UUID

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
from tests.integration.helpers import _create_active_user, _auth_headers

ENDPOINT = "/api/v1/candidates/summaries"

_EXPECTED_FIELDS = {
    "id",
    "full_name",
    "email",
    "phone",
    "cpf",
    "tags",
    "created_at",
    "archived_at",
    "archive_reason",
    "application_source",
    "resume_count",
    "linked_job_count",
    "latest_job_id",
    "latest_job_title",
    "latest_job_stage",
    "latest_relationship_status",
    "active_job_id",
    "active_job_title",
    "active_job_stage",
    "active_job_job_fit_score",
    "ai_status",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"recruiter-{uuid4().hex[:8]}@contract-tests.com"
    await _create_active_user(db_session, email, "pass1234", UserRole.RECRUITER)
    return await _auth_headers(client, email, "pass1234")


async def _make_candidate(db_session: AsyncSession, created_by: UUID, **kwargs) -> CandidateModel:
    c = CandidateModel(email=f"c-{uuid4().hex[:8]}@contract-tests.com", full_name="Contract Candidate", created_by=created_by, **kwargs)
    db_session.add(c)
    await db_session.flush()
    return c


async def _make_job(db_session: AsyncSession, created_by: UUID, title: str = "Test Job") -> JobModel:
    j = JobModel(title=title, description="desc", created_by=created_by, status="published", location="SP")
    db_session.add(j)
    await db_session.flush()
    return j


async def _make_resume(db_session: AsyncSession, candidate_id: UUID, created_by: UUID) -> tuple[ResumeModel, ResumeVersionModel]:
    resume = ResumeModel(candidate_id=candidate_id, title="CV", created_by=created_by)
    db_session.add(resume)
    await db_session.flush()
    h = hashlib.sha256(uuid4().bytes).hexdigest()
    rv = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="b",
        s3_key="k",
        original_file_name="cv.pdf",
        file_size_bytes=100,
        file_hash_sha256=h,
        uploaded_by=created_by,
    )
    db_session.add(rv)
    await db_session.flush()
    return resume, rv


async def _make_pipeline(
    db_session: AsyncSession,
    candidate_id: UUID,
    job_id: UUID,
    resume_version_id: UUID,
    *,
    stage: str = "entry",
    relationship_status: str = "active",
    is_terminal: bool = False,
    terminated_at: datetime | None = None,
) -> CandidateJobPipelineModel:
    # Terminal pipelines require terminated_at and pipeline_status='terminal'
    if is_terminal and terminated_at is None:
        terminated_at = datetime.now(timezone.utc)
    p = CandidateJobPipelineModel(
        candidate_id=candidate_id,
        job_id=job_id,
        resume_version_id=resume_version_id,
        link_status="active",
        pipeline_stage=stage,
        pipeline_status="active" if not is_terminal else "terminal",
        relationship_status=relationship_status,
        is_terminal=is_terminal,
        terminated_at=terminated_at,
    )
    db_session.add(p)
    await db_session.flush()
    return p


async def _make_analysis(
    db_session: AsyncSession,
    resume_version_id: UUID,
    job_id: UUID,
    created_by: UUID,
    status: str = "completed",
) -> AnalysisModel:
    ai_model = AIModelModel(
        provider="google",
        model_id=f"gemini-{uuid4().hex[:6]}",
        model_name="Gemini Test",
        context_window=100000,
        is_active=True,
    )
    db_session.add(ai_model)
    await db_session.flush()

    pt = PromptTemplateModel(
        name=f"tpl-{uuid4().hex[:6]}",
        version=1,
        description="tpl",
        template_type="candidate_analysis",
        user_prompt_template="A: {resume}",
        is_active=True,
        created_by=created_by,
    )
    db_session.add(pt)
    await db_session.flush()

    a = AnalysisModel(
        resume_version_id=resume_version_id,
        job_id=job_id,
        ai_model_id=ai_model.id,
        prompt_template_id=pt.id,
        status=status,
        requested_by=created_by,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(a)
    await db_session.flush()
    return a


async def _ensure_score_version(db_session: AsyncSession) -> ScoreModelVersionModel:
    sv = await db_session.scalar(sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True)))
    if sv is None:
        sv = ScoreModelVersionModel(
            version=f"v-{uuid4().hex[:8]}",
            is_active=True,
            weights={"skill_match": 0.4, "experience_match": 0.25, "seniority_match": 0.2, "education": 0.1, "ai_confidence": 0.05},
            thresholds={"high": 70, "low": 45},
        )
        db_session.add(sv)
        await db_session.flush()
    return sv


async def _make_score(
    db_session: AsyncSession,
    candidate_id: UUID,
    job_id: UUID,
    version_id: UUID,
    final_score: Decimal = Decimal("75.50"),
) -> CandidateJobScoreModel:
    score = CandidateJobScoreModel(
        candidate_id=candidate_id,
        job_id=job_id,
        version_id=version_id,
        final_score=final_score,
        decision_suggestion="good_match",
        breakdown={},
        reason_codes=[],
        explanation_text="Good match.",
        freshness_status="fresh",
        recompute_reason="initial",
        job_signature_hash=hashlib.sha256(b"job").hexdigest()[:16],
        job_updated_at=datetime.now(timezone.utc),
    )
    db_session.add(score)
    await db_session.flush()
    return score


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_contract_response_fields(client: AsyncClient, db_session: AsyncSession):
    """Test 12: Response mantém os mesmos campos esperados."""
    headers = await _recruiter_headers(client, db_session)
    created_by = (await db_session.scalar(sa.select(CandidateModel.created_by).limit(1))) or uuid4()
    # create one candidate so the list is non-empty
    await _make_candidate(db_session, uuid4())
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"page": 1, "page_size": 5})
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert len(body["data"]) > 0
    row = body["data"][0]
    missing = _EXPECTED_FIELDS - set(row.keys())
    assert not missing, f"Missing fields in response: {missing}"


@pytest.mark.asyncio
async def test_contract_pagination(client: AsyncClient, db_session: AsyncSession):
    """Test 1: Paginação mantém page, page_size, total corretos."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    for _ in range(5):
        await _make_candidate(db_session, creator)
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"page": 1, "page_size": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 3
    assert len(body["data"]) == 3
    assert body["total"] >= 5

    resp2 = await client.get(ENDPOINT, headers=headers, params={"page": 2, "page_size": 3})
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["page"] == 2
    assert len(body2["data"]) >= 2


@pytest.mark.asyncio
async def test_contract_search_filter(client: AsyncClient, db_session: AsyncSession):
    """Test 2: Filtro por busca retorna apenas candidatos que batem com nome ou email."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    unique_suffix = uuid4().hex[:8]

    target = CandidateModel(
        email=f"specific-{unique_suffix}@contract-tests.com",
        full_name=f"Unique Name {unique_suffix}",
        created_by=creator,
    )
    db_session.add(target)
    other = CandidateModel(email=f"other-{uuid4().hex}@contract-tests.com", full_name="Other Person", created_by=creator)
    db_session.add(other)
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": unique_suffix})
    assert resp.status_code == 200
    body = resp.json()
    ids = [item["id"] for item in body["data"]]
    assert str(target.id) in ids
    assert str(other.id) not in ids


@pytest.mark.asyncio
async def test_contract_resume_count(client: AsyncClient, db_session: AsyncSession):
    """Test 3: resume_count reflete o número real de currículos ativos do candidato."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    await _make_resume(db_session, c.id, creator)
    await _make_resume(db_session, c.id, creator)
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    assert items[0]["resume_count"] == 2


@pytest.mark.asyncio
async def test_contract_linked_job_count(client: AsyncClient, db_session: AsyncSession):
    """Test 4: linked_job_count conta vagas com status visible (active, hired, rejected)."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    _, rv = await _make_resume(db_session, c.id, creator)

    j1 = await _make_job(db_session, creator, "Job A")
    j2 = await _make_job(db_session, creator, "Job B")
    j3 = await _make_job(db_session, creator, "Job C (invisible)")

    await _make_pipeline(db_session, c.id, j1.id, rv.id, stage="entry", relationship_status="active")
    await _make_pipeline(db_session, c.id, j2.id, rv.id, stage="hired", relationship_status="hired", is_terminal=True)
    # archived status is NOT in _VISIBLE_RELATIONSHIP_STATUSES
    await _make_pipeline(db_session, c.id, j3.id, rv.id, stage="entry", relationship_status="archived", is_terminal=True)
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    # active + hired = 2 visible; archived = not visible
    assert items[0]["linked_job_count"] == 2


@pytest.mark.asyncio
async def test_contract_latest_job(client: AsyncClient, db_session: AsyncSession):
    """Test 5: latest_job_* reflete a vaga mais recentemente atualizada com status visível."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    _, rv = await _make_resume(db_session, c.id, creator)

    j1 = await _make_job(db_session, creator, "Older Job")
    j2 = await _make_job(db_session, creator, "Newer Job")

    p1 = await _make_pipeline(db_session, c.id, j1.id, rv.id, stage="screening", relationship_status="active")
    # Force p1 updated_at to be older
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(CandidateJobPipelineModel.candidate_job_pipeline_id == p1.candidate_job_pipeline_id)
        .values(updated_at=datetime(2020, 1, 1, tzinfo=timezone.utc))
    )
    p2 = await _make_pipeline(db_session, c.id, j2.id, rv.id, stage="hr_interview", relationship_status="hired", is_terminal=True)
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    row = items[0]
    assert row["latest_job_id"] == str(j2.id)
    assert row["latest_job_title"] == "Newer Job"
    assert row["latest_job_stage"] == "hr_interview"
    assert row["latest_relationship_status"] == "hired"


@pytest.mark.asyncio
async def test_contract_active_job(client: AsyncClient, db_session: AsyncSession):
    """Test 6: active_job_* reflete apenas o pipeline ativo (não terminal)."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    _, rv = await _make_resume(db_session, c.id, creator)

    j_active = await _make_job(db_session, creator, "Active Job")
    j_old = await _make_job(db_session, creator, "Old Hired Job")

    await _make_pipeline(db_session, c.id, j_old.id, rv.id, stage="hired", relationship_status="hired", is_terminal=True)
    await _make_pipeline(db_session, c.id, j_active.id, rv.id, stage="screening", relationship_status="active")
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    row = items[0]
    assert row["active_job_id"] == str(j_active.id)
    assert row["active_job_title"] == "Active Job"
    assert row["active_job_stage"] == "screening"


@pytest.mark.asyncio
async def test_contract_active_job_fit_score(client: AsyncClient, db_session: AsyncSession):
    """Test 7: active_job_job_fit_score retorna o score fresh da vaga ativa."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    _, rv = await _make_resume(db_session, c.id, creator)
    j = await _make_job(db_session, creator, "Scored Job")

    await _make_pipeline(db_session, c.id, j.id, rv.id, stage="entry", relationship_status="active")
    sv = await _ensure_score_version(db_session)
    await _make_score(db_session, c.id, j.id, sv.id, Decimal("82.00"))
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    assert items[0]["active_job_job_fit_score"] == pytest.approx(82.0, abs=0.01)


@pytest.mark.asyncio
async def test_contract_ai_status(client: AsyncClient, db_session: AsyncSession):
    """Test 8: ai_status retorna o status da análise mais recente não descartada."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    _, rv = await _make_resume(db_session, c.id, creator)
    j = await _make_job(db_session, creator, "Analyzed Job")

    await _make_pipeline(db_session, c.id, j.id, rv.id)
    await _make_analysis(db_session, rv.id, j.id, creator, status="completed")
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    assert items[0]["ai_status"] == "completed"


@pytest.mark.asyncio
async def test_contract_candidate_without_active_job(client: AsyncClient, db_session: AsyncSession):
    """Test 9: Candidato sem vaga ativa retorna active_job_* nulos."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    row = items[0]
    assert row["active_job_id"] is None
    assert row["active_job_title"] is None
    assert row["active_job_stage"] is None
    assert row["active_job_job_fit_score"] is None
    assert row["resume_count"] == 0
    assert row["linked_job_count"] == 0


@pytest.mark.asyncio
async def test_contract_terminal_pipeline_not_active(client: AsyncClient, db_session: AsyncSession):
    """Test 10: Pipeline terminal/removido não aparece como ativo."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()
    c = await _make_candidate(db_session, creator)
    _, rv = await _make_resume(db_session, c.id, creator)
    j = await _make_job(db_session, creator, "Terminal Job")

    await _make_pipeline(
        db_session,
        c.id,
        j.id,
        rv.id,
        stage="rejected",
        relationship_status="rejected",
        is_terminal=True,
        terminated_at=datetime.now(timezone.utc),
    )
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"search": c.email})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) == 1
    row = items[0]
    assert row["active_job_id"] is None
    assert row["active_job_title"] is None
    assert row["active_job_stage"] is None
    # BUT latest_job shows the terminal pipeline (rejected is visible)
    assert row["latest_job_id"] == str(j.id)
    assert row["latest_relationship_status"] == "rejected"


@pytest.mark.asyncio
async def test_contract_ordering(client: AsyncClient, db_session: AsyncSession):
    """Test 11: Ordenação permanece created_at desc."""
    headers = await _recruiter_headers(client, db_session)
    creator = uuid4()

    c1 = CandidateModel(email=f"ord1-{uuid4().hex}@contract-tests.com", full_name="Ord First", created_by=creator)
    db_session.add(c1)
    await db_session.flush()
    # Force c1 to have older created_at
    await db_session.execute(
        sa.update(CandidateModel)
        .where(CandidateModel.id == c1.id)
        .values(created_at=datetime(2020, 1, 1, tzinfo=timezone.utc))
    )

    c2 = CandidateModel(email=f"ord2-{uuid4().hex}@contract-tests.com", full_name="Ord Second", created_by=creator)
    db_session.add(c2)
    await db_session.flush()
    await db_session.execute(
        sa.update(CandidateModel)
        .where(CandidateModel.id == c2.id)
        .values(created_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
    )
    await db_session.commit()

    resp = await client.get(ENDPOINT, headers=headers, params={"page_size": 100})
    assert resp.status_code == 200
    items = resp.json()["data"]
    ids = [item["id"] for item in items]
    assert ids.index(str(c2.id)) < ids.index(str(c1.id)), "Newer candidate should appear before older"
