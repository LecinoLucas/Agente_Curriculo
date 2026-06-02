from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

ASSISTANT_STATES = (
    "IDENTIFY",
    "VERIFY_OTP",
    "CHOOSE_LOCATION",
    "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_FUNCTION",
    "CHOOSE_SHIFT",
    "SHOW_JOBS",
    "COLLECT_RESUME",
    "CONFIRM_APPLICATION",
    "DONE",
)

ASSISTANT_SETTING_KEYS = (
    "assistant_enabled",
    "welcome_message",
    "global_fallback_message",
    "default_max_attempts",
    "offer_hr_after_attempts",
    "talk_to_hr_message",
    "session_expiration_minutes",
    "channels_enabled",
)

ASSISTANT_STATE_CHECK = (
    "state IN ("
    "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'CONFIRM_APPLICATION', 'DONE'"
    ")"
)

ASSISTANT_SETTING_KEY_CHECK = (
    "key IN ("
    "'assistant_enabled', 'welcome_message', 'global_fallback_message', "
    "'default_max_attempts', 'offer_hr_after_attempts', 'talk_to_hr_message', "
    "'session_expiration_minutes', 'channels_enabled'"
    ")"
)


class AssistantStateContentModel(Base):
    __tablename__ = "assistant_state_contents"
    __table_args__ = (
        sa.CheckConstraint(ASSISTANT_STATE_CHECK, name="ck_assistant_state_contents_state"),
        sa.CheckConstraint("version >= 1", name="ck_assistant_state_contents_version"),
        sa.UniqueConstraint("state", name="uq_assistant_state_contents_state"),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    state: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    prompt_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    helper_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    fallback_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    input_placeholder: Mapped[str | None] = mapped_column(sa.String(160), nullable=True)
    is_editable: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
    )
    version: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        default=1,
        server_default=sa.text("1"),
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


class AssistantQuickReplyModel(Base):
    __tablename__ = "assistant_quick_replies"
    __table_args__ = (
        sa.CheckConstraint(ASSISTANT_STATE_CHECK, name="ck_assistant_quick_replies_state"),
        sa.CheckConstraint("sort_order >= 0", name="ck_assistant_quick_replies_sort_order"),
        sa.UniqueConstraint("state", "value", name="uq_assistant_quick_replies_state_value"),
        sa.Index("ix_assistant_quick_replies_state", "state"),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    state: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    value: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    label: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        default=0,
        server_default=sa.text("0"),
    )
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=True,
        server_default=sa.text("true"),
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


class AssistantSettingModel(Base):
    __tablename__ = "assistant_settings"
    __table_args__ = (
        sa.CheckConstraint(ASSISTANT_SETTING_KEY_CHECK, name="ck_assistant_settings_key"),
    )

    key: Mapped[str] = mapped_column(sa.String(60), primary_key=True)
    value_json: Mapped[dict | list | str | int | bool] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=False,
        server_default=sa.text("false"),
    )
    updated_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    updater = relationship("UserModel", lazy="noload")
