from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import sqlalchemy as sa

from src.infrastructure.database.models.assistant_settings_model import (
    ASSISTANT_SETTING_KEYS,
    ASSISTANT_STATES,
)

SENSITIVE_STATE_CONTENTS = frozenset({"IDENTIFY", "VERIFY_OTP"})

ALLOWED_QUICK_REPLY_VALUES: dict[str, tuple[str, ...]] = {
    "IDENTIFY": ("cpf", "whatsapp"),
    "VERIFY_OTP": (),
    "CHOOSE_LOCATION": (),
    "CHOOSE_UNIT_OR_ANY": ("any_in_location", "choose_unit"),
    "CHOOSE_FUNCTION": (),
    "CHOOSE_SHIFT": ("morning", "afternoon", "night", "any"),
    "SHOW_JOBS": ("continue",),
    "COLLECT_RESUME": ("send_resume", "skip_resume"),
    "CONFIRM_APPLICATION": ("confirm", "review"),
    "DONE": (),
}

ALLOWED_PLACEHOLDERS: dict[str, tuple[str, ...]] = {
    "IDENTIFY": (),
    "VERIFY_OTP": ("attempts_remaining", "attempts_label"),
    "CHOOSE_LOCATION": (),
    "CHOOSE_UNIT_OR_ANY": ("location_hint",),
    "CHOOSE_FUNCTION": (),
    "CHOOSE_SHIFT": (),
    "SHOW_JOBS": (),
    "COLLECT_RESUME": (),
    "CONFIRM_APPLICATION": (),
    "DONE": (),
}

PLACEHOLDER_PATTERN = re.compile(r"{([a-zA-Z_][a-zA-Z0-9_]*)}")
EMAIL_PATTERN = re.compile(r"\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b")
CPF_PATTERN = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
PHONE_PATTERN = re.compile(r"(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}")


@dataclass(frozen=True)
class AssistantStateContentSeed:
    state: str
    prompt_text: str
    helper_text: str | None = None
    fallback_text: str | None = None
    input_placeholder: str | None = None
    is_editable: bool = True
    is_active: bool = True
    version: int = 1


@dataclass(frozen=True)
class AssistantQuickReplySeed:
    state: str
    value: str
    label: str
    sort_order: int
    is_active: bool = True


@dataclass(frozen=True)
class AssistantSettingSeed:
    key: str
    value_json: dict | list | str | int | bool
    description: str | None = None
    is_sensitive: bool = False


STATE_CONTENT_SEED: tuple[AssistantStateContentSeed, ...] = (
    AssistantStateContentSeed(
        state="IDENTIFY",
        prompt_text=(
            "Olá! Vou te ajudar a encontrar uma vaga. "
            "Para começar, me diga seu CPF ou WhatsApp."
        ),
        fallback_text=(
            "Não consegui entender. Digite seu CPF ou WhatsApp com DDD para continuar."
        ),
        is_editable=False,
    ),
    AssistantStateContentSeed(
        state="VERIFY_OTP",
        prompt_text=(
            "Enviamos um código de verificação. "
            "Digite o código de 6 dígitos para continuar."
        ),
        fallback_text=(
            "Código incorreto. Você ainda tem {attempts_remaining} {attempts_label}. "
            "Digite o código de 6 dígitos para continuar."
        ),
        is_editable=False,
    ),
    AssistantStateContentSeed(
        state="CHOOSE_LOCATION",
        prompt_text="Em qual cidade ou localidade você quer trabalhar?",
        fallback_text=(
            "Não encontrei essa localidade. Digite o nome da cidade ou localidade novamente."
        ),
    ),
    AssistantStateContentSeed(
        state="CHOOSE_UNIT_OR_ANY",
        prompt_text=(
            "Encontrei {location_hint}. Você prefere um posto específico "
            "ou qualquer posto da localidade?"
        ),
        fallback_text=(
            "Não consegui identificar esse posto. Você pode escolher qualquer posto da "
            "localidade ou digitar o nome do posto novamente."
        ),
    ),
    AssistantStateContentSeed(
        state="CHOOSE_FUNCTION",
        prompt_text="Qual função você deseja procurar?",
        fallback_text="Não consegui entender a função desejada. Digite o nome da função.",
    ),
    AssistantStateContentSeed(
        state="CHOOSE_SHIFT",
        prompt_text="Qual turno você prefere?",
        fallback_text="Não consegui entender o turno. Escolha uma das opções disponíveis.",
    ),
    AssistantStateContentSeed(
        state="SHOW_JOBS",
        prompt_text=(
            "Já tenho as informações principais. Na próxima etapa vou buscar "
            "vagas compatíveis para você."
        ),
    ),
    AssistantStateContentSeed(
        state="COLLECT_RESUME",
        prompt_text="Você quer enviar seu currículo agora ou continuar sem currículo?",
    ),
    AssistantStateContentSeed(
        state="CONFIRM_APPLICATION",
        prompt_text="Confirma que deseja seguir com essas informações?",
    ),
    AssistantStateContentSeed(
        state="DONE",
        prompt_text=(
            "Tudo certo. Suas informações foram registradas para continuidade "
            "nos canais oficiais."
        ),
    ),
)

QUICK_REPLY_SEED: tuple[AssistantQuickReplySeed, ...] = (
    AssistantQuickReplySeed("IDENTIFY", "cpf", "Informar CPF", 0),
    AssistantQuickReplySeed("IDENTIFY", "whatsapp", "Informar WhatsApp", 1),
    AssistantQuickReplySeed(
        "CHOOSE_UNIT_OR_ANY",
        "any_in_location",
        "Qualquer posto em {location_hint}",
        0,
    ),
    AssistantQuickReplySeed("CHOOSE_UNIT_OR_ANY", "choose_unit", "Escolher posto", 1),
    AssistantQuickReplySeed("CHOOSE_SHIFT", "morning", "Manhã", 0),
    AssistantQuickReplySeed("CHOOSE_SHIFT", "afternoon", "Tarde", 1),
    AssistantQuickReplySeed("CHOOSE_SHIFT", "night", "Noite", 2),
    AssistantQuickReplySeed("CHOOSE_SHIFT", "any", "Qualquer turno", 3),
    AssistantQuickReplySeed("SHOW_JOBS", "continue", "Continuar", 0),
    AssistantQuickReplySeed("COLLECT_RESUME", "send_resume", "Enviar currículo", 0),
    AssistantQuickReplySeed("COLLECT_RESUME", "skip_resume", "Continuar sem currículo", 1),
    AssistantQuickReplySeed("CONFIRM_APPLICATION", "confirm", "Confirmar", 0),
    AssistantQuickReplySeed("CONFIRM_APPLICATION", "review", "Revisar", 1),
)

SETTING_SEED: tuple[AssistantSettingSeed, ...] = (
    AssistantSettingSeed(
        "assistant_enabled",
        True,
        "Habilita o Assistente do Candidato no canal web.",
        True,
    ),
    AssistantSettingSeed(
        "welcome_message",
        STATE_CONTENT_SEED[0].prompt_text,
        "Mensagem inicial exibida ao candidato.",
    ),
    AssistantSettingSeed(
        "global_fallback_message",
        "Não consegui entender. Tente responder de outra forma.",
        "Fallback global para entradas não compreendidas.",
    ),
    AssistantSettingSeed(
        "default_max_attempts",
        3,
        "Limite padrão de tentativas antes de registrar falha com sufixo de limite.",
        True,
    ),
    AssistantSettingSeed(
        "offer_hr_after_attempts",
        2,
        "Tentativas antes de sugerir contato com RH em fluxos futuros.",
    ),
    AssistantSettingSeed(
        "talk_to_hr_message",
        "Vou te encaminhar para o RH para te ajudar melhor.",
        "Mensagem preparada para handoff futuro.",
    ),
    AssistantSettingSeed(
        "session_expiration_minutes",
        60,
        "Tempo de expiração planejado para sessão do assistente.",
        True,
    ),
    AssistantSettingSeed(
        "channels_enabled",
        ["web"],
        "Canais habilitados. WhatsApp permanece desabilitado até existir canal real.",
        True,
    ),
)


def ensure_known_state(state: str) -> None:
    if state not in ASSISTANT_STATES:
        raise ValueError(f"Estado do assistente desconhecido: {state}")


def validate_placeholders(state: str, *texts: str | None) -> None:
    ensure_known_state(state)
    allowed = set(ALLOWED_PLACEHOLDERS[state])
    for text in texts:
        if not text:
            continue
        found = set(PLACEHOLDER_PATTERN.findall(text))
        unknown = found - allowed
        if unknown:
            names = ", ".join(sorted(unknown))
            raise ValueError(f"Placeholder não permitido para {state}: {names}")


def validate_quick_reply_value(state: str, value: str) -> None:
    ensure_known_state(state)
    if value not in ALLOWED_QUICK_REPLY_VALUES[state]:
        raise ValueError(f"Quick reply value não permitido para {state}: {value}")


def validate_static_text_security(*texts: str | None) -> None:
    for text in texts:
        if not text:
            continue
        if EMAIL_PATTERN.search(text) or CPF_PATTERN.search(text) or PHONE_PATTERN.search(text):
            raise ValueError("Texto do assistente não pode conter PII estática de exemplo.")


def validate_state_content_seed(seed: AssistantStateContentSeed) -> None:
    ensure_known_state(seed.state)
    validate_placeholders(
        seed.state,
        seed.prompt_text,
        seed.helper_text,
        seed.fallback_text,
        seed.input_placeholder,
    )
    validate_static_text_security(
        seed.prompt_text,
        seed.helper_text,
        seed.fallback_text,
        seed.input_placeholder,
    )
    if seed.state in SENSITIVE_STATE_CONTENTS and seed.is_editable:
        raise ValueError(f"{seed.state} deve permanecer não editável nesta fase.")


def validate_quick_reply_seed(seed: AssistantQuickReplySeed) -> None:
    validate_quick_reply_value(seed.state, seed.value)
    validate_placeholders(seed.state, seed.label)
    validate_static_text_security(seed.label)


def validate_setting_value(key: str, value: Any) -> None:
    if key not in ASSISTANT_SETTING_KEYS:
        raise ValueError(f"Setting do assistente desconhecido: {key}")
    if key in {"assistant_enabled"} and not isinstance(value, bool):
        raise ValueError(f"{key} deve ser booleano.")
    if key in {"default_max_attempts", "offer_hr_after_attempts"} and (
        not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 10
    ):
        raise ValueError(f"{key} deve ser inteiro entre 1 e 10.")
    if key == "session_expiration_minutes" and (
        not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 1440
    ):
        raise ValueError(f"{key} deve ser inteiro entre 1 e 1440.")
    if key == "channels_enabled" and (
        not isinstance(value, list) or value != ["web"]
    ):
        raise ValueError("channels_enabled só permite ['web'] nesta fase.")
    if key in {"welcome_message", "global_fallback_message", "talk_to_hr_message"}:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{key} deve ser texto não vazio.")
        validate_static_text_security(value)


def validate_setting_patch_value(key: str, value: Any) -> None:
    """Stricter validation for admin PATCH of a setting value.

    Builds on :func:`validate_setting_value` (type/range/PII) and adds the
    phase-specific safety guards. Does NOT decide sensitivity — the service
    blocks sensitive keys separately.
    """
    if key not in ASSISTANT_SETTING_KEYS:
        raise ValueError(f"Setting do assistente desconhecido: {key}")
    if key == "channels_enabled" and isinstance(value, list) and any(
        str(item).strip().lower() == "whatsapp" for item in value
    ):
        raise ValueError("channels_enabled não pode conter whatsapp nesta fase.")
    validate_setting_value(key, value)
    if key == "assistant_enabled" and value is False:
        raise ValueError(
            "Não é possível desligar o assistente nesta fase (sem confirmação)."
        )
    if key == "default_max_attempts" and (
        not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 5
    ):
        raise ValueError("default_max_attempts deve estar entre 1 e 5 nesta fase.")


def validate_catalog_integrity() -> None:
    for seed in STATE_CONTENT_SEED:
        validate_state_content_seed(seed)
    seeded_states = {seed.state for seed in STATE_CONTENT_SEED}
    if seeded_states != set(ASSISTANT_STATES):
        missing = set(ASSISTANT_STATES) - seeded_states
        raise ValueError(f"Seed sem conteúdo para estados: {sorted(missing)}")
    for seed in QUICK_REPLY_SEED:
        validate_quick_reply_seed(seed)
    for seed in SETTING_SEED:
        validate_setting_value(seed.key, seed.value_json)


async def seed_assistant_configuration(session: Any) -> None:
    from src.infrastructure.database.models.assistant_settings_model import (
        AssistantQuickReplyModel,
        AssistantSettingModel,
        AssistantStateContentModel,
    )

    validate_catalog_integrity()

    for seed in STATE_CONTENT_SEED:
        existing = await session.scalar(
            sa.select(AssistantStateContentModel).where(
                AssistantStateContentModel.state == seed.state
            )
        )
        if existing is None:
            session.add(
                AssistantStateContentModel(
                    state=seed.state,
                    prompt_text=seed.prompt_text,
                    helper_text=seed.helper_text,
                    fallback_text=seed.fallback_text,
                    input_placeholder=seed.input_placeholder,
                    is_editable=seed.is_editable,
                    is_active=seed.is_active,
                    version=seed.version,
                )
            )

    for seed in QUICK_REPLY_SEED:
        existing = await session.scalar(
            sa.select(AssistantQuickReplyModel).where(
                AssistantQuickReplyModel.state == seed.state,
                AssistantQuickReplyModel.value == seed.value,
            )
        )
        if existing is None:
            session.add(
                AssistantQuickReplyModel(
                    state=seed.state,
                    value=seed.value,
                    label=seed.label,
                    sort_order=seed.sort_order,
                    is_active=seed.is_active,
                )
            )

    for seed in SETTING_SEED:
        existing = await session.scalar(
            sa.select(AssistantSettingModel).where(AssistantSettingModel.key == seed.key)
        )
        if existing is None:
            session.add(
                AssistantSettingModel(
                    key=seed.key,
                    value_json=seed.value_json,
                    description=seed.description,
                    is_sensitive=seed.is_sensitive,
                )
            )

    await session.flush()
