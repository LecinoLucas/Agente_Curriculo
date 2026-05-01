import asyncio
import json
import sys
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy as sa

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.application.services.skill_text_normalizer import normalize_skill_text
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.database.models.job_model import SkillModel

CATALOG_PATH = Path(__file__).resolve().parent / "data" / "skills_catalog.json"


def _clean_aliases(aliases: Iterable[str]) -> list[str]:
    cleaned = {normalize_skill_text(alias) for alias in aliases if alias and alias.strip()}
    return sorted(cleaned)


def _load_catalog() -> list[dict]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Catalog must be a JSON array")

    normalized_names: set[str] = set()
    catalog: list[dict] = []
    for item in payload:
        name = str(item["name"]).strip()
        normalized_name = str(item["normalized_name"]).strip()
        category = str(item["category"]).strip()
        aliases = _clean_aliases(item.get("aliases", []))

        expected_normalized = normalize_skill_text(name)
        if normalized_name != expected_normalized:
            raise ValueError(
                f"Invalid normalized_name for '{name}': '{normalized_name}' != '{expected_normalized}'"
            )
        if normalized_name in normalized_names:
            raise ValueError(f"Duplicate normalized_name in catalog: {normalized_name}")

        normalized_names.add(normalized_name)
        catalog.append(
            {
                "name": name,
                "normalized_name": normalized_name,
                "category": category,
                "aliases": aliases,
            }
        )

    return catalog


async def main() -> None:
    catalog = _load_catalog()
    inserted = 0
    updated = 0

    async with AsyncSessionFactory() as session:
        existing_rows = await session.execute(
            sa.select(SkillModel).where(
                SkillModel.deleted_at.is_(None),
                SkillModel.normalized_name.in_([item["normalized_name"] for item in catalog]),
            )
        )
        existing_by_normalized = {row.normalized_name: row for row in existing_rows.scalars().all()}

        now = datetime.now(timezone.utc)
        for item in catalog:
            skill = existing_by_normalized.get(item["normalized_name"])
            if skill is None:
                session.add(
                    SkillModel(
                        name=item["name"],
                        normalized_name=item["normalized_name"],
                        category=item["category"],
                        aliases=item["aliases"],
                        is_verified=True,
                    )
                )
                inserted += 1
                continue

            changed = False
            if skill.name != item["name"]:
                skill.name = item["name"]
                changed = True
            if skill.category != item["category"]:
                skill.category = item["category"]
                changed = True
            if list(skill.aliases or []) != item["aliases"]:
                skill.aliases = item["aliases"]
                changed = True
            if changed:
                skill.updated_at = now
                updated += 1

        await session.commit()

    await engine.dispose()
    print(f"catalog={len(catalog)} inserted={inserted} updated={updated}")


if __name__ == "__main__":
    asyncio.run(main())
