"""add_ranking_freshness_to_candidate_job_scores

Revision ID: 6f8d9c1b2a34
Revises: 11559b342fc9, 4d6eac8022fa
Create Date: 2026-05-07 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f8d9c1b2a34"
down_revision: Union[str, Sequence[str], None] = ("11559b342fc9", "4d6eac8022fa")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "candidate_job_scores",
        sa.Column("source_analysis_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "candidate_job_scores",
        sa.Column("source_analysis_created_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "candidate_job_scores",
        sa.Column("score_model_version", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "candidate_job_scores",
        sa.Column(
            "freshness_status",
            sa.String(length=20),
            nullable=False,
            server_default="unknown",
        ),
    )
    op.add_column(
        "candidate_job_scores",
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE candidate_job_scores
            SET updated_at = computed_at
            WHERE updated_at IS NULL
            """
        )
    )
    op.create_foreign_key(
        "fk_candidate_job_scores_source_analysis",
        "candidate_job_scores",
        "analyses",
        ["source_analysis_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_candidate_job_scores_freshness_status",
        "candidate_job_scores",
        "freshness_status IN ('fresh', 'stale', 'unknown')",
    )
    op.create_index(
        "idx_candidate_job_scores_freshness",
        "candidate_job_scores",
        ["job_id", "freshness_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_candidate_job_scores_freshness", table_name="candidate_job_scores")
    op.drop_constraint(
        "ck_candidate_job_scores_freshness_status",
        "candidate_job_scores",
        type_="check",
    )
    op.drop_constraint(
        "fk_candidate_job_scores_source_analysis",
        "candidate_job_scores",
        type_="foreignkey",
    )
    op.drop_column("candidate_job_scores", "source_analysis_created_at")
    op.drop_column("candidate_job_scores", "updated_at")
    op.drop_column("candidate_job_scores", "freshness_status")
    op.drop_column("candidate_job_scores", "score_model_version")
    op.drop_column("candidate_job_scores", "source_analysis_id")
