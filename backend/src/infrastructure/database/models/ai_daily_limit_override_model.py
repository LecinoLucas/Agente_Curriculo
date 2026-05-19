from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class AIDailyLimitOverrideModel(Base):
    """Temporary administrator-issued increase to the per-user / per-job /
    global daily AI analysis limit. Always has an expiration; never permanent.

    Resolution priority when evaluating limits for an action:
        user (scope='user', scope_id=user_id) >
        job  (scope='job', scope_id=job_id)  >
        global (scope='global', scope_id IS NULL)

    `old_limit` snapshots the limit at the time of creation, for audit;
    enforcement always uses `new_limit` while active.
    """

    __tablename__ = "ai_daily_limit_overrides"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    scope: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    # NULL when scope='global'; user_id or job_id otherwise. Kept untyped at
    # FK level because the same column targets two different tables — joins
    # use scope to decide which table.
    scope_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), nullable=True)
    limit_type: Mapped[str] = mapped_column(
        sa.String(40), nullable=False, server_default="analysis_request"
    )
    old_limit: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    new_limit: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    reason: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False
    )
    created_by: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    revoked_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        sa.CheckConstraint(
            "scope IN ('user', 'job', 'global')",
            name="ck_ai_daily_limit_overrides_scope",
        ),
        sa.CheckConstraint(
            "(scope = 'global' AND scope_id IS NULL) OR (scope IN ('user', 'job') AND scope_id IS NOT NULL)",
            name="ck_ai_daily_limit_overrides_scope_id_consistency",
        ),
        sa.CheckConstraint(
            "new_limit > old_limit", name="ck_ai_daily_limit_overrides_increases"
        ),
        sa.Index(
            "idx_ai_daily_limit_overrides_active_lookup",
            "scope",
            "scope_id",
            "limit_type",
            "expires_at",
        ),
    )
