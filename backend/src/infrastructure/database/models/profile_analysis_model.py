from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class CandidateProfileAnalysisModel(Base):
    __tablename__ = "candidate_profile_analysis"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    resume_version_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("resume_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    model_id: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    prompt_version: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    professional_area: Mapped[str | None] = mapped_column(sa.String(50))
    seniority_level: Mapped[str | None] = mapped_column(sa.String(50))
    education_level: Mapped[str | None] = mapped_column(sa.String(100))
    experience_years: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    skills_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    summary: Mapped[str | None] = mapped_column(sa.Text)
    strengths_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    weaknesses_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    raw_response_json: Mapped[dict] = mapped_column(JSONB_COMPAT, nullable=False, server_default="{}")
    input_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    output_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "resume_version_id",
            "provider",
            "model_id",
            "prompt_version",
            name="uq_candidate_profile_analysis_version_model_prompt",
        ),
        sa.Index("idx_candidate_profile_analysis_candidate", "candidate_id", "created_at"),
        sa.Index("idx_candidate_profile_analysis_resume", "resume_version_id", "created_at"),
    )


class JobProfileAnalysisModel(Base):
    __tablename__ = "job_profile_analysis"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    model_id: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    prompt_version: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    job_signature_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    job_area: Mapped[str | None] = mapped_column(sa.String(50))
    seniority_required: Mapped[str | None] = mapped_column(sa.String(50))
    education_required: Mapped[str | None] = mapped_column(sa.String(100))
    experience_required: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    # DEPRECATED: Use skill_requirements from JobModel instead. Keep for backward compatibility with historical data.
    required_skills_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    nice_to_have_skills_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    responsibilities_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    raw_response_json: Mapped[dict] = mapped_column(JSONB_COMPAT, nullable=False, server_default="{}")
    input_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    output_tokens: Mapped[int | None] = mapped_column(sa.Integer)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "job_id",
            "job_signature_hash",
            "provider",
            "model_id",
            "prompt_version",
            name="uq_job_profile_analysis_version_model_prompt",
        ),
        sa.Index("idx_job_profile_analysis_job", "job_id", "created_at"),
        sa.Index("idx_job_profile_analysis_signature", "job_signature_hash"),
    )


class CandidateJobMatchModel(Base):
    __tablename__ = "candidate_job_match"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
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
    resume_version_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("resume_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_profile_analysis_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_profile_analysis.id", ondelete="CASCADE"),
        nullable=False,
    )
    job_profile_analysis_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("job_profile_analysis.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_job_pipeline_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_job_pipeline.candidate_job_pipeline_id", ondelete="SET NULL"),
    )
    match_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    recommendation: Mapped[str | None] = mapped_column(sa.String(50))
    matched_skills_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    missing_skills_json: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    explanation: Mapped[str | None] = mapped_column(sa.Text)
    eligibility_status: Mapped[str | None] = mapped_column(sa.String(20))
    strict_score: Mapped[int | None] = mapped_column(sa.Integer)
    balanced_score: Mapped[int | None] = mapped_column(sa.Integer)
    score_version: Mapped[str | None] = mapped_column(sa.String(50))
    skill_evidence_breakdown: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    possible_false_negative: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("false"),
    )
    score_diff: Mapped[int | None] = mapped_column(sa.Integer)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "candidate_id",
            "job_id",
            "resume_version_id",
            "candidate_profile_analysis_id",
            "job_profile_analysis_id",
            name="uq_candidate_job_match_profile_pair",
        ),
        sa.CheckConstraint(
            "eligibility_status IS NULL OR eligibility_status IN ('PASS', 'REVIEW', 'FAIL')",
            name="ck_candidate_job_match_eligibility_status",
        ),
        sa.CheckConstraint(
            "strict_score IS NULL OR (strict_score >= 0 AND strict_score <= 100)",
            name="ck_candidate_job_match_strict_score_range",
        ),
        sa.CheckConstraint(
            "balanced_score IS NULL OR (balanced_score >= 0 AND balanced_score <= 100)",
            name="ck_candidate_job_match_balanced_score_range",
        ),
        sa.Index("idx_candidate_job_match_job_score", "job_id", "match_score"),
        sa.Index("idx_candidate_job_match_job_created", "job_id", "created_at"),
        sa.Index("idx_candidate_job_match_candidate_job", "candidate_id", "job_id"),
        sa.Index("idx_candidate_job_match_pipeline", "candidate_job_pipeline_id"),
        sa.Index("idx_candidate_job_match_eligibility_status", "eligibility_status"),
        sa.Index("idx_candidate_job_match_score_version", "score_version"),
        sa.Index("idx_candidate_job_match_possible_false_negative", "possible_false_negative"),
        sa.Index("idx_candidate_job_match_balanced_score", "balanced_score"),
    )
