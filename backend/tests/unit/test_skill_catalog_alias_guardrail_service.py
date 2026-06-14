from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.application.services.skill_catalog_runtime_service import (
    SkillCatalogAliasGuardrailService,
)


class FakeSkillCatalogRepository:
    def __init__(self) -> None:
        self.skills: list[SimpleNamespace] = []
        self.aliases: list[SimpleNamespace] = []

    async def list_skills_by_normalized_names(
        self,
        normalized_names: list[str],
        *,
        exclude_skill_id=None,
    ) -> list[SimpleNamespace]:
        names = set(normalized_names)
        return [
            skill
            for skill in self.skills
            if skill.normalized_name in names and skill.id != exclude_skill_id
        ]

    async def list_aliases_by_normalized_values(
        self,
        normalized_aliases: list[str],
        *,
        exclude_skill_id=None,
    ) -> list[SimpleNamespace]:
        names = set(normalized_aliases)
        return [
            alias
            for alias in self.aliases
            if alias.normalized_alias in names and alias.skill_id != exclude_skill_id
        ]


def _skill(name: str, *, normalized_name: str | None = None, skill_id=None) -> SimpleNamespace:
    return SimpleNamespace(
        id=skill_id or uuid4(),
        name=name,
        normalized_name=normalized_name or name.strip().lower(),
    )


def _alias(alias: str, skill: SimpleNamespace, *, normalized_alias: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        alias=alias,
        normalized_alias=normalized_alias or alias.strip().lower(),
        skill_id=skill.id,
        skill=skill,
    )


@pytest.mark.asyncio
async def test_blocks_when_canonical_matches_existing_canonical() -> None:
    repository = FakeSkillCatalogRepository()
    repository.skills.append(_skill("Python", normalized_name="python"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="PYTHON",
        aliases=[],
    )

    assert result.allowed is False
    assert {item.type for item in result.conflicts} == {"canonical_already_exists"}


@pytest.mark.asyncio
async def test_blocks_when_canonical_matches_existing_alias() -> None:
    repository = FakeSkillCatalogRepository()
    skill = _skill("Engenharia de Dados", normalized_name="engenharia de dados")
    repository.aliases.append(_alias("Python", skill, normalized_alias="python"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Python",
        aliases=[],
    )

    assert result.allowed is False
    assert {item.type for item in result.conflicts} == {"canonical_matches_existing_alias"}


@pytest.mark.asyncio
async def test_blocks_when_alias_matches_existing_canonical() -> None:
    repository = FakeSkillCatalogRepository()
    repository.skills.append(_skill("Backend", normalized_name="backend"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Python Platform",
        aliases=["backend"],
    )

    assert result.allowed is False
    assert {item.type for item in result.conflicts} == {"alias_matches_existing_canonical"}


@pytest.mark.asyncio
async def test_blocks_when_alias_matches_existing_alias() -> None:
    repository = FakeSkillCatalogRepository()
    skill = _skill("Cloud", normalized_name="cloud")
    repository.aliases.append(_alias("AWS", skill, normalized_alias="aws"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Amazon Platform",
        aliases=["aws"],
    )

    assert result.allowed is False
    assert {item.type for item in result.conflicts} == {"alias_already_exists"}


@pytest.mark.asyncio
async def test_warns_when_aliases_are_duplicated_or_same_as_canonical() -> None:
    repository = FakeSkillCatalogRepository()

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Power BI",
        aliases=["power_bi", "Power-BI", "  ", "Dashboard"],
    )

    assert result.allowed is True
    assert result.normalized_aliases == ("dashboard",)
    assert {item.type for item in result.warnings} == {
        "alias_same_as_canonical",
        "empty_or_invalid_name",
    }


@pytest.mark.asyncio
async def test_normalizes_accents_case_hyphen_and_underscore() -> None:
    repository = FakeSkillCatalogRepository()

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="  Análise_de-Dados  ",
        aliases=["Machine_Learning-Avançado"],
    )

    assert result.allowed is True
    assert result.normalized_canonical == "analise de dados"
    assert result.normalized_aliases == ("machine learning avancado",)


@pytest.mark.asyncio
async def test_edit_mode_ignores_current_skill_conflicts() -> None:
    repository = FakeSkillCatalogRepository()
    skill = _skill("Python", normalized_name="python")
    repository.skills.append(skill)
    repository.aliases.append(_alias("Py", skill, normalized_alias="py"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Python",
        aliases=["Py"],
        current_skill_id=skill.id,
    )

    assert result.allowed is True
    assert result.conflicts == ()
    assert {item.type for item in result.warnings} == {"ambiguous_macro_skill"}


@pytest.mark.asyncio
async def test_returns_macro_skill_warning_without_blocking() -> None:
    repository = FakeSkillCatalogRepository()

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Backend",
        aliases=["APIs internas"],
    )

    assert result.allowed is True
    assert any(item.type == "ambiguous_macro_skill" for item in result.warnings)


@pytest.mark.asyncio
async def test_returns_allowed_true_for_valid_input() -> None:
    repository = FakeSkillCatalogRepository()
    repository.skills.append(_skill("Python", normalized_name="python"))
    repository.aliases.append(_alias("Py", repository.skills[0], normalized_alias="py"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="FastAPI",
        aliases=["Starlette Framework"],
        source="ai_suggestion",
    )

    assert result.allowed is True
    assert result.source == "ai_suggestion"
    assert result.conflicts == ()


@pytest.mark.asyncio
async def test_returns_allowed_false_when_multiple_conflicts_exist() -> None:
    repository = FakeSkillCatalogRepository()
    python_skill = _skill("Python", normalized_name="python")
    backend_skill = _skill("Backend", normalized_name="backend")
    repository.skills.extend([python_skill, backend_skill])
    repository.aliases.append(_alias("Py", python_skill, normalized_alias="py"))

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="Py",
        aliases=["Backend"],
    )

    assert result.allowed is False
    assert {item.type for item in result.conflicts} == {
        "canonical_matches_existing_alias",
        "alias_matches_existing_canonical",
    }


@pytest.mark.asyncio
async def test_rejects_empty_canonical_name() -> None:
    repository = FakeSkillCatalogRepository()

    result = await SkillCatalogAliasGuardrailService(repository).validate(
        canonical_name="   ",
        aliases=["Python"],
    )

    assert result.allowed is False
    assert any(item.type == "empty_or_invalid_name" for item in result.conflicts)
