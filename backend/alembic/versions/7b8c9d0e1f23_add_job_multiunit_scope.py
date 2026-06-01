"""Add optional multi-unit scope to jobs.

Revision ID: 7b8c9d0e1f23
Revises: 2a7d9c4e5f61
Create Date: 2026-06-01 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7b8c9d0e1f23"
down_revision: str | Sequence[str] | None = "2a7d9c4e5f61"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("operational_group_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("location_group_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("allocation_mode", sa.String(length=30), nullable=True),
    )
    op.create_foreign_key(
        "fk_jobs_operational_group_id_operational_groups",
        "jobs",
        "operational_groups",
        ["operational_group_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_jobs_location_group_id_location_groups",
        "jobs",
        "location_groups",
        ["location_group_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_jobs_allocation_mode",
        "jobs",
        "allocation_mode IS NULL OR allocation_mode IN ('corporate', 'operational')",
    )
    op.create_index(
        "ix_jobs_operational_group_id",
        "jobs",
        ["operational_group_id"],
        unique=False,
    )
    op.create_index(
        "ix_jobs_location_group_id",
        "jobs",
        ["location_group_id"],
        unique=False,
    )
    op.create_index(
        "ix_jobs_allocation_mode",
        "jobs",
        ["allocation_mode"],
        unique=False,
    )

    op.create_table(
        "job_units",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("operational_unit_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("openings_count", sa.Integer(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["operational_unit_id"],
            ["operational_units.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "operational_unit_id", name="uq_job_units_job_unit"),
    )
    op.create_index("ix_job_units_job_id", "job_units", ["job_id"], unique=False)
    op.create_index(
        "ix_job_units_operational_unit_id",
        "job_units",
        ["operational_unit_id"],
        unique=False,
    )
    op.create_index("ix_job_units_is_active", "job_units", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_job_units_is_active", table_name="job_units")
    op.drop_index("ix_job_units_operational_unit_id", table_name="job_units")
    op.drop_index("ix_job_units_job_id", table_name="job_units")
    op.drop_table("job_units")

    op.drop_index("ix_jobs_allocation_mode", table_name="jobs")
    op.drop_index("ix_jobs_location_group_id", table_name="jobs")
    op.drop_index("ix_jobs_operational_group_id", table_name="jobs")
    op.drop_constraint("ck_jobs_allocation_mode", "jobs", type_="check")
    op.drop_constraint("fk_jobs_location_group_id_location_groups", "jobs", type_="foreignkey")
    op.drop_constraint(
        "fk_jobs_operational_group_id_operational_groups",
        "jobs",
        type_="foreignkey",
    )
    op.drop_column("jobs", "allocation_mode")
    op.drop_column("jobs", "location_group_id")
    op.drop_column("jobs", "operational_group_id")
