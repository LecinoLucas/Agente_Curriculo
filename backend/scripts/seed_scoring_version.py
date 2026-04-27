import asyncio
import sys
from pathlib import Path

import sqlalchemy as sa

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel


DEFAULT_VERSION = "v1-dev"
DEFAULT_WEIGHTS = {
    "skill_match_score": 0.40,
    "experience_match_score": 0.20,
    "seniority_match_score": 0.15,
    "education_score": 0.10,
    "ai_confidence_score": 0.20,
    "penalty_score": -0.05,
}
DEFAULT_THRESHOLDS = {
    "high": 70,
    "low": 45,
}


async def main() -> None:
    async with AsyncSessionFactory() as session:
        active = await session.scalar(
            sa.select(ScoreModelVersionModel).where(
                ScoreModelVersionModel.is_active.is_(True)
            )
        )
        if active is not None:
            print(f"Versao de scoring ativa ja existe: {active.version}")
            await engine.dispose()
            return

        version = await session.scalar(
            sa.select(ScoreModelVersionModel).where(
                ScoreModelVersionModel.version == DEFAULT_VERSION
            )
        )

        if version is None:
            version = ScoreModelVersionModel(
                version=DEFAULT_VERSION,
                weights=DEFAULT_WEIGHTS,
                thresholds=DEFAULT_THRESHOLDS,
                is_active=True,
            )
            session.add(version)
            print(f"Versao de scoring criada: {DEFAULT_VERSION}")
        else:
            version.weights = DEFAULT_WEIGHTS
            version.thresholds = DEFAULT_THRESHOLDS
            version.is_active = True
            print(f"Versao de scoring reativada: {DEFAULT_VERSION}")

        await session.commit()

    await engine.dispose()
    print("Seed de scoring finalizado.")


if __name__ == "__main__":
    asyncio.run(main())
