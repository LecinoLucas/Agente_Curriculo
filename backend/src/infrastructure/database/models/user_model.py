import sqlalchemy as sa
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")
    )
    email: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        sa.Enum("admin", "recruiter", "candidate", "viewer", name="user_role"),
        nullable=False,
        server_default="candidate",
    )
    status: Mapped[str] = mapped_column(
        sa.Enum(
            "pending_verification", "active", "suspended", "inactive",
            name="user_status",
        ),
        nullable=False,
        server_default="pending_verification",
    )
    full_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(sa.Text)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    login_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    failed_login_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    locked_until: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))

    sessions: Mapped[list["UserSessionModel"]] = relationship(  # type: ignore[name-defined]
        "UserSessionModel", back_populates="user", lazy="noload"
    )


class UserSessionModel(Base):
    __tablename__ = "user_sessions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")
    )
    user_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False, unique=True)
    user_agent: Mapped[Optional[str]] = mapped_column(sa.Text)
    ip_address: Mapped[Optional[str]] = mapped_column(sa.String(45))  # IPv6 max length
    device_fingerprint: Mapped[Optional[str]] = mapped_column(sa.String(255))
    last_used_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )
    expires_at: Mapped[datetime] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    revoke_reason: Mapped[Optional[str]] = mapped_column(sa.String(100))
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )

    user: Mapped["UserModel"] = relationship("UserModel", back_populates="sessions", lazy="noload")


class PasswordResetTokenModel(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")
    )
    user_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("NOW()")
    )
