import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.application.services.skill_catalog_comparison_service import (  # noqa: E402
    AliasDifference,
    MetadataGap,
    SkillCatalogComparisonReport,
    SkillCatalogComparisonService,
)
from src.application.services.skill_catalog_runtime_service import (  # noqa: E402
    SkillCatalogRuntimeService,
)
from src.infrastructure.database.connection import AsyncSessionFactory, engine  # noqa: E402
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (  # noqa: E402
    SQLAlchemySkillCatalogRepository,
)


def _print_string_list(title: str, values: tuple[str, ...]) -> None:
    print(f"- {title}: {len(values)}")
    for value in values:
        print(f"  - {value}")


def _print_grouped_aliases(title: str, values: tuple[AliasDifference, ...]) -> None:
    grouped: dict[str, list[str]] = defaultdict(list)
    for item in values:
        suffix = f" [{item.classification}]"
        if item.db_owner:
            suffix += f" owner={item.db_owner}"
        grouped[item.canonical].append(f"{item.alias}{suffix}")

    print(f"- {title}: {len(values)}")
    for canonical in sorted(grouped):
        aliases = ", ".join(sorted(grouped[canonical], key=str.casefold))
        print(f"  - {canonical}: {aliases}")


def _print_metadata_gaps(values: tuple[MetadataGap, ...]) -> None:
    print(f"- Metadados/relations ainda divergentes: {len(values)}")
    for item in values:
        print(
            "  - "
            f"tipo={item.gap_type}; "
            f"skill={item.canonical}; "
            f"campo={item.field}; "
            f"json={item.json_value}; "
            f"banco={item.db_value}"
        )


def _print_conflicts(report: SkillCatalogComparisonReport) -> None:
    print(f"- Conflitos: {len(report.conflicts)}")
    for item in report.conflicts:
        print(
            "  - "
            f"tipo={item.type}; "
            f"alias={item.alias}; "
            f"json_canonical={item.json_canonical}; "
            f"db_canonical={item.db_canonical}; "
            f"resolucao={item.resolution}; "
            f"impacto={item.impact}; "
            f"sugestao={item.suggestion}"
        )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare o catálogo legado de skills com o catálogo persistido no banco.",
    )
    parser.add_argument(
        "--json-path",
        type=str,
        default="src/domain/catalogs/skill_equivalences.json",
        help="Caminho do catálogo legado em JSON.",
    )
    parser.add_argument(
        "--report-path",
        type=str,
        default="reports/skill_catalog_comparison_report.json",
        help="Caminho relativo ao backend para salvar o relatório detalhado em JSON.",
    )
    args = parser.parse_args()

    json_path = Path(args.json_path)
    if not json_path.is_absolute():
        json_path = ROOT_DIR / json_path

    report_path = Path(args.report_path)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path

    comparison_service = SkillCatalogComparisonService()
    legacy_catalog = comparison_service.load_legacy_catalog(json_path)
    legacy_groups, legacy_relations = comparison_service.build_legacy_snapshot(
        legacy_catalog
    )

    async with AsyncSessionFactory() as session:
        repository = SQLAlchemySkillCatalogRepository(session)
        runtime_service = SkillCatalogRuntimeService(repository, ttl_seconds=300)
        db_snapshot = await runtime_service.refresh_skill_catalog_cache()

    await engine.dispose()

    db_groups, db_relations = comparison_service.build_db_snapshot(db_snapshot)
    report = comparison_service.compare(
        legacy_groups=legacy_groups,
        db_groups=db_groups,
        legacy_relations=legacy_relations,
        db_relations=db_relations,
    )
    comparison_service.write_report(report, report_path)

    summary = report.summary
    print("Comparação catálogo de skills:")
    print(f"- Skills JSON: {summary['json_skill_count']}")
    print(f"- Skills Banco: {summary['db_skill_count']}")
    print(f"- Aliases JSON: {summary['json_alias_count']}")
    print(f"- Aliases Banco: {summary['db_alias_count']}")
    print(f"- Relations JSON: {summary['json_relation_count']}")
    print(f"- Relations Banco: {summary['db_relation_count']}")
    print(f"- Skills ausentes no banco: {summary['missing_skills_count']}")
    print(f"- Skills extras no banco: {summary['extra_skills_count']}")
    print(f"- Aliases ausentes no banco: {summary['missing_aliases_count']}")
    print(f"- Aliases extras no banco: {summary['extra_aliases_count']}")
    print(f"- Conflitos classificados: {summary['conflicts_count']}")
    print(f"- Lacunas de metadados/relations: {summary['metadata_gaps_count']}")
    print(f"- Equivalência aproximada: {summary['equivalence_percent']:.2f}%")
    print(f"- Aliases ausentes por tipo: {summary['missing_aliases_by_type']}")
    print(f"- Conflitos por tipo: {summary['conflicts_by_type']}")
    print(f"- Conflitos resolvidos por relation: {summary['resolved_by_relation_count']}")
    print(f"- Relatório JSON: {report_path}")

    if report.missing_skills:
        _print_string_list("Skills presentes no JSON e ausentes no banco", report.missing_skills)
    if report.extra_skills:
        _print_string_list("Skills presentes no banco e ausentes no JSON", report.extra_skills)
    if report.missing_aliases:
        _print_grouped_aliases("Aliases presentes no JSON e ausentes no banco", report.missing_aliases)
    if report.extra_aliases:
        _print_grouped_aliases("Aliases presentes no banco e ausentes no JSON", report.extra_aliases)
    if report.conflicts:
        _print_conflicts(report)
    if report.metadata_gaps:
        _print_metadata_gaps(report.metadata_gaps)


if __name__ == "__main__":
    asyncio.run(main())
