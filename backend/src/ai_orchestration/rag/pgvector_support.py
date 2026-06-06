"""
pgvector Support: Utilitários para detecção e status da extensão pgvector no Postgres.

Permite que o sistema RAG decida entre busca vetorial real ou fallback JSON.
"""
from __future__ import annotations

import logging
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def is_pgvector_available(session: AsyncSession) -> bool:
    """Verifica se a extensão 'vector' está instalada e disponível no banco de dados.

    Faz uma consulta ao catálogo do Postgres para evitar exceções de sintaxe.
    """
    try:
        # Consulta standard para verificar extensões instaladas
        stmt = sa.text(
            "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
        )
        result = await session.execute(stmt)
        return result.scalar() == 1
    except Exception as exc:
        # Em SQLite ou erros de conexão, assumimos indisponível
        logger.debug(f"pgvector check failed (likely not Postgres or no extension): {exc}")
        return False


async def get_vector_extension_status(session: AsyncSession) -> dict[str, Any]:
    """Retorna um relatório detalhado sobre o suporte a vetores no ambiente atual."""
    available = await is_pgvector_available(session)
    
    status = {
        "pgvector_available": available,
        "storage_mode": "pgvector" if available else "json_fallback",
        "warnings": []
    }
    
    if not available:
        status["warnings"].append("pgvector_not_available")
        
    return status


def build_pgvector_unavailable_warning() -> str:
    """Retorna uma mensagem de aviso padrão para quando a busca vetorial está desativada."""
    return (
        "Busca vetorial desativada: extensão 'pgvector' não detectada no Postgres. "
        "O sistema está operando em modo de compatibilidade (JSON fallback)."
    )
