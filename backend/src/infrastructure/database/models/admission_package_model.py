"""Admission export package models for ERP integration preparation."""

from __future__ import annotations

from datetime import datetime, UTC
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class AdmissionExportPackageModel(Base):
    """Admission package for manual ERP integration — snapshot of candidate data ready for export."""

    __tablename__ = "admission_export_packages"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
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
    # Status: draft → ready_for_review → approved_for_export → exported
    #         OR → cancelled
    status: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        default="draft",
    )
    # Snapshot of payload at creation time — independent of live data
    payload_json: Mapped[dict] = mapped_column(JSONB_COMPAT, nullable=False)
    # Validation errors (if any) at creation time
    validation_errors_json: Mapped[Optional[list]] = mapped_column(
        JSONB_COMPAT, nullable=True
    )
    # Audit trail
    created_by: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
    )
    approved_by: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
    )
    exported_by: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    exported_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )

    __table_args__ = (
        sa.CheckConstraint(
            f"status IN ('draft', 'ready_for_review', 'approved_for_export', 'exported', 'cancelled')",
            name="ck_admission_package_status",
        ),
        sa.Index("idx_admission_package_case_status", "case_id", "status"),
        sa.Index("idx_admission_package_candidate_created", "candidate_id", "created_at"),
    )
