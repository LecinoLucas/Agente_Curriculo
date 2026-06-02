"""Add candidate applications and location preferences.

Revision ID: 8c2d4e6f0a13
Revises: 7b8c9d0e1f23
Create Date: 2026-06-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8c2d4e6f0a13"
down_revision: str | Sequence[str] | None = "7b8c9d0e1f23"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ACTIVE_APPLICATION_STATUSES = "'started', 'qualified', 'submitted', 'linked_to_pipeline'"


def upgrade() -> None:
    op.create_table(
        "candidate_applications",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=30), server_default="staff", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="started", nullable=False),
        sa.Column("preferred_location_group_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("preferred_unit_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "accepts_any_unit_in_location",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("desired_job_area", sa.String(length=100), nullable=True),
        sa.Column("desired_shift", sa.String(length=100), nullable=True),
        sa.Column("lgpd_consent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("lgpd_consent_version", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["preferred_location_group_id"],
            ["location_groups.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["preferred_unit_id"],
            ["operational_units.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_candidate_applications_candidate_id",
        "candidate_applications",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        "ix_candidate_applications_job_id",
        "candidate_applications",
        ["job_id"],
        unique=False,
    )
    op.create_index(
        "ix_candidate_applications_status",
        "candidate_applications",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_candidate_applications_source",
        "candidate_applications",
        ["source"],
        unique=False,
    )
    op.create_index(
        "uq_candidate_applications_active_candidate_job",
        "candidate_applications",
        ["candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text(
            "deleted_at IS NULL AND job_id IS NOT NULL AND "
            f"status IN ({ACTIVE_APPLICATION_STATUSES})"
        ),
    )

    op.create_table(
        "candidate_location_preferences",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("location_group_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("operational_unit_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("desired_shift", sa.String(length=100), nullable=True),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint("priority >= 0", name="ck_candidate_location_preferences_priority"),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["location_group_id"],
            ["location_groups.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["operational_unit_id"],
            ["operational_units.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_candidate_location_preferences_candidate_id",
        "candidate_location_preferences",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        "ix_candidate_location_preferences_location_group_id",
        "candidate_location_preferences",
        ["location_group_id"],
        unique=False,
    )
    op.create_index(
        "ix_candidate_location_preferences_operational_unit_id",
        "candidate_location_preferences",
        ["operational_unit_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_candidate_location_preferences_operational_unit_id",
        table_name="candidate_location_preferences",
    )
    op.drop_index(
        "ix_candidate_location_preferences_location_group_id",
        table_name="candidate_location_preferences",
    )
    op.drop_index(
        "ix_candidate_location_preferences_candidate_id",
        table_name="candidate_location_preferences",
    )
    op.drop_table("candidate_location_preferences")

    op.drop_index(
        "uq_candidate_applications_active_candidate_job",
        table_name="candidate_applications",
    )
    op.drop_index("ix_candidate_applications_source", table_name="candidate_applications")
    op.drop_index("ix_candidate_applications_status", table_name="candidate_applications")
    op.drop_index("ix_candidate_applications_job_id", table_name="candidate_applications")
    op.drop_index("ix_candidate_applications_candidate_id", table_name="candidate_applications")
    op.drop_table("candidate_applications")
