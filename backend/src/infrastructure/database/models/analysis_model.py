from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class AIModelModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    provider: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    model_id: Mapped[str] = mapped_column(sa.String(255), nullable=False, unique=True)
    model_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    context_window: Mapped[int | None] = mapped_column(sa.Integer)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default="true")
    activated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    deprecated_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )


class PromptTemplateModel(Base):
    __tablename__ = "prompt_templates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    version: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    template_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(sa.Text)
    user_prompt_template: Mapped[str] = mapped_column(sa.Text, nullable=False)
    output_schema: Mapped[dict[str, Any] | None] = mapped_column(JSONB_COMPAT)
    max_tokens: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="4096")
    temperature: Mapped[Decimal] = mapped_column(
        sa.Numeric(3, 2),
        nullable=False,
        server_default="0.1",
    )
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default="false")
    activated_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    deactivated_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    created_by: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (sa.UniqueConstraint("name", "version", name="uq_prompt_template_version"),)


class AnalysisModel(Base):
    __tablename__ = "analyses"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    resume_version_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("resume_versions.id"), nullable=False
    )
    job_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("jobs.id"))
    ai_model_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("ai_models.id"), nullable=False
    )
    prompt_template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("prompt_templates.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        sa.Enum(
            "pending",
            "processing",
            "completed",
            "failed",
            "cancelled",
            name="analysis_status",
        ),
        nullable=False,
        server_default="pending",
    )
    priority: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, server_default="5")
    idempotency_key: Mapped[str | None] = mapped_column(sa.String(255), unique=True)
    requested_by: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(sa.Text)
    retry_count: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, server_default="0")
    max_retries: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, server_default="3")
    next_retry_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    queue_name: Mapped[str] = mapped_column(
        sa.String(100),
        nullable=False,
        server_default="analysis.default",
    )
    worker_id: Mapped[str | None] = mapped_column(sa.String(255))
    task_id: Mapped[str | None] = mapped_column(sa.String(255))
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
        sa.Index("idx_analyses_status_created_at", "status", "created_at"),
        sa.Index("idx_analyses_created_at", "created_at"),
    )

    result: Mapped[AnalysisResultModel | None] = relationship(
        "AnalysisResultModel", back_populates="analysis", uselist=False, lazy="noload"
    )


class AnalysisResultModel(Base):
    __tablename__ = "analysis_results"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    analysis_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("analyses.id"), nullable=False, unique=True
    )
    overall_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    technical_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    experience_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    education_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    communication_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    leadership_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    candidate_summary: Mapped[str | None] = mapped_column(sa.Text)
    seniority_level: Mapped[str | None] = mapped_column(sa.String(50))
    total_experience_years: Mapped[Decimal | None] = mapped_column(sa.Numeric(4, 1))
    highest_education_level: Mapped[str | None] = mapped_column(sa.String(100))
    highest_education_field: Mapped[str | None] = mapped_column(sa.String(255))
    strengths: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    weaknesses: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    recommendations: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    keywords: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    extracted_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        server_default="{}",
    )
    input_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    output_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    cache_read_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    cache_write_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    processing_time_ms: Mapped[int | None] = mapped_column(sa.Integer)
    raw_llm_response: Mapped[str | None] = mapped_column(sa.Text)
    prompt_version_used: Mapped[str | None] = mapped_column(sa.String(50))
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    analysis: Mapped[AnalysisModel] = relationship(
        "AnalysisModel", back_populates="result", lazy="noload"
    )


class ResumeJobMatchModel(Base):
    __tablename__ = "resume_job_matches"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    analysis_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("analyses.id"), nullable=False
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id"),
        nullable=False,
    )
    match_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    skills_match_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    experience_match_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    seniority_match_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    matched_skills: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    missing_skills: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    bonus_skills: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    match_summary: Mapped[str | None] = mapped_column(sa.Text)
    recommendation: Mapped[str | None] = mapped_column(sa.String(50))
    weights_source: Mapped[str | None] = mapped_column(sa.String(50), server_default="fallback_hardcoded")
    score_model_version_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("score_model_versions.id"),
        nullable=True,
    )
    validation_status: Mapped[str | None] = mapped_column(sa.String(50), server_default="pass")
    missing_evidence: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    rejection_reasons: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )

    __table_args__ = (
        sa.UniqueConstraint("analysis_id", "job_id", name="uq_resume_job_match"),
        sa.Index("idx_resume_job_matches_job_id", "job_id", "match_score"),
        sa.Index("idx_resume_job_matches_analysis_id", "analysis_id"),
    )


class MatchingObservationModel(Base):
    __tablename__ = "matching_observations"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id"),
        nullable=False,
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id"),
        nullable=False,
    )
    analysis_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("analyses.id"),
        nullable=True,
    )
    engine_used: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="unknown",
    )
    score: Mapped[Decimal] = mapped_column(
        sa.Numeric(5, 2),
        nullable=False,
        server_default="0",
    )
    confidence_score: Mapped[Decimal] = mapped_column(
        sa.Numeric(5, 2),
        nullable=False,
        server_default="0",
    )
    matched_skills: Mapped[list] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        server_default="[]",
    )
    missing_skills: Mapped[list] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        server_default="[]",
    )
    equivalences_used: Mapped[list] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        server_default="[]",
    )
    source: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="ui",
    )
    observed_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    liked: Mapped[bool | None] = mapped_column(sa.Boolean, nullable=True)
    rejected: Mapped[bool | None] = mapped_column(sa.Boolean, nullable=True)
    hired: Mapped[bool | None] = mapped_column(sa.Boolean, nullable=True)
    feedback_comment: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    feedback_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
        nullable=True,
    )
    feedback_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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
        sa.Index("idx_matching_observations_job_candidate", "job_id", "candidate_id"),
        sa.Index("idx_matching_observations_source", "source", "observed_at"),
        sa.Index("idx_matching_observations_observed_at", "observed_at"),
    )
