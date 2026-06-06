"""enable_pgvector_extension

Revision ID: 23dbb452c78a
Revises: 399c41dd0e2c
Create Date: 2026-06-06 14:10:39.566265

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '23dbb452c78a'
down_revision: Union[str, None] = '399c41dd0e2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Habilita a extensão pgvector se estivermos em Postgres
    # O comando execute é seguro pois se falhar (ex: sem permissão), 
    # o usuário deve habilitar manualmente.
    # Usamos try/except opcionalmente se quisermos ignorar erros em SQLite
    # mas o check 'IF NOT EXISTS' já ajuda no Postgres.
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except Exception as e:
        # Log ou print informativo, mas não trava se não for Postgres
        print(f"Aviso: Não foi possível criar a extensão 'vector'. Ignorado (comum em SQLite ou falta de permissão superuser). Detalhe: {e}")


def downgrade() -> None:
    # Geralmente não removemos extensões no downgrade por segurança e 
    # porque outros sistemas podem estar usando.
    pass
