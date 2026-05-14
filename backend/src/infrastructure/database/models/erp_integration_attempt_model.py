"""ERP integration attempts model (dry-run/real modes)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class ErpIntegrationAttemptModel(Base):
    __tablename__ = "erp_integration_attempts"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    package_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("admission_export_packages.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("pre_admission_cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(sa.String(40), nullable=False, server_default="protheus")
    mode: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="dry_run")
    status: Mapped[str] = mapped_column(sa.String(40), nullable=False, server_default="draft")
    idempotency_key: Mapped[Optional[str]] = mapped_column(sa.String(255))
    external_reference: Mapped[Optional[str]] = mapped_column(sa.String(255))
    http_status: Mapped[Optional[int]] = mapped_column(sa.Integer)
    request_headers_json: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    response_headers_json: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    attempt_number: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="1")
    request_payload_json: Mapped[dict] = mapped_column(JSONB_COMPAT, nullable=False)
    response_payload_json: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    validation_errors_json: Mapped[Optional[list]] = mapped_column(JSONB_COMPAT)
    error_message: Mapped[Optional[str]] = mapped_column(sa.Text)
    attempted_by: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
        onupdate=lambda: datetime.now(UTC),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))

    __table_args__ = (
        sa.CheckConstraint("provider IN ('protheus')", name="ck_erp_attempt_provider"),
        sa.CheckConstraint("mode IN ('dry_run', 'mock', 'real')", name="ck_erp_attempt_mode"),
        sa.CheckConstraint(
            "status IN ('draft', 'validation_failed', 'ready', 'simulated', 'failed', 'sent')",
            name="ck_erp_attempt_status",
        ),
        sa.Index("idx_erp_attempt_package_created", "package_id", "created_at"),
        sa.Index("idx_erp_attempt_case_created", "case_id", "created_at"),
        sa.Index("idx_erp_attempt_idempotency_key", "idempotency_key"),
        sa.UniqueConstraint(
            "provider",
            "mode",
            "package_id",
            "idempotency_key",
            "attempt_number",
            name="uq_erp_attempt_provider_mode_package_idempotency_attempt",
        ),
    )
