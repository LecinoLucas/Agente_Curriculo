from dataclasses import dataclass
from typing import Any, Literal

ConversationState = Literal[
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
]


@dataclass(frozen=True)
class ConversationPrompt:
    state: ConversationState
    content: str
    quick_replies: tuple[tuple[str, str], ...] = ()


STATE_TRANSITIONS: dict[ConversationState, ConversationState] = {
    "IDENTIFY": "VERIFY_OTP",
    "VERIFY_OTP": "CHOOSE_LOCATION",
    "CHOOSE_LOCATION": "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_UNIT_OR_ANY": "CHOOSE_FUNCTION",
    "CHOOSE_FUNCTION": "CHOOSE_SHIFT",
    "CHOOSE_SHIFT": "SHOW_JOBS",
    "SHOW_JOBS": "COLLECT_RESUME",
    "COLLECT_RESUME": "CONFIRM_APPLICATION",
    "CONFIRM_APPLICATION": "DONE",
    "DONE": "DONE",
}


def first_prompt() -> ConversationPrompt:
    return prompt_for("IDENTIFY")


def next_state(current_state: str) -> ConversationState:
    return STATE_TRANSITIONS.get(_coerce_state(current_state), "IDENTIFY")


def prompt_for(state: str, context: dict[str, Any] | None = None) -> ConversationPrompt:
    context = context or {}
    coerced_state = _coerce_state(state)

    if coerced_state == "IDENTIFY":
        return ConversationPrompt(
            state="IDENTIFY",
            content=(
                "Olá! Vou te ajudar a encontrar uma vaga. "
                "Para começar, me diga seu CPF ou WhatsApp."
            ),
            quick_replies=(
                ("cpf", "Informar CPF"),
                ("whatsapp", "Informar WhatsApp"),
            ),
        )
    if coerced_state == "VERIFY_OTP":
        return ConversationPrompt(
            state="VERIFY_OTP",
            content=(
                "Enviamos um código de verificação. "
                "Digite o código de 6 dígitos para continuar."
            ),
        )
    if coerced_state == "CHOOSE_LOCATION":
        return ConversationPrompt(
            state="CHOOSE_LOCATION",
            content="Em qual localidade você prefere trabalhar?",
        )
    if coerced_state == "CHOOSE_UNIT_OR_ANY":
        location_hint = str(context.get("location_hint") or "essa localidade")
        return ConversationPrompt(
            state="CHOOSE_UNIT_OR_ANY",
            content=(
                f"Encontrei {location_hint}. Você prefere um posto específico "
                "ou qualquer posto da localidade?"
            ),
            quick_replies=(
                ("any_in_location", f"Qualquer posto em {location_hint}"),
                ("choose_unit", "Escolher posto"),
            ),
        )
    if coerced_state == "CHOOSE_FUNCTION":
        return ConversationPrompt(
            state="CHOOSE_FUNCTION",
            content="Qual função você deseja procurar?",
        )
    if coerced_state == "CHOOSE_SHIFT":
        return ConversationPrompt(
            state="CHOOSE_SHIFT",
            content="Qual turno você prefere?",
            quick_replies=(
                ("morning", "Manhã"),
                ("afternoon", "Tarde"),
                ("night", "Noite"),
                ("any", "Qualquer turno"),
            ),
        )
    if coerced_state == "SHOW_JOBS":
        return ConversationPrompt(
            state="SHOW_JOBS",
            content=(
                "Já tenho as informações principais. Na próxima etapa vou buscar "
                "vagas compatíveis para você."
            ),
            quick_replies=(("continue", "Continuar"),),
        )
    if coerced_state == "COLLECT_RESUME":
        return ConversationPrompt(
            state="COLLECT_RESUME",
            content="Você quer enviar seu currículo agora ou continuar sem currículo?",
            quick_replies=(
                ("send_resume", "Enviar currículo"),
                ("skip_resume", "Continuar sem currículo"),
            ),
        )
    if coerced_state == "CONFIRM_APPLICATION":
        return ConversationPrompt(
            state="CONFIRM_APPLICATION",
            content="Confirma que deseja seguir com essas informações?",
            quick_replies=(
                ("confirm", "Confirmar"),
                ("review", "Revisar"),
            ),
        )
    return ConversationPrompt(
        state="DONE",
        content=(
            "Tudo certo. Suas informações foram registradas para continuidade "
            "nos canais oficiais."
        ),
    )


def _coerce_state(state: str) -> ConversationState:
    if state in STATE_TRANSITIONS:
        return state  # type: ignore[return-value]
    return "IDENTIFY"
