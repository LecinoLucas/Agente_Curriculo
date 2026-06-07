import asyncio
import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ai_orchestration.rag.ingestion_service import TextIngestionService
from src.ai_orchestration.rag.ingestion_plan import IngestionPipelineInput
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import SQLAlchemyKnowledgeDocumentRepository
from src.infrastructure.repositories.sqlalchemy_knowledge_chunk_repository import SQLAlchemyKnowledgeChunkRepository

DOCS_DIR = ROOT_DIR / "scripts" / "knowledge_seed_docs"

# ── Document configurations ───────────────────────────────────────────────────

SEED_DOCUMENTS = [
    {
        "filename": "admission_rules.md",
        "title": "Regras fictícias de pré-admissão",
        "source_type": "admission_checklist",
        "domain": "admission",
        "tags": ["pre-admissao", "checklist", "documentos"],
    },
    {
        "filename": "protheus_export_rules.md",
        "title": "Regras de Exportação Protheus (Fictício)",
        "source_type": "protheus_docs",
        "domain": "integration",
        "tags": ["protheus", "erp", "exportacao"],
    },
    {
        "filename": "pipeline_rules.md",
        "title": "Regras de Pipeline de Recrutamento",
        "source_type": "ats_guide",
        "domain": "recruitment",
        "tags": ["pipeline", "etapas", "gates"],
    },
    {
        "filename": "job_quality_rules.md",
        "title": "Guia de Qualidade de Vagas",
        "source_type": "hiring_rules",
        "domain": "recruitment",
        "tags": ["vagas", "qualidade", "requisitos"],
    },
    {
        "filename": "anti_discrimination_policy.md",
        "title": "Política Antidiscriminatória Interna",
        "source_type": "rh_policy",
        "domain": "compliance",
        "tags": ["diversidade", "inclusao", "politica"],
    },
    {
        "filename": "assistant_usage_policy.md",
        "title": "Política de Uso do Assistente IA",
        "source_type": "internal_guide",
        "domain": "ai_assistant",
        "tags": ["assistente", "ia", "seguranca"],
    },
]

# ── Validation ────────────────────────────────────────────────────────────────

SENSITIVE_PATTERNS = [
    r"\d{3}\.\d{3}\.\d{3}-\d{2}",  # CPF
    r"\d{2}\.\d{3}\.\d{3}-\d{1}",  # RG
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",  # Email
    r"\(\d{2}\)\s\d{4,5}-\d{4}",  # Telefone
    r"payload_json",
    r"vector_json",
    r"senha",
    r"token",
    r"api_key",
]

def validate_safe_content(content: str) -> bool:
    """Verifica se o conteúdo contém padrões sensíveis bloqueados."""
    for pattern in SENSITIVE_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            print(f"BLOQUEADO: Padrão sensível detectado ('{pattern}').")
            return False
    return True

# ── Seed implementation ───────────────────────────────────────────────────────

async def run_seed(dry_run: bool = False, force: bool = False) -> None:
    print(f"Iniciando seed da Base de Conhecimento RAG (dry_run={dry_run}, force={force})...")
    
    async with AsyncSessionFactory() as session:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(session)
        service = TextIngestionService(doc_repo, chunk_repo)
        
        counts = {"created": 0, "duplicated": 0, "reingested": 0, "failed": 0}
        
        for doc_cfg in SEED_DOCUMENTS:
            file_path = DOCS_DIR / doc_cfg["filename"]
            if not file_path.exists():
                print(f"AVISO: Arquivo não encontrado: {file_path}")
                counts["failed"] += 1
                continue
                
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            if not validate_safe_content(content):
                print(f"FALHA: Documento '{doc_cfg['filename']}' contém dados sensíveis. Pulando.")
                counts["failed"] += 1
                continue
                
            # Metadados obrigatórios
            metadata = {
                "source_type": doc_cfg["source_type"],
                "domain": doc_cfg["domain"],
                "title": doc_cfg["title"],
                "version": "1.0",
                "owner_area": "RH",
                "visibility": "internal",
                "allowed_roles": ["ADMIN", "HR", "RECRUITER", "MANAGER"],
                "sensitivity_level": "low",
                "language": "pt-BR",
                "tags": doc_cfg["tags"],
                "reviewed_by": "System Seed",
            }
            
            pipeline_input = IngestionPipelineInput(
                title=doc_cfg["title"],
                content=content,
                source_type=doc_cfg["source_type"],
                metadata=metadata,
                force_reingest=force
            )
            
            if dry_run:
                print(f"[DRY-RUN] Ingerindo: {doc_cfg['title']} ({doc_cfg['source_type']})")
                counts["created"] += 1
            else:
                try:
                    result = await service.ingest(pipeline_input)
                    if result.ok:
                        if result.reingested:
                            print(f"RE-INGERIDO (force): {doc_cfg['title']}")
                            counts["reingested"] += 1
                        elif result.was_duplicate:
                            print(f"DUPLICADO: {doc_cfg['title']} (hash: {result.content_hash[:8]}...)")
                            counts["duplicated"] += 1
                        else:
                            print(f"CRIADO: {doc_cfg['title']} (chunks: {result.chunks_created})")
                            counts["created"] += 1
                    else:
                        print(f"ERRO ao ingerir '{doc_cfg['title']}': {result.error}")
                        counts["failed"] += 1
                except Exception as exc:
                    print(f"EXCEÇÃO ao ingerir '{doc_cfg['title']}': {exc}")
                    counts["failed"] += 1
        
        if not dry_run:
            await session.commit()
            print("\nResumo final (Banco):")
        else:
            print("\nResumo final (Simulação):")
            
        print(f"  Criados: {counts['created']}")
        print(f"  Duplicados: {counts['duplicated']}")
        print(f"  Re-ingeridos: {counts['reingested']}")
        print(f"  Falhas: {counts['failed']}")

    await engine.dispose()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed da Base de Conhecimento RAG.")
    parser.add_argument("--dry-run", action="store_true", help="Valida e simula sem escrever no banco.")
    parser.add_argument("--force", action="store_true", help="Re-ingere mesmo se o documento já existir.")
    
    args = parser.parse_args()
    asyncio.run(run_seed(dry_run=args.dry_run, force=args.force))
