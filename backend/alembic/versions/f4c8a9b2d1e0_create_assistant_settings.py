"""Create assistant content/settings tables.

Revision ID: f4c8a9b2d1e0
Revises: e2b6c8d9f4a1
Create Date: 2026-06-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f4c8a9b2d1e0"
down_revision: str | Sequence[str] | None = "e2b6c8d9f4a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONB_COMPAT = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")

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


def upgrade() -> None:
    op.create_table(
        "assistant_state_contents",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("helper_text", sa.Text(), nullable=True),
        sa.Column("fallback_text", sa.Text(), nullable=True),
        sa.Column("input_placeholder", sa.String(160), nullable=True),
        sa.Column("is_editable", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(ASSISTANT_STATE_CHECK, name="ck_assistant_state_contents_state"),
        sa.CheckConstraint("version >= 1", name="ck_assistant_state_contents_version"),
        sa.UniqueConstraint("state", name="uq_assistant_state_contents_state"),
    )

    op.create_table(
        "assistant_quick_replies",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("value", sa.String(50), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(ASSISTANT_STATE_CHECK, name="ck_assistant_quick_replies_state"),
        sa.CheckConstraint("sort_order >= 0", name="ck_assistant_quick_replies_sort_order"),
        sa.UniqueConstraint("state", "value", name="uq_assistant_quick_replies_state_value"),
    )
    op.create_index("ix_assistant_quick_replies_state", "assistant_quick_replies", ["state"])

    op.create_table(
        "assistant_settings",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("value_json", JSONB_COMPAT, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "updated_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(ASSISTANT_SETTING_KEY_CHECK, name="ck_assistant_settings_key"),
    )

    _seed_state_contents()
    _seed_quick_replies()
    _seed_settings()


def downgrade() -> None:
    op.drop_table("assistant_settings")
    op.drop_index("ix_assistant_quick_replies_state", table_name="assistant_quick_replies")
    op.drop_table("assistant_quick_replies")
    op.drop_table("assistant_state_contents")


def _seed_state_contents() -> None:
    table = sa.table(
        "assistant_state_contents",
        sa.column("state", sa.String),
        sa.column("prompt_text", sa.Text),
        sa.column("helper_text", sa.Text),
        sa.column("fallback_text", sa.Text),
        sa.column("input_placeholder", sa.String),
        sa.column("is_editable", sa.Boolean),
        sa.column("is_active", sa.Boolean),
        sa.column("version", sa.Integer),
    )
    op.bulk_insert(
        table,
        [
            {
                "state": "IDENTIFY",
                "prompt_text": (
                    "Olá! Vou te ajudar a encontrar uma vaga. "
                    "Para começar, me diga seu CPF ou WhatsApp."
                ),
                "helper_text": None,
                "fallback_text": (
                    "Não consegui entender. Digite seu CPF ou WhatsApp com DDD "
                    "para continuar."
                ),
                "input_placeholder": None,
                "is_editable": False,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "VERIFY_OTP",
                "prompt_text": (
                    "Enviamos um código de verificação. "
                    "Digite o código de 6 dígitos para continuar."
                ),
                "helper_text": None,
                "fallback_text": (
                    "Código incorreto. Você ainda tem {attempts_remaining} "
                    "{attempts_label}. Digite o código de 6 dígitos para continuar."
                ),
                "input_placeholder": None,
                "is_editable": False,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "CHOOSE_LOCATION",
                "prompt_text": "Em qual localidade você prefere trabalhar?",
                "helper_text": None,
                "fallback_text": (
                    "Não encontrei essa localidade. Digite o nome da cidade ou "
                    "localidade novamente."
                ),
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "CHOOSE_UNIT_OR_ANY",
                "prompt_text": (
                    "Encontrei {location_hint}. Você prefere um posto específico "
                    "ou qualquer posto da localidade?"
                ),
                "helper_text": None,
                "fallback_text": (
                    "Não consegui identificar esse posto. Você pode escolher qualquer "
                    "posto da localidade ou digitar o nome do posto novamente."
                ),
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "CHOOSE_FUNCTION",
                "prompt_text": "Qual função você deseja procurar?",
                "helper_text": None,
                "fallback_text": (
                    "Não consegui entender a função desejada. Digite o nome da função."
                ),
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "CHOOSE_SHIFT",
                "prompt_text": "Qual turno você prefere?",
                "helper_text": None,
                "fallback_text": (
                    "Não consegui entender o turno. Escolha uma das opções disponíveis."
                ),
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "SHOW_JOBS",
                "prompt_text": (
                    "Já tenho as informações principais. Na próxima etapa vou buscar "
                    "vagas compatíveis para você."
                ),
                "helper_text": None,
                "fallback_text": None,
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "COLLECT_RESUME",
                "prompt_text": (
                    "Você quer enviar seu currículo agora ou continuar sem currículo?"
                ),
                "helper_text": None,
                "fallback_text": None,
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "CONFIRM_APPLICATION",
                "prompt_text": "Confirma que deseja seguir com essas informações?",
                "helper_text": None,
                "fallback_text": None,
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
            {
                "state": "DONE",
                "prompt_text": (
                    "Tudo certo. Suas informações foram registradas para continuidade "
                    "nos canais oficiais."
                ),
                "helper_text": None,
                "fallback_text": None,
                "input_placeholder": None,
                "is_editable": True,
                "is_active": True,
                "version": 1,
            },
        ],
    )


def _seed_quick_replies() -> None:
    table = sa.table(
        "assistant_quick_replies",
        sa.column("state", sa.String),
        sa.column("value", sa.String),
        sa.column("label", sa.String),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        table,
        [
            {
                "state": "IDENTIFY",
                "value": "cpf",
                "label": "Informar CPF",
                "sort_order": 0,
                "is_active": True,
            },
            {
                "state": "IDENTIFY",
                "value": "whatsapp",
                "label": "Informar WhatsApp",
                "sort_order": 1,
                "is_active": True,
            },
            {
                "state": "CHOOSE_UNIT_OR_ANY",
                "value": "any_in_location",
                "label": "Qualquer posto em {location_hint}",
                "sort_order": 0,
                "is_active": True,
            },
            {
                "state": "CHOOSE_UNIT_OR_ANY",
                "value": "choose_unit",
                "label": "Escolher posto",
                "sort_order": 1,
                "is_active": True,
            },
            {
                "state": "CHOOSE_SHIFT",
                "value": "morning",
                "label": "Manhã",
                "sort_order": 0,
                "is_active": True,
            },
            {
                "state": "CHOOSE_SHIFT",
                "value": "afternoon",
                "label": "Tarde",
                "sort_order": 1,
                "is_active": True,
            },
            {
                "state": "CHOOSE_SHIFT",
                "value": "night",
                "label": "Noite",
                "sort_order": 2,
                "is_active": True,
            },
            {
                "state": "CHOOSE_SHIFT",
                "value": "any",
                "label": "Qualquer turno",
                "sort_order": 3,
                "is_active": True,
            },
            {
                "state": "SHOW_JOBS",
                "value": "continue",
                "label": "Continuar",
                "sort_order": 0,
                "is_active": True,
            },
            {
                "state": "COLLECT_RESUME",
                "value": "send_resume",
                "label": "Enviar currículo",
                "sort_order": 0,
                "is_active": True,
            },
            {
                "state": "COLLECT_RESUME",
                "value": "skip_resume",
                "label": "Continuar sem currículo",
                "sort_order": 1,
                "is_active": True,
            },
            {
                "state": "CONFIRM_APPLICATION",
                "value": "confirm",
                "label": "Confirmar",
                "sort_order": 0,
                "is_active": True,
            },
            {
                "state": "CONFIRM_APPLICATION",
                "value": "review",
                "label": "Revisar",
                "sort_order": 1,
                "is_active": True,
            },
        ],
    )


def _seed_settings() -> None:
    table = sa.table(
        "assistant_settings",
        sa.column("key", sa.String),
        sa.column("value_json", JSONB_COMPAT),
        sa.column("description", sa.Text),
        sa.column("is_sensitive", sa.Boolean),
    )
    op.bulk_insert(
        table,
        [
            {
                "key": "assistant_enabled",
                "value_json": True,
                "description": "Habilita o Assistente do Candidato no canal web.",
                "is_sensitive": True,
            },
            {
                "key": "welcome_message",
                "value_json": (
                    "Olá! Vou te ajudar a encontrar uma vaga. "
                    "Para começar, me diga seu CPF ou WhatsApp."
                ),
                "description": "Mensagem inicial exibida ao candidato.",
                "is_sensitive": False,
            },
            {
                "key": "global_fallback_message",
                "value_json": "Não consegui entender. Tente responder de outra forma.",
                "description": "Fallback global para entradas não compreendidas.",
                "is_sensitive": False,
            },
            {
                "key": "default_max_attempts",
                "value_json": 3,
                "description": (
                    "Limite padrão de tentativas antes de registrar falha com sufixo "
                    "de limite."
                ),
                "is_sensitive": True,
            },
            {
                "key": "offer_hr_after_attempts",
                "value_json": 2,
                "description": "Tentativas antes de sugerir contato com RH em fluxos futuros.",
                "is_sensitive": False,
            },
            {
                "key": "talk_to_hr_message",
                "value_json": "Vou te encaminhar para o RH para te ajudar melhor.",
                "description": "Mensagem preparada para handoff futuro.",
                "is_sensitive": False,
            },
            {
                "key": "session_expiration_minutes",
                "value_json": 60,
                "description": "Tempo de expiração planejado para sessão do assistente.",
                "is_sensitive": True,
            },
            {
                "key": "channels_enabled",
                "value_json": ["web"],
                "description": (
                    "Canais habilitados. WhatsApp permanece desabilitado até existir "
                    "canal real."
                ),
                "is_sensitive": True,
            },
        ],
    )
