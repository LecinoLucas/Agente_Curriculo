#!/usr/bin/env python3
"""
Diagnóstico: encontra valores únicos de job_area no banco que não estão mapeados
em LEGACY_JOB_AREA_MAP.

Uso:
    python scripts/check_legacy_job_areas.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import unicodedata
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.interface.api.schemas.job_schemas import LEGACY_JOB_AREA_MAP  # noqa: E402


def normalize_area(value: str | None) -> str:
    if not value:
        return ""

    text_value = value.strip().lower()
    text_value = unicodedata.normalize("NFKD", text_value)
    text_value = "".join(ch for ch in text_value if not unicodedata.combining(ch))
    text_value = " ".join(text_value.split())

    return text_value


async def check_unmapped_areas() -> None:
    db_url = os.getenv("DATABASE_URL")

    if not db_url:
        print("❌ DATABASE_URL not set")
        return

    engine = create_async_engine(db_url, echo=False)

    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    """
                    SELECT DISTINCT job_area
                    FROM jobs
                    WHERE job_area IS NOT NULL
                      AND TRIM(job_area) <> ''
                    ORDER BY job_area
                    """
                )
            )

            rows = result.fetchall()

        if not rows:
            print("✓ No job_area values found in database")
            return

        normalized_map = {
            normalize_area(key): value
            for key, value in LEGACY_JOB_AREA_MAP.items()
        }

        print(f"Found {len(rows)} unique job_area values:\n")

        unmapped: list[tuple[str, str]] = []

        for (original,) in rows:
            normalized = normalize_area(original)
            mapped_to = normalized_map.get(normalized)
            is_mapped = mapped_to is not None

            status = "✓" if is_mapped else "✗"
            print(
                f"{status} '{original}' "
                f"(normalized: '{normalized}') → {mapped_to or 'NOT MAPPED'}"
            )

            if not is_mapped:
                unmapped.append((str(original), normalized))

        if unmapped:
            print(f"\n⚠️ {len(unmapped)} unmapped values found.")
            print("\nAdd these to LEGACY_JOB_AREA_MAP:\n")

            for original, normalized in unmapped:
                print(f'    "{normalized}": "{{english_equivalent}}",  # from "{original}"')
        else:
            print("\n✓ All job_area values are properly mapped!")

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(check_unmapped_areas())