#!/usr/bin/env python3
"""
Auditoria de chaves Redis — somente leitura.

Uso:
    REDIS_URL=redis://localhost:6379/0 python scripts/diagnostics/redis_cache_audit.py

Variáveis de ambiente:
    REDIS_URL        — URL do Redis de aplicação (padrão: redis://localhost:6379/0)
    CELERY_BROKER    — URL do Redis broker Celery (padrão: redis://localhost:6379/1)
    CELERY_BACKEND   — URL do Redis backend Celery (padrão: redis://localhost:6379/2)

Este script é somente leitura. Não deleta, não expira e não modifica nenhuma chave.
"""
from __future__ import annotations

import asyncio
import os


async def _audit_redis(url: str, label: str) -> None:
    try:
        import redis.asyncio as aioredis
    except ImportError:
        print(f"[{label}] redis-py não instalado. Execute: pip install redis")
        return

    try:
        client = aioredis.from_url(url, decode_responses=True, socket_timeout=3)
        await client.ping()
    except Exception as exc:
        print(f"[{label}] Conexão falhou: {exc}")
        return

    info = await client.info("memory")
    used_memory_mb = round(int(info.get("used_memory", 0)) / 1024 / 1024, 2)
    peak_memory_mb = round(int(info.get("used_memory_peak", 0)) / 1024 / 1024, 2)
    dbsize = await client.dbsize()

    print(f"\n[{label}] {url}")
    print(f"  Chaves totais:    {dbsize}")
    print(f"  Memória usada:    {used_memory_mb} MB")
    print(f"  Pico de memória:  {peak_memory_mb} MB")

    # Amostra de chaves por padrão (SCAN — não bloqueia)
    patterns = {
        "session:*": "Sessões de auth",
        "celery-task-meta-*": "Resultados de tasks Celery",
        "matching:recompute:*": "Debounce de recompute de matches",
        "gc:oauth:*": "OAuth Google Calendar",
        "candidate_portal:*": "Sessões portal candidato",
        "rate_limit:*": "Rate limit counters",
    }

    eternal_keys: list[tuple[str, int]] = []

    for pattern, desc in patterns.items():
        count = 0
        no_ttl_count = 0
        async for key in client.scan_iter(match=pattern, count=100):
            count += 1
            if count > 50:
                break
            ttl = await client.ttl(key)
            if ttl == -1:
                no_ttl_count += 1
                eternal_keys.append((key, -1))

        if count > 0:
            status = "⚠️  SEM TTL" if no_ttl_count > 0 else "✓"
            print(f"  {status} {desc} ({pattern}): {count} amostradas, {no_ttl_count} sem TTL")

    if eternal_keys:
        print(f"\n  ⚠️  Chaves sem TTL detectadas ({len(eternal_keys)}):")
        for key, ttl in eternal_keys[:10]:
            size = await client.memory_usage(key) or 0
            print(f"    {key[:80]} | {round(size/1024,1)} KB")

    await client.aclose()


async def main():
    print("=" * 60)
    print("REDIS CACHE AUDIT — somente leitura")
    print("=" * 60)

    app_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    broker_url = os.getenv("CELERY_BROKER", "redis://localhost:6379/1")
    backend_url = os.getenv("CELERY_BACKEND", "redis://localhost:6379/2")

    await _audit_redis(app_url, "App Redis (sessões, rate-limit, oauth)")
    await _audit_redis(broker_url, "Celery Broker (filas)")
    await _audit_redis(backend_url, "Celery Backend (resultados)")

    print("\n" + "=" * 60)
    print("Script concluído. Nenhuma chave modificada.")


if __name__ == "__main__":
    asyncio.run(main())
