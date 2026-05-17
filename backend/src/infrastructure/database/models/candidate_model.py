import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class CandidateModel(Base):
    """External person being evaluated."""
    __tablename__ = "candidates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    # Links Candidate to User with role="candidate" for candidate portal access.
    # When NULL: candidate is anonymous (sourced, imported, no login).
    # When NOT NULL: candidate can login to portal via associated User.
    #
    # Invariant: If user_id is set, User(user_id).role MUST be "candidate"
    user_id: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    full_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(sa.String(255))
    phone: Mapped[Optional[str]] = mapped_column(sa.String(50))
    cpf: Mapped[Optional[str]] = mapped_column(sa.Text())
    location_city: Mapped[Optional[str]] = mapped_column(sa.String(100))
    location_state: Mapped[Optional[str]] = mapped_column(sa.String(100))
    location_country: Mapped[str] = mapped_column(sa.String(10), nullable=False, server_default="BR")
    linkedin_url: Mapped[Optional[str]] = mapped_column(sa.Text)
    github_url: Mapped[Optional[str]] = mapped_column(sa.Text)
    portfolio_url: Mapped[Optional[str]] = mapped_column(sa.Text)
    internal_notes: Mapped[Optional[str]] = mapped_column(sa.Text)
    tags: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, server_default="[]")
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
    archived_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True, index=True)
    archived_by: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    archive_reason: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)
    archive_reason_note: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    data_quality_status: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="unknown",
        comment="Data quality classification: valid, no_resume, empty_resume, parsing_failed, unknown, invalid"
    )
    data_quality_reason: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        comment="Explanation of why candidate is marked invalid"
    )
    data_quality_marked_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        comment="When data quality status was last determined"
    )
    # Public application tracking
    lgpd_consent_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        comment="When candidate gave LGPD consent (public application)"
    )
    lgpd_consent_version: Mapped[Optional[str]] = mapped_column(
        sa.String(50),
        comment="Version of LGPD terms accepted (v1.0, etc)"
    )
    application_source: Mapped[Optional[str]] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="manual",
        comment="Source of application: manual, google_oauth, api, import, etc"
    )
    desired_contract_type: Mapped[Optional[str]] = mapped_column(
        sa.String(20),
        comment="Desired contract type from public application: CLT, PJ, Indiferente"
    )
    salary_expectation: Mapped[Optional[str]] = mapped_column(
        sa.String(100),
        comment="Normalized salary expectation in BRL (decimal string)"
    )
    google_sub: Mapped[Optional[str]] = mapped_column(
        sa.String(255),
        comment="Stable Google subject identifier for candidate social login"
    )
    google_picture_url: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        comment="Last Google profile picture URL seen during candidate social login"
    )
    works_at_marajo_group: Mapped[Optional[bool]] = mapped_column(
        sa.Boolean(),
        comment="From public application: does candidate work at Marajó Group?"
    )
    password_hash: Mapped[Optional[str]] = mapped_column(
        sa.String(255),
        comment="Password hash for candidate portal login"
    )
    password_created_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        comment="When candidate password was created"
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        comment="When candidate last logged in to candidate portal"
    )

    __table_args__ = (
        sa.Index("idx_candidates_user_id", "user_id"),
        sa.Index(
            "uq_candidates_user_id_not_null",
            "user_id",
            unique=True,
            postgresql_where=sa.text("user_id IS NOT NULL"),
            sqlite_where=sa.text("user_id IS NOT NULL"),
        ),
        sa.Index("idx_candidates_email", "email"),
        sa.Index("idx_candidates_cpf", "cpf"),
        sa.Index(
            "uq_candidates_google_sub_not_null",
            "google_sub",
            unique=True,
            postgresql_where=sa.text("google_sub IS NOT NULL"),
            sqlite_where=sa.text("google_sub IS NOT NULL"),
        ),
        sa.Index("idx_candidates_data_quality_status", "data_quality_status"),
    )

    resumes: Mapped[list["ResumeModel"]] = relationship(  # type: ignore[name-defined]
        "ResumeModel", back_populates="candidate", lazy="noload"
    )
