from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.skill_resolver_service import SkillResolverService
from src.application.services.skill_text_normalizer import normalize_skill_name
from src.infrastructure.database.models.job_model import SkillAliasModel, SkillModel
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


@pytest.mark.asyncio
async def test_resolve_skill_exact_match(db_session: AsyncSession) -> None:
    skill = await _create_skill(db_session, name="Power BI")
    service = SkillResolverService(SQLAlchemySkillRepository(db_session))

    resolved = await service.resolve_skill(" power-bi ")

    assert resolved is not None
    assert resolved["skill_id"] == skill.id
    assert resolved["canonical_name"] == "Power BI"
    assert resolved["matched_by"] == "exact"
    assert resolved["raw_value"] == " power-bi "
    assert resolved["normalized_value"] == "power bi"


@pytest.mark.asyncio
async def test_resolve_skill_alias_match(db_session: AsyncSession) -> None:
    skill = await _create_skill(db_session, name="SQL Server", normalized_name="sql server")
    await _create_alias(db_session, skill_id=skill.id, alias_name="MSSQL", alias_type="abbreviation")
    service = SkillResolverService(SQLAlchemySkillRepository(db_session))

    resolved = await service.resolve_skill("mssql")

    assert resolved is not None
    assert resolved["skill_id"] == skill.id
    assert resolved["canonical_name"] == "SQL Server"
    assert resolved["matched_by"] == "alias"


@pytest.mark.asyncio
async def test_resolve_skill_returns_none_for_unknown_skill(db_session: AsyncSession) -> None:
    service = SkillResolverService(SQLAlchemySkillRepository(db_session))

    resolved = await service.resolve_skill("Skill Inexistente")

    assert resolved is None


@pytest.mark.asyncio
async def test_resolve_many_removes_duplicates_and_ignores_empty(db_session: AsyncSession) -> None:
    power_bi = await _create_skill(db_session, name="Power BI")
    sql_server = await _create_skill(db_session, name="SQL Server", normalized_name="sql server")
    await _create_alias(db_session, skill_id=sql_server.id, alias_name="MSSQL", alias_type="abbreviation")
    service = SkillResolverService(SQLAlchemySkillRepository(db_session))

    resolved = await service.resolve_many(
        ["Power BI", " power-bi ", "", "   ", "MSSQL", "mssql", "Desconhecida"]
    )

    assert len(resolved) == 2
    assert [item["skill_id"] for item in resolved] == [power_bi.id, sql_server.id]
    assert resolved[0]["raw_value"] == "Power BI"
    assert resolved[1]["raw_value"] == "MSSQL"


@pytest.mark.asyncio
async def test_repository_alias_lookup_only_uses_active_aliases(db_session: AsyncSession) -> None:
    skill = await _create_skill(db_session, name="PostgreSQL", normalized_name="postgresql")
    await _create_alias(db_session, skill_id=skill.id, alias_name="Postgres", is_active=False)
    repository = SQLAlchemySkillRepository(db_session)

    found = await repository.find_active_by_alias_normalized_name("postgres")

    assert found is None


@pytest.mark.asyncio
async def test_resolver_works_with_legacy_normalized_name_in_skills(db_session: AsyncSession) -> None:
    skill = await _create_skill(db_session, name="Power-BI", normalized_name="power-bi")
    service = SkillResolverService(SQLAlchemySkillRepository(db_session))

    resolved = await service.resolve_skill("Power BI")

    assert resolved is not None
    assert resolved["skill_id"] == skill.id
    assert resolved["matched_by"] == "exact"

    stored = await db_session.scalar(
        sa.select(SkillModel).where(SkillModel.id == skill.id)
    )
    assert stored is not None
