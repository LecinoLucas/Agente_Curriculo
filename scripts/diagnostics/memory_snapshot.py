#!/usr/bin/env python3
"""
Diagnóstico de memória do processo FastAPI.

Uso:
    python scripts/diagnostics/memory_snapshot.py

Variáveis de ambiente necessárias (opcionais):
    DATABASE_URL  — conexão Postgres (para inspecionar tabela ai_usage_logs)

Este script é somente leitura. Não altera nenhum dado.
"""
from __future__ import annotations

import asyncio
import os
import sys

try:
    import psutil
except ImportError:
    print("psutil não instalado. Execute: pip install psutil")
    sys.exit(1)


def _process_memory_summary() -> dict:
    proc = psutil.Process(os.getpid())
    mem = proc.memory_info()
    return {
        "rss_mb": round(mem.rss / 1024 / 1024, 2),
        "vms_mb": round(mem.vms / 1024 / 1024, 2),
        "percent": round(proc.memory_percent(), 3),
        "pid": proc.pid,
    }


async def _check_ai_usage_log_count(database_url: str) -> dict:
    try:
        import sqlalchemy as sa
        from sqlalchemy.ext.asyncio import create_async_engine
    except ImportError:
        return {"error": "sqlalchemy not installed"}

    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                sa.text("""
                    SELECT
                        date_trunc('day', created_at) AS day,
                        COUNT(*) AS cnt
                    FROM ai_usage_logs
                    WHERE created_at >= NOW() - INTERVAL '30 days'
                    GROUP BY 1
                    ORDER BY 1 DESC
                    LIMIT 10
                """)
            )
            rows = result.fetchall()
            total = await conn.execute(
                sa.text("SELECT COUNT(*) FROM ai_usage_logs WHERE created_at >= NOW() - INTERVAL '30 days'")
            )
            total_count = total.scalar()
            return {
                "total_30d": total_count,
                "per_day": [{"day": str(r[0])[:10], "count": r[1]} for r in rows],
                "warning": "CRITICAL" if (total_count or 0) > 2000 else "OK",
            }
    except Exception as exc:
        return {"error": str(exc)}
    finally:
        await engine.dispose()


async def main():
    print("=" * 60)
    print("MEMORY SNAPSHOT — somente leitura")
    print("=" * 60)

    mem = _process_memory_summary()
    print(f"\n[Processo atual]")
    print(f"  RSS:     {mem['rss_mb']} MB")
    print(f"  VMS:     {mem['vms_mb']} MB")
    print(f"  %Mem:    {mem['percent']}%")
    print(f"  PID:     {mem['pid']}")

    database_url = os.getenv("DATABASE_URL", "")
    if database_url:
        async_url = database_url.replace("postgresql://", "postgresql+asyncpg://").replace(
            "postgres://", "postgresql+asyncpg://"
        )
        print(f"\n[AI Usage Logs — últimos 30 dias]")
        result = await _check_ai_usage_log_count(async_url)
        if "error" in result:
            print(f"  Erro: {result['error']}")
        else:
            print(f"  Total 30d:  {result['total_30d']}")
            print(f"  Status:     {result['warning']}")
            if result["warning"] == "CRITICAL":
                print("  ⚠️  Volume alto: ai_usage_log_service._list_rows pode sobrecarregar")
            for row in result["per_day"][:5]:
                print(f"    {row['day']}: {row['count']} logs")
    else:
        print("\n[AI Usage Logs] DATABASE_URL não configurado — pulando checagem")

    print("\n" + "=" * 60)
    print("Script concluído. Nenhum dado alterado.")


if __name__ == "__main__":
    asyncio.run(main())
