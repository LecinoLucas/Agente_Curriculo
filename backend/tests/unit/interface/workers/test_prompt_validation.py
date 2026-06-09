"""
Regression guard for prompt validation — ensures AnalysisPromptTooLargeError
is raised (not RuntimeError) when prompts exceed configured limits.

Critical invariant: prompt_chars_exceeded must produce AnalysisPromptTooLargeError,
never a naked RuntimeError, so the failure classifier maps it to prompt_too_large
and the worker does not attempt a Celery retry.
"""
from __future__ import annotations

import pytest

from src.ai_orchestration.analysis.failure_classifier import classify_analysis_exception
from src.ai_orchestration.analysis.prompt_validator import (
    AnalysisPromptTooLargeError,
    validate_prompt_before_ai,
)
from src.interface.workers.analysis_tasks import (
    AnalysisPromptTooLargeError as WorkerAnalysisPromptTooLargeError,
    _validate_prompt_before_ai,
)


# ── Backward compat alias guard ──────────────────────────────────────────────


def test_worker_prompt_too_large_error_is_same_class_as_engine() -> None:
    """The alias in analysis_tasks must point to the same class."""
    assert WorkerAnalysisPromptTooLargeError is AnalysisPromptTooLargeError


def test_worker_validate_prompt_alias_is_same_function_as_engine() -> None:
    assert _validate_prompt_before_ai is validate_prompt_before_ai


# ── Prompt size validation ────────────────────────────────────────────────────


class TestPromptSizeValidation:
    def test_prompt_4644_chars_passes(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        validate_prompt_before_ai(prompt="x" * 4644, resume_chars=100, job_chars=100)

    def test_prompt_5000_chars_passes(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        validate_prompt_before_ai(prompt="x" * 5000, resume_chars=100, job_chars=100)

    def test_prompt_above_limit_raises_analysis_prompt_too_large_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 100, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        with pytest.raises(AnalysisPromptTooLargeError) as exc_info:
            validate_prompt_before_ai(prompt="x" * 200, resume_chars=10, job_chars=10)

        assert "prompt_chars_exceeded" in exc_info.value.reasons

    def test_prompt_above_limit_does_not_raise_plain_runtime_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        with pytest.raises(AnalysisPromptTooLargeError):
            validate_prompt_before_ai(prompt="x" * 200, resume_chars=10, job_chars=10)

    def test_resume_chars_exceeded_included_in_reasons(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 10, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)

        with pytest.raises(AnalysisPromptTooLargeError) as exc_info:
            validate_prompt_before_ai(prompt="x" * 100, resume_chars=200, job_chars=10)

        assert "resume_chars_exceeded" in exc_info.value.reasons

    def test_error_carries_prompt_and_resume_and_job_char_counts(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        prompt_text = "x" * 100

        with pytest.raises(AnalysisPromptTooLargeError) as exc_info:
            validate_prompt_before_ai(
                prompt=prompt_text,
                resume_chars=42,
                job_chars=18,
            )

        err = exc_info.value
        assert err.prompt_chars == 100
        assert err.resume_chars == 42
        assert err.job_chars == 18


# ── Classifier integration ────────────────────────────────────────────────────


class TestClassifierIntegration:
    def test_prompt_too_large_error_classifies_as_prompt_too_large(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        exc = None
        try:
            validate_prompt_before_ai(prompt="x" * 200, resume_chars=10, job_chars=10)
        except AnalysisPromptTooLargeError as e:
            exc = e

        assert exc is not None
        classification = classify_analysis_exception(exc)
        assert classification.provider_error_type == "prompt_too_large"
        assert classification.is_temporary is False

    def test_prompt_too_large_error_is_not_temporary(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        exc = None
        try:
            validate_prompt_before_ai(prompt="x" * 200, resume_chars=10, job_chars=10)
        except AnalysisPromptTooLargeError as e:
            exc = e

        assert exc is not None
        classification = classify_analysis_exception(exc)
        assert classification.is_temporary is False


# ── engine-level test: no provider call when prompt too large ─────────────────


class TestEnginePromptGuard:
    @pytest.mark.asyncio
    async def test_engine_does_not_call_provider_when_prompt_exceeds_limit(
        self, monkeypatch
    ) -> None:
        from unittest.mock import AsyncMock, MagicMock, patch
        from src.core.settings import settings

        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        class FakeJob:
            title = "Dev"
            requirements = None
            responsibilities = None
            description = None

        with (
            patch("src.infrastructure.ai.factory.AIServiceFactory.create") as factory_mock,
            pytest.raises(AnalysisPromptTooLargeError),
        ):
            from src.ai_orchestration.analysis.engine import run_analysis
            await run_analysis(
                resume_text="currículo de desenvolvedor python senior",
                job=FakeJob(),
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-analysis-id",
                queue_name="analysis",
                sessionmaker=MagicMock(),
            )

        factory_mock.assert_not_called()
