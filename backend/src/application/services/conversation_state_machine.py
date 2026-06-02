from dataclasses import dataclass
from typing import Literal

ConversationState = Literal[
    "START",
    "IDENTIFY",
    "RESUME_OR_NEW",
    "CHOOSE_LOCATION",
    "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_FUNCTION",
    "CHOOSE_SHIFT",
    "SHOW_JOBS",
    "COLLECT_BASIC_DATA",
    "COLLECT_RESUME",
    "CONFIRM_APPLICATION",
    "SUBMITTED",
    "FOLLOW_UP",
]


@dataclass(frozen=True)
class ConversationPrompt:
    state: ConversationState
    content: str
    options: tuple[tuple[str, str], ...] = ()


STATE_SEQUENCE: tuple[ConversationState, ...] = (
    "IDENTIFY",
    "RESUME_OR_NEW",
    "CHOOSE_LOCATION",
    "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_FUNCTION",
    "CHOOSE_SHIFT",
    "SHOW_JOBS",
    "COLLECT_BASIC_DATA",
    "COLLECT_RESUME",
    "CONFIRM_APPLICATION",
    "SUBMITTED",
    "FOLLOW_UP",
)

PROMPTS: dict[ConversationState, ConversationPrompt] = {
    "START": ConversationPrompt(
        state="IDENTIFY",
        content="Olá. Para continuar seu atendimento, informe seu CPF ou WhatsApp.",
    ),
    "IDENTIFY": ConversationPrompt(
        state="IDENTIFY",
        content="Informe seu CPF ou WhatsApp para localizar seu atendimento.",
    ),
    "RESUME_OR_NEW": ConversationPrompt(
        state="RESUME_OR_NEW",
        content=(
            "Encontrei seu ponto de atendimento. "
            "Deseja continuar ou iniciar uma nova candidatura?"
        ),
        options=(("continue", "Continuar"), ("new", "Nova candidatura")),
    ),
    "CHOOSE_LOCATION": ConversationPrompt(
        state="CHOOSE_LOCATION",
        content="Em qual localidade você prefere trabalhar?",
    ),
    "CHOOSE_UNIT_OR_ANY": ConversationPrompt(
        state="CHOOSE_UNIT_OR_ANY",
        content="Você prefere uma filial específica ou aceita qualquer unidade nessa localidade?",
        options=(("any", "Qualquer unidade"), ("specific", "Escolher filial")),
    ),
    "CHOOSE_FUNCTION": ConversationPrompt(
        state="CHOOSE_FUNCTION",
        content="Qual função você procura?",
    ),
    "CHOOSE_SHIFT": ConversationPrompt(
        state="CHOOSE_SHIFT",
        content="Qual turno de trabalho você prefere?",
        options=(
            ("morning", "Manhã"),
            ("afternoon", "Tarde"),
            ("night", "Noite"),
            ("any", "Indiferente"),
        ),
    ),
    "SHOW_JOBS": ConversationPrompt(
        state="SHOW_JOBS",
        content="Com essas preferências, posso seguir para seus dados básicos.",
        options=(("continue", "Continuar"),),
    ),
    "COLLECT_BASIC_DATA": ConversationPrompt(
        state="COLLECT_BASIC_DATA",
        content="Informe nome completo, e-mail e telefone para contato.",
    ),
    "COLLECT_RESUME": ConversationPrompt(
        state="COLLECT_RESUME",
        content="Envie seu currículo ou confirme que deseja continuar sem currículo neste momento.",
        options=(("send_resume", "Enviar currículo"), ("skip_resume", "Continuar sem currículo")),
    ),
    "CONFIRM_APPLICATION": ConversationPrompt(
        state="CONFIRM_APPLICATION",
        content="Confirme se deseja registrar essas informações para o RH.",
        options=(("confirm", "Confirmar"), ("review", "Revisar")),
    ),
    "SUBMITTED": ConversationPrompt(
        state="SUBMITTED",
        content=(
            "Seu atendimento foi registrado. "
            "O RH poderá continuar a análise pelos canais oficiais."
        ),
    ),
    "FOLLOW_UP": ConversationPrompt(
        state="FOLLOW_UP",
        content="Posso ajudar com mais alguma informação sobre seu atendimento?",
        options=(("status", "Ver andamento"), ("finish", "Encerrar")),
    ),
}


def first_prompt() -> ConversationPrompt:
    return PROMPTS["START"]


def next_state(current_state: str, interpreted_intent: str | None = None) -> ConversationState:
    if current_state == "START":
        return "IDENTIFY"
    if current_state == "CONFIRM_APPLICATION" and interpreted_intent == "review":
        return "CHOOSE_LOCATION"
    if current_state == "SUBMITTED":
        return "FOLLOW_UP"

    try:
        index = STATE_SEQUENCE.index(current_state)  # type: ignore[arg-type]
    except ValueError:
        return "IDENTIFY"
    if index + 1 >= len(STATE_SEQUENCE):
        return "FOLLOW_UP"
    return STATE_SEQUENCE[index + 1]


def prompt_for(state: str) -> ConversationPrompt:
    return PROMPTS.get(state, PROMPTS["IDENTIFY"])  # type: ignore[return-value]
