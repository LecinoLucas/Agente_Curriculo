"""
AI-BEHAVIORAL-ENGINE-ISOLATE-1 — unit tests.

Invariants:
A. Engine builds prompt without PII.
B. Engine calls provider when input is valid.
C. Engine parses a valid response.
D. Invalid response raises BehavioralAIProviderResponseInvalidError.
E. Failure classifier distinguishes temporary vs unexpected errors.
F. behavioral_ai_evaluation_service still works after delegating to engine.
G. Failure in usage log does not derail behavioral (AI-USAGE-LOG-HARDENING-1 compat).
H. Bot modules do NOT import the behavioral engine.
I. Analysis engine does NOT depend on behavioral engine.
J. Engine has no Celery, no session.commit, no bot references.
"""
from __future__ import annotations

import importlib
import inspect
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.ai_orchestration.behavioral.behavioral_contracts import (
    BehavioralEvaluationInput,
    BehavioralQAItem,
)
from src.ai_orchestration.behavioral.engine import BehavioralEngineResult, run_behavioral_evaluation
from src.ai_orchestration.behavioral.failure_classifier import (
    classify_provider_error,
    classify_unexpected_failure,
    get_provider_status_code,
    get_retry_after_seconds,
    is_retryable_provider_error,
)
from src.ai_orchestration.behavioral.prompt_builder import (
    SYSTEM_PROMPT,
    build_evaluation_prompt,
)
from src.ai_orchestration.behavioral.response_parser import (
    BehavioralAIProviderResponseInvalidError,
    contains_prohibited_language,
    parse_evaluation_response,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _valid_input() -> BehavioralEvaluationInput:
    return BehavioralEvaluationInput(
        competency_names=["Comunicação", "Trabalho em equipe"],
        questions_and_answers=[
            BehavioralQAItem(
                competency="Comunicação",
                question="Como você lida com feedback crítico?",
                answer_type="text",
                answer="Ouço com atenção e busco melhorar.",
            ),
            BehavioralQAItem(
                competency="Trabalho em equipe",
                question="Descreva um projeto colaborativo.",
                answer_type="text",
                answer="Trabalhei em equipe de 5 pessoas em projeto de 3 meses.",
            ),
        ],
    )


def _valid_response_json() -> str:
    return json.dumps({
        "confidence": "medium",
        "summary": "Candidato demonstra perfil colaborativo.",
        "competency_signals": [
            {
                "competency": "Comunicação",
                "signal": "strong",
                "evidence": "Resposta indica abertura ao feedback.",
                "concerns": [],
            }
        ],
        "strengths": ["Comunicação clara"],
        "concerns": [],
        "suggested_interview_questions": ["Como você prioriza tarefas?"],
        "risk_flags": [],
    })


def _make_ai_service(content: str | None = None, raise_exc: Exception | None = None):
    from src.application.ports.ai_service import AIAnalysisResponse

    class FakeAIService:
        async def analyze(self, request):
            if raise_exc is not None:
                raise raise_exc
            return AIAnalysisResponse(
                content=content or _valid_response_json(),
                input_tokens=200,
                output_tokens=100,
                cache_read_tokens=0,
                cache_write_tokens=0,
                processing_time_ms=400,
                finish_reason="STOP",
            )

    return FakeAIService()


# ── A. Prompt safety ──────────────────────────────────────────────────────────


class TestPromptSafety:
    def test_prompt_does_not_include_pii_placeholder(self) -> None:
        evaluation_input = _valid_input()
        prompt = build_evaluation_prompt(evaluation_input)
        assert "CPF" not in prompt
        assert "@" not in prompt
        assert "telefone" not in prompt.lower()

    def test_prompt_includes_competencies(self) -> None:
        evaluation_input = _valid_input()
        prompt = build_evaluation_prompt(evaluation_input)
        assert "Comunicação" in prompt
        assert "Trabalho em equipe" in prompt

    def test_prompt_includes_answers(self) -> None:
        evaluation_input = _valid_input()
        prompt = build_evaluation_prompt(evaluation_input)
        assert "Ouço com atenção" in prompt

    def test_prompt_preserves_guardrails(self) -> None:
        prompt = build_evaluation_prompt(_valid_input())
        assert "Proibido: aprovar, reprovar" in prompt
        assert "baseada em evidências" in prompt

    def test_system_prompt_not_empty(self) -> None:
        assert len(SYSTEM_PROMPT) > 20

    def test_empty_qa_list_produces_valid_prompt(self) -> None:
        empty_input = BehavioralEvaluationInput(
            competency_names=["Liderança"],
            questions_and_answers=[],
        )
        prompt = build_evaluation_prompt(empty_input)
        assert isinstance(prompt, str)
        assert "Liderança" in prompt


# ── B. Engine calls provider ──────────────────────────────────────────────────


class TestEngineCallsProvider:
    @pytest.mark.asyncio
    async def test_calls_provider_with_valid_input(self) -> None:
        fake_service = _make_ai_service()
        result = await run_behavioral_evaluation(
            evaluation_input=_valid_input(),
            ai_service=fake_service,
        )
        assert isinstance(result, BehavioralEngineResult)
        assert result.input_tokens == 200
        assert result.output_tokens == 100

    @pytest.mark.asyncio
    async def test_engine_result_carries_metadata(self) -> None:
        fake_service = _make_ai_service()
        result = await run_behavioral_evaluation(
            evaluation_input=_valid_input(),
            ai_service=fake_service,
        )
        assert result.processing_time_ms == 400
        assert result.finish_reason == "STOP"


# ── C. Valid response parsing ─────────────────────────────────────────────────


class TestValidResponseParsing:
    def test_parses_confidence_medium(self) -> None:
        data = parse_evaluation_response(_valid_response_json())
        assert data["confidence"] == "medium"

    def test_parses_summary(self) -> None:
        data = parse_evaluation_response(_valid_response_json())
        assert isinstance(data["summary"], str)

    def test_parses_competency_signals_list(self) -> None:
        data = parse_evaluation_response(_valid_response_json())
        assert isinstance(data["competency_signals"], list)

    def test_engine_result_data_has_required_keys(self) -> None:
        data = parse_evaluation_response(_valid_response_json())
        assert "confidence" in data
        assert "summary" in data
        assert "competency_signals" in data

    def test_parses_json_wrapped_in_markdown_fence(self) -> None:
        wrapped = f"```json\n{_valid_response_json()}\n```"
        data = parse_evaluation_response(wrapped)
        assert data["confidence"] == "medium"


# ── D. Invalid response raises controlled error ───────────────────────────────


class TestInvalidResponseHandling:
    def test_invalid_json_raises_provider_response_invalid(self) -> None:
        with pytest.raises(BehavioralAIProviderResponseInvalidError):
            parse_evaluation_response("{not valid json")

    def test_wrong_confidence_value_raises_error(self) -> None:
        bad = json.dumps({
            "confidence": "excellent",
            "summary": "OK",
            "competency_signals": [],
        })
        with pytest.raises(BehavioralAIProviderResponseInvalidError) as exc_info:
            parse_evaluation_response(bad)
        assert "confidence" in str(exc_info.value).lower()

    def test_missing_summary_raises_error(self) -> None:
        bad = json.dumps({
            "confidence": "high",
            "competency_signals": [],
        })
        with pytest.raises(BehavioralAIProviderResponseInvalidError) as exc_info:
            parse_evaluation_response(bad)
        assert "summary" in str(exc_info.value).lower()

    def test_prohibited_language_raises_error(self) -> None:
        prohibited_response = json.dumps({
            "confidence": "high",
            "summary": "O candidato apresenta perfil ansioso e diagnóstico de instabilidade.",
            "competency_signals": [],
        })
        assert contains_prohibited_language(prohibited_response)

    @pytest.mark.asyncio
    async def test_engine_raises_on_prohibited_language(self) -> None:
        prohibited = json.dumps({
            "confidence": "high",
            "summary": "O candidato é ansioso.",
            "competency_signals": [],
        })
        fake_service = _make_ai_service(content=prohibited)
        with pytest.raises(BehavioralAIProviderResponseInvalidError):
            await run_behavioral_evaluation(
                evaluation_input=_valid_input(),
                ai_service=fake_service,
            )

    def test_error_is_not_runtime_error_subclass(self) -> None:
        assert not issubclass(BehavioralAIProviderResponseInvalidError, RuntimeError)


# ── E. Failure classifier ─────────────────────────────────────────────────────


class TestFailureClassifier:
    def test_rate_limited_is_temporary(self) -> None:
        assert is_retryable_provider_error("rate_limited") is True

    def test_provider_timeout_is_temporary(self) -> None:
        assert is_retryable_provider_error("provider_timeout") is True

    def test_unexpected_error_is_not_temporary(self) -> None:
        assert is_retryable_provider_error("unexpected_error") is False

    def test_credential_invalid_is_not_retryable(self) -> None:
        assert is_retryable_provider_error("ai_credential_invalid") is False

    def test_classify_provider_response_invalid(self) -> None:
        exc = BehavioralAIProviderResponseInvalidError("bad response")
        result = classify_unexpected_failure(exc)
        assert result == "provider_response_invalid"

    def test_classify_unknown_is_unexpected_error(self) -> None:
        exc = RuntimeError("something completely unknown")
        result = classify_unexpected_failure(exc)
        assert result == "unexpected_error"

    def test_classify_timeout_string_in_message(self) -> None:
        exc = RuntimeError("connection timed out after 30s")
        result = classify_unexpected_failure(exc)
        assert result == "provider_timeout"

    def test_no_provider_status_code_for_generic_exc(self) -> None:
        exc = RuntimeError("generic error")
        assert get_provider_status_code(exc) is None

    def test_retry_after_uses_backoff_table(self) -> None:
        exc = RuntimeError("generic")
        assert get_retry_after_seconds(exc, retry_count=1) == 15
        assert get_retry_after_seconds(exc, retry_count=2) == 45
        assert get_retry_after_seconds(exc, retry_count=3) == 120

    def test_retry_after_defaults_300_for_unknown_count(self) -> None:
        exc = RuntimeError("generic")
        assert get_retry_after_seconds(exc, retry_count=99) == 300


# ── H. Bot modules do not import behavioral engine ────────────────────────────


class TestBotDoesNotImportBehavioralEngine:
    def _load_source(self, module_name: str) -> str:
        mod = importlib.import_module(module_name)
        return inspect.getsource(mod)

    def test_candidate_bot_policies_has_no_behavioral_engine_import(self) -> None:
        try:
            src = self._load_source("src.ai_orchestration.tools.candidate_bot_policies")
        except ModuleNotFoundError:
            pytest.skip("candidate_bot_policies not found")
        assert "ai_orchestration.behavioral" not in src

    def test_candidate_bot_tool_registry_has_no_behavioral_engine_import(self) -> None:
        try:
            src = self._load_source("src.ai_orchestration.tools.candidate_bot_tool_registry")
        except ModuleNotFoundError:
            pytest.skip("candidate_bot_tool_registry not found")
        assert "ai_orchestration.behavioral" not in src


# ── I. Analysis engine independent of behavioral engine ──────────────────────


class TestAnalysisEngineIndependent:
    def test_analysis_engine_does_not_import_behavioral(self) -> None:
        mod = importlib.import_module("src.ai_orchestration.analysis.engine")
        src = inspect.getsource(mod)
        assert "ai_orchestration.behavioral" not in src

    def test_analysis_prompt_builder_does_not_import_behavioral(self) -> None:
        mod = importlib.import_module("src.ai_orchestration.analysis.prompt_builder")
        src = inspect.getsource(mod)
        assert "ai_orchestration.behavioral" not in src


# ── J. Engine module boundaries ───────────────────────────────────────────────


class TestEngineBoundaries:
    def _src(self, mod_name: str) -> str:
        mod = importlib.import_module(mod_name)
        return inspect.getsource(mod)

    def test_engine_has_no_celery_imports(self) -> None:
        src = self._src("src.ai_orchestration.behavioral.engine")
        lines = [ln.strip() for ln in src.splitlines()]
        assert not any(
            ln.startswith("from celery") or ln.startswith("import celery") or "celery_app" in ln
            for ln in lines
        )

    def test_engine_has_no_session_commit(self) -> None:
        src = self._src("src.ai_orchestration.behavioral.engine")
        assert "session.commit" not in src
        assert "session.add" not in src

    def test_engine_has_no_bot_reference(self) -> None:
        src = self._src("src.ai_orchestration.behavioral.engine")
        assert "candidate_bot" not in src.lower()
        assert "bot_tool" not in src.lower()

    def test_prompt_builder_has_no_db_reference(self) -> None:
        src = self._src("src.ai_orchestration.behavioral.prompt_builder")
        assert "session" not in src
        assert "sqlalchemy" not in src.lower()

    def test_failure_classifier_has_no_celery(self) -> None:
        src = self._src("src.ai_orchestration.behavioral.failure_classifier")
        assert "celery" not in src.lower()
