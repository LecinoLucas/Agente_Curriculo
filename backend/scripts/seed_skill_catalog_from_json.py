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
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import SQLAlchemySkillCatalogRepository
from src.infrastructure.database.models.skill_catalog_model import SkillCatalogModel, SkillAliasModel
from src.application.services.skill_catalog_normalizer import normalize_skill_name

async def seed_skills(session: AsyncSession, json_path: Path):
    repo = SQLAlchemySkillCatalogRepository(session)
    
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    groups = data.get("groups", [])
    
    summary = {
        "skills_created": 0,
        "skills_existed": 0,
        "aliases_created": 0,
        "aliases_existed": 0,
        "conflicts_ignored": 0
    }
    
    for group in groups:
        canonical = group.get("canonical")
        aliases = group.get("aliases", [])
        
        if not canonical:
            continue
            
        normalized_canonical = normalize_skill_name(canonical)
        
        # Check if skill exists as skill
        skill = await repo.find_by_normalized_name(normalized_canonical)
        
        if not skill:
            # Check if canonical name exists as alias
            existing_alias_as_skill = await repo.find_by_normalized_alias(normalized_canonical)
            if existing_alias_as_skill:
                print(f"[CONFLICT] Canonical name '{canonical}' ({normalized_canonical}) already exists as an alias for skill ID {existing_alias_as_skill.skill_id}. Skipping group.")
                summary["conflicts_ignored"] += 1
                continue
                
            # Create skill
            skill = SkillCatalogModel(
                name=canonical.strip(),
                normalized_name=normalized_canonical,
                category=None,
            )
            session.add(skill)
            await session.flush()
            summary["skills_created"] += 1
        else:
            summary["skills_existed"] += 1
            
        # Process aliases
        for alias in aliases:
            norm_alias = normalize_skill_name(alias)
            
            if not norm_alias:
                continue
                
            # Rule: alias equal to canonical name normalizado deve ser ignorado
            if norm_alias == normalized_canonical:
                continue
                
            # Rule: alias que já existe como skill canônica deve ser logado e pulado
            conflict_skill = await repo.find_by_normalized_name(norm_alias)
            if conflict_skill:
                print(f"[CONFLICT] Alias '{alias}' ({norm_alias}) already exists as a canonical skill. Skipping alias.")
                summary["conflicts_ignored"] += 1
                continue
                
            # Rule: alias já existente em outra skill deve ser logado e pulado
            conflict_alias = await repo.find_by_normalized_alias(norm_alias)
            if conflict_alias:
                if conflict_alias.skill_id != skill.id:
                    print(f"[CONFLICT] Alias '{alias}' ({norm_alias}) already exists for another skill (ID {conflict_alias.skill_id}). Skipping alias.")
                    summary["conflicts_ignored"] += 1
                    continue
                else:
                    summary["aliases_existed"] += 1
                    continue
                    
            # Create alias
            new_alias = SkillAliasModel(
                skill_id=skill.id,
                alias=alias.strip(),
                normalized_alias=norm_alias
            )
            session.add(new_alias)
            summary["aliases_created"] += 1
            
        await session.flush()
        
    await session.commit()
    return summary

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

if __name__ == "__main__":
    asyncio.run(main())
