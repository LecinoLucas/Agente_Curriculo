from __future__ import annotations

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.application.services.skill_text_normalizer import normalize_skill_text
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.database.models.job_model import SkillModel


RAW_SKILLS = [
    ("Python", "backend", ["py", "python3"]),
    ("FastAPI", "backend", ["fast-api"]),
    ("Node.js", "backend", ["node", "nodejs"]),
    ("React", "frontend", ["reactjs"]),
    ("TypeScript", "frontend", ["ts"]),
    ("PostgreSQL", "database", ["postgres"]),
    ("Redis", "database", []),
    ("Docker", "devops", []),
    ("Kubernetes", "devops", ["k8s"]),
    ("AWS", "devops", ["amazon web services"]),
    ("SQL", "data", []),
    ("Pandas", "data", []),
    ("Machine Learning", "data", ["ml"]),
    ("Liderança", "soft_skill", ["leadership"]),
    ("Comunicação", "soft_skill", ["communication"]),
]


def normalize_category(value: str) -> str:
    return value.replace("-", "_").lower()


def clean_aliases(values):
    return sorted(
        {
            normalize_skill_text(v)
            for v in values
            if v and str(v).strip()
        }
    )


async def main() -> None:
    now = datetime.now(UTC)

    async with AsyncSessionFactory() as session:

        existing_rows = await session.execute(
            sa.select(SkillModel).where(
                SkillModel.deleted_at.is_(None)
            )
        )

        existing = {
            s.normalized_name: s
            for s in existing_rows.scalars().all()
        }

        inserted = 0
        updated = 0

        for name, category, aliases in RAW_SKILLS:
            normalized_name = normalize_skill_text(name)

            skill = existing.get(normalized_name)

            cleaned_aliases = clean_aliases(
                [name, *aliases]
            )

            if skill is None:
                session.add(
                    SkillModel(
                        name=name,
                        normalized_name=normalized_name,
                        category=normalize_category(category),
                        aliases=cleaned_aliases,
                        is_verified=True,
                    )
                )
                inserted += 1
                continue

            changed = False

            if skill.name != name:
                skill.name = name
                changed = True

            if skill.category != normalize_category(category):
                skill.category = normalize_category(category)
                changed = True

            if sorted(skill.aliases or []) != cleaned_aliases:
                skill.aliases = cleaned_aliases
                changed = True

            if changed:
                skill.updated_at = now
                updated += 1

        await session.commit()

    await engine.dispose()

    print(
        f"skills={len(RAW_SKILLS)} "
        f"inserted={inserted} "
        f"updated={updated}"
    )


if __name__ == "__main__":
    asyncio.run(main())