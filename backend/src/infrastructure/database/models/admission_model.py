from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class Admission(Base):
    __tablename__ = "admissions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id"),
        nullable=False,
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="pending",
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
    )

    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'approved', 'rejected')",
            name="ck_admission_status",
        ),
        sa.UniqueConstraint(
            "candidate_id",
            "job_id",
            name="uq_admissions_candidate_job",
        ),
    )


class DocumentRequirement(Base):
    __tablename__ = "document_requirements"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    is_required: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
    )


class CandidateDocument(Base):
    __tablename__ = "candidate_documents"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    admission_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("admissions.id"),
        nullable=False,
    )
    document_requirement_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("document_requirements.id"),
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(sa.String(1024), nullable=False)
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="pending",
    )
    structured_data: Mapped[dict | None] = mapped_column(sa.JSON)
    uploaded_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    validated_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))

    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_candidate_document_status",
        ),
        sa.UniqueConstraint(
            "admission_id",
            "document_requirement_id",
            name="uq_candidate_documents_admission_requirement",
        ),
    )
