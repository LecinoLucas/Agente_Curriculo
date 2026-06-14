from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

class SkillCatalogModel(Base):
    __tablename__ = "skill_catalog"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    normalized_name: Mapped[str] = mapped_column(sa.Text, nullable=False, unique=True, index=True)
    category: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    domains: Mapped[list] = mapped_column(JSONB_COMPAT, nullable=False, default=list, server_default="[]")
    default_strength: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    catalog_type: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True, server_default=sa.text("true"), index=True)
    created_by: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True, index=True)
    archived_by: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True)
    archive_reason: Mapped[Optional[str]] = mapped_column(sa.String(100), nullable=True)
    archive_reason_note: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )

    aliases: Mapped[list["SkillAliasModel"]] = relationship(
        "SkillAliasModel",
        back_populates="skill",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    outgoing_relations: Mapped[list["SkillRelationModel"]] = relationship(
        "SkillRelationModel",
        back_populates="source_skill",
        cascade="all, delete-orphan",
        lazy="selectin",
        foreign_keys="SkillRelationModel.source_skill_id",
    )


class SkillAliasModel(Base):
    __tablename__ = "skill_aliases"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    skill_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("skill_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    alias: Mapped[str] = mapped_column(sa.Text, nullable=False)
    normalized_alias: Mapped[str] = mapped_column(sa.Text, nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )

    skill: Mapped["SkillCatalogModel"] = relationship(
        "SkillCatalogModel",
        back_populates="aliases",
    )


class SkillRelationModel(Base):
    __tablename__ = "skill_relations"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    source_skill_id: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("skill_catalog.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    source_name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    normalized_source_name: Mapped[str] = mapped_column(sa.Text, nullable=False, index=True)
    target_skill_id: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("skill_catalog.id", ondelete="SET NULL"),
        nullable=True,
    )
    target_name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    normalized_target_name: Mapped[str] = mapped_column(sa.Text, nullable=False, index=True)
    relation_type: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    strength: Mapped[Optional[str]] = mapped_column(sa.String(50), nullable=True)
    score: Mapped[Optional[float]] = mapped_column(sa.Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "normalized_source_name",
            "normalized_target_name",
            "relation_type",
            name="uq_skill_relations_source_target_type",
        ),
    )

    source_skill: Mapped[Optional["SkillCatalogModel"]] = relationship(
        "SkillCatalogModel",
        back_populates="outgoing_relations",
        foreign_keys=[source_skill_id],
    )
    target_skill: Mapped[Optional["SkillCatalogModel"]] = relationship(
        "SkillCatalogModel",
        foreign_keys=[target_skill_id],
    )
