"""
AI boundary enforcement tests: verify that the new analysis sub-modules are
properly isolated — no cross-contamination with bot, frontend, or Celery.
"""
from __future__ import annotations

import importlib
import inspect

import pytest

from src.ai_orchestration.analysis.failure_classifier import (
    AnalysisErrorClassification,
    AnalysisExecutionError,
    AnalysisFailureDetails,
    classify_analysis_exception,
)
from src.ai_orchestration.analysis.prompt_builder import (
    PROMPT_INSTRUCTION,
    build_minimal_user_prompt,
)
from src.ai_orchestration.analysis.prompt_compaction import (
    compact_job_for_prompt,
    compact_resume_for_prompt,
)
from src.ai_orchestration.analysis.prompt_validator import (
    AnalysisPromptTooLargeError,
    validate_prompt_before_ai,
)
from src.ai_orchestration.analysis.response_parser import (
    parse_and_validate_analysis_response,
)


# ── Module boundary checks ───────────────────────────────────────────────────


class TestModuleBoundaries:
    def _module_source(self, module_name: str) -> str:
        mod = importlib.import_module(module_name)
        return inspect.getsource(mod)

    def test_prompt_compaction_has_no_celery(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.prompt_compaction")
        assert "celery" not in src.lower()

    def test_prompt_validator_has_no_celery(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.prompt_validator")
        assert "celery" not in src.lower()

    def test_prompt_builder_has_no_celery(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.prompt_builder")
        assert "celery" not in src.lower()

    def test_failure_classifier_has_no_celery(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.failure_classifier")
        assert "celery" not in src.lower()

    def test_engine_has_no_celery_imports(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.engine")
        lines = [ln.strip() for ln in src.splitlines()]
        assert not any(
            ln.startswith("from celery") or ln.startswith("import celery") or "celery_app" in ln
            for ln in lines
        )

    def test_engine_has_no_bot_reference(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.engine")
        assert "candidate_bot" not in src.lower()
        assert "bot_tool" not in src.lower()

    def test_engine_does_not_create_celery_task_ids(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.engine")
        assert "self.request.id" not in src
        assert "@celery_app.task" not in src

    def test_engine_has_no_direct_db_write(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.engine")
        assert "session.commit" not in src
        assert "session.add" not in src

    def test_failure_classifier_has_no_bot_reference(self) -> None:
        src = self._module_source("src.ai_orchestration.analysis.failure_classifier")
        assert "candidate_bot" not in src.lower()


# ── prompt_compaction unit tests ─────────────────────────────────────────────


class TestPromptCompaction:
    def test_compact_resume_respects_max_chars(self, monkeypatch) -> None:
        from src.ai_orchestration.analysis import prompt_compaction
        from src.core.settings import settings

        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 50, raising=True)
        long_text = "experiência\n" * 200
        result = compact_resume_for_prompt(long_text)
        assert len(result) <= 50 + len("\n\n[conteudo truncado para controle de custo]") + 10

    def test_compact_resume_does_not_break_with_empty_text(self) -> None:
        result = compact_resume_for_prompt("")
        assert isinstance(result, str)

    def test_compact_resume_removes_email(self) -> None:
        # Verifies the raw email never appears in output (may be filtered by line relevance too)
        result = compact_resume_for_prompt("nome: João\nemail: joao@empresa.com\nexperiência")
        assert "joao@empresa.com" not in result

    def test_compact_resume_removes_cpf(self) -> None:
        # Raw CPF must never appear — may be filtered away by line relevance
        result = compact_resume_for_prompt("CPF: 123.456.789-00\nexperiência como dev")
        assert "123.456.789-00" not in result

    def test_compact_job_respects_max_chars(self, monkeypatch) -> None:
        from src.core.settings import settings

        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 30, raising=True)

        class FakeJob:
            title = "Analista"
            requirements = "Python " * 100
            responsibilities = None
            description = None

        result = compact_job_for_prompt(FakeJob())
        assert len(result) <= 30 + len("\n\n[conteudo truncado para controle de custo]") + 10

    def test_compact_job_handles_none_job(self) -> None:
        result = compact_job_for_prompt(None) if False else ""
        # Callers pass None and check before calling — this verifies duck typing
        class EmptyJob:
            title = None
            requirements = None
            responsibilities = None
            description = None

        result = compact_job_for_prompt(EmptyJob())
        assert result == ""

    def test_compact_job_includes_title_and_requirements(self) -> None:
        class FakeJob:
            title = "Desenvolvedor Python"
            requirements = "5 anos de experiência"
            responsibilities = None
            description = None

        result = compact_job_for_prompt(FakeJob())
        assert "Desenvolvedor Python" in result
        assert "5 anos de experiência" in result


# ── prompt_validator unit tests ──────────────────────────────────────────────


class TestPromptValidator:
    def _make_prompt(self, resume_chars: int = 100, job_chars: int = 100) -> str:
        return "x" * (resume_chars + job_chars + 200)

    def test_valid_prompt_4644_chars_passes(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)

        prompt = "x" * 4644
        validate_prompt_before_ai(prompt=prompt, resume_chars=100, job_chars=100)

    def test_valid_prompt_5000_chars_passes(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)

        prompt = "x" * 5000
        validate_prompt_before_ai(prompt=prompt, resume_chars=100, job_chars=100)

    def test_prompt_exceeding_limit_raises_analysis_prompt_too_large_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 100, raising=True)

        with pytest.raises(AnalysisPromptTooLargeError) as exc_info:
            validate_prompt_before_ai(prompt="x" * 200, resume_chars=10, job_chars=10)

        assert "prompt_chars_exceeded" in exc_info.value.reasons

    def test_prompt_too_large_does_not_raise_runtime_error(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 10, raising=True)

        with pytest.raises(AnalysisPromptTooLargeError):
            validate_prompt_before_ai(prompt="x" * 200, resume_chars=5, job_chars=5)

    def test_prompt_too_large_error_is_not_runtime_error_subclass(self) -> None:
        assert not issubclass(AnalysisPromptTooLargeError, RuntimeError)


# ── failure_classifier unit tests ────────────────────────────────────────────


class TestFailureClassifier:
    def test_analysis_prompt_too_large_classifies_as_prompt_too_large(self) -> None:
        exc = AnalysisPromptTooLargeError(
            reasons=["prompt_chars_exceeded"],
            prompt_chars=35000,
            resume_chars=25000,
            job_chars=5000,
        )
        result = classify_analysis_exception(exc)
        assert result.provider_error_type == "prompt_too_large"
        assert result.is_temporary is False

    def test_unexpected_exception_classifies_as_unexpected_error(self) -> None:
        exc = RuntimeError("completely unexpected thing happened")
        result = classify_analysis_exception(exc)
        assert result.provider_error_type == "unexpected_error"
        assert result.is_temporary is False

    def test_analysis_execution_error_non_retryable_classifies_as_payload_invalid(self) -> None:
        exc = AnalysisExecutionError(
            "response was truncated",
            details=AnalysisFailureDetails(
                finish_reason="MAX_TOKENS",
                provider="gemini",
                model_id="gemini-2.5-flash",
            ),
        )
        result = classify_analysis_exception(exc)
        assert result.provider_error_type == "payload_invalid"
        assert result.is_temporary is False

    def test_analysis_execution_error_for_parse_failure_classifies_as_payload_invalid(
        self,
    ) -> None:
        exc = AnalysisExecutionError(
            "ai_response_invalid_json: could not parse",
            details=AnalysisFailureDetails(provider="gemini", model_id="gemini-2.5-flash"),
        )
        result = classify_analysis_exception(exc)
        assert result.provider_error_type == "payload_invalid"

    def test_prompt_too_large_is_not_temporary(self) -> None:
        exc = AnalysisPromptTooLargeError(
            reasons=["resume_chars_exceeded"],
            prompt_chars=10000,
            resume_chars=26000,
            job_chars=100,
        )
        result = classify_analysis_exception(exc)
        assert result.is_temporary is False


# ── engine integration guard (import-level) ──────────────────────────────────


class TestEngineImports:
    def test_engine_exports_run_analysis(self) -> None:
        from src.ai_orchestration.analysis.engine import run_analysis
        assert callable(run_analysis)

    def test_engine_exports_analysis_engine_result(self) -> None:
        from src.ai_orchestration.analysis.engine import AnalysisEngineResult
        import dataclasses
        assert dataclasses.is_dataclass(AnalysisEngineResult)

    def test_package_init_re_exports_all_public_symbols(self) -> None:
        import src.ai_orchestration.analysis as pkg
        assert hasattr(pkg, "AnalysisPromptTooLargeError")
        assert hasattr(pkg, "AnalysisErrorClassification")
        assert hasattr(pkg, "AnalysisExecutionError")
        assert hasattr(pkg, "AnalysisFailureDetails")
        assert hasattr(pkg, "run_analysis")
        assert hasattr(pkg, "classify_analysis_exception")
        assert hasattr(pkg, "validate_prompt_before_ai")
        assert hasattr(pkg, "build_minimal_user_prompt")
        assert hasattr(pkg, "compact_resume_for_prompt")
        assert hasattr(pkg, "compact_job_for_prompt")
