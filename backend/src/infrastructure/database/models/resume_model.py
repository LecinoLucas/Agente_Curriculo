import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base


class ResumeModel(Base):
    __tablename__ = "resumes"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("candidates.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        sa.Enum("active", "archived", "deleted", name="resume_status"),
        nullable=False,
        server_default="active",
    )
    current_version: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="1")
    created_by: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
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
    deleted_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))

    candidate: Mapped["CandidateModel"] = relationship(  # type: ignore[name-defined]
        "CandidateModel", back_populates="resumes", lazy="noload"
    )
    versions: Mapped[list["ResumeVersionModel"]] = relationship(
        "ResumeVersionModel", back_populates="resume", lazy="noload"
    )


class ResumeVersionModel(Base):
    __tablename__ = "resume_versions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    resume_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("resumes.id"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    s3_bucket: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    s3_etag: Mapped[Optional[str]] = mapped_column(sa.String(100))
    s3_version_id: Mapped[Optional[str]] = mapped_column(sa.String(200))
    original_file_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    file_hash_sha256: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    mime_type: Mapped[str] = mapped_column(sa.String(100), nullable=False, server_default="application/pdf")
    extracted_text: Mapped[Optional[str]] = mapped_column(sa.Text)
    extraction_status: Mapped[str] = mapped_column(
        sa.String(50), nullable=False, server_default="pending"
    )
    extraction_error: Mapped[Optional[str]] = mapped_column(sa.Text)
    page_count: Mapped[Optional[int]] = mapped_column(sa.Integer)
    word_count: Mapped[Optional[int]] = mapped_column(sa.Integer)
    language_detected: Mapped[Optional[str]] = mapped_column(sa.String(10))
    uploaded_by: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (sa.UniqueConstraint("resume_id", "version_number", name="uq_resume_version"),)

    resume: Mapped["ResumeModel"] = relationship("ResumeModel", back_populates="versions", lazy="noload")
