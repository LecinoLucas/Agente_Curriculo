import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class CandidateModel(Base):
    """
    Candidate Model - External entity representing a person being evaluated.

    See: docs/user-candidate-boundary.md for boundary documentation.
    """
    __tablename__ = "candidates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    # BRIDGE FIELD (Temporary for Phase 20.2)
    # Links Candidate to User with role="candidate" for candidate portal access.
    # When NULL: candidate is anonymous (sourced, imported, no login).
    # When NOT NULL: candidate can login to portal via associated User.
    #
    # Invariant: If user_id is set, User(user_id).role MUST be "candidate"
    #
    # Phase 20.3+: Will be replaced by CandidateAccount(candidate_id, user_id)
    # to completely separate candidate portal from internal user system.
    user_id: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    full_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(sa.String(255))
    phone: Mapped[Optional[str]] = mapped_column(sa.String(50))
    cpf: Mapped[Optional[str]] = mapped_column(sa.String(14))
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
    deleted_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))

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
    )

    resumes: Mapped[list["ResumeModel"]] = relationship(  # type: ignore[name-defined]
        "ResumeModel", back_populates="candidate", lazy="noload"
    )
