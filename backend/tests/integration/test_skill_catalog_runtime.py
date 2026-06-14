from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.application.services.skill_catalog_comparison_service import (
    SkillCatalogComparisonService,
)
from src.application.services.skill_equivalence_service import SkillEquivalenceService
from src.application.services.skill_catalog_runtime_service import (
    SkillCatalogAliasGuardrailService,
    SkillCatalogRuntimeService,
)
from src.application.services.skill_catalog_sync_service import SkillCatalogSyncService
from src.infrastructure.database.models.skill_catalog_model import (
    SkillAliasModel,
    SkillCatalogModel,
    SkillRelationModel,
)
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (
    SQLAlchemySkillCatalogRepository,
)

pytestmark = pytest.mark.asyncio


class CountingSkillCatalogRepository(SQLAlchemySkillCatalogRepository):
    def __init__(self, session: AsyncSession):
        super().__init__(session)
        self.runtime_calls = 0

    async def list_runtime_skills(self, *, include_inactive: bool = False):
        self.runtime_calls += 1
        return await super().list_runtime_skills(include_inactive=include_inactive)


def _write_catalog(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


async def test_runtime_service_loads_alias_map_metadata_and_relations_and_ignores_archived_and_inactive_by_default(
    db_session: AsyncSession,
) -> None:
    active_skill = SkillCatalogModel(
        name="Python",
        normalized_name="python",
        is_active=True,
        domains=["Backend", "Dados"],
        default_strength="strong",
        catalog_type="hard_skill",
    )
    inactive_skill = SkillCatalogModel(name="Cobol", normalized_name="cobol", is_active=False)
    archived_skill = SkillCatalogModel(
        name="Oracle",
        normalized_name="oracle",
        is_active=False,
        archived_at=datetime.now(timezone.utc),
    )
    db_session.add_all([active_skill, inactive_skill, archived_skill])
    await db_session.flush()

    db_session.add_all(
        [
            SkillAliasModel(skill_id=active_skill.id, alias="Py", normalized_alias="py"),
            SkillAliasModel(
                skill_id=inactive_skill.id,
                alias="Cobol Legacy",
                normalized_alias="cobol legacy",
            ),
            SkillAliasModel(
                skill_id=archived_skill.id,
                alias="Oracle DB",
                normalized_alias="oracle db",
            ),
            SkillRelationModel(
                source_skill_id=active_skill.id,
                source_name="Backend",
                normalized_source_name="backend",
                target_name="Python",
                normalized_target_name="python",
                target_skill_id=active_skill.id,
                strength="strong",
                score=0.85,
                reason="Linguagem central para trilhas backend no legado.",
            ),
        ]
    )
    await db_session.commit()

    service = SkillCatalogRuntimeService(
        SQLAlchemySkillCatalogRepository(db_session),
        ttl_seconds=300,
    )

    snapshot = await service.get_runtime_snapshot()
    alias_map = await service.get_skill_equivalence_map_from_db()
    legacy_catalog = await service.get_legacy_compatible_catalog()

    assert snapshot.total_skills == 1
    assert snapshot.total_aliases == 1
    assert snapshot.total_relations == 1
    assert alias_map == {"Python": ["Py"]}
    assert legacy_catalog["groups"] == [
        {
            "canonical": "Python",
            "aliases": ["Py"],
            "domain": ["Backend", "Dados"],
            "type": "hard_skill",
            "strength": "strong",
        }
    ]
    assert legacy_catalog["relations"] == [
        {
            "from": "Backend",
            "to": "Python",
            "type": None,
            "strength": "strong",
            "score": 0.85,
            "reason": "Linguagem central para trilhas backend no legado.",
        }
    ]


async def test_runtime_service_uses_cache_within_ttl_and_refreshes_after_expiration(
    db_session: AsyncSession,
) -> None:
    skill = SkillCatalogModel(name="Python", normalized_name="python", is_active=True)
    db_session.add(skill)
    await db_session.flush()
    db_session.add(SkillAliasModel(skill_id=skill.id, alias="Py", normalized_alias="py"))
    await db_session.commit()

    now = [100.0]
    repository = CountingSkillCatalogRepository(db_session)
    service = SkillCatalogRuntimeService(
        repository,
        ttl_seconds=300,
        clock=lambda: now[0],
    )

    first = await service.get_runtime_snapshot()
    second = await service.get_runtime_snapshot()
    assert first.total_skills == second.total_skills == 1
    assert repository.runtime_calls == 1

    now[0] = 401.0
    await service.get_runtime_snapshot()
    assert repository.runtime_calls == 2

    service.invalidate_skill_catalog_cache()
    await service.get_runtime_snapshot()
    assert repository.runtime_calls == 3


async def test_sync_creates_missing_skills_aliases_metadata_and_is_idempotent(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    catalog = {
        "groups": [
            {
                "canonical": "Python",
                "aliases": ["Py", "Python 3"],
                "domain": ["Backend", "Dados"],
                "type": "hard_skill",
                "strength": "strong",
            }
        ],
        "relations": [],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)

    repository = SQLAlchemySkillCatalogRepository(db_session)
    service = SkillCatalogSyncService(repository)

    first = await service.sync_catalog(service.load_catalog(json_path))
    await db_session.commit()
    second = await service.sync_catalog(service.load_catalog(json_path))
    await db_session.commit()

    skill = await repository.find_by_normalized_name("python")
    assert skill is not None
    assert first.skills_created == 1
    assert first.aliases_created == 2
    assert first.skills_updated == 0
    assert first.relations_created == 0
    assert second.skills_created == 0
    assert second.skills_updated == 0
    assert second.aliases_created == 0
    assert second.aliases_existing == 2
    assert second.relations_created == 0
    assert skill.domains == ["Backend", "Dados"]
    assert skill.default_strength == "strong"
    assert skill.catalog_type == "hard_skill"


async def test_sync_creates_relations_and_preserves_alias_is_legacy_canonical_conflict(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    catalog = {
        "groups": [
            {
                "canonical": "Backend",
                "aliases": ["Python"],
                "domain": ["Tecnologia"],
                "type": "macro_skill",
                "strength": "partial",
            },
            {
                "canonical": "Python",
                "aliases": ["Py"],
                "domain": ["Backend"],
                "type": "hard_skill",
                "strength": "strong",
            },
        ],
        "relations": [
            {
                "from": "Backend",
                "to": "Python",
                "strength": "strong",
                "score": 0.85,
                "reason": "Python representa uma skill específica do grupo Backend.",
            }
        ],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)

    repository = SQLAlchemySkillCatalogRepository(db_session)
    sync_service = SkillCatalogSyncService(repository)
    result = await sync_service.sync_catalog(sync_service.load_catalog(json_path))
    await db_session.commit()

    backend_skill = await repository.find_by_normalized_name("backend")
    python_skill = await repository.find_by_normalized_name("python")
    relation = await repository.find_relation(
        normalized_source_name="backend",
        normalized_target_name="python",
        relation_type=None,
    )

    assert backend_skill is not None
    assert python_skill is not None
    assert relation is not None
    assert relation.source_skill_id == backend_skill.id
    assert relation.target_skill_id == python_skill.id
    assert result.skills_created == 2
    assert result.aliases_created == 1
    assert result.relations_created == 1
    assert any(
        item.type == "alias_is_legacy_canonical_skill"
        and item.alias == "Python"
        and item.db_skill == "Python"
        for item in result.conflicts
    )


async def test_guardrail_service_detects_runtime_collisions_without_writing(
    db_session: AsyncSession,
) -> None:
    skill = SkillCatalogModel(name="Python", normalized_name="python", is_active=True)
    db_session.add(skill)
    await db_session.flush()
    db_session.add(
        SkillAliasModel(
            skill_id=skill.id,
            alias="Py",
            normalized_alias="py",
        )
    )
    await db_session.commit()

    repository = SQLAlchemySkillCatalogRepository(db_session)
    service = SkillCatalogAliasGuardrailService(repository)

    skills_before = len(await repository.list_runtime_skills(include_inactive=True))
    aliases_before = sum(len(item.aliases) for item in await repository.list_runtime_skills(include_inactive=True))

    result = await service.validate(
        canonical_name="Py",
        aliases=["Python"],
        source="admin",
    )

    skills_after_models = await repository.list_runtime_skills(include_inactive=True)
    skills_after = len(skills_after_models)
    aliases_after = sum(len(item.aliases) for item in skills_after_models)

    assert result.allowed is False
    assert {item.type for item in result.conflicts} == {
        "canonical_matches_existing_alias",
        "alias_matches_existing_canonical",
    }
    assert result.source == "admin"
    assert skills_before == skills_after == 1
    assert aliases_before == aliases_after == 1


async def test_guardrail_service_allows_self_edit_and_ignores_self_collisions(
    db_session: AsyncSession,
) -> None:
    skill = SkillCatalogModel(name="Power BI", normalized_name="power bi", is_active=True)
    db_session.add(skill)
    await db_session.flush()
    db_session.add(
        SkillAliasModel(
            skill_id=skill.id,
            alias="PBI",
            normalized_alias="pbi",
        )
    )
    await db_session.commit()

    repository = SQLAlchemySkillCatalogRepository(db_session)
    service = SkillCatalogAliasGuardrailService(repository)

    result = await service.validate(
        canonical_name="Power-BI",
        aliases=["PBI", "power_bi"],
        current_skill_id=skill.id,
    )

    assert result.allowed is True
    assert result.conflicts == ()
    assert any(item.type == "alias_same_as_canonical" for item in result.warnings)


async def test_sync_reassigns_known_inverted_aliases_to_expected_canonical_skill(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    javascript = SkillCatalogModel(name="JavaScript", normalized_name="javascript", is_active=True)
    typescript = SkillCatalogModel(name="TypeScript", normalized_name="typescript", is_active=True)
    observability = SkillCatalogModel(name="Observability", normalized_name="observability", is_active=True)
    monitoring = SkillCatalogModel(name="monitoring", normalized_name="monitoring", is_active=True)
    db_session.add_all([javascript, typescript, observability, monitoring])
    await db_session.flush()
    db_session.add_all(
        [
            SkillAliasModel(skill_id=javascript.id, alias="TS", normalized_alias="ts"),
            SkillAliasModel(
                skill_id=observability.id,
                alias="monitoramento",
                normalized_alias="monitoramento",
            ),
        ]
    )
    await db_session.commit()

    catalog = {
        "groups": [
            {"canonical": "TypeScript", "aliases": ["TS"]},
            {"canonical": "monitoring", "aliases": ["monitoramento"]},
        ],
        "relations": [],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)

    repository = SQLAlchemySkillCatalogRepository(db_session)
    sync_service = SkillCatalogSyncService(repository)
    await sync_service.sync_catalog(sync_service.load_catalog(json_path))
    await db_session.commit()

    ts_owner = await repository.find_by_normalized_alias("ts")
    monitoring_owner = await repository.find_by_normalized_alias("monitoramento")
    assert ts_owner is not None and ts_owner.skill is not None
    assert monitoring_owner is not None and monitoring_owner.skill is not None
    assert ts_owner.skill.name == "TypeScript"
    assert monitoring_owner.skill.name == "monitoring"


async def test_sync_creates_canonical_skill_even_when_term_already_exists_as_legacy_alias(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    backend_skill = SkillCatalogModel(name="Backend", normalized_name="backend", is_active=True)
    db_session.add(backend_skill)
    await db_session.flush()
    db_session.add(
        SkillAliasModel(
            skill_id=backend_skill.id,
            alias="Node.js",
            normalized_alias="node.js",
        )
    )
    await db_session.commit()

    catalog = {
        "groups": [
            {
                "canonical": "Node.js",
                "aliases": ["Node"],
                "domain": ["Backend"],
                "type": "hard_skill",
                "strength": "strong",
            }
        ],
        "relations": [],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)

    repository = SQLAlchemySkillCatalogRepository(db_session)
    sync_service = SkillCatalogSyncService(repository)
    result = await sync_service.sync_catalog(sync_service.load_catalog(json_path))
    await db_session.commit()

    node_skill = await repository.find_by_normalized_name("node.js")
    assert node_skill is not None
    assert node_skill.name == "Node.js"
    assert result.skills_created == 1
    assert any(
        item.type == "canonical_is_existing_alias"
        and item.canonical == "Node.js"
        and item.db_skill == "Backend"
        for item in result.conflicts
    )


async def test_comparison_detects_fewer_differences_after_sync_and_keeps_conflicts_visible(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    comparison_service = SkillCatalogComparisonService()
    catalog = {
        "groups": [
            {
                "canonical": "Backend",
                "aliases": ["Python"],
                "domain": ["Tecnologia"],
                "type": "macro_skill",
                "strength": "partial",
            },
            {
                "canonical": "Python",
                "aliases": ["Py"],
                "domain": ["Backend"],
                "type": "hard_skill",
                "strength": "strong",
            },
        ],
        "relations": [
            {
                "from": "Backend",
                "to": "Python",
                "strength": "strong",
                "score": 0.85,
                "reason": "Python representa uma skill específica do grupo Backend.",
            }
        ],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)
    legacy_groups, legacy_relations = comparison_service.build_legacy_snapshot(catalog)

    runtime_service = SkillCatalogRuntimeService(
        SQLAlchemySkillCatalogRepository(db_session),
        ttl_seconds=300,
    )
    empty_snapshot = await runtime_service.get_runtime_snapshot()
    empty_groups, empty_relations = comparison_service.build_db_snapshot(empty_snapshot)
    before = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=empty_groups,
        legacy_relations=legacy_relations,
        db_relations=empty_relations,
    )

    repository = SQLAlchemySkillCatalogRepository(db_session)
    sync_service = SkillCatalogSyncService(repository)
    await sync_service.sync_catalog(sync_service.load_catalog(json_path))
    await db_session.commit()

    populated_snapshot = await runtime_service.refresh_skill_catalog_cache()
    populated_groups, populated_relations = comparison_service.build_db_snapshot(
        populated_snapshot
    )
    after = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=populated_groups,
        legacy_relations=legacy_relations,
        db_relations=populated_relations,
    )

    assert before.summary["missing_skills_count"] == 2
    assert before.summary["missing_aliases_count"] == 2
    assert before.summary["metadata_gaps_count"] == 1
    assert after.summary["missing_skills_count"] == 0
    assert after.summary["missing_aliases_count"] == 0
    assert after.summary["metadata_gaps_count"] == 0
    assert after.summary["conflicts_count"] == 1
    assert any(
        item.type == "alias_should_be_relation"
        and item.alias == "Python"
        and item.json_canonical == "Backend"
        and item.db_canonical == "Python"
        and item.resolution == "resolved_by_relation"
        for item in after.conflicts
    )


async def test_sync_persists_relation_without_source_skill_when_legacy_source_is_not_a_group(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    catalog = {
        "groups": [
            {
                "canonical": "Atendimento",
                "aliases": [],
                "domain": ["Operações"],
                "type": "macro_skill",
                "strength": "partial",
            }
        ],
        "relations": [
            {
                "from": "Recepcionista",
                "to": "Atendimento",
                "strength": "strong",
                "score": 0.85,
                "reason": "Recepcionista comprova atendimento ao público.",
            }
        ],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)

    repository = SQLAlchemySkillCatalogRepository(db_session)
    sync_service = SkillCatalogSyncService(repository)
    await sync_service.sync_catalog(sync_service.load_catalog(json_path))
    await db_session.commit()

    runtime_service = SkillCatalogRuntimeService(repository, ttl_seconds=300)
    snapshot = await runtime_service.refresh_skill_catalog_cache()
    preview = await runtime_service.get_legacy_compatible_catalog()

    assert snapshot.total_relations == 1
    assert preview["relations"] == [
        {
            "from": "Recepcionista",
            "to": "Atendimento",
            "type": None,
            "strength": "strong",
            "score": 0.85,
            "reason": "Recepcionista comprova atendimento ao público.",
        }
    ]


async def test_comparison_classifies_hierarchical_conflicts_invalid_legacy_alias_and_inverted_alias(
    db_session: AsyncSession,
) -> None:
    comparison_service = SkillCatalogComparisonService()
    db_session.add_all(
        [
            SkillCatalogModel(name="Backend", normalized_name="backend", is_active=True),
            SkillCatalogModel(name="Python", normalized_name="python", is_active=True),
            SkillCatalogModel(name="Frontend", normalized_name="frontend", is_active=True),
            SkillCatalogModel(name="JavaScript", normalized_name="javascript", is_active=True),
            SkillCatalogModel(name="Data Science", normalized_name="data science", is_active=True),
            SkillCatalogModel(name="Machine Learning", normalized_name="machine learning", is_active=True),
            SkillCatalogModel(name=".NET", normalized_name=".net", is_active=True),
            SkillCatalogModel(name="GCP", normalized_name="gcp", is_active=True),
        ]
    )
    await db_session.flush()

    skills = {
        skill.normalized_name: skill
        for skill in (await SQLAlchemySkillCatalogRepository(db_session).list_runtime_skills())
    }
    db_session.add_all(
        [
            SkillAliasModel(skill_id=skills["javascript"].id, alias="JS", normalized_alias="js"),
            SkillAliasModel(
                skill_id=skills["gcp"].id,
                alias="Google Cloud Platform",
                normalized_alias="google cloud platform",
            ),
            SkillRelationModel(
                source_skill_id=skills["backend"].id,
                source_name="Backend",
                normalized_source_name="backend",
                target_skill_id=skills["python"].id,
                target_name="Python",
                normalized_target_name="python",
                strength="strong",
                score=0.9,
                reason="Python representa uma skill específica frequentemente associada ao domínio Backend.",
            ),
            SkillRelationModel(
                source_skill_id=skills["frontend"].id,
                source_name="Frontend",
                normalized_source_name="frontend",
                target_skill_id=skills["javascript"].id,
                target_name="JavaScript",
                normalized_target_name="javascript",
                strength="strong",
                score=0.9,
                reason="JavaScript representa uma skill base frequentemente associada ao domínio Frontend.",
            ),
            SkillRelationModel(
                source_skill_id=skills["data science"].id,
                source_name="Data Science",
                normalized_source_name="data science",
                target_skill_id=skills["machine learning"].id,
                target_name="Machine Learning",
                normalized_target_name="machine learning",
                strength="strong",
                score=0.9,
                reason="Machine Learning representa uma especialização recorrente dentro de Data Science.",
            ),
        ]
    )
    await db_session.commit()

    legacy_groups, legacy_relations = comparison_service.build_legacy_snapshot(
        {
            "groups": [
                {"canonical": "Backend", "aliases": ["Python"]},
                {"canonical": "Frontend", "aliases": ["JavaScript"]},
                {"canonical": "Data Science", "aliases": ["Machine Learning"]},
                {"canonical": ".NET", "aliases": ["JS"]},
                {"canonical": "GCP", "aliases": ["Google Cloud Platform"]},
            ],
            "relations": [],
        }
    )

    runtime_service = SkillCatalogRuntimeService(
        SQLAlchemySkillCatalogRepository(db_session),
        ttl_seconds=300,
    )
    db_snapshot = await runtime_service.refresh_skill_catalog_cache()
    db_groups, db_relations = comparison_service.build_db_snapshot(db_snapshot)
    report = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=db_groups,
        legacy_relations=legacy_relations,
        db_relations=db_relations,
    )

    assert report.summary["conflicts_by_type"]["alias_should_be_relation"] == 3
    assert report.summary["resolved_by_relation_count"] == 3
    assert any(
        item.classification == "invalid_legacy_alias"
        and item.canonical == ".NET"
        and item.alias == "JS"
        for item in report.missing_aliases
    )
    assert any(
        item.classification == "alias_inverted"
        and item.canonical == "GCP"
        and item.alias == "Google Cloud Platform"
        for item in report.missing_aliases
    )


async def test_sync_classifies_spring_boot_alias_as_relation_instead_of_importing_alias(
    db_session: AsyncSession,
    tmp_path: Path,
) -> None:
    java = SkillCatalogModel(name="Java", normalized_name="java", is_active=True)
    spring_boot = SkillCatalogModel(
        name="Spring Boot",
        normalized_name="spring boot",
        is_active=True,
    )
    db_session.add_all([java, spring_boot])
    await db_session.flush()
    db_session.add(
        SkillAliasModel(skill_id=java.id, alias="Spring", normalized_alias="spring")
    )
    await db_session.commit()

    catalog = {
        "groups": [
            {
                "canonical": "Spring Boot",
                "aliases": ["Spring"],
                "domain": ["technology"],
                "type": "skill",
                "strength": "strong",
            }
        ],
        "relations": [],
    }
    json_path = _write_catalog(tmp_path / "catalog.json", catalog)

    repository = SQLAlchemySkillCatalogRepository(db_session)
    sync_service = SkillCatalogSyncService(repository)
    await sync_service.sync_catalog(sync_service.load_catalog(json_path))
    await db_session.commit()

    runtime_service = SkillCatalogRuntimeService(repository, ttl_seconds=300)
    snapshot = await runtime_service.refresh_skill_catalog_cache()
    comparison_service = SkillCatalogComparisonService()
    legacy_groups, legacy_relations = comparison_service.build_legacy_snapshot(catalog)
    db_groups, db_relations = comparison_service.build_db_snapshot(snapshot)
    report = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=db_groups,
        legacy_relations=legacy_relations,
        db_relations=db_relations,
    )

    relation = await repository.find_relation(
        normalized_source_name="spring boot",
        normalized_target_name="spring",
        relation_type=None,
    )

    assert relation is not None
    assert any(
        item.classification == "alias_should_be_relation"
        and item.canonical == "Spring Boot"
        and item.alias == "Spring"
        for item in report.missing_aliases
    )


async def test_cleanup_of_dev_extra_skills_removes_them_from_comparison_report(
    db_session: AsyncSession,
) -> None:
    comparison_service = SkillCatalogComparisonService()
    legacy_groups, legacy_relations = comparison_service.build_legacy_snapshot(
        {"groups": [], "relations": []}
    )

    dev_skill = SkillCatalogModel(
        name="Codex Skill Validation 1778552097261",
        normalized_name="codex skill validation 1778552097261",
        is_active=True,
    )
    db_session.add(dev_skill)
    await db_session.commit()

    repository = SQLAlchemySkillCatalogRepository(db_session)
    runtime_service = SkillCatalogRuntimeService(repository, ttl_seconds=300)
    before_snapshot = await runtime_service.refresh_skill_catalog_cache()
    before_groups, before_relations = comparison_service.build_db_snapshot(before_snapshot)
    before = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=before_groups,
        legacy_relations=legacy_relations,
        db_relations=before_relations,
    )

    skill = await repository.find_by_normalized_name(
        "codex skill validation 1778552097261"
    )
    assert skill is not None
    await repository.delete_skill(skill)
    await db_session.commit()

    after_snapshot = await runtime_service.refresh_skill_catalog_cache()
    after_groups, after_relations = comparison_service.build_db_snapshot(after_snapshot)
    after = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=after_groups,
        legacy_relations=legacy_relations,
        db_relations=after_relations,
    )

    assert "Codex Skill Validation 1778552097261" in before.extra_skills
    assert "Codex Skill Validation 1778552097261" not in after.extra_skills


async def test_matching_database_source_uses_active_skills_only_and_preserves_relations(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active_skill = SkillCatalogModel(
        name="JavaScript",
        normalized_name="javascript",
        is_active=True,
        default_strength="strong",
        catalog_type="skill",
    )
    inactive_skill = SkillCatalogModel(
        name="Cobol",
        normalized_name="cobol",
        is_active=False,
        default_strength="strong",
        catalog_type="skill",
    )
    archived_skill = SkillCatalogModel(
        name="Oracle",
        normalized_name="oracle",
        is_active=False,
        archived_at=datetime.now(timezone.utc),
        default_strength="strong",
        catalog_type="skill",
    )
    spring_boot = SkillCatalogModel(
        name="Spring Boot",
        normalized_name="spring boot",
        is_active=True,
        default_strength="strong",
        catalog_type="skill",
    )
    db_session.add_all([active_skill, inactive_skill, archived_skill, spring_boot])
    await db_session.flush()
    db_session.add_all(
        [
            SkillAliasModel(skill_id=active_skill.id, alias="TypeScript", normalized_alias="typescript"),
            SkillAliasModel(skill_id=inactive_skill.id, alias="Cobol Legacy", normalized_alias="cobol legacy"),
            SkillAliasModel(skill_id=archived_skill.id, alias="Oracle DB", normalized_alias="oracle db"),
            SkillRelationModel(
                source_skill_id=spring_boot.id,
                source_name="Spring Boot",
                normalized_source_name="spring boot",
                target_name="Spring",
                normalized_target_name="spring",
                strength="strong",
                score=0.8,
                reason="relation",
            ),
        ]
    )
    await db_session.commit()

    session_factory = async_sessionmaker(
        db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    class _NoopEngine:
        async def dispose(self) -> None:
            return None

    async def _fake_create_celery_async_sessionmaker():
        return _NoopEngine(), session_factory

    SkillEquivalenceService.clear_catalog_cache()
    monkeypatch.setattr(
        "src.application.services.skill_equivalence_service.create_celery_async_sessionmaker",
        _fake_create_celery_async_sessionmaker,
    )
    monkeypatch.setattr(
        "src.application.services.skill_equivalence_service.settings.SKILL_CATALOG_SOURCE",
        "database",
    )
    monkeypatch.setattr(
        "src.application.services.skill_equivalence_service.settings.SKILL_CATALOG_COMPARE_ON_MATCH",
        False,
    )

    service = SkillEquivalenceService.for_matching()

    assert service._source == "database"
    assert service.match_skill("TypeScript", "JavaScript").matched is True
    assert service.match_skill("Cobol Legacy", "Cobol").matched is False
    assert service.match_skill("Oracle DB", "Oracle").matched is False
    relation = service.match_skill("Spring Boot", "Spring")
    assert relation.matched is True
    assert relation.source == "relation"
