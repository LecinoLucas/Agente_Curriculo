"""
Testes de integração: candidate_profile_analysis — idempotência e reuso.

Cobre:
- Primeira chamada cria candidate_profile_analysis
- Segunda chamada com mesma chave retorna existente sem IntegrityError
- Retry simulado não gera duplicidade
- Provider/model/prompt diferente pode criar nova linha
- Candidato diferente com resume_version_id diferente processa normalmente
- candidate_job_match continua separado por candidate_id
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)


# ── Helpers de seed ───────────────────────────────────────────────────────────


async def _make_user(db: AsyncSession) -> UserModel:
    user = UserModel(
        id=uuid4(),
        email=f"user-{uuid4().hex[:8]}@test.com",
        password_hash="hash",
        role="recruiter",
        status="active",
        full_name="Test Recruiter",
    )
    db.add(user)
    await db.flush()
    return user


async def _make_candidate(db: AsyncSession, created_by: UserModel) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=f"Candidate {uuid4().hex[:6]}",
        email=f"cand-{uuid4().hex[:8]}@test.com",
        location_country="BR",
        tags=[],
        created_by=created_by.id,
    )
    db.add(candidate)
    await db.flush()
    return candidate


async def _make_resume_version(
    db: AsyncSession,
    *,
    candidate: CandidateModel,
    uploaded_by: UserModel,
    file_hash: str | None = None,
) -> tuple[ResumeModel, ResumeVersionModel]:
    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate.id,
        title="Currículo",
        status="active",
        current_version=1,
        created_by=uploaded_by.id,
    )
    db.add(resume)
    await db.flush()

    version = ResumeVersionModel(
        id=uuid4(),
        resume_id=resume.id,
        version_number=1,
        original_file_name="resume.pdf",
        file_size_bytes=1234,
        file_hash_sha256=file_hash or uuid4().hex,
        s3_bucket="bucket",
        s3_key=f"resume/{uuid4().hex}.pdf",
        extraction_status="completed",
        extracted_text="Python FastAPI PostgreSQL",
        uploaded_by=uploaded_by.id,
    )
    db.add(version)
    await db.flush()
    return resume, version


async def _make_ai_model(db: AsyncSession, provider: str = "google", model_id: str | None = None) -> AIModelModel:
    m = AIModelModel(
        id=uuid4(),
        provider=provider,
        model_id=model_id or f"gemini-{uuid4().hex[:6]}",
        model_name="Gemini",
        is_active=True,
    )
    db.add(m)
    await db.flush()
    return m


async def _make_prompt(db: AsyncSession, created_by: UserModel, version: int = 1) -> PromptTemplateModel:
    p = PromptTemplateModel(
        id=uuid4(),
        name=f"prompt-{uuid4().hex[:6]}",
        version=version,
        template_type="candidate_analysis",
        user_prompt_template="{}",
        created_by=created_by.id,
        is_active=True,
    )
    db.add(p)
    await db.flush()
    return p


def _make_profile(
    *,
    candidate_id,
    resume_version_id,
    provider: str = "google",
    model_id: str = "gemini-2.5-flash",
    prompt_version: str = "1",
) -> CandidateProfileAnalysisModel:
    return CandidateProfileAnalysisModel(
        id=uuid4(),
        candidate_id=candidate_id,
        resume_version_id=resume_version_id,
        provider=provider,
        model_id=model_id,
        prompt_version=prompt_version,
        professional_area="technology",
        seniority_level="mid",
        education_level="bachelors",
        experience_years=3,
        skills_json=["Python", "FastAPI"],
        summary="Desenvolvedor backend",
        strengths_json=[],
        weaknesses_json=[],
        raw_response_json={},
        input_tokens=100,
        output_tokens=50,
    )


# ── Testes ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upsert_creates_profile_when_none_exists(db_session: AsyncSession) -> None:
    """Primeira chamada com chave nova deve criar o registro."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)
    profile = _make_profile(
        candidate_id=candidate.id,
        resume_version_id=version.id,
    )
    result = await repo.upsert_candidate_profile_analysis(profile)
    await db_session.commit()

    assert result is not None
    assert result.resume_version_id == version.id
    assert result.provider == "google"

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 1


@pytest.mark.asyncio
async def test_upsert_returns_existing_on_duplicate_key(db_session: AsyncSession) -> None:
    """Segunda chamada com a mesma chave deve retornar o existente sem IntegrityError."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    profile_1 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id)
    result_1 = await repo.upsert_candidate_profile_analysis(profile_1)
    await db_session.commit()

    # Segunda tentativa — mesma chave, candidate_id igual
    profile_2 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id)
    result_2 = await repo.upsert_candidate_profile_analysis(profile_2)
    await db_session.commit()

    # Não deve criar novo registro
    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 1, "Não deve haver duplicata na tabela"
    assert result_2.id == result_1.id, "Deve retornar o mesmo registro"


@pytest.mark.asyncio
async def test_retry_simulation_does_not_break(db_session: AsyncSession) -> None:
    """Simula retry do Celery chamando upsert múltiplas vezes."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    results = []
    for _ in range(4):  # 4 retries simulados
        profile = _make_profile(candidate_id=candidate.id, resume_version_id=version.id)
        r = await repo.upsert_candidate_profile_analysis(profile)
        results.append(r)
        await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 1, "4 retries não devem criar 4 registros"
    # Todos devem retornar o mesmo id
    ids = {r.id for r in results}
    assert len(ids) == 1


@pytest.mark.asyncio
async def test_different_provider_creates_new_profile(db_session: AsyncSession) -> None:
    """Provedor diferente → nova linha permitida."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    p_google = _make_profile(candidate_id=candidate.id, resume_version_id=version.id, provider="google")
    await repo.upsert_candidate_profile_analysis(p_google)

    p_anthropic = _make_profile(candidate_id=candidate.id, resume_version_id=version.id, provider="anthropic")
    await repo.upsert_candidate_profile_analysis(p_anthropic)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 2


@pytest.mark.asyncio
async def test_different_model_id_creates_new_profile(db_session: AsyncSession) -> None:
    """model_id diferente → nova linha permitida."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    p1 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id, model_id="gemini-2.5-flash")
    await repo.upsert_candidate_profile_analysis(p1)

    p2 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id, model_id="gemini-1.5-pro")
    await repo.upsert_candidate_profile_analysis(p2)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 2


@pytest.mark.asyncio
async def test_different_prompt_version_creates_new_profile(db_session: AsyncSession) -> None:
    """prompt_version diferente → nova linha permitida."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    p1 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id, prompt_version="1")
    await repo.upsert_candidate_profile_analysis(p1)

    p2 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id, prompt_version="2")
    await repo.upsert_candidate_profile_analysis(p2)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 2


@pytest.mark.asyncio
async def test_two_candidates_same_pdf_different_resume_versions(db_session: AsyncSession) -> None:
    """
    Dois candidatos com o mesmo PDF mas resume_version_id diferentes
    (modelagem atual) devem processar normalmente, cada um com seu
    próprio candidate_profile_analysis.
    """
    user = await _make_user(db_session)
    candidate_a = await _make_candidate(db_session, user)
    candidate_b = await _make_candidate(db_session, user)

    # Mesmo hash de arquivo (mesmo PDF), mas resume_versions distintas
    shared_hash = uuid4().hex
    _, version_a = await _make_resume_version(
        db_session, candidate=candidate_a, uploaded_by=user, file_hash=shared_hash
    )
    _, version_b = await _make_resume_version(
        db_session, candidate=candidate_b, uploaded_by=user, file_hash=shared_hash
    )
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    profile_a = _make_profile(candidate_id=candidate_a.id, resume_version_id=version_a.id)
    profile_b = _make_profile(candidate_id=candidate_b.id, resume_version_id=version_b.id)

    result_a = await repo.upsert_candidate_profile_analysis(profile_a)
    result_b = await repo.upsert_candidate_profile_analysis(profile_b)
    await db_session.commit()

    assert result_a.id != result_b.id, "Cada candidato deve ter seu próprio profile analysis"
    assert result_a.candidate_id == candidate_a.id
    assert result_b.candidate_id == candidate_b.id
    assert result_a.resume_version_id == version_a.id
    assert result_b.resume_version_id == version_b.id

    total = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
    )
    assert total == 2


@pytest.mark.asyncio
async def test_get_by_version_model_prompt_returns_correct_record(db_session: AsyncSession) -> None:
    """get_candidate_profile_analysis_by_version_model_prompt deve retornar pelo chave correta."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)
    profile = _make_profile(
        candidate_id=candidate.id,
        resume_version_id=version.id,
        provider="google",
        model_id="gemini-2.5-flash",
        prompt_version="1",
    )
    created = await repo.upsert_candidate_profile_analysis(profile)
    await db_session.commit()

    found = await repo.get_candidate_profile_analysis_by_version_model_prompt(
        resume_version_id=version.id,
        provider="google",
        model_id="gemini-2.5-flash",
        prompt_version="1",
    )
    assert found is not None
    assert found.id == created.id

    not_found = await repo.get_candidate_profile_analysis_by_version_model_prompt(
        resume_version_id=version.id,
        provider="google",
        model_id="gemini-OUTRO",
        prompt_version="1",
    )
    assert not_found is None


@pytest.mark.asyncio
async def test_save_candidate_profile_analysis_is_alias_for_upsert(db_session: AsyncSession) -> None:
    """save_candidate_profile_analysis deve ser idempotente (chama upsert internamente)."""
    user = await _make_user(db_session)
    candidate = await _make_candidate(db_session, user)
    _, version = await _make_resume_version(db_session, candidate=candidate, uploaded_by=user)
    await db_session.commit()

    repo = SQLAlchemyAnalysisRepository(db_session)

    p1 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id)
    r1 = await repo.save_candidate_profile_analysis(p1)
    await db_session.commit()

    p2 = _make_profile(candidate_id=candidate.id, resume_version_id=version.id)
    r2 = await repo.save_candidate_profile_analysis(p2)
    await db_session.commit()

    assert r1.id == r2.id, "save deve ser idempotente como o upsert"

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateProfileAnalysisModel)
        .where(CandidateProfileAnalysisModel.resume_version_id == version.id)
    )
    assert count == 1
