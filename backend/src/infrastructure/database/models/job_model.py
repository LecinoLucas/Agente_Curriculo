import sqlalchemy as sa
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    requirements: Mapped[Optional[str]] = mapped_column(sa.Text)
    status: Mapped[str] = mapped_column(
        sa.Enum("draft", "published", "paused", "closed", "cancelled", "archived", name="job_status"),
        nullable=False,
        server_default="draft",
    )
    seniority_level: Mapped[Optional[str]] = mapped_column(sa.String(50))
    minimum_education_level: Mapped[Optional[str]] = mapped_column(sa.String(50))
    minimum_years_experience: Mapped[Optional[Decimal]] = mapped_column(sa.Numeric(4, 1))
    deal_breakers: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    work_model: Mapped[Optional[str]] = mapped_column(sa.String(50))
    location: Mapped[Optional[str]] = mapped_column(sa.String(255))
    salary_min: Mapped[Optional[Decimal]] = mapped_column(sa.Numeric(12, 2))
    salary_max: Mapped[Optional[Decimal]] = mapped_column(sa.Numeric(12, 2))
    salary_currency: Mapped[str] = mapped_column(sa.String(10), nullable=False, server_default="BRL")
    job_area: Mapped[Optional[str]] = mapped_column(sa.String(50))
    responsibilities: Mapped[Optional[str]] = mapped_column(sa.Text)
    experience_context: Mapped[Optional[str]] = mapped_column(sa.Text)
    behavioral_requirements: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    priority: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="normal")
    quality_score: Mapped[Optional[int]] = mapped_column(sa.Integer)
    quality_status: Mapped[Optional[str]] = mapped_column(sa.String(20))
    skill_requirements: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    job_profile_json: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    job_profile_hash: Mapped[Optional[str]] = mapped_column(sa.String(16))
    created_by: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    closed_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    archived_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    archived_by: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    archived_previous_status: Mapped[Optional[str]] = mapped_column(sa.String(30))
    archive_reason: Mapped[Optional[str]] = mapped_column(sa.String(100))
    archive_reason_note: Mapped[Optional[str]] = mapped_column(sa.Text)
    expires_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
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


class JobRequiredSkillModel(Base):
    __tablename__ = "job_required_skills"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    job_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("jobs.id"), nullable=False)
    skill_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("skills.id"), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default="false")
    minimum_level: Mapped[Optional[str]] = mapped_column(sa.String(50))
    minimum_years: Mapped[Optional[Decimal]] = mapped_column(sa.Numeric(4, 1))
    weight: Mapped[Decimal] = mapped_column(sa.Numeric(4, 2), nullable=False, server_default="1.00")

    __table_args__ = (sa.UniqueConstraint("job_id", "skill_id", name="uq_job_skill"),)


class SkillModel(Base):
    __tablename__ = "skills"
    __table_args__ = (
        sa.Index(
            "uq_skills_normalized_name_active",
            "normalized_name",
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(sa.String(100))
    aliases: Mapped[list] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    is_verified: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default="false")
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


class SkillAliasModel(Base):
    __tablename__ = "skill_alias"
    __table_args__ = (
        sa.UniqueConstraint("alias_normalized", name="uq_skill_alias_alias_normalized"),
        sa.CheckConstraint(
            "alias_type IN ('synonym', 'abbreviation', 'vendor_variant')",
            name="ck_skill_alias_alias_type",
        ),
        sa.Index("idx_skill_alias_skill_active", "skill_id", "is_active"),
        sa.Index("idx_skill_alias_type_active", "alias_type", "is_active"),
        sa.Index("idx_skill_alias_normalized_active", "alias_normalized", "is_active"),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    skill_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    alias_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    alias_normalized: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    alias_type: Mapped[str] = mapped_column(sa.String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )


class SkillEquivalenceModel(Base):
    __tablename__ = "skill_equivalence"
    __table_args__ = (
        sa.CheckConstraint(
            "strength IN ('exact', 'strong', 'partial', 'weak')",
            name="ck_skill_equivalence_strength",
        ),
        sa.CheckConstraint(
            "direction IN ('source_to_target', 'bidirectional')",
            name="ck_skill_equivalence_direction",
        ),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_skill_equivalence_score_range",
        ),
        sa.CheckConstraint(
            "source_skill_id <> target_skill_id",
            name="ck_skill_equivalence_distinct_skills",
        ),
        sa.Index("idx_skill_equivalence_source_active", "source_skill_id", "is_active"),
        sa.Index("idx_skill_equivalence_target_active", "target_skill_id", "is_active"),
        sa.Index("idx_skill_equivalence_context_active", "context", "is_active"),
        sa.Index(
            "idx_skill_equivalence_source_target_active",
            "source_skill_id",
            "target_skill_id",
            "is_active",
        ),
        sa.Index(
            "idx_skill_equivalence_target_source_active",
            "target_skill_id",
            "source_skill_id",
            "is_active",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    source_skill_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    target_skill_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    strength: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    score: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    direction: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    context: Mapped[str | None] = mapped_column(sa.String(100))
    reason: Mapped[str] = mapped_column(sa.Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
