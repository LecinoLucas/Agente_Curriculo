from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
    AsyncEngine,
)
from sqlalchemy.pool import NullPool

from src.core.settings import settings
def _make_engine(poolclass=None):
    """Factory para criar AsyncEngine.

    poolclass=NullPool para Celery.
    Pool padrão para FastAPI.
    """
    engine_kwargs = {
        "pool_pre_ping": True,
        "echo": settings.APP_DEBUG,
    }

    if poolclass is not None:
        engine_kwargs["poolclass"] = poolclass
    else:
        engine_kwargs.update(
            {
                "pool_size": settings.DATABASE_POOL_SIZE,
                "max_overflow": settings.DATABASE_MAX_OVERFLOW,
                "pool_timeout": settings.DATABASE_POOL_TIMEOUT,
            }
        )

    return create_async_engine(
        settings.DATABASE_URL,
        **engine_kwargs,
    )


def get_session_factory():
    """Para FastAPI: retorna sessionmaker global (reutiliza conexões no mesmo loop)."""
    return AsyncSessionFactory


async def create_celery_async_sessionmaker() -> tuple[AsyncEngine, async_sessionmaker]:
    """Factory CELERY-SPECIFIC: cria engine + sessionmaker DENTRO do event loop da task.

    Retorna (engine, sessionmaker) para uso dentro de asyncio.run().

    IMPORTANTE: Chamar await engine.dispose() no finally para limpar pool!
    """
    celery_engine = _make_engine(poolclass=NullPool)
    celery_sessionmaker = async_sessionmaker(
        celery_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    return celery_engine, celery_sessionmaker


# ─────────────────────────────────────────────────────────────────
# GLOBAL: FastAPI / web requests (reutiliza conexões no mesmo loop)
# ─────────────────────────────────────────────────────────────────
engine = _make_engine()
AsyncSessionFactory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: sessão para um request."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_database_health() -> bool:
    """Health check usando engine global."""
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
