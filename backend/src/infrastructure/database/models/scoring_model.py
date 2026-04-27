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
    final_score: Mapped[Decimal] = mapped_column(sa.Numeric(5, 2), nullable=False)
    decision_suggestion: Mapped[str] = mapped_column(sa.String(30), nullable=False)
    breakdown: Mapped[dict[str, Any]] = mapped_column(JSONB_COMPAT, nullable=False)
    reason_codes: Mapped[list[Any]] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    explanation_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    version: Mapped[ScoreModelVersionModel] = relationship(
        "ScoreModelVersionModel", back_populates="scores", lazy="noload"
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "candidate_id", "job_id", "version_id",
            name="uq_candidate_job_score_version",
        ),
        sa.Index("idx_candidate_job_scores_job_id", "job_id", "final_score"),
        sa.Index("idx_candidate_job_scores_candidate_job", "candidate_id", "job_id"),
    )
