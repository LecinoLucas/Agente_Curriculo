from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    ALLOWED_PLACEHOLDERS,
    ALLOWED_QUICK_REPLY_VALUES,
    SENSITIVE_STATE_CONTENTS,
    validate_placeholders,
    validate_setting_patch_value,
    validate_static_text_security,
)
from src.application.services.audit_service import AuditService
from src.infrastructure.database.models.assistant_settings_model import (
    ASSISTANT_STATES,
    AssistantQuickReplyModel,
    AssistantSettingModel,
    AssistantStateContentModel,
)
from src.interface.api.schemas.admin_assistant_schemas import (
    AdminAssistantQuickReplyItem,
    AdminAssistantQuickReplyPatch,
    AdminAssistantSettingItem,
    AdminAssistantStateContentItem,
    AdminAssistantStateContentPatch,
    AdminAssistantStateItem,
)


class AssistantContentNotEditableError(Exception):
    """Raised when an admin tries to edit a resource that policy forbids editing
    (sensitive/non-editable state, or a sensitive setting). Maps to HTTP 403."""

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

    # ── Mutations (admin only; do NOT touch the engine read path) ─────────────

    async def update_state_content(
        self,
        state: str,
        patch: AdminAssistantStateContentPatch,
        actor_id: UUID | None,
    ) -> AdminAssistantStateContentItem | None:
        row = await self.db.scalar(
            sa.select(AssistantStateContentModel).where(
                AssistantStateContentModel.state == state
            )
        )
        if row is None:
            return None

        if state in SENSITIVE_STATE_CONTENTS or not row.is_editable:
            raise AssistantContentNotEditableError(
                f"O estado {state} não pode ser editado nesta fase."
            )

        data = patch.model_dump(exclude_unset=True)
        if not data:
            return self._state_content_item(row)

        # Prospective values (provided value or current one) for validation.
        # `exclude_unset` keeps explicit nulls present, so `.get` is exact here.
        prompt = data.get("prompt_text", row.prompt_text)
        helper = data.get("helper_text", row.helper_text)
        fallback = data.get("fallback_text", row.fallback_text)
        placeholder = data.get("input_placeholder", row.input_placeholder)

        if "prompt_text" in data and (prompt is None or not prompt.strip()):
            raise ValueError("prompt_text não pode ser vazio.")

        validate_placeholders(state, prompt, helper, fallback, placeholder)
        validate_static_text_security(prompt, helper, fallback, placeholder)

        before = self._content_snapshot(row)
        for field in (
            "prompt_text",
            "helper_text",
            "fallback_text",
            "input_placeholder",
            "is_active",
        ):
            if field in data:
                setattr(row, field, data[field])
        row.version += 1
        await self.db.flush()
        after = self._content_snapshot(row)

        await AuditService(self.db).log_event(
            action="admin.assistant.state_content.update",
            resource_type="assistant_state_content",
            resource_id=row.id,
            user_id=actor_id,
            before_state=before,
            after_state=after,
            metadata={"state": state},
        )
        return self._state_content_item(row)

    async def update_quick_reply(
        self,
        quick_reply_id: UUID,
        patch: AdminAssistantQuickReplyPatch,
        actor_id: UUID | None,
    ) -> AdminAssistantQuickReplyItem | None:
        row = await self.db.get(AssistantQuickReplyModel, quick_reply_id)
        if row is None:
            return None

        if row.state in SENSITIVE_STATE_CONTENTS:
            raise AssistantContentNotEditableError(
                f"Quick replies do estado {row.state} não podem ser editadas nesta fase."
            )
        content = await self.db.scalar(
            sa.select(AssistantStateContentModel).where(
                AssistantStateContentModel.state == row.state
            )
        )
        if content is not None and not content.is_editable:
            raise AssistantContentNotEditableError(
                f"Quick replies do estado {row.state} não podem ser editadas."
            )

        data = patch.model_dump(exclude_unset=True)
        if not data:
            return self._quick_reply_item(row)

        if "label" in data:
            label = data["label"]
            if label is None or not label.strip():
                raise ValueError("label não pode ser vazio.")
            # Labels may reuse the state's whitelisted placeholders, never PII.
            validate_placeholders(row.state, label)
            validate_static_text_security(label)
        if "sort_order" in data and (
            not isinstance(data["sort_order"], int)
            or isinstance(data["sort_order"], bool)
            or data["sort_order"] < 0
        ):
            raise ValueError("sort_order deve ser um inteiro maior ou igual a zero.")

        before = self._quick_reply_snapshot(row)
        for field in ("label", "sort_order", "is_active"):
            if field in data:
                setattr(row, field, data[field])
        await self.db.flush()
        after = self._quick_reply_snapshot(row)

        await AuditService(self.db).log_event(
            action="admin.assistant.quick_reply.update",
            resource_type="assistant_quick_reply",
            resource_id=row.id,
            user_id=actor_id,
            before_state=before,
            after_state=after,
            metadata={"state": row.state, "value": row.value},
        )
        return self._quick_reply_item(row)

    async def update_setting(
        self,
        key: str,
        value: Any,
        actor_id: UUID | None,
    ) -> AdminAssistantSettingItem | None:
        row = await self.db.get(AssistantSettingModel, key)
        if row is None:
            return None

        # Validate the value first (specific 422), then block sensitive keys (403).
        validate_setting_patch_value(key, value)
        if row.is_sensitive:
            raise AssistantContentNotEditableError(
                f"A configuração {key} é sensível e não pode ser alterada nesta fase."
            )

        before = {"key": row.key, "value_json": row.value_json}
        row.value_json = value
        row.updated_by = actor_id
        await self.db.flush()
        after = {"key": row.key, "value_json": row.value_json}

        await AuditService(self.db).log_event(
            action="admin.assistant.setting.update",
            resource_type="assistant_setting",
            resource_id=None,
            user_id=actor_id,
            before_state=before,
            after_state=after,
            metadata={"key": key},
        )
        return self._setting_item(row)

    @staticmethod
    def _content_snapshot(row: AssistantStateContentModel) -> dict[str, Any]:
        return {
            "state": row.state,
            "prompt_text": row.prompt_text,
            "helper_text": row.helper_text,
            "fallback_text": row.fallback_text,
            "input_placeholder": row.input_placeholder,
            "is_active": row.is_active,
            "version": row.version,
        }

    @staticmethod
    def _quick_reply_snapshot(row: AssistantQuickReplyModel) -> dict[str, Any]:
        return {
            "id": str(row.id),
            "state": row.state,
            "value": row.value,
            "label": row.label,
            "sort_order": row.sort_order,
            "is_active": row.is_active,
        }

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
