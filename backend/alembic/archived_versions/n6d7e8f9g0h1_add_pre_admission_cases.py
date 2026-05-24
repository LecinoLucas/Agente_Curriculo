"""add pre admission cases

Revision ID: n6d7e8f9g0h1
Revises: m5c6d7e8f9g0
Create Date: 2026-05-14 07:10:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n6d7e8f9g0h1"
down_revision: str | None = "m5c6d7e8f9g0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pre_admission_cases",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("hiring_decision_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=40), server_default="draft", nullable=False),
        sa.Column("salary_offer", sa.Numeric(12, 2), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("work_model", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("closed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'offer_preparing', 'offer_sent', 'offer_accepted', 'offer_declined', "
            "'documents_pending', 'documents_received', 'ready_for_admission', 'admitted', 'cancelled')",
            name="ck_pre_admission_cases_status",
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["hiring_decision_id"], ["candidate_job_hiring_decisions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_id", "job_id", "hiring_decision_id", name="uq_pre_admission_case_decision"),
    )
    op.create_index("idx_pre_admission_cases_job_candidate", "pre_admission_cases", ["job_id", "candidate_id"])
    op.create_index("idx_pre_admission_cases_status", "pre_admission_cases", ["status"])
    op.create_index(
        "uq_pre_admission_active_candidate_job",
        "pre_admission_cases",
        ["candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("status NOT IN ('admitted', 'cancelled', 'offer_declined')"),
    )

    op.create_table(
        "pre_admission_checklist_items",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("case_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("item_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "item_type IN ('cpf', 'rg', 'comprovante_endereco', 'carteira_trabalho', 'pis', "
            "'titulo_eleitor', 'certificado_reservista', 'exame_admissional', 'dados_bancarios', 'other')",
            name="ck_pre_admission_items_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'received', 'approved', 'rejected', 'waived')",
            name="ck_pre_admission_items_status",
        ),
        sa.ForeignKeyConstraint(["case_id"], ["pre_admission_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_pre_admission_items_case", "pre_admission_checklist_items", ["case_id"])

    op.create_table(
        "pre_admission_events",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("case_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("actor_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["case_id"], ["pre_admission_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_pre_admission_events_case_created", "pre_admission_events", ["case_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_pre_admission_events_case_created", table_name="pre_admission_events")
    op.drop_table("pre_admission_events")
    op.drop_index("idx_pre_admission_items_case", table_name="pre_admission_checklist_items")
    op.drop_table("pre_admission_checklist_items")
    op.drop_index("uq_pre_admission_active_candidate_job", table_name="pre_admission_cases")
    op.drop_index("idx_pre_admission_cases_status", table_name="pre_admission_cases")
    op.drop_index("idx_pre_admission_cases_job_candidate", table_name="pre_admission_cases")
    op.drop_table("pre_admission_cases")
