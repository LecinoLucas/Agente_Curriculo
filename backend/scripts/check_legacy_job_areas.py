#!/usr/bin/env python3
"""
Diagnóstico: Encontra todos os valores únicos de job_area no banco de dados
que não estão mapeados em LEGACY_JOB_AREA_MAP.

Uso:
    python scripts/check_legacy_job_areas.py
"""

import asyncio
import sys
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.interface.api.schemas.job_schemas import LEGACY_JOB_AREA_MAP


async def check_unmapped_areas():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not set")
        return

    engine = create_async_engine(db_url, echo=False)

    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT DISTINCT job_area
                FROM jobs
                WHERE job_area IS NOT NULL
                ORDER BY job_area
            """))
            rows = result.fetchall()

        if not rows:
            print("✓ No job_area values found in database")
            return

        print(f"Found {len(rows)} unique job_area values:\n")

        unmapped = []
        for (original,) in rows:
            normalized = original.lower()
            is_mapped = normalized in LEGACY_JOB_AREA_MAP
            status = "✓" if is_mapped else "✗"
            mapped_to = LEGACY_JOB_AREA_MAP.get(normalized, "NOT MAPPED")

            print(f"{status} '{original}' (normalized: '{normalized}') → {mapped_to}")

            if not is_mapped:
                unmapped.append((original, normalized))

        if unmapped:
            print(f"\n⚠️  {len(unmapped)} unmapped values found. Add to LEGACY_JOB_AREA_MAP:")
            print("\nLegacy values to add:")
            for original, normalized in unmapped:
                print(f'    "{normalized}": "{{english_equivalent}}",  # from "{original}"')
        else:
            print("\n✓ All job_area values are properly mapped!")

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(check_unmapped_areas())
