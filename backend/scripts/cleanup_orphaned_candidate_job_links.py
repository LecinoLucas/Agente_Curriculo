"""Cleanup script to neutralize orphaned candidate_job_links.

Marks all orphaned links (no active pipeline) as 'transferred' instead of 'active'.
This is reversible (status can be changed back if needed) and non-destructive (deleted_at stays NULL).

Safety:
- Only marks links with status='active' and deleted_at IS NULL
- Only targets links with NO active candidate_pipeline for same (candidate_id, job_id)
- Updates updated_at timestamp
- Does NOT delete anything physically
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


async def cleanup_orphaned_links(db_url: str, dry_run: bool = True) -> dict:
    """Mark orphaned candidate_job_links as 'transferred'."""
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Find orphaned links
        find_query = text("""
            SELECT cjl.id
            FROM candidate_job_links cjl
            LEFT JOIN candidate_pipeline cp
                ON cjl.candidate_id = cp.candidate_id
                AND cjl.job_id = cp.job_id
            WHERE cjl.status = 'active'
              AND cjl.deleted_at IS NULL
              AND (cp.is_active IS NULL OR cp.is_active = false)
        """)

        result = await session.execute(find_query)
        orphaned_ids = [row[0] for row in result.fetchall()]

        if not orphaned_ids:
            return {
                "action": "NO CLEANUP NEEDED",
                "orphaned_count": 0,
                "updated_count": 0,
                "dry_run": dry_run,
            }

        # Dry run: just report
        if dry_run:
            return {
                "action": "DRY RUN",
                "orphaned_count": len(orphaned_ids),
                "updated_count": 0,
                "dry_run": True,
                "sample_ids": [str(id) for id in orphaned_ids[:5]],
            }

        # Real cleanup: mark as 'transferred'
        now = datetime.now(UTC)
        cleanup_query = text("""
            UPDATE candidate_job_links
            SET status = 'transferred', updated_at = :now
            WHERE id IN (
                SELECT cjl.id
                FROM candidate_job_links cjl
                LEFT JOIN candidate_pipeline cp
                    ON cjl.candidate_id = cp.candidate_id
                    AND cjl.job_id = cp.job_id
                WHERE cjl.status = 'active'
                  AND cjl.deleted_at IS NULL
                  AND (cp.is_active IS NULL OR cp.is_active = false)
            )
        """)

        update_result = await session.execute(cleanup_query, {"now": now})
        await session.commit()

        updated_count = update_result.rowcount or 0

        return {
            "action": "CLEANUP EXECUTED",
            "orphaned_count": len(orphaned_ids),
            "updated_count": updated_count,
            "dry_run": False,
        }


async def main():
    # Get database URL from environment or use default
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/resume_ai")

    # Get mode from command line
    dry_run = not (len(sys.argv) > 1 and sys.argv[1] == "--execute")

    print("=" * 80)
    print("LIMPEZA: candidate_job_links órfãs")
    print(f"Modo: {'DRY RUN (sem alterações)' if dry_run else 'EXECUTAR (marcar como transferred)'}")
    print("=" * 80)
    print()

    try:
        result = await cleanup_orphaned_links(db_url, dry_run=dry_run)

        if result["action"] == "NO CLEANUP NEEDED":
            print("✅ Nenhuma limpeza necessária. Sistema está consistente.")
            print(f"   Total de links active: 0 órfãos encontrados")
        elif result["action"] == "DRY RUN":
            print(f"📊 DRY RUN REPORT:")
            print(f"   Links órfãos encontrados: {result['orphaned_count']}")
            print(f"   Seriam marcados como 'transferred': {result['orphaned_count']}")
            if result.get("sample_ids"):
                print(f"   Exemplos (IDs): {', '.join(result['sample_ids'][:3])}")
            print()
            print("❗ Para executar a limpeza, rode:")
            print("   python scripts/cleanup_orphaned_candidate_job_links.py --execute")
        else:  # CLEANUP EXECUTED
            print(f"✅ LIMPEZA EXECUTADA:")
            print(f"   Links órfãos encontrados: {result['orphaned_count']}")
            print(f"   Links marcados como 'transferred': {result['updated_count']}")
            print()
            print("✓ Todos os links órfãos foram neutralizados")
            print("✓ Status alterado: 'active' → 'transferred'")
            print("✓ deleted_at permanece NULL (reversível)")

    except Exception as e:
        print(f"❌ Erro ao executar limpeza: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
