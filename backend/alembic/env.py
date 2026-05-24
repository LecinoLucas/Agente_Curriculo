import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# Importa todos os modelos para que o autogenerate os detecte
import src.infrastructure.database.models  # noqa: F401
from alembic import context
from src.infrastructure.database.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.getenv("DATABASE_URL")
if not database_url:
    from src.core.settings import settings

    database_url = settings.DATABASE_URL

config.set_main_option(
    "sqlalchemy.url",
    database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://"),
)

target_metadata = Base.metadata

IGNORED_AUTOGENERATE_TABLES = {"audit_logs_default"}


def include_object(object_, name, type_, reflected, compare_to):
    if type_ == "table" and name in IGNORED_AUTOGENERATE_TABLES:
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_async_engine(
        database_url,
        poolclass=pool.NullPool,
    )

    def do_run_migrations(connection: Connection) -> None:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()

    async def run() -> None:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
        await connectable.dispose()

    import asyncio

    asyncio.run(run())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
