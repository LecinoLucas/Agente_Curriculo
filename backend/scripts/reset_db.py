#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

SAFE_MARKERS = ["localhost", "127.0.0.1", "dev", "test"]
BLOCKED_MARKERS = ["prod", "production", "amazonaws", "render", "railway"]


TABLES = [
    "pipeline_events",
    "pipeline_stage_transitions",
    "audit_logs",
    "document_ai_analyses",
    "analysis_results",
    "resume_job_matches",
    "analyses",
    "candidate_job_scores",
    "score_model_versions",
    "job_required_skills",
    "candidate_pipeline",
    "resume_versions",
    "resumes",
    "candidate_documents",
    "admissions",
    "candidates",
    "jobs",
]


def validate_database(url: str):
    lowered = url.lower()

    if any(b in lowered for b in BLOCKED_MARKERS):
        raise RuntimeError("🚨 Banco parece ser produção. Abortado.")

    if not any(s in lowered for s in SAFE_MARKERS):
        raise RuntimeError("🚨 DATABASE_URL não parece seguro (dev/test).")


async def main():
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("❌ DATABASE_URL não configurado")
        sys.exit(1)

    validate_database(database_url)

    if "--dry-run" in sys.argv:
        print("DRY RUN - tabelas que seriam limpas:")
        for t in TABLES:
            print("-", t)
        return

    if "--confirm" not in sys.argv:
        confirm = input("Digite DELETE para confirmar limpeza TOTAL: ")
        if confirm != "DELETE":
            print("Abortado.")
            return

    engine = create_async_engine(database_url, echo=False)

    start = datetime.now(UTC)

    try:
        async with engine.begin() as conn:
            tables_sql = ", ".join(f'"{t}"' for t in TABLES)

            await conn.execute(
                text(f"""
                TRUNCATE TABLE {tables_sql}
                RESTART IDENTITY CASCADE
                """)
            )

        elapsed = (datetime.now(UTC) - start).total_seconds()

        print("\n✅ Limpeza concluída")
        print(f"Tempo: {elapsed:.2f}s")

    except Exception as e:
        print(f"❌ Erro: {e}")
        raise

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())