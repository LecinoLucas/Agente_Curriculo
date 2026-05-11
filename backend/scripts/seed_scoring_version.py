from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import sqlalchemy as sa

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel


# Versão alinhada com o score canônico determinístico atual.
DEFAULT_VERSION = "v3-canonical-det"

# ⚠️ SOMA PRECISA DAR 1.0
DEFAULT_WEIGHTS = {
    "priority_skill_match": 0.500000,
    "complementary_skill_match": 0.166667,
    "experience_match": 0.222222,
    "seniority_match": 0.111111,
    "ai_confidence": 0.000000,
}

DEFAULT_THRESHOLDS = {
    "high": 70,
    "low": 55,
    "strong_match": 85,
    "good_match": 70,
    "potential": 55,
    "not_match": 0,
    "hard_fail_max_score": 39,
    "priority_threshold": 60,
}


def _validate_weights(weights: dict[str, float]) -> None:
    total = round(sum(weights.values()), 6)

    if total != 1.0:
        raise RuntimeError(
            f"Pesos inválidos: soma={total}, esperado=1.0"
        )

    for key, value in weights.items():
        if value < 0:
            raise RuntimeError(
                f"Peso negativo inválido: {key}={value}"
            )


async def main() -> None:
    # 🔒 garante consistência antes de tocar no banco
    _validate_weights(DEFAULT_WEIGHTS)

    try:
        async with AsyncSessionFactory() as session:

            # 🔥 desativa TODAS versões anteriores (bug clássico resolvido)
            await session.execute(
                sa.update(ScoreModelVersionModel)
                .where(ScoreModelVersionModel.is_active.is_(True))
                .values(is_active=False)
            )

            # 🔍 verifica se já existe essa versão
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
                print(f"✅ Versão de scoring criada: {DEFAULT_VERSION}")
            else:
                version.weights = DEFAULT_WEIGHTS
                version.thresholds = DEFAULT_THRESHOLDS
                version.is_active = True
                print(f"♻️ Versão de scoring atualizada: {DEFAULT_VERSION}")

            await session.commit()

        print("🚀 Seed de scoring finalizado com sucesso.")

    except Exception as e:
        print(f"❌ Erro ao seed de scoring: {e}")
        raise

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
