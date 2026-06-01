"""Create operational master data tables.

Revision ID: 2a7d9c4e5f61
Revises: h1f2a3b4c5d6
Create Date: 2026-06-01 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "2a7d9c4e5f61"
down_revision: str | Sequence[str] | None = "h1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "operational_groups",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_operational_groups_code", "operational_groups", ["code"], unique=True)
    op.create_index(
        "ix_operational_groups_is_active",
        "operational_groups",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_operational_groups_normalized_name",
        "operational_groups",
        ["normalized_name"],
        unique=True,
    )

    op.create_table(
        "location_groups",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("state", sa.String(length=2), nullable=False),
        sa.Column("city", sa.String(length=255), nullable=True),
        sa.Column("type", sa.String(length=30), server_default="other", nullable=False),
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
        sa.CheckConstraint(
            "type IN ('city', 'district', 'corporate', 'other')",
            name="ck_location_groups_type",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_name", "state", name="uq_location_groups_normalized_state"),
    )
    op.create_index("ix_location_groups_is_active", "location_groups", ["is_active"], unique=False)
    op.create_index(
        "ix_location_groups_normalized_name",
        "location_groups",
        ["normalized_name"],
        unique=False,
    )
    op.create_index("ix_location_groups_state", "location_groups", ["state"], unique=False)
    op.create_index("ix_location_groups_type", "location_groups", ["type"], unique=False)

    op.create_table(
        "operational_units",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("group_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("location_group_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("public_name", sa.String(length=255), nullable=True),
        sa.Column("type", sa.String(length=30), server_default="other", nullable=False),
        sa.Column("reference_point", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("city", sa.String(length=255), nullable=True),
        sa.Column("state", sa.String(length=2), nullable=True),
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
        sa.CheckConstraint(
            "type IN ('office', 'gas_station', 'store', 'other')",
            name="ck_operational_units_type",
        ),
        sa.ForeignKeyConstraint(["group_id"], ["operational_groups.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["location_group_id"], ["location_groups.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "code", name="uq_operational_units_group_code"),
    )
    op.create_index(
        "ix_operational_units_group_id",
        "operational_units",
        ["group_id"],
        unique=False,
    )
    op.create_index(
        "ix_operational_units_is_active",
        "operational_units",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        "ix_operational_units_location_group_id",
        "operational_units",
        ["location_group_id"],
        unique=False,
    )
    op.create_index(
        "ix_operational_units_normalized_name",
        "operational_units",
        ["normalized_name"],
        unique=False,
    )
    op.create_index("ix_operational_units_type", "operational_units", ["type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_operational_units_type", table_name="operational_units")
    op.drop_index("ix_operational_units_normalized_name", table_name="operational_units")
    op.drop_index("ix_operational_units_location_group_id", table_name="operational_units")
    op.drop_index("ix_operational_units_is_active", table_name="operational_units")
    op.drop_index("ix_operational_units_group_id", table_name="operational_units")
    op.drop_table("operational_units")

    op.drop_index("ix_location_groups_type", table_name="location_groups")
    op.drop_index("ix_location_groups_state", table_name="location_groups")
    op.drop_index("ix_location_groups_normalized_name", table_name="location_groups")
    op.drop_index("ix_location_groups_is_active", table_name="location_groups")
    op.drop_table("location_groups")

    op.drop_index("ix_operational_groups_normalized_name", table_name="operational_groups")
    op.drop_index("ix_operational_groups_is_active", table_name="operational_groups")
    op.drop_index("ix_operational_groups_code", table_name="operational_groups")
    op.drop_table("operational_groups")
