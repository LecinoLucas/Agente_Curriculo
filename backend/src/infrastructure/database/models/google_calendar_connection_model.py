from __future__ import annotations

import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class GoogleCalendarConnectionModel(Base):
    """Conexão do usuário com o Google Calendar."""

    __tablename__ = "google_calendar_connections"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    user_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
        nullable=False,
    )
    google_account_email: Mapped[str] = mapped_column(
        sa.String(255),
        nullable=False,
    )
    access_token_encrypted: Mapped[str] = mapped_column(
        sa.Text,
        nullable=False,
    )
    refresh_token_encrypted: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    scopes: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
    )
    connected_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        # Garante que só exista uma conexão ativa por usuário
        sa.Index(
            "idx_google_connection_user_active",
            "user_id",
            unique=True,
            postgresql_where=sa.text("revoked_at IS NULL"),
            sqlite_where=sa.text("revoked_at IS NULL"),
        ),
        sa.Index("idx_google_connection_user_id", "user_id"),
    )
