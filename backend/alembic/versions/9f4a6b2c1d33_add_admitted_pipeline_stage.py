"""Add admitted pipeline stage.

Revision ID: 9f4a6b2c1d33
Revises: 8c7e5d4a2f10
Create Date: 2026-05-25 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op


revision: str = "9f4a6b2c1d33"
down_revision: str | None = "8c7e5d4a2f10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


STAGES = (
    "'entry', 'screening', 'hr_interview', 'technical_interview', "
    "'final', 'offer', 'hired', 'pre_admission', 'protheus', 'admitted', 'rejected'"
)

OLD_STAGES = (
    "'entry', 'screening', 'hr_interview', 'technical_interview', "
    "'final', 'offer', 'hired', 'pre_admission', 'protheus', 'rejected'"
)


def upgrade() -> None:
    op.drop_constraint("ck_candidate_job_pipeline_stage", "candidate_job_pipeline", type_="check")
    op.create_check_constraint(
        "ck_candidate_job_pipeline_stage",
        "candidate_job_pipeline",
        f"pipeline_stage IN ({STAGES})",
    )

    op.drop_constraint("ck_candidate_pipeline_stage", "candidate_pipeline", type_="check")
    op.create_check_constraint(
        "ck_candidate_pipeline_stage",
        "candidate_pipeline",
        f"stage IN ({STAGES})",
    )

    op.drop_constraint("ck_pipeline_transition_to_stage", "pipeline_stage_transitions", type_="check")
    op.create_check_constraint(
        "ck_pipeline_transition_to_stage",
        "pipeline_stage_transitions",
        f"to_stage IN ({STAGES})",
    )
    op.drop_constraint("ck_pipeline_transition_from_stage", "pipeline_stage_transitions", type_="check")
    op.create_check_constraint(
        "ck_pipeline_transition_from_stage",
        "pipeline_stage_transitions",
        f"from_stage IS NULL OR from_stage IN ({STAGES})",
    )


def downgrade() -> None:
    op.execute("UPDATE candidate_job_pipeline SET pipeline_stage = 'hired' WHERE pipeline_stage = 'admitted'")
    op.execute("UPDATE candidate_pipeline SET stage = 'hired' WHERE stage = 'admitted'")
    op.execute("UPDATE pipeline_stage_transitions SET from_stage = 'hired' WHERE from_stage = 'admitted'")
    op.execute("UPDATE pipeline_stage_transitions SET to_stage = 'hired' WHERE to_stage = 'admitted'")

    op.drop_constraint("ck_pipeline_transition_from_stage", "pipeline_stage_transitions", type_="check")
    op.create_check_constraint(
        "ck_pipeline_transition_from_stage",
        "pipeline_stage_transitions",
        f"from_stage IS NULL OR from_stage IN ({OLD_STAGES})",
    )
    op.drop_constraint("ck_pipeline_transition_to_stage", "pipeline_stage_transitions", type_="check")
    op.create_check_constraint(
        "ck_pipeline_transition_to_stage",
        "pipeline_stage_transitions",
        f"to_stage IN ({OLD_STAGES})",
    )

    op.drop_constraint("ck_candidate_pipeline_stage", "candidate_pipeline", type_="check")
    op.create_check_constraint(
        "ck_candidate_pipeline_stage",
        "candidate_pipeline",
        f"stage IN ({OLD_STAGES})",
    )

    op.drop_constraint("ck_candidate_job_pipeline_stage", "candidate_job_pipeline", type_="check")
    op.create_check_constraint(
        "ck_candidate_job_pipeline_stage",
        "candidate_job_pipeline",
        f"pipeline_stage IN ({OLD_STAGES})",
    )
