from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base


class OperationalGroupModel(Base):
    __tablename__ = "operational_groups"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    code: Mapped[str] = mapped_column(sa.String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(
        sa.String(255),
        nullable=False,
        unique=True,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    units: Mapped[list["OperationalUnitModel"]] = relationship(
        "OperationalUnitModel",
        back_populates="group",
        lazy="noload",
    )


class LocationGroupModel(Base):
    __tablename__ = "location_groups"
    __table_args__ = (
        sa.UniqueConstraint("normalized_name", "state", name="uq_location_groups_normalized_state"),
        sa.CheckConstraint(
            "type IN ('city', 'district', 'corporate', 'other')",
            name="ck_location_groups_type",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(sa.String(255), nullable=False, index=True)
    state: Mapped[str] = mapped_column(sa.String(2), nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    type: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="other",
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    units: Mapped[list["OperationalUnitModel"]] = relationship(
        "OperationalUnitModel",
        back_populates="location_group",
        lazy="noload",
    )


class OperationalUnitModel(Base):
    __tablename__ = "operational_units"
    __table_args__ = (
        sa.UniqueConstraint("group_id", "code", name="uq_operational_units_group_code"),
        sa.CheckConstraint(
            "type IN ('office', 'gas_station', 'store', 'other')",
            name="ck_operational_units_type",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    group_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("operational_groups.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    location_group_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("location_groups.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(sa.String(255), nullable=False, index=True)
    public_name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    type: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="other",
        index=True,
    )
    reference_point: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    address: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    city: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(sa.String(2), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    group: Mapped[OperationalGroupModel] = relationship(
        "OperationalGroupModel",
        back_populates="units",
        lazy="noload",
    )
    location_group: Mapped[LocationGroupModel] = relationship(
        "LocationGroupModel",
        back_populates="units",
        lazy="noload",
    )
