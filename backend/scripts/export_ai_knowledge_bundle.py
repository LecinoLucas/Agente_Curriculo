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


async def run_export(output_path: Path, *, include_archived: bool = False) -> None:
    async with AsyncSessionFactory() as session:
        service = AIKnowledgePortabilityService(session)
        bundle = await service.export_bundle(include_archived=include_archived)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(bundle, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Bundle exportado: {output_path} ({bundle['document_count']} documento(s)).")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Exporta a Base de Conhecimento em bundle portátil.")
    parser.add_argument("output", help="Caminho do arquivo JSON de saída.")
    parser.add_argument(
        "--include-archived",
        action="store_true",
        help="Inclui documentos arquivados no bundle.",
    )
    args = parser.parse_args()
    asyncio.run(run_export(Path(args.output), include_archived=args.include_archived))
