import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.settings import settings
from src.infrastructure.database.connection import engine

TARGET_MODELS = {
    "anthropic": {
        "provider": "anthropic",
        "model_id": "claude-sonnet-4-20250514",
        "model_name": "Claude Sonnet 4",
        "context_window": 200000,
    },
    "google": {
        "provider": "google",
        "model_id": "gemini-2.5-flash",
        "model_name": "Gemini 2.5 Flash",
        "context_window": 2000000,
    },
}


async def table_exists(connection, table_name: str) -> bool:
    result = await connection.execute(
        text(
            """
            SELECT to_regclass(:table_name)
            """
        ),
        {"table_name": table_name},
    )
    return result.scalar() is not None


async def seed_ai_models(connection) -> None:
    if not await table_exists(connection, "ai_models"):
        return

    target = dict(TARGET_MODELS[settings.AI_PROVIDER])
    target["model_id"] = settings.AI_MODEL_ID
    target["model_name"] = settings.AI_MODEL_ID.replace("-", " ").title()

    await connection.execute(
        text(
            """
            INSERT INTO ai_models (
                provider,
                model_id,
                model_name,
                context_window,
                is_active,
                activated_at,
                deprecated_at
            )
            VALUES (
                :provider,
                :model_id,
                :model_name,
                :context_window,
                true,
                NOW(),
                NULL
            )
            ON CONFLICT (model_id) DO UPDATE SET
                provider = EXCLUDED.provider,
                model_name = EXCLUDED.model_name,
                context_window = EXCLUDED.context_window
            """
        ),
        target,
    )

    await connection.execute(
        text(
            """
            UPDATE ai_models
            SET
                is_active = false,
                deprecated_at = CASE
                    WHEN is_active THEN NOW()
                    ELSE deprecated_at
                END
            WHERE model_id <> :model_id
            """
        ),
        {"model_id": target["model_id"]},
    )

    await connection.execute(
        text(
            """
            UPDATE ai_models
            SET
                is_active = true,
                provider = :provider,
                model_name = :model_name,
                context_window = :context_window,
                activated_at = NOW(),
                deprecated_at = NULL
            WHERE model_id = :model_id
            """
        ),
        target,
    )


async def main() -> None:
    async with engine.begin() as connection:
        await seed_ai_models(connection)

    await engine.dispose()
    print(f"AI models seeded for provider={settings.AI_PROVIDER}")


if __name__ == "__main__":
    asyncio.run(main())
