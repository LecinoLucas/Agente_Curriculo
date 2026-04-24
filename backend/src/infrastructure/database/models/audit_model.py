import sqlalchemy as sa
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

# Tabela append-only — sem updated_at, sem deleted_at, sem soft delete.
# Particionada por mês no PostgreSQL (definido no schema SQL direto).
# SQLAlchemy mapeia para a tabela pai; o particionamento é transparente.


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), nullable=False, server_default=sa.text("uuid_generate_v4()")
    )
    timestamp: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )
    user_id: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    session_id: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("user_sessions.id")
    )
    ip_address: Mapped[Optional[str]] = mapped_column(sa.String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(sa.Text)
    action: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    resource_id: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True))
    request_id: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True))
    http_method: Mapped[Optional[str]] = mapped_column(sa.String(10))
    http_path: Mapped[Optional[str]] = mapped_column(sa.Text)
    http_status_code: Mapped[Optional[int]] = mapped_column(sa.SmallInteger)
    before_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB_COMPAT)
    after_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB_COMPAT)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB_COMPAT, nullable=False, server_default="{}"
    )

    # PK composta necessária pelo particionamento por range
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", "timestamp"),
        {"postgresql_partition_by": "RANGE (timestamp)"},
    )
