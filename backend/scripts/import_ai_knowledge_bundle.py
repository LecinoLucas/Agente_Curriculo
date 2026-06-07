import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.application.services.ai_knowledge_portability_service import (
    AIKnowledgePortabilityService,
)
from src.infrastructure.database.connection import AsyncSessionFactory, engine


async def run_import(bundle_path: Path) -> None:
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    async with AsyncSessionFactory() as session:
        service = AIKnowledgePortabilityService(session)
        result = await service.import_bundle(bundle)

    print(
        "Importação concluída: "
        f"criados={result.created}, atualizados={result.updated}, "
        f"inalterados={result.unchanged}, arquivados={result.archived}"
    )
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa um bundle portátil da Base de Conhecimento.")
    parser.add_argument("bundle", help="Caminho do arquivo JSON do bundle.")
    args = parser.parse_args()
    asyncio.run(run_import(Path(args.bundle)))
