from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

APPLICATION_ACTIVE_STATUSES = ("started", "qualified", "submitted", "linked_to_pipeline")
APPLICATION_STATUSES = (*APPLICATION_ACTIVE_STATUSES, "abandoned", "cancelled")
APPLICATION_SOURCES = ("web_portal", "bot", "whatsapp", "staff")


class CandidateApplicationModel(Base):
    __tablename__ = "candidate_applications"
    __table_args__ = (
        sa.CheckConstraint(
            "source IN ('web_portal', 'bot', 'whatsapp', 'staff')",
            name="ck_candidate_applications_source",
        ),
        sa.CheckConstraint(
            "status IN ("
            "'started', 'qualified', 'submitted', 'linked_to_pipeline', "
            "'abandoned', 'cancelled'"
            ")",
            name="ck_candidate_applications_status",
        ),
        sa.CheckConstraint(
            "NOT accepts_any_unit_in_location OR "
            "(preferred_location_group_id IS NOT NULL AND preferred_unit_id IS NULL)",
            name="ck_candidate_applications_any_unit_location",
        ),
        sa.Index("ix_candidate_applications_candidate_id", "candidate_id"),
        sa.Index("ix_candidate_applications_job_id", "job_id"),
        sa.Index("ix_candidate_applications_status", "status"),
        sa.Index("ix_candidate_applications_source", "source"),
        sa.Index(
            "uq_candidate_applications_active_candidate_job",
            "candidate_id",
            "job_id",
            unique=True,
            postgresql_where=sa.text(
                "deleted_at IS NULL AND job_id IS NOT NULL AND "
                "status IN ('started', 'qualified', 'submitted', 'linked_to_pipeline')"
            ),
            sqlite_where=sa.text(
                "deleted_at IS NULL AND job_id IS NOT NULL AND "
                "status IN ('started', 'qualified', 'submitted', 'linked_to_pipeline')"
            ),
        ),
    )

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
    job_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="staff",
    )
    status: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="started",
    )
    preferred_location_group_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("location_groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    preferred_unit_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("operational_units.id", ondelete="SET NULL"),
        nullable=True,
    )
    accepts_any_unit_in_location: Mapped[bool] = mapped_column(
        sa.Boolean(),
        nullable=False,
        default=False,
        server_default=sa.text("false"),
    )
    desired_job_area: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    desired_shift: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    lgpd_consent_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )
    lgpd_consent_version: Mapped[str | None] = mapped_column(sa.String(50), nullable=True)
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
        onupdate=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True)

    candidate = relationship("CandidateModel", lazy="noload")
    job = relationship("JobModel", lazy="noload")
    preferred_location_group = relationship("LocationGroupModel", lazy="noload")
    preferred_unit = relationship("OperationalUnitModel", lazy="noload")


class CandidateLocationPreferenceModel(Base):
    __tablename__ = "candidate_location_preferences"
    __table_args__ = (
        sa.CheckConstraint("priority >= 0", name="ck_candidate_location_preferences_priority"),
        sa.Index("ix_candidate_location_preferences_candidate_id", "candidate_id"),
        sa.Index("ix_candidate_location_preferences_location_group_id", "location_group_id"),
        sa.Index("ix_candidate_location_preferences_operational_unit_id", "operational_unit_id"),
    )

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
    location_group_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("location_groups.id", ondelete="RESTRICT"),
        nullable=False,
    )
    operational_unit_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("operational_units.id", ondelete="SET NULL"),
        nullable=True,
    )
    desired_shift: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    priority: Mapped[int] = mapped_column(
        sa.Integer(),
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    candidate = relationship("CandidateModel", lazy="noload")
    location_group = relationship("LocationGroupModel", lazy="noload")
    operational_unit = relationship("OperationalUnitModel", lazy="noload")
