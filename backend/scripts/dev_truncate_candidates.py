#!/usr/bin/env python3
"""Controlled truncation script for dev/test environment.

Uso:
    python scripts/dev_truncate_candidates.py
    python scripts/dev_truncate_candidates.py --force
    python scripts/dev_truncate_candidates.py --include-catalogs --force
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


CORE_TABLES = [
    "pipeline_events",
    "candidate_job_pipeline_events",
    "audit_logs",
    "document_ai_analyses",
    "analysis_results",
    "candidate_job_match",
    "candidate_profile_analysis",
    "job_profile_analysis",
    "matching_observations",
    "analyses",
    "candidate_job_scores",
    "job_required_skills",
    "candidate_job_pipeline",
    "resume_versions",
    "resumes",
    "candidate_documents",
    "admissions",
    "candidates",
    "jobs",
]

CATALOG_TABLES = [
    "skills",
    "prompt_templates",
    "score_model_versions",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Limpa dados de teste em ambiente dev/test."
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Pula confirmação manual.",
    )

    parser.add_argument(
        "--include-catalogs",
        action="store_true",
        help="Também limpa skills, prompt_templates e score_model_versions.",
    )

    return parser.parse_args()


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL não configurado.")

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://",
            "postgresql+asyncpg://",
            1,
        )

    return database_url


def assert_safe_database(database_url: str) -> None:
    lowered = database_url.lower()

    allowed_markers = [
        "localhost",
        "127.0.0.1",
        "test",
        "dev",
        "development",
    ]

    blocked_markers = [
        "prod",
        "production",
        "render.com",
        "railway.app",
        "amazonaws.com",
        "azure",
        "supabase",
    ]

    if any(marker in lowered for marker in blocked_markers):
        raise RuntimeError("Abortado: DATABASE_URL parece ser produção/remoto.")

    if not any(marker in lowered for marker in allowed_markers):
        raise RuntimeError(
            "Abortado: DATABASE_URL precisa conter localhost, 127.0.0.1, dev ou test."
        )


async def existing_tables(connection, table_names: list[str]) -> list[str]:
    result = await connection.execute(
        text(
            """
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename = ANY(:tables)
            """
        ),
        {"tables": table_names},
    )

    found = {row[0] for row in result.fetchall()}
    return [table for table in table_names if table in found]


async def count_table(connection, table_name: str) -> int:
    result = await connection.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
    return int(result.scalar() or 0)


async def print_counts(connection, tables: list[str], title: str) -> None:
    logger.info("=" * 60)
    logger.info(title)
    logger.info("=" * 60)

    for table in tables:
        count = await count_table(connection, table)
        logger.info("%s: %s", table, count)


async def truncate_dev_data(*, force: bool, include_catalogs: bool) -> None:
    database_url = get_database_url()
    assert_safe_database(database_url)

    safe_url = database_url.split("@")[-1]
    logger.info("Database alvo: %s", safe_url)

    tables_to_clean = CORE_TABLES + (CATALOG_TABLES if include_catalogs else [])

    if not force:
        print("\n⚠️  Isto vai apagar dados de teste do banco.")
        print("Usuários serão preservados.")
        print(f"Catálogos serão apagados: {include_catalogs}")
        confirmation = input("Digite DELETE para confirmar: ")

        if confirmation != "DELETE":
            logger.info("Operação cancelada.")
            return

    engine = create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
    )

    start_time = datetime.now(UTC)

    try:
        async with engine.begin() as connection:
            existing = await existing_tables(connection, tables_to_clean)

            if not existing:
                logger.info("Nenhuma tabela alvo encontrada.")
                return

            await print_counts(connection, existing, "ANTES")

            truncate_sql = ", ".join(f'"{table}"' for table in existing)

            logger.info("Executando TRUNCATE em %s tabelas...", len(existing))

            await connection.execute(
                text(
                    f"""
                    TRUNCATE TABLE {truncate_sql}
                    RESTART IDENTITY CASCADE
                    """
                )
            )

            await print_counts(connection, existing, "DEPOIS")

        elapsed = (datetime.now(UTC) - start_time).total_seconds()

        logger.info("=" * 60)
        logger.info("✅ Limpeza concluída com sucesso")
        logger.info("Tempo: %.1fs", elapsed)
        logger.info("=" * 60)

    except Exception:
        logger.exception("Falha na limpeza")
        raise

    finally:
        await engine.dispose()


if __name__ == "__main__":
    args = parse_args()

    try:
        asyncio.run(
            truncate_dev_data(
                force=args.force,
                include_catalogs=args.include_catalogs,
            )
        )
    except Exception:
        sys.exit(1)
