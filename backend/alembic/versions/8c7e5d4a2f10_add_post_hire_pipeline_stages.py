"""Add post-hire pipeline stages.

Revision ID: 8c7e5d4a2f10
Revises: 4d2f8c6a1b90
Create Date: 2026-05-25 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op


revision: str = "8c7e5d4a2f10"
down_revision: str | None = "4d2f8c6a1b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


STAGES = (
    "'entry', 'screening', 'hr_interview', 'technical_interview', "
    "'final', 'offer', 'hired', 'pre_admission', 'protheus', 'rejected'"
)

OLD_STAGES = (
    "'entry', 'screening', 'hr_interview', 'technical_interview', "
    "'final', 'offer', 'hired', 'rejected'"
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

    op.execute(
        """
        UPDATE candidate_job_pipeline AS hired_pipeline
        SET
            link_status = 'active',
            pipeline_status = 'active',
            relationship_status = 'active',
            is_terminal = FALSE,
            terminated_at = NULL,
            termination_reason = NULL
        WHERE hired_pipeline.pipeline_stage = 'hired'
          AND hired_pipeline.relationship_status = 'hired'
          AND hired_pipeline.is_terminal = TRUE
          AND NOT EXISTS (
              SELECT 1
              FROM candidate_job_pipeline AS active_pipeline
              WHERE active_pipeline.candidate_id = hired_pipeline.candidate_id
                AND active_pipeline.job_id <> hired_pipeline.job_id
                AND active_pipeline.relationship_status = 'active'
                AND active_pipeline.is_terminal = FALSE
                AND active_pipeline.terminated_at IS NULL
          )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE candidate_job_pipeline
        SET pipeline_stage = 'hired'
        WHERE pipeline_stage IN ('pre_admission', 'protheus')
        """
    )
    op.execute(
        """
        UPDATE candidate_pipeline
        SET stage = 'hired'
        WHERE stage IN ('pre_admission', 'protheus')
        """
    )
    op.execute(
        """
        UPDATE pipeline_stage_transitions
        SET from_stage = 'hired'
        WHERE from_stage IN ('pre_admission', 'protheus')
        """
    )
    op.execute(
        """
        UPDATE pipeline_stage_transitions
        SET to_stage = 'hired'
        WHERE to_stage IN ('pre_admission', 'protheus')
        """
    )

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
