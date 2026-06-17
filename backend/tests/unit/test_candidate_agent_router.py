from __future__ import annotations

from src.application.services.candidate_agent_router import CandidateAgentRouter
from src.application.services.candidate_assistant_intent_service import CandidateIntent


def test_router_routes_free_text_jobs_to_public_jobs_tool() -> None:
    router = CandidateAgentRouter()

    decision = router.route(message="tem vaga para caixa em Goiânia?")

    assert decision.intent == "see_jobs"
    assert decision.action == "tool"
    assert decision.tool_name == "search_public_jobs"
    assert "caixa" in str(decision.tool_args.get("query", "")).casefold()


def test_router_uses_handoff_signal_from_ai_intent() -> None:
    router = CandidateAgentRouter()
    ai_intent = CandidateIntent(
        intent="unclear",
        confidence=0.4,
        should_handoff=True,
        talk_to_hr_message="Vou encaminhar você para o RH.",
    )

    decision = router.route(
        message="preciso de ajuda",
        ai_intent=ai_intent,
    )

    assert decision.intent == "talk_to_hr"
    assert decision.action == "handoff"


def test_router_returns_safe_response_for_sensitive_topic() -> None:
    router = CandidateAgentRouter()

    decision = router.route(message="estou grávida, isso atrapalha?")

    assert decision.intent == "unknown"
    assert decision.action == "safe_response"
    assert decision.safe_message is not None
    assert "sensível" in decision.safe_message.casefold()
    assert "rh" in decision.safe_message.casefold()


def test_router_returns_unknown_quick_replies() -> None:
    router = CandidateAgentRouter()
    ai_intent = CandidateIntent(
        intent="unclear",
        confidence=0.4,
        safe_user_message="Posso te ajudar melhor se você escolher uma das opções abaixo.",
    )

    decision = router.route(
        message="blabla sem contexto",
        ai_intent=ai_intent,
    )

    assert decision.intent == "unknown"
    assert decision.action == "safe_response"
    assert decision.quick_replies
    assert decision.safe_message == ai_intent.safe_user_message


def test_router_apply_to_job_starts_guided_flow() -> None:
    router = CandidateAgentRouter()

    decision = router.route(message="quero me candidatar nessa vaga")

    assert decision.intent == "apply_to_job"
    assert decision.action == "application_draft"
    assert decision.tool_name == "search_public_jobs"
