"""Add candidate_job_collaboration_comments table."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "5f6e7g8h9i0j"
down_revision = "1cc806051e3c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "candidate_job_collaboration_comments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("candidate_id", sa.UUID(), nullable=False),
        sa.Column("job_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column(
            "author_role",
            sa.Enum(
                "admin", "recruiter", "manager", "hr", "viewer", "candidate",
                name="collaboration_author_role"
            ),
            nullable=False,
        ),
        sa.Column(
            "comment_type",
            sa.Enum(
                "comment",
                "review_request",
                "manager_feedback",
                "interview_request",
                name="collaboration_comment_type",
            ),
            nullable=False,
        ),
        sa.Column(
            "visibility",
            sa.Enum("internal", name="collaboration_visibility"),
            nullable=False,
            server_default="internal",
        ),
        sa.Column(
            "recommendation",
            sa.Enum(
                "advance",
                "hold",
                "reject",
                "request_interview",
                "none",
                name="collaboration_recommendation",
            ),
            nullable=True,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["candidate_id"],
            ["candidates.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["jobs.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_collaboration_candidate_job",
        "candidate_job_collaboration_comments",
        ["candidate_id", "job_id"],
    )
    op.create_index(
        "ix_collaboration_created_at",
        "candidate_job_collaboration_comments",
        ["created_at"],
    )
    op.create_index(
        "ix_collaboration_author_role",
        "candidate_job_collaboration_comments",
        ["author_role"],
    )


def downgrade() -> None:
    op.drop_index("ix_collaboration_author_role", "candidate_job_collaboration_comments")
    op.drop_index("ix_collaboration_created_at", "candidate_job_collaboration_comments")
    op.drop_index("ix_collaboration_candidate_job", "candidate_job_collaboration_comments")
    op.drop_table("candidate_job_collaboration_comments")
    op.execute("DROP TYPE collaboration_recommendation;")
    op.execute("DROP TYPE collaboration_visibility;")
    op.execute("DROP TYPE collaboration_comment_type;")
    op.execute("DROP TYPE collaboration_author_role;")
