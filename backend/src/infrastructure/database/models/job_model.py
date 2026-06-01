from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    requirements: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[str] = mapped_column(
        sa.Enum(
            "draft", "published", "paused", "closed", "cancelled", "archived", name="job_status"
        ),
        nullable=False,
        server_default="draft",
    )
    seniority_level: Mapped[str | None] = mapped_column(sa.String(50))
    minimum_education_level: Mapped[str | None] = mapped_column(sa.String(50))
    minimum_years_experience: Mapped[Decimal | None] = mapped_column(sa.Numeric(4, 1))
    deal_breakers: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    work_model: Mapped[str | None] = mapped_column(sa.String(50))
    location: Mapped[str | None] = mapped_column(sa.String(255))
    salary_min: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 2))
    salary_max: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 2))
    salary_currency: Mapped[str] = mapped_column(
        sa.String(10), nullable=False, server_default="BRL"
    )
    job_area: Mapped[str | None] = mapped_column(sa.String(50))
    responsibilities: Mapped[str | None] = mapped_column(sa.Text)
    experience_context: Mapped[str | None] = mapped_column(sa.Text)
    behavioral_requirements: Mapped[list] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    mandatory_skills: Mapped[list] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    nice_to_have_skills: Mapped[list] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    screening_questions: Mapped[list] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default="[]"
    )
    benefits: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
    working_hours: Mapped[str | None] = mapped_column(sa.String(200))
    priority: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="normal")
    quality_score: Mapped[int | None] = mapped_column(sa.Integer)
    quality_status: Mapped[str | None] = mapped_column(sa.String(20))
    skill_requirements: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    job_profile_json: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    job_profile_hash: Mapped[str | None] = mapped_column(sa.String(16))
    operational_group_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("operational_groups.id", ondelete="SET NULL"),
    )
    location_group_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("location_groups.id", ondelete="SET NULL"),
    )
    allocation_mode: Mapped[str | None] = mapped_column(sa.String(30))
    behavioral_template_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_templates.id", ondelete="SET NULL"),
    )
    created_by: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    archived_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("users.id")
    )
    archived_previous_status: Mapped[str | None] = mapped_column(sa.String(30))
    archive_reason: Mapped[str | None] = mapped_column(sa.String(100))
    archive_reason_note: Mapped[str | None] = mapped_column(sa.Text)
    expires_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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
    deleted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    selection_flow_type: Mapped[str] = mapped_column(
        sa.String(30), nullable=False, server_default="standard"
    )
    requires_behavioral_assessment: Mapped[bool] = mapped_column(
        sa.Boolean(), nullable=False, server_default=sa.text("true")
    )
    requires_behavioral_ai_evaluation: Mapped[bool] = mapped_column(
        sa.Boolean(), nullable=False, server_default=sa.text("true")
    )
    requires_interview: Mapped[bool] = mapped_column(
        sa.Boolean(), nullable=False, server_default=sa.text("true")
    )
    requires_scorecard: Mapped[bool] = mapped_column(
        sa.Boolean(), nullable=False, server_default=sa.text("true")
    )
    requires_manager_review: Mapped[bool] = mapped_column(
        sa.Boolean(), nullable=False, server_default=sa.text("false")
    )

    job_units: Mapped[list["JobUnitModel"]] = relationship(
        "JobUnitModel",
        back_populates="job",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="JobUnitModel.created_at.asc()",
    )

    @property
    def operational_unit_ids(self) -> list[UUID]:
        return [unit.operational_unit_id for unit in self.job_units if unit.is_active]


class JobUnitModel(Base):
    __tablename__ = "job_units"
    __table_args__ = (
        sa.UniqueConstraint("job_id", "operational_unit_id", name="uq_job_units_job_unit"),
    )

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
        index=True,
    )
    operational_unit_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("operational_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    openings_count: Mapped[int | None] = mapped_column(sa.Integer)
    priority: Mapped[int | None] = mapped_column(sa.Integer)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean(),
        nullable=False,
        default=True,
        server_default=sa.text("true"),
        index=True,
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

    job: Mapped[JobModel] = relationship(
        "JobModel",
        back_populates="job_units",
        lazy="noload",
    )


class JobRequiredSkillModel(Base):
    __tablename__ = "job_required_skills"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("jobs.id"), nullable=False
    )
    skill_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("skills.id"), nullable=False
    )
    priority_level: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default="complementary"
    )
    minimum_level: Mapped[str | None] = mapped_column(sa.String(50))
    minimum_years: Mapped[Decimal | None] = mapped_column(sa.Numeric(4, 1))
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
    deleted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
