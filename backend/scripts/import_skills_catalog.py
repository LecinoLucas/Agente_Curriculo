from __future__ import annotations

import asyncio
import json
import sys
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import sqlalchemy as sa

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.application.services.skill_text_normalizer import normalize_skill_text
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.database.models.job_model import SkillModel

CATALOG_PATH = Path(__file__).resolve().parent / "data" / "skills_catalog.json"


def _clean_aliases(values: Iterable[str]) -> list[str]:
    cleaned = {
        normalize_skill_text(value)
        for value in values
        if value and str(value).strip()
    }
    return sorted(cleaned)


def _normalize_category(value: Any) -> str:
    return normalize_skill_text(str(value or "other"))


def _load_catalog() -> list[dict[str, Any]]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    if not isinstance(payload, list):
        raise ValueError("Catalog must be a JSON array")

    seen: set[str] = set()
    catalog: list[dict[str, Any]] = []

    for item in payload:
        if not isinstance(item, dict):
            raise ValueError("Every catalog item must be an object")

        name = str(item.get("name") or "").strip()
        if not name:
            raise ValueError("Catalog item missing name")

        normalized_name = str(
            item.get("normalized_name")
            or item.get("normalized")
            or normalize_skill_text(name)
        ).strip()

        expected = normalize_skill_text(name)
        normalized_name = normalize_skill_text(normalized_name)

        if normalized_name != expected and item.get("normalized_name"):
            raise ValueError(
                f"Invalid normalized_name for '{name}': '{normalized_name}' != '{expected}'"
            )

        if normalized_name in seen:
            raise ValueError(f"Duplicate skill in catalog: {normalized_name}")

        seen.add(normalized_name)

        aliases = _clean_aliases(
            [
                *(item.get("aliases") or []),
                *(item.get("synonyms") or []),
                *(item.get("related_skills") or []),
                *(item.get("tools") or []),
            ]
        )

        catalog.append(
            {
                "name": name,
                "normalized_name": normalized_name,
                "category": _normalize_category(item.get("category")),
                "aliases": aliases,
                "is_verified": True,
                "metadata": {
                    "catalog_id": item.get("id"),
                    "type": item.get("type"),
                    "weight": item.get("weight"),
                    "related_skills": item.get("related_skills") or [],
                    "tools": item.get("tools") or [],
                },
            }
        )

    return catalog


async def main() -> None:
    catalog = _load_catalog()

    inserted = 0
    updated = 0
    unchanged = 0

    normalized_names = [item["normalized_name"] for item in catalog]
    now = datetime.now(UTC)

    async with AsyncSessionFactory() as session:
        existing_rows = await session.execute(
            sa.select(SkillModel).where(
                SkillModel.deleted_at.is_(None),
                SkillModel.normalized_name.in_(normalized_names),
            )
        )

        existing_by_normalized = {
            row.normalized_name: row
            for row in existing_rows.scalars().all()
        }

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

            if sorted(skill.aliases or []) != item["aliases"]:
                skill.aliases = item["aliases"]
                changed = True

            if getattr(skill, "is_verified", None) is not True:
                skill.is_verified = True
                changed = True

            if changed:
                skill.updated_at = now
                updated += 1
            else:
                unchanged += 1

        await session.commit()

    await engine.dispose()

    print(
        f"catalog={len(catalog)} "
        f"inserted={inserted} "
        f"updated={updated} "
        f"unchanged={unchanged}"
    )


if __name__ == "__main__":
    asyncio.run(main())