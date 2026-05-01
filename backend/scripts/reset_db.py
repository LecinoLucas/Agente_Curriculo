#!/usr/bin/env python3
"""
Script de limpeza nuclear do banco de dados - Remove tudo exceto usuários

⚠️ CUIDADO: Este script é destrutivo e remove TODOS os dados operacionais
⚠️ Preserva APENAS usuários cadastrados

Uso:
    python scripts/reset_db.py

Opções:
    --confirm    Executa sem pedir confirmação (use com cuidado!)
    --dry-run    Mostra o que será removido sem executar
"""

import asyncio
import sys
from datetime import datetime

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Importar modelos
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.document_ai_analysis_model import DocumentAIAnalysisModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel
from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from src.infrastructure.database.models.audit_model import AuditLogModel


async def count_records(session: AsyncSession) -> dict:
    """Conta registros em cada tabela."""
    counts = {}

    models = [
        ("Usuários", "user"),
        ("Candidatos", CandidateModel),
        ("Resumes", ResumeModel),
        ("Vagas", JobModel),
        ("Pipeline", CandidatePipelineModel),
        ("Análises", AnalysisModel),
        ("Análises DocumentAI", DocumentAIAnalysisModel),
        ("Scores", CandidateJobScoreModel),
        ("Versões Score", ScoreModelVersionModel),
        ("Eventos Pipeline", PipelineEventModel),
        ("Audit Logs", AuditLogModel),
    ]

    for label, model in models:
        try:
            result = await session.execute(
                text(f'SELECT COUNT(*) FROM "{model.__tablename__}"')
                if isinstance(model, str)
                else text(f'SELECT COUNT(*) FROM "{model.__tablename__}"')
            )
            count = result.scalar()
            counts[label] = count
        except Exception as e:
            counts[label] = f"Erro: {str(e)}"

    return counts


async def reset_database(database_url: str, dry_run: bool = False, skip_confirm: bool = False):
    """Executa o reset do banco de dados."""

    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("\n" + "="*80)
        print("🗑️  LIMPEZA NUCLEAR DO BANCO DE DADOS")
        print("="*80)

        print("\n📊 Estado ANTES da limpeza:")
        before = await count_records(session)
        for label, count in before.items():
            print(f"  {label:.<40} {count}")

        if dry_run:
            print("\n🔍 DRY-RUN: Nenhuma alteração foi feita.")
            print("   Execute sem --dry-run para proceder com a limpeza.")
            await engine.dispose()
            return

        # Pedir confirmação
        if not skip_confirm:
            print("\n" + "!"*80)
            print("⚠️  ATENÇÃO: Esta ação é IRREVERSÍVEL!")
            print("⚠️  Serão removidos TODOS os dados, exceto usuários cadastrados")
            print("!"*80)
            response = input("\nDigite 'sim, tenho certeza' para proceder: ").strip().lower()
            if response != "sim, tenho certeza":
                print("❌ Operação cancelada.")
                await engine.dispose()
                return

        print("\n🔄 Executando limpeza...")

        try:
            # Desabilitar constraints
            await session.execute(text("ALTER TABLE candidate_pipeline DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE resume DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE candidate_job_score DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE analysis DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE document_ai_analysis DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE job DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE candidate DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE pipeline_event DISABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE audit_log DISABLE TRIGGER ALL;"))

            # Remover dados
            await session.execute(delete(PipelineEventModel))
            await session.execute(delete(AuditLogModel))
            await session.execute(delete(DocumentAIAnalysisModel))
            await session.execute(delete(AnalysisModel))
            await session.execute(delete(CandidateJobScoreModel))
            await session.execute(delete(ScoreModelVersionModel))
            await session.execute(delete(JobModel))
            await session.execute(delete(CandidatePipelineModel))
            await session.execute(delete(ResumeModel))
            await session.execute(delete(CandidateModel))

            # Reabilitar constraints
            await session.execute(text("ALTER TABLE candidate_pipeline ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE resume ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE candidate_job_score ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE analysis ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE document_ai_analysis ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE job ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE candidate ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE pipeline_event ENABLE TRIGGER ALL;"))
            await session.execute(text("ALTER TABLE audit_log ENABLE TRIGGER ALL;"))

            await session.commit()

            print("✅ Limpeza concluída!")

            # Mostrar estado após limpeza
            await session.refresh(session)
            print("\n📊 Estado APÓS a limpeza:")
            after = await count_records(session)
            for label, count in after.items():
                print(f"  {label:.<40} {count}")

            # Log da operação
            timestamp = datetime.now().isoformat()
            print(f"\n✓ Operação concluída em {timestamp}")

        except Exception as e:
            print(f"❌ Erro durante limpeza: {str(e)}")
            await session.rollback()
            raise
        finally:
            await engine.dispose()


async def main():
    from dotenv import load_dotenv
    import os

    # Carregar .env
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("❌ DATABASE_URL não encontrada em .env")
        sys.exit(1)

    # Parse argumentos
    dry_run = "--dry-run" in sys.argv
    skip_confirm = "--confirm" in sys.argv

    try:
        await reset_database(database_url, dry_run=dry_run, skip_confirm=skip_confirm)
    except Exception as e:
        print(f"❌ Erro: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
