"""Add pre-admission checklist templates and case snapshots.

Revision ID: f3d1a8c9b2e4
Revises: d8a1c4f7b6e2
Create Date: 2026-05-26 11:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "f3d1a8c9b2e4"
down_revision: str | None = "d8a1c4f7b6e2"
branch_labels = None
depends_on = None


DEFAULT_FILE_TYPES_JSON = '["application/pdf","image/jpeg","image/png","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]'


def upgrade() -> None:
    op.create_table(
        "pre_admission_checklist_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("admission_type", sa.String(length=80), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_pre_admission_checklist_templates_active",
        "pre_admission_checklist_templates",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "uq_pre_admission_checklist_templates_default_active",
        "pre_admission_checklist_templates",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default = true AND is_active = true"),
        sqlite_where=sa.text("is_default = 1 AND is_active = 1"),
    )

    op.create_table(
        "pre_admission_checklist_template_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("document_key", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("candidate_description", sa.Text(), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("accepted_file_types", sa.JSON(), nullable=False),
        sa.Column("max_file_size_mb", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["template_id"], ["pre_admission_checklist_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_pre_admission_checklist_template_items_template",
        "pre_admission_checklist_template_items",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        "idx_pre_admission_checklist_template_items_template_order",
        "pre_admission_checklist_template_items",
        ["template_id", "display_order"],
        unique=False,
    )

    op.add_column(
        "pre_admission_cases",
        sa.Column("checklist_template_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "pre_admission_cases",
        sa.Column("checklist_template_name", sa.String(length=180), nullable=True),
    )
    op.create_foreign_key(
        "fk_pre_admission_cases_checklist_template",
        "pre_admission_cases",
        "pre_admission_checklist_templates",
        ["checklist_template_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "pre_admission_checklist_items",
        sa.Column("template_item_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "pre_admission_checklist_items",
        sa.Column("document_key", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "pre_admission_checklist_items",
        sa.Column("candidate_description", sa.Text(), nullable=True),
    )
    op.add_column(
        "pre_admission_checklist_items",
        sa.Column("accepted_file_types", sa.JSON(), nullable=True),
    )
    op.add_column(
        "pre_admission_checklist_items",
        sa.Column("max_file_size_mb", sa.Integer(), nullable=False, server_default="10"),
    )
    op.add_column(
        "pre_admission_checklist_items",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_foreign_key(
        "fk_pre_admission_checklist_items_template_item",
        "pre_admission_checklist_items",
        "pre_admission_checklist_template_items",
        ["template_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_pre_admission_items_case_order",
        "pre_admission_checklist_items",
        ["case_id", "display_order"],
        unique=False,
    )

    op.execute(
        sa.text(
            """
            UPDATE pre_admission_checklist_items
            SET document_key = item_type,
                accepted_file_types = CAST(:accepted_file_types AS JSON)
            WHERE document_key IS NULL
            """
        ).bindparams(accepted_file_types=DEFAULT_FILE_TYPES_JSON)
    )

    with op.batch_alter_table("pre_admission_checklist_items") as batch_op:
        batch_op.alter_column("document_key", existing_type=sa.String(length=120), nullable=False)
        batch_op.alter_column("accepted_file_types", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.drop_index("idx_pre_admission_items_case_order", table_name="pre_admission_checklist_items")
    op.drop_constraint(
        "fk_pre_admission_checklist_items_template_item",
        "pre_admission_checklist_items",
        type_="foreignkey",
    )
    op.drop_column("pre_admission_checklist_items", "display_order")
    op.drop_column("pre_admission_checklist_items", "max_file_size_mb")
    op.drop_column("pre_admission_checklist_items", "accepted_file_types")
    op.drop_column("pre_admission_checklist_items", "candidate_description")
    op.drop_column("pre_admission_checklist_items", "document_key")
    op.drop_column("pre_admission_checklist_items", "template_item_id")

    op.drop_constraint(
        "fk_pre_admission_cases_checklist_template",
        "pre_admission_cases",
        type_="foreignkey",
    )
    op.drop_column("pre_admission_cases", "checklist_template_name")
    op.drop_column("pre_admission_cases", "checklist_template_id")

    op.drop_index(
        "idx_pre_admission_checklist_template_items_template_order",
        table_name="pre_admission_checklist_template_items",
    )
    op.drop_index(
        "idx_pre_admission_checklist_template_items_template",
        table_name="pre_admission_checklist_template_items",
    )
    op.drop_table("pre_admission_checklist_template_items")

    op.drop_index(
        "uq_pre_admission_checklist_templates_default_active",
        table_name="pre_admission_checklist_templates",
        postgresql_where=sa.text("is_default = true AND is_active = true"),
        sqlite_where=sa.text("is_default = 1 AND is_active = 1"),
    )
    op.drop_index(
        "idx_pre_admission_checklist_templates_active",
        table_name="pre_admission_checklist_templates",
    )
    op.drop_table("pre_admission_checklist_templates")
