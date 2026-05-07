from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.skill_evidence_service import SkillEvidenceService
from src.application.services.skill_text_normalizer import normalize_skill_name
from src.infrastructure.database.models.job_model import (
    SkillAliasModel,
    SkillEquivalenceModel,
    SkillModel,
)
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository


async def _create_skill(
    session: AsyncSession,
    *,
    name: str,
    normalized_name: str | None = None,
) -> SkillModel:
    skill = SkillModel(
        id=uuid4(),
        name=name,
        normalized_name=normalized_name or normalize_skill_name(name),
        category="Tecnologia",
        aliases=[],
        is_verified=True,
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


async def _create_alias(
    session: AsyncSession,
    *,
    skill_id,
    alias_name: str,
    alias_type: str = "synonym",
    is_active: bool = True,
) -> SkillAliasModel:
    alias = SkillAliasModel(
        id=uuid4(),
        skill_id=skill_id,
        alias_name=alias_name,
        alias_normalized=normalize_skill_name(alias_name),
        alias_type=alias_type,
        is_active=is_active,
    )
    session.add(alias)
    await session.commit()
    await session.refresh(alias)
    return alias


async def _create_equivalence(
    session: AsyncSession,
    *,
    source_skill_id,
    target_skill_id,
    strength: str,
    score: int,
    direction: str = "source_to_target",
    context: str | None = None,
    reason: str,
    is_active: bool = True,
) -> SkillEquivalenceModel:
    row = SkillEquivalenceModel(
        id=uuid4(),
        source_skill_id=source_skill_id,
        target_skill_id=target_skill_id,
        strength=strength,
        score=score,
        direction=direction,
        context=context,
        reason=reason,
        is_active=is_active,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@pytest.mark.asyncio
async def test_skill_evidence_exact_match(db_session: AsyncSession) -> None:
    sql = await _create_skill(db_session, name="SQL")
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["SQL"], "SQL")

    assert evidence["required_skill_id"] == sql.id
    assert evidence["matched_skill_id"] == sql.id
    assert evidence["score"] == 100
    assert evidence["match_type"] == "exact"
    assert evidence["strength"] == "exact"


@pytest.mark.asyncio
async def test_skill_evidence_alias_match_scores_95(db_session: AsyncSession) -> None:
    sql = await _create_skill(db_session, name="SQL")
    await _create_alias(db_session, skill_id=sql.id, alias_name="PostgreSQL")
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["PostgreSQL"], "SQL")

    assert evidence["required_skill_id"] == sql.id
    assert evidence["matched_skill_id"] == sql.id
    assert evidence["score"] == 95
    assert evidence["match_type"] == "alias"
    assert evidence["strength"] == "exact"


@pytest.mark.asyncio
async def test_skill_evidence_strong_equivalence(db_session: AsyncSession) -> None:
    postgresql = await _create_skill(db_session, name="PostgreSQL")
    sql = await _create_skill(db_session, name="SQL")
    await _create_equivalence(
        db_session,
        source_skill_id=postgresql.id,
        target_skill_id=sql.id,
        strength="strong",
        score=90,
        reason="Banco relacional compatível para consultas SQL.",
    )
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["PostgreSQL"], "SQL")

    assert evidence["matched_skill_id"] == postgresql.id
    assert evidence["required_skill_id"] == sql.id
    assert evidence["score"] == 90
    assert evidence["match_type"] == "strong_equivalence"
    assert evidence["strength"] == "strong"


@pytest.mark.asyncio
async def test_skill_evidence_partial_equivalence(db_session: AsyncSession) -> None:
    sap = await _create_skill(db_session, name="SAP")
    erp = await _create_skill(db_session, name="ERP")
    await _create_equivalence(
        db_session,
        source_skill_id=sap.id,
        target_skill_id=erp.id,
        strength="partial",
        score=60,
        reason="SAP cobre parte relevante de um ERP corporativo.",
    )
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["SAP"], "ERP")

    assert evidence["score"] == 60
    assert evidence["match_type"] == "partial_equivalence"
    assert evidence["strength"] == "partial"


@pytest.mark.asyncio
async def test_skill_evidence_weak_equivalence(db_session: AsyncSession) -> None:
    protheus = await _create_skill(db_session, name="Protheus")
    sap_mm = await _create_skill(db_session, name="SAP MM")
    await _create_equivalence(
        db_session,
        source_skill_id=protheus.id,
        target_skill_id=sap_mm.id,
        strength="weak",
        score=20,
        reason="Ambos atuam em contexto ERP, mas não são substitutos diretos.",
    )
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["Protheus"], "SAP MM")

    assert evidence["score"] == 20
    assert evidence["match_type"] == "weak_equivalence"
    assert evidence["strength"] == "weak"


@pytest.mark.asyncio
async def test_skill_evidence_returns_none_when_no_evidence(db_session: AsyncSession) -> None:
    await _create_skill(db_session, name="Excel")
    python = await _create_skill(db_session, name="Python")
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["Excel"], "Python")

    assert evidence["required_skill_id"] == python.id
    assert evidence["matched_skill"] is None
    assert evidence["score"] == 0
    assert evidence["match_type"] == "none"


@pytest.mark.asyncio
async def test_skill_evidence_returns_none_when_required_skill_not_in_catalog(
    db_session: AsyncSession,
) -> None:
    await _create_skill(db_session, name="SQL")
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["SQL"], "Ferramenta Inventada")

    assert evidence["required_skill_id"] is None
    assert evidence["matched_skill"] is None
    assert evidence["score"] == 0
    assert evidence["reason"] == "Skill exigida não encontrada no catálogo."


@pytest.mark.asyncio
async def test_skill_evidence_does_not_allow_transitive_equivalence(
    db_session: AsyncSession,
) -> None:
    protheus = await _create_skill(db_session, name="Protheus")
    erp = await _create_skill(db_session, name="ERP")
    sap = await _create_skill(db_session, name="SAP")
    await _create_equivalence(
        db_session,
        source_skill_id=protheus.id,
        target_skill_id=erp.id,
        strength="strong",
        score=80,
        reason="Protheus é um ERP.",
    )
    await _create_equivalence(
        db_session,
        source_skill_id=erp.id,
        target_skill_id=sap.id,
        strength="partial",
        score=60,
        reason="ERP genérico cobre parte do contexto SAP.",
    )
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["Protheus"], "SAP")

    assert evidence["score"] == 0
    assert evidence["match_type"] == "none"


@pytest.mark.asyncio
async def test_skill_evidence_context_uses_matching_context_then_null_fallback(
    db_session: AsyncSession,
) -> None:
    postgresql = await _create_skill(db_session, name="PostgreSQL")
    sql = await _create_skill(db_session, name="SQL")
    await _create_equivalence(
        db_session,
        source_skill_id=postgresql.id,
        target_skill_id=sql.id,
        strength="strong",
        score=99,
        context="erp",
        reason="Equivalência específica de ERP.",
    )
    await _create_equivalence(
        db_session,
        source_skill_id=postgresql.id,
        target_skill_id=sql.id,
        strength="strong",
        score=70,
        context=None,
        reason="Equivalência genérica.",
    )
    await _create_equivalence(
        db_session,
        source_skill_id=postgresql.id,
        target_skill_id=sql.id,
        strength="strong",
        score=90,
        context="data",
        reason="Equivalência específica de dados.",
    )
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence_data = await service.resolve_skill_evidence(["PostgreSQL"], "SQL", context="data")
    evidence_ops = await service.resolve_skill_evidence(["PostgreSQL"], "SQL", context="ops")

    assert evidence_data["score"] == 90
    assert evidence_data["context"] == "data"
    assert evidence_ops["score"] == 70
    assert evidence_ops["context"] is None


@pytest.mark.asyncio
async def test_skill_evidence_chooses_best_evidence(db_session: AsyncSession) -> None:
    protheus = await _create_skill(db_session, name="Protheus")
    sap = await _create_skill(db_session, name="SAP")
    sap_mm = await _create_skill(db_session, name="SAP MM")
    await _create_equivalence(
        db_session,
        source_skill_id=protheus.id,
        target_skill_id=sap_mm.id,
        strength="weak",
        score=20,
        reason="Cobertura limitada.",
    )
    await _create_equivalence(
        db_session,
        source_skill_id=sap.id,
        target_skill_id=sap_mm.id,
        strength="partial",
        score=60,
        reason="SAP cobre melhor o módulo MM.",
    )
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    evidence = await service.resolve_skill_evidence(["Protheus", "SAP"], "SAP MM")

    assert evidence["matched_skill"] == "SAP"
    assert evidence["matched_skill_id"] == sap.id
    assert evidence["score"] == 60
    assert evidence["match_type"] == "partial_equivalence"


@pytest.mark.asyncio
async def test_resolve_job_skill_evidences_preserves_required_skill_order(
    db_session: AsyncSession,
) -> None:
    sql = await _create_skill(db_session, name="SQL")
    python = await _create_skill(db_session, name="Python")
    service = SkillEvidenceService(SQLAlchemySkillRepository(db_session))

    results = await service.resolve_job_skill_evidences(["Python", "SQL"], ["Python", "SQL"])

    assert [item["required_skill"] for item in results] == ["Python", "SQL"]
    assert [item["required_skill_id"] for item in results] == [python.id, sql.id]
