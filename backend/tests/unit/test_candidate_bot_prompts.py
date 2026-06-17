from __future__ import annotations

from src.application.prompts.candidate_bot_prompts import (
    CANDIDATE_ALLOWED_DATA,
    CANDIDATE_ALLOWED_INTENTS,
    CANDIDATE_BOT_SYSTEM_PROMPT,
    CANDIDATE_HANDOFF_RULES,
    CANDIDATE_INTENT_CLASSIFICATION_PROMPT,
    CANDIDATE_PROHIBITED_DATA,
    CANDIDATE_SAFE_RESPONSE_PROMPT,
    CANDIDATE_WRITE_CONFIRMATION_RULES,
)


def test_candidate_bot_prompt_module_exports_runtime_contract() -> None:
    assert CANDIDATE_BOT_SYSTEM_PROMPT.strip()
    assert CANDIDATE_INTENT_CLASSIFICATION_PROMPT.strip()
    assert CANDIDATE_SAFE_RESPONSE_PROMPT.strip()
    assert CANDIDATE_ALLOWED_INTENTS
    assert CANDIDATE_ALLOWED_DATA
    assert CANDIDATE_PROHIBITED_DATA
    assert CANDIDATE_HANDOFF_RULES
    assert CANDIDATE_WRITE_CONFIRMATION_RULES


def test_system_prompt_contains_anti_hallucination_rules() -> None:
    lowered = CANDIDATE_BOT_SYSTEM_PROMPT.casefold()
    assert "português do brasil" in lowered
    assert "uma pergunta por vez" in lowered
    assert "nunca invente vaga" in lowered
    assert "use apenas tools autorizadas e rag público" in lowered
    assert "nunca rejeite candidato sozinho" in lowered
    assert "nunca aprove candidato" in lowered


def test_system_prompt_contains_lgpd_and_sensitive_data_rules() -> None:
    lowered = CANDIDATE_BOT_SYSTEM_PROMPT.casefold()
    assert "nunca peça dados sensíveis" in lowered
    assert "nunca peça documentos admissionais antes da etapa correta" in lowered
    for item in CANDIDATE_PROHIBITED_DATA:
        assert item.casefold() in lowered


def test_system_prompt_requires_explicit_confirmation_before_write() -> None:
    lowered = CANDIDATE_BOT_SYSTEM_PROMPT.casefold()
    assert "antes de criar candidatura" in lowered
    assert "mostre um resumo" in lowered
    assert "confirmação explícita" in lowered


def test_intent_prompt_lists_only_allowed_candidate_intents() -> None:
    lowered = CANDIDATE_INTENT_CLASSIFICATION_PROMPT.casefold()
    for intent in CANDIDATE_ALLOWED_INTENTS:
        assert f"- {intent}" in lowered
    assert "approve_candidate" not in lowered
    assert "create_pre_admission" not in lowered
    assert "reject_candidate" not in lowered


def test_safe_response_prompt_forbids_deadline_promises() -> None:
    lowered = CANDIDATE_SAFE_RESPONSE_PROMPT.casefold()
    assert "não prometa prazo" in lowered
    assert "não prometa prazo, aprovação, reprovação ou contratação." in lowered
