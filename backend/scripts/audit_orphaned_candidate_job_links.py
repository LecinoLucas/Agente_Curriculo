"""Audit script to find and report orphaned candidate_job_links.

Orphaned link = status='active', deleted_at IS NULL, but NO candidate_pipeline
with is_active=true for the same (candidate_id, job_id) pair.

This violates the rule: "pipeline ativo é a única fonte de verdade para vagas atuais"
"""
import asyncio
from datetime import UTC, datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def audit_orphaned_links(db_url: str) -> dict:
    """Find all orphaned candidate_job_links."""
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Query: find candidate_job_links with no active pipeline
        query = text("""
            SELECT
                cjl.id,
                cjl.candidate_id,
                cjl.job_id,
                cjl.status,
                cjl.source,
                cjl.created_at,
                cjl.updated_at,
                CASE WHEN cp.is_active IS NULL THEN 'NO PIPELINE'
                     WHEN cp.is_active = false THEN 'PIPELINE INACTIVE'
                     ELSE 'PIPELINE ACTIVE'
                END as pipeline_status
            FROM candidate_job_links cjl
            LEFT JOIN candidate_pipeline cp
                ON cjl.candidate_id = cp.candidate_id
                AND cjl.job_id = cp.job_id
            WHERE cjl.status = 'active'
              AND cjl.deleted_at IS NULL
              AND (cp.is_active IS NULL OR cp.is_active = false)
            ORDER BY cjl.created_at DESC
        """)

        result = await session.execute(query)
        orphaned = result.fetchall()

        # Query: count by pipeline_status
        count_query = text("""
            SELECT
                CASE WHEN cp.is_active IS NULL THEN 'NO PIPELINE'
                     WHEN cp.is_active = false THEN 'PIPELINE INACTIVE'
                     ELSE 'PIPELINE ACTIVE'
                END as pipeline_status,
                COUNT(*) as count
            FROM candidate_job_links cjl
            LEFT JOIN candidate_pipeline cp
                ON cjl.candidate_id = cp.candidate_id
                AND cjl.job_id = cp.job_id
            WHERE cjl.status = 'active'
              AND cjl.deleted_at IS NULL
              AND (cp.is_active IS NULL OR cp.is_active = false)
            GROUP BY pipeline_status
        """)

        count_result = await session.execute(count_query)
        counts = count_result.fetchall()

        # Query: count total active non-deleted links
        total_query = text("""
            SELECT COUNT(*) as total
            FROM candidate_job_links
            WHERE status = 'active' AND deleted_at IS NULL
        """)
        total_result = await session.execute(total_query)
        total = total_result.scalar()

    await engine.dispose()

    return {
        "orphaned_records": orphaned,
        "counts_by_status": {str(row[0]): row[1] for row in counts},
        "total_active_links": total,
    }


async def main():
    # Get database URL from environment or use default
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/resume_ai")

    print("=" * 80)
    print("AUDITORIA: candidate_job_links órfãs (sem pipeline ativo correspondente)")
    print("=" * 80)
    print()

    try:
        results = await audit_orphaned_links(db_url)

        # Summary
        orphaned = results["orphaned_records"]
        counts = results["counts_by_status"]
        total = results["total_active_links"]

        print(f"Total de active links (deleted_at IS NULL): {total}")
        print()
        print("Estatísticas de links órfãos:")
        for status, count in counts.items():
            print(f"  {status}: {count}")
        print()
        print(f"TOTAL ÓRFÃOS: {len(orphaned)}")
        print()

        if orphaned:
            print("Primeiros 10 registros órfãos:")
            print("-" * 80)
            print(f"{'ID':<40} {'Candidate':<40} {'Job':<40} {'Status':<15} {'Pipeline':<20}")
            print("-" * 80)
            for row in orphaned[:10]:
                link_id, cand_id, job_id, status, source, created_at, updated_at, pipeline_status = row
                print(f"{str(link_id):<40} {str(cand_id):<40} {str(job_id):<40} {status:<15} {pipeline_status:<20}")
            if len(orphaned) > 10:
                print(f"... e mais {len(orphaned) - 10} registros")
        else:
            print("✅ Nenhum link órfão encontrado! Sistema está consistente.")

    except Exception as e:
        print(f"❌ Erro ao executar auditoria: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
