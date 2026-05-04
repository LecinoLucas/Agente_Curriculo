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


# 🔥 Nova versão alinhada com evidence_matcher + full_analysis
DEFAULT_VERSION = "v2-evidence-dev"

# ⚠️ SOMA PRECISA DAR 1.0
DEFAULT_WEIGHTS = {
    "critical_requirements": 0.40,
    "skill_match": 0.25,
    "experience_match": 0.15,
    "seniority_match": 0.10,
    "education_match": 0.05,
    "differentials": 0.05,
}

DEFAULT_THRESHOLDS = {
    "strong_match": 82,
    "interview": 65,
    "maybe": 45,
    "not_match": 0,
    "hard_fail_max_score": 39,
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