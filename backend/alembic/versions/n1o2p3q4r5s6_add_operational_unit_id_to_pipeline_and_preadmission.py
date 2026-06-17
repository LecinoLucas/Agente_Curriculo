"""Add operational_unit_id to pipeline and pre-admission tables

Revision ID: n1o2p3q4r5s6
Revises: m1n2o3p4q5r6
Create Date: 2026-06-17 00:00:00.000000

Phase 1 of multi-branch/multi-unit support:
- candidate_job_pipeline: operational_unit_id (active pipeline model)
- candidate_job_pipeline_events: operational_unit_id (event log)
- candidate_pipeline: operational_unit_id (legacy model, kept for completeness)
- pipeline_stage_transitions: operational_unit_id (legacy transitions)
- pre_admission_cases: operational_unit_id
"""

from alembic import op
import sqlalchemy as sa


revision = "n1o2p3q4r5s6"
down_revision = "m1n2o3p4q5r6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- candidate_job_pipeline (active model) --------------------------------
    op.add_column(
        "candidate_job_pipeline",
        sa.Column(
            "operational_unit_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("operational_units.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_candidate_job_pipeline_unit",
        "candidate_job_pipeline",
        ["job_id", "operational_unit_id"],
    )

    # -- candidate_job_pipeline_events (event log) ----------------------------
    op.add_column(
        "candidate_job_pipeline_events",
        sa.Column(
            "operational_unit_id",
            sa.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    # -- candidate_pipeline (legacy model) ------------------------------------
    op.add_column(
        "candidate_pipeline",
        sa.Column(
            "operational_unit_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("operational_units.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_candidate_pipeline_unit",
        "candidate_pipeline",
        ["job_id", "operational_unit_id"],
    )

    # -- pipeline_stage_transitions (legacy transitions) ----------------------
    op.add_column(
        "pipeline_stage_transitions",
        sa.Column(
            "operational_unit_id",
            sa.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    # -- pre_admission_cases --------------------------------------------------
    op.add_column(
        "pre_admission_cases",
        sa.Column(
            "operational_unit_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("operational_units.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_pre_admission_cases_unit",
        "pre_admission_cases",
        ["operational_unit_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_pre_admission_cases_unit", table_name="pre_admission_cases")
    op.drop_column("pre_admission_cases", "operational_unit_id")

    op.drop_column("pipeline_stage_transitions", "operational_unit_id")

    op.drop_index("idx_candidate_pipeline_unit", table_name="candidate_pipeline")
    op.drop_column("candidate_pipeline", "operational_unit_id")

    op.drop_column("candidate_job_pipeline_events", "operational_unit_id")

    op.drop_index("idx_candidate_job_pipeline_unit", table_name="candidate_job_pipeline")
    op.drop_column("candidate_job_pipeline", "operational_unit_id")
