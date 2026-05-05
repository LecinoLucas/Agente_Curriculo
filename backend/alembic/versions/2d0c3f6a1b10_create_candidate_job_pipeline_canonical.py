"""create_candidate_job_pipeline_canonical

Revision ID: 2d0c3f6a1b10
Revises: 11559b342fc9
Create Date: 2026-05-04 09:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2d0c3f6a1b10"
down_revision: Union[str, None] = "11559b342fc9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "candidate_job_pipeline",
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("resume_version_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("link_status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("pipeline_stage", sa.String(length=50), nullable=False, server_default="entry"),
        sa.Column("pipeline_status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("current_analysis_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("match_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("entered_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_moved_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "link_status IN ('active', 'removed', 'transferred', 'hired', 'rejected')",
            name="ck_candidate_job_pipeline_link_status",
        ),
        sa.CheckConstraint(
            "pipeline_stage IN ('entry', 'screening', 'hr_interview', 'technical_interview', 'final', 'offer', 'hired', 'rejected')",
            name="ck_candidate_job_pipeline_stage",
        ),
        sa.CheckConstraint(
            "pipeline_status IN ('active', 'terminal')",
            name="ck_candidate_job_pipeline_pipeline_status",
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'ai_match', 'import')",
            name="ck_candidate_job_pipeline_source",
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resume_version_id"], ["resume_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["current_analysis_id"], ["analyses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["last_moved_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("candidate_id", "job_id"),
    )

    op.create_index(
        "idx_candidate_job_pipeline_job_stage",
        "candidate_job_pipeline",
        ["job_id", "pipeline_stage"],
        unique=False,
    )
    op.create_index(
        "idx_candidate_job_pipeline_job_active",
        "candidate_job_pipeline",
        ["job_id", "pipeline_status", "link_status"],
        unique=False,
    )
    op.create_index(
        "idx_candidate_job_pipeline_analysis",
        "candidate_job_pipeline",
        ["current_analysis_id"],
        unique=False,
    )

    op.create_table(
        "candidate_job_pipeline_events",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("from_stage", sa.String(length=50), nullable=True),
        sa.Column("to_stage", sa.String(length=50), nullable=True),
        sa.Column("from_job_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("to_job_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_candidate_job_pipeline_events_entry_time",
        "candidate_job_pipeline_events",
        ["candidate_id", "job_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_candidate_job_pipeline_events_job_time",
        "candidate_job_pipeline_events",
        ["job_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_candidate_job_pipeline_events_actor",
        "candidate_job_pipeline_events",
        ["actor_id"],
        unique=False,
    )

    op.create_table(
        "candidate_job_pipeline_migration_conflicts",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("pipeline_stage_old", sa.String(length=50), nullable=True),
        sa.Column("pipeline_status_old", sa.String(length=20), nullable=True),
        sa.Column("link_status_old", sa.String(length=20), nullable=True),
        sa.Column("link_source_old", sa.String(length=20), nullable=True),
        sa.Column("resolved_stage", sa.String(length=50), nullable=False),
        sa.Column("resolved_link_status", sa.String(length=20), nullable=False),
        sa.Column("resolved_source", sa.String(length=20), nullable=False),
        sa.Column("applied_rule", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        """
        WITH cjl_ranked AS (
            SELECT
                cjl.*,
                ROW_NUMBER() OVER (
                    PARTITION BY cjl.candidate_id, cjl.job_id
                    ORDER BY
                        CASE WHEN cjl.deleted_at IS NULL THEN 0 ELSE 1 END,
                        cjl.updated_at DESC,
                        cjl.created_at DESC
                ) AS rn
            FROM candidate_job_links cjl
        ),
        cjl_one AS (
            SELECT * FROM cjl_ranked WHERE rn = 1
        ),
        cp_one AS (
            SELECT * FROM candidate_pipeline
        ),
        keys AS (
            SELECT candidate_id, job_id FROM cjl_one
            UNION
            SELECT candidate_id, job_id FROM cp_one
        ),
        latest_analysis AS (
            SELECT
                r.candidate_id,
                a.job_id,
                a.id AS analysis_id,
                a.resume_version_id,
                ROW_NUMBER() OVER (
                    PARTITION BY r.candidate_id, a.job_id
                    ORDER BY a.created_at DESC, a.updated_at DESC
                ) AS rn
            FROM analyses a
            JOIN resume_versions rv ON rv.id = a.resume_version_id
            JOIN resumes r ON r.id = rv.resume_id
            WHERE r.deleted_at IS NULL
              AND a.job_id IS NOT NULL
        ),
        resolved AS (
            SELECT
                k.candidate_id,
                k.job_id,
                la.resume_version_id,
                la.analysis_id,
                cp.stage AS cp_stage,
                cp.status AS cp_status,
                cp.match_score,
                cp.entered_at,
                cp.last_moved_by,
                cp.created_at AS cp_created_at,
                cp.updated_at AS cp_updated_at,
                cjl.status AS cjl_status,
                cjl.source AS cjl_source,
                cjl.created_at AS cjl_created_at,
                cjl.updated_at AS cjl_updated_at,
                CASE
                    WHEN COALESCE(cp.status, '') = 'hired' OR COALESCE(cjl.status, '') = 'hired' OR COALESCE(cp.stage, '') = 'hired' THEN 'hired'
                    WHEN COALESCE(cp.status, '') = 'rejected' OR COALESCE(cjl.status, '') = 'rejected' OR COALESCE(cp.stage, '') = 'rejected' THEN 'rejected'
                    WHEN COALESCE(cjl.status, '') = 'removed' THEN 'removed'
                    WHEN COALESCE(cp.status, '') = 'transferred' OR COALESCE(cjl.status, '') = 'transferred' THEN 'transferred'
                    ELSE 'active'
                END AS resolved_link_status,
                CASE
                    WHEN cjl.source = 'ai_match' THEN 'ai_match'
                    WHEN cjl.source = 'import' THEN 'import'
                    WHEN cjl.source = 'manual' THEN 'manual'
                    WHEN cjl.source = 'pipeline' THEN 'manual'
                    ELSE 'manual'
                END AS resolved_source
            FROM keys k
            LEFT JOIN cp_one cp
              ON cp.candidate_id = k.candidate_id
             AND cp.job_id = k.job_id
            LEFT JOIN cjl_one cjl
              ON cjl.candidate_id = k.candidate_id
             AND cjl.job_id = k.job_id
            LEFT JOIN latest_analysis la
              ON la.candidate_id = k.candidate_id
             AND la.job_id = k.job_id
             AND la.rn = 1
        ),
        normalized AS (
            SELECT
                r.*,
                CASE
                    WHEN r.cp_stage IS NOT NULL THEN r.cp_stage
                    WHEN r.resolved_link_status = 'hired' THEN 'hired'
                    WHEN r.resolved_link_status = 'rejected' THEN 'rejected'
                    ELSE 'entry'
                END AS resolved_stage,
                CASE
                    WHEN r.resolved_link_status = 'active'
                         AND COALESCE(
                            CASE
                                WHEN r.cp_stage IS NOT NULL THEN r.cp_stage
                                WHEN r.resolved_link_status = 'hired' THEN 'hired'
                                WHEN r.resolved_link_status = 'rejected' THEN 'rejected'
                                ELSE 'entry'
                            END,
                            'entry'
                         ) NOT IN ('hired', 'rejected')
                    THEN 'active'
                    ELSE 'terminal'
                END AS resolved_pipeline_status,
                COALESCE(r.entered_at, r.cjl_created_at) AS resolved_entered_at,
                COALESCE(
                    LEAST(r.cp_created_at, r.cjl_created_at),
                    r.cp_created_at,
                    r.cjl_created_at,
                    NOW()
                ) AS resolved_created_at,
                COALESCE(
                    GREATEST(r.cp_updated_at, r.cjl_updated_at),
                    r.cp_updated_at,
                    r.cjl_updated_at,
                    NOW()
                ) AS resolved_updated_at
            FROM resolved r
        )
        INSERT INTO candidate_job_pipeline (
            candidate_id,
            job_id,
            resume_version_id,
            link_status,
            pipeline_stage,
            pipeline_status,
            source,
            current_analysis_id,
            match_score,
            entered_at,
            last_moved_by,
            created_at,
            updated_at
        )
        SELECT
            n.candidate_id,
            n.job_id,
            n.resume_version_id,
            n.resolved_link_status,
            n.resolved_stage,
            n.resolved_pipeline_status,
            n.resolved_source,
            n.analysis_id,
            n.match_score,
            n.resolved_entered_at,
            n.last_moved_by,
            n.resolved_created_at,
            n.resolved_updated_at
        FROM normalized n
        """
    )

    op.execute(
        """
        WITH cjl_ranked AS (
            SELECT
                cjl.*,
                ROW_NUMBER() OVER (
                    PARTITION BY cjl.candidate_id, cjl.job_id
                    ORDER BY
                        CASE WHEN cjl.deleted_at IS NULL THEN 0 ELSE 1 END,
                        cjl.updated_at DESC,
                        cjl.created_at DESC
                ) AS rn
            FROM candidate_job_links cjl
        ),
        cjl_one AS (
            SELECT * FROM cjl_ranked WHERE rn = 1
        ),
        keys AS (
            SELECT candidate_id, job_id FROM cjl_one
            UNION
            SELECT candidate_id, job_id FROM candidate_pipeline
        ),
        merged AS (
            SELECT
                k.candidate_id,
                k.job_id,
                cp.stage AS cp_stage,
                cp.status AS cp_status,
                cjl.status AS cjl_status,
                cjl.source AS cjl_source,
                cjp.pipeline_stage AS resolved_stage,
                cjp.link_status AS resolved_link_status,
                cjp.source AS resolved_source
            FROM keys k
            LEFT JOIN candidate_pipeline cp
              ON cp.candidate_id = k.candidate_id
             AND cp.job_id = k.job_id
            LEFT JOIN cjl_one cjl
              ON cjl.candidate_id = k.candidate_id
             AND cjl.job_id = k.job_id
            JOIN candidate_job_pipeline cjp
              ON cjp.candidate_id = k.candidate_id
             AND cjp.job_id = k.job_id
        )
        INSERT INTO candidate_job_pipeline_migration_conflicts (
            candidate_id,
            job_id,
            pipeline_stage_old,
            pipeline_status_old,
            link_status_old,
            link_source_old,
            resolved_stage,
            resolved_link_status,
            resolved_source,
            applied_rule
        )
        SELECT
            m.candidate_id,
            m.job_id,
            m.cp_stage,
            m.cp_status,
            m.cjl_status,
            m.cjl_source,
            m.resolved_stage,
            m.resolved_link_status,
            m.resolved_source,
            'stage=max_progress; status=terminal_priority; source=ai_match>manual>import>default_manual'
        FROM merged m
        WHERE
            (m.cp_stage IS NOT NULL AND m.cjl_status IS NOT NULL)
            OR (m.cp_status IS NOT NULL AND m.cjl_status IS NOT NULL AND m.cp_status <> m.cjl_status)
            OR (m.cp_stage IS NOT NULL AND m.resolved_stage <> m.cp_stage)
            OR (m.cjl_status IS NOT NULL AND m.resolved_link_status <> m.cjl_status)
        """
    )

    op.execute(
        """
        INSERT INTO candidate_job_pipeline_events (
            candidate_id,
            job_id,
            event_type,
            from_stage,
            to_stage,
            actor_id,
            metadata,
            created_at
        )
        SELECT
            pst.candidate_id,
            pst.job_id,
            'stage_moved' AS event_type,
            pst.from_stage,
            pst.to_stage,
            pst.moved_by,
            json_build_object(
                'trigger', pst.trigger,
                'notes', pst.notes,
                'reason', pst.reason
            ) AS metadata,
            pst.moved_at
        FROM pipeline_stage_transitions pst
        """
    )


def downgrade() -> None:
    op.drop_index("idx_candidate_job_pipeline_events_actor", table_name="candidate_job_pipeline_events")
    op.drop_index("idx_candidate_job_pipeline_events_job_time", table_name="candidate_job_pipeline_events")
    op.drop_index("idx_candidate_job_pipeline_events_entry_time", table_name="candidate_job_pipeline_events")
    op.drop_table("candidate_job_pipeline_events")

    op.drop_table("candidate_job_pipeline_migration_conflicts")

    op.drop_index("idx_candidate_job_pipeline_analysis", table_name="candidate_job_pipeline")
    op.drop_index("idx_candidate_job_pipeline_job_active", table_name="candidate_job_pipeline")
    op.drop_index("idx_candidate_job_pipeline_job_stage", table_name="candidate_job_pipeline")
    op.drop_table("candidate_job_pipeline")
