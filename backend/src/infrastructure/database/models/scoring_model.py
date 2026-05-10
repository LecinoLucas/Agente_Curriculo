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


class ScoreModelVersionModel(Base):
    """Immutable record of a scoring formula: weights + thresholds at a point in time.

    Only one row may have is_active=True. Scores in candidate_job_scores always
    reference the version that was active when they were computed, guaranteeing
    that the same (candidate, job) pair always returns an auditable result even
    after the scoring formula evolves.
    """

    __tablename__ = "score_model_versions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    version: Mapped[str] = mapped_column(sa.String(20), nullable=False, unique=True)
    weights: Mapped[dict[str, Any]] = mapped_column(JSONB_COMPAT, nullable=False)
    thresholds: Mapped[dict[str, Any]] = mapped_column(JSONB_COMPAT, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    scores: Mapped[list[CandidateJobScoreModel]] = relationship(
        "CandidateJobScoreModel", back_populates="version", lazy="noload"
    )

    __table_args__ = (
        sa.Index("idx_score_model_versions_active", "is_active"),
    )


class CandidateJobScoreModel(Base):
    """Persisted multi-factor score for a (candidate, job) pair under a specific version.

    Written by CandidateRankingService.compute_and_persist(); never recomputed
    inline during GET /ranking. The unique constraint on (candidate_id, job_id,
    version_id) allows safe upserts: recomputing with the same version simply
    overwrites the previous result while preserving the audit trail via computed_at.

    VERSION TRACKING:
    - version_id (FK): The ScoreModelVersionModel that was active when this score was
      computed. This is the SOURCE OF TRUTH for score semantics (e.g., which factors
      were used, what weights applied). Always use version_id → version.version.
    - score_model_version: DEPRECATED denormalization of version.version for backward
      compatibility. Reads should use version.version from the FK instead.
    - explainability_version: Separate versioning for the explanation algorithm
      (e.g., LLM prompt version, response format). NOT tied to version_id.
      May diverge independently from score version.
    """

    __tablename__ = "candidate_job_scores"

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
    version_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("score_model_versions.id"),
        nullable=False,
    )
    source_analysis_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("analyses.id"),
        nullable=True,
    )
    source_analysis_created_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )
    input_hash: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    score_model_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    explainability_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    final_score: Mapped[Decimal] = mapped_column(sa.Numeric(5, 2), nullable=False)
    decision_suggestion: Mapped[str] = mapped_column(sa.String(30), nullable=False)
    breakdown: Mapped[dict[str, Any]] = mapped_column(JSONB_COMPAT, nullable=False)
    reason_codes: Mapped[list[Any]] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    explanation_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    factor_summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB_COMPAT, nullable=True)
    delta_summary_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB_COMPAT, nullable=True)
    freshness_status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
    )
    computed_at: Mapped[datetime] = mapped_column(
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
    previous_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2), nullable=True)
    recompute_reason: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    job_signature_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    job_updated_at: Mapped[datetime] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=False)

    version: Mapped[ScoreModelVersionModel] = relationship(
        "ScoreModelVersionModel", back_populates="scores", lazy="noload"
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "candidate_id", "job_id", "version_id",
            name="uq_candidate_job_score_version",
        ),
        sa.CheckConstraint(
            "freshness_status IN ('fresh', 'stale')",
            name="ck_candidate_job_scores_freshness_status",
        ),
        sa.Index("idx_candidate_job_scores_job_id", "job_id", "final_score"),
        sa.Index("idx_candidate_job_scores_candidate_job", "candidate_id", "job_id"),
        sa.Index("idx_candidate_job_scores_freshness", "job_id", "freshness_status"),
        sa.Index("idx_candidate_job_scores_input_hash", "job_id", "input_hash"),
        sa.Index("idx_candidate_job_scores_recompute_reason", "job_id", "recompute_reason"),
        sa.Index("idx_candidate_job_scores_job_signature", "job_id", "job_signature_hash"),
        sa.Index("idx_candidate_job_scores_job_updated", "job_id", "job_updated_at"),
    )


class CandidateJobScoreSnapshotModel(Base):
    __tablename__ = "candidate_job_score_snapshots"

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
    version_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("score_model_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    ranking_version: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    source_analysis_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("analyses.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_analysis_created_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )
    job_signature_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    score_model_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    explainability_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
    input_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    final_score: Mapped[Decimal] = mapped_column(sa.Numeric(5, 2), nullable=False)
    freshness_status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
    )
    computed_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    factors: Mapped[list[CandidateJobScoreFactorModel]] = relationship(
        "CandidateJobScoreFactorModel",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        sa.CheckConstraint(
            "freshness_status IN ('fresh', 'stale')",
            name="ck_candidate_job_score_snapshots_freshness_status",
        ),
        sa.Index("idx_candidate_job_score_snapshots_candidate_job", "candidate_id", "job_id", "computed_at"),
        sa.Index("idx_candidate_job_score_snapshots_job", "job_id", "computed_at"),
        sa.Index("idx_candidate_job_score_snapshots_input_hash", "job_id", "input_hash"),
    )


class CandidateJobScoreFactorModel(Base):
    __tablename__ = "candidate_job_score_factors"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    snapshot_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_job_score_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    factor_type: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    factor_key: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    factor_label: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    impact_score: Mapped[Decimal] = mapped_column(sa.Numeric(7, 2), nullable=False)
    normalized_weight: Mapped[Decimal] = mapped_column(sa.Numeric(6, 4), nullable=False)
    direction: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSONB_COMPAT, nullable=False, server_default="{}")
    display_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    snapshot: Mapped[CandidateJobScoreSnapshotModel] = relationship(
        "CandidateJobScoreSnapshotModel",
        back_populates="factors",
        lazy="noload",
    )

    __table_args__ = (
        sa.CheckConstraint(
            "factor_type IN ("
            "'required_skill_match',"
            "'missing_required_skill',"
            "'adjacent_skill_match',"
            "'experience_match',"
            "'insufficient_experience',"
            "'seniority_match',"
            "'seniority_gap',"
            "'education_match',"
            "'deal_breaker_violation',"
            "'eligibility_cap',"
            "'data_confidence_penalty'"
            ")",
            name="ck_candidate_job_score_factors_type",
        ),
        sa.CheckConstraint(
            "direction IN ('positive', 'negative', 'neutral')",
            name="ck_candidate_job_score_factors_direction",
        ),
        sa.Index("idx_candidate_job_score_factors_snapshot", "snapshot_id", "display_order"),
    )
