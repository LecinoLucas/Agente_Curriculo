import asyncio
import json
import argparse
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.application.services.skill_catalog_normalizer import normalize_skill_name
from src.application.services.skill_catalog_sync_service import SkillCatalogSyncService
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import (
    SQLAlchemySkillCatalogRepository,
)

async def seed_skills(session: AsyncSession, json_path: Path):
    repo = SQLAlchemySkillCatalogRepository(session)
    sync_service = SkillCatalogSyncService(repo)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    result = await sync_service.sync_catalog(data)
    await session.commit()

    valid_groups = sum(
        1
        for group in data.get("groups", []) or []
        if normalize_skill_name(str(group.get("canonical") or "").strip())
    )

    for conflict in result.conflicts:
        print(
            "[CONFLICT] "
            f"type={conflict.type}; "
            f"canonical={conflict.canonical}; "
            f"alias={conflict.alias}; "
            f"db_skill={conflict.db_skill}; "
            f"detail={conflict.detail}"
        )

    return {
        "skills_created": result.skills_created,
        "skills_existed": valid_groups - result.skills_created - result.skills_skipped,
        "aliases_created": result.aliases_created,
        "aliases_existed": result.aliases_existing,
        "conflicts_ignored": len(result.conflicts),
        "relations_created": result.relations_created,
        "relations_updated": result.relations_updated,
        "relations_skipped": result.relations_skipped,
    }

async def main():
    parser = argparse.ArgumentParser(description="Seed skill catalog from JSON.")
    parser.add_argument(
        "--json-path",
        type=str,
        default="src/domain/catalogs/skill_equivalences.json",
        help="Path to the skill equivalences JSON file."
    )
    args = parser.parse_args()
    
    json_path = Path(args.json_path)
    if not json_path.is_absolute():
        json_path = ROOT_DIR / json_path
        
    print(f"Reading from {json_path}")
    
    if not json_path.exists():
        print(f"File not found: {json_path}")
        sys.exit(1)
        
    async with AsyncSessionFactory() as session:
        summary = await seed_skills(session, json_path)
        
    await engine.dispose()
    
    print("\n=== RESUMO ===")
    print(f"Skills criadas: {summary['skills_created']}")
    print(f"Skills já existentes: {summary['skills_existed']}")
    print(f"Aliases criados: {summary['aliases_created']}")
    print(f"Aliases já existentes: {summary['aliases_existed']}")
    print(f"Conflitos ignorados: {summary['conflicts_ignored']}")
    print(f"Relations criadas: {summary['relations_created']}")
    print(f"Relations atualizadas: {summary['relations_updated']}")
    print(f"Relations já existentes: {summary['relations_skipped']}")

if __name__ == "__main__":
    asyncio.run(main())
