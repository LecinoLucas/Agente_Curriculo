from __future__ import annotations

import asyncio
from typing import Optional

from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool

from src.core.settings import settings

_pool: Optional[ConnectionPool] = None
_pool_lock = asyncio.Lock()


# ─────────────────────────────────────────────
# POOL
# ─────────────────────────────────────────────

async def _get_pool() -> ConnectionPool:
    global _pool

    if _pool is not None:
        return _pool

    async with _pool_lock:
        if _pool is None:
            _pool = ConnectionPool.from_url(
                settings.REDIS_URL,

                max_connections=settings.REDIS_MAX_CONNECTIONS,

                # 🔥 TIMEOUTS (CRÍTICO)
                socket_connect_timeout=5,
                socket_timeout=5,

                # 🔥 estabilidade
                retry_on_timeout=True,

                # 🔥 detecta conexão morta
                health_check_interval=30,

                # 🔥 NÃO forçar decode
                decode_responses=False,
            )

    return _pool


# ─────────────────────────────────────────────
# CLIENT
# ─────────────────────────────────────────────

async def get_redis() -> Redis:
    pool = await _get_pool()
    return Redis(connection_pool=pool)


# ─────────────────────────────────────────────
# CLOSE
# ─────────────────────────────────────────────

async def close_redis() -> None:
    global _pool

    if _pool is not None:
        await _pool.disconnect()
        await _pool.aclose()
        _pool = None