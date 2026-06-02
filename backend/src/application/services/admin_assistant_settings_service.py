from __future__ import annotations

from dataclasses import dataclass

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    ALLOWED_PLACEHOLDERS,
    ALLOWED_QUICK_REPLY_VALUES,
    SENSITIVE_STATE_CONTENTS,
)
from src.infrastructure.database.models.assistant_settings_model import (
    ASSISTANT_STATES,
    AssistantQuickReplyModel,
    AssistantSettingModel,
    AssistantStateContentModel,
)
from src.interface.api.schemas.admin_assistant_schemas import (
    AdminAssistantQuickReplyItem,
    AdminAssistantSettingItem,
    AdminAssistantStateContentItem,
    AdminAssistantStateItem,
)

STATE_LABELS: dict[str, str] = {
    "IDENTIFY": "Identificação",
    "VERIFY_OTP": "Verificação de código",
    "CHOOSE_LOCATION": "Localidade",
    "CHOOSE_UNIT_OR_ANY": "Posto específico ou qualquer posto",
    "CHOOSE_FUNCTION": "Função",
    "CHOOSE_SHIFT": "Turno",
    "SHOW_JOBS": "Exibição de vagas",
    "COLLECT_RESUME": "Currículo",
    "CONFIRM_APPLICATION": "Confirmação",
    "DONE": "Finalização",
}

STATE_DESCRIPTIONS: dict[str, str] = {
    "IDENTIFY": "Coleta CPF ou WhatsApp para iniciar o atendimento.",
    "VERIFY_OTP": "Valida o código de verificação quando necessário.",
    "CHOOSE_LOCATION": "Coleta a localidade desejada para trabalhar.",
    "CHOOSE_UNIT_OR_ANY": "Permite escolher um posto específico ou qualquer posto da localidade.",
    "CHOOSE_FUNCTION": "Coleta a função de interesse.",
    "CHOOSE_SHIFT": "Coleta a preferência de turno.",
    "SHOW_JOBS": "Prepara a exibição de vagas compatíveis.",
    "COLLECT_RESUME": "Pergunta se o candidato deseja enviar currículo.",
    "CONFIRM_APPLICATION": "Confirma as informações antes de registrar continuidade.",
    "DONE": "Encerra o fluxo do assistente.",
}

STATE_ORDER = {state: index for index, state in enumerate(ASSISTANT_STATES)}


@dataclass(frozen=True)
class StateContentQuery:
    state: str | None = None
    is_active: bool | None = None
    is_editable: bool | None = None


@dataclass(frozen=True)
class QuickReplyQuery:
    state: str | None = None
    is_active: bool | None = None


class AdminAssistantSettingsService:
    """Read-only admin access to persisted assistant content/settings."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_states(self) -> list[AdminAssistantStateItem]:
        rows = await self.db.execute(
            sa.select(
                AssistantStateContentModel.state,
                AssistantStateContentModel.is_editable,
            )
        )
        editable_by_state = {state: is_editable for state, is_editable in rows.all()}

        return [
            AdminAssistantStateItem(
                state=state,
                label=STATE_LABELS[state],
                description=STATE_DESCRIPTIONS[state],
                is_sensitive=state in SENSITIVE_STATE_CONTENTS,
                is_editable=editable_by_state.get(
                    state,
                    state not in SENSITIVE_STATE_CONTENTS,
                ),
                order=order,
                allowed_quick_reply_values=list(ALLOWED_QUICK_REPLY_VALUES[state]),
                allowed_placeholders=list(ALLOWED_PLACEHOLDERS[state]),
            )
            for state, order in STATE_ORDER.items()
        ]

    async def list_state_contents(
        self,
        query: StateContentQuery,
    ) -> list[AdminAssistantStateContentItem]:
        stmt = sa.select(AssistantStateContentModel)
        if query.state is not None:
            stmt = stmt.where(AssistantStateContentModel.state == query.state)
        if query.is_active is not None:
            stmt = stmt.where(AssistantStateContentModel.is_active == query.is_active)
        if query.is_editable is not None:
            stmt = stmt.where(AssistantStateContentModel.is_editable == query.is_editable)
        stmt = stmt.order_by(_state_order_expr(AssistantStateContentModel.state))

        result = await self.db.execute(stmt)
        return [self._state_content_item(row) for row in result.scalars().all()]

    async def get_state_content(
        self,
        state: str,
    ) -> AdminAssistantStateContentItem | None:
        row = await self.db.scalar(
            sa.select(AssistantStateContentModel).where(
                AssistantStateContentModel.state == state
            )
        )
        if row is None:
            return None
        return self._state_content_item(row)

    async def list_quick_replies(
        self,
        query: QuickReplyQuery,
    ) -> list[AdminAssistantQuickReplyItem]:
        stmt = sa.select(AssistantQuickReplyModel)
        if query.state is not None:
            stmt = stmt.where(AssistantQuickReplyModel.state == query.state)
        if query.is_active is not None:
            stmt = stmt.where(AssistantQuickReplyModel.is_active == query.is_active)
        stmt = stmt.order_by(
            _state_order_expr(AssistantQuickReplyModel.state),
            AssistantQuickReplyModel.sort_order,
            AssistantQuickReplyModel.id,
        )

        result = await self.db.execute(stmt)
        return [self._quick_reply_item(row) for row in result.scalars().all()]

    async def list_settings(self) -> list[AdminAssistantSettingItem]:
        result = await self.db.execute(
            sa.select(AssistantSettingModel).order_by(AssistantSettingModel.key)
        )
        return [self._setting_item(row) for row in result.scalars().all()]

    @staticmethod
    def _state_content_item(
        row: AssistantStateContentModel,
    ) -> AdminAssistantStateContentItem:
        return AdminAssistantStateContentItem(
            state=row.state,
            prompt_text=row.prompt_text,
            helper_text=row.helper_text,
            fallback_text=row.fallback_text,
            input_placeholder=row.input_placeholder,
            is_editable=row.is_editable,
            is_active=row.is_active,
            version=row.version,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _quick_reply_item(row: AssistantQuickReplyModel) -> AdminAssistantQuickReplyItem:
        return AdminAssistantQuickReplyItem(
            id=row.id,
            state=row.state,
            value=row.value,
            label=row.label,
            sort_order=row.sort_order,
            is_active=row.is_active,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    def _setting_item(row: AssistantSettingModel) -> AdminAssistantSettingItem:
        return AdminAssistantSettingItem(
            key=row.key,
            value_json=None if row.is_sensitive else row.value_json,
            is_sensitive=row.is_sensitive,
            description=row.description,
            updated_at=row.updated_at,
        )


def _state_order_expr(column: sa.ColumnElement[str]) -> sa.ColumnElement[int]:
    return sa.case(STATE_ORDER, value=column, else_=len(STATE_ORDER))
