import argparse
import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from src.application.services.skill_catalog_sync_service import (  # noqa: E402
    SkillCatalogSyncService,
)
from src.infrastructure.database.connection import AsyncSessionFactory, engine  # noqa: E402
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (  # noqa: E402
    SQLAlchemySkillCatalogRepository,
)


async def sync_skill_catalog(session: AsyncSession, json_path: Path) -> dict[str, object]:
    repository = SQLAlchemySkillCatalogRepository(session)
    service = SkillCatalogSyncService(repository)
    catalog = service.load_catalog(json_path)
    result = await service.sync_catalog(catalog)
    await session.commit()
    return result.to_json_dict()


def _print_summary(summary: dict[str, object]) -> None:
    print("Sincronização do catálogo de skills:")
    print(f"- Skills criadas: {summary['skills_created']}")
    print(f"- Skills atualizadas: {summary['skills_updated']}")
    print(f"- Skills puladas: {summary['skills_skipped']}")
    print(f"- Aliases criados: {summary['aliases_created']}")
    print(f"- Aliases existentes: {summary['aliases_existing']}")
    print(f"- Aliases pulados: {summary['aliases_skipped']}")
    print(f"- Relations criadas: {summary['relations_created']}")
    print(f"- Relations atualizadas: {summary['relations_updated']}")
    print(f"- Relations puladas: {summary['relations_skipped']}")
    print(f"- Conflitos: {len(summary['conflicts'])}")
    for item in summary["conflicts"]:
        print(
            "  - "
            f"tipo={item['type']}; "
            f"canonical={item['canonical']}; "
            f"alias={item['alias']}; "
            f"db_skill={item['db_skill']}; "
            f"detail={item['detail']}; "
            f"suggestion={item['suggestion']}"
        )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sincroniza o skill_catalog do banco com o catálogo legado em JSON.",
    )
    parser.add_argument(
        "--json-path",
        type=str,
        default="src/domain/catalogs/skill_equivalences.json",
        help="Caminho do catálogo legado em JSON.",
    )
    args = parser.parse_args()

    json_path = Path(args.json_path)
    if not json_path.is_absolute():
        json_path = ROOT_DIR / json_path

    async with AsyncSessionFactory() as session:
        summary = await sync_skill_catalog(session, json_path)

    await engine.dispose()
    _print_summary(summary)


if __name__ == "__main__":
    asyncio.run(main())
