"""
Unit tests for ResumeAnalysisEngine (engine.run_analysis).

These tests verify:
- provider is called when the prompt is valid
- provider is NOT called when the prompt exceeds limit
- parsed result is returned correctly
- controlled errors propagate as AnalysisExecutionError
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.ai_orchestration.analysis.engine import AnalysisEngineResult, run_analysis
from src.ai_orchestration.analysis.failure_classifier import (
    AnalysisExecutionError,
    AnalysisFailureDetails,
)
from src.ai_orchestration.analysis.prompt_validator import AnalysisPromptTooLargeError


def _valid_ai_response_json() -> str:
    return json.dumps({
        "professional_area": "technology",
        "seniority_level": "senior",
        "skills": ["Python", "FastAPI"],
        "experiences": [{"role": "Backend Engineer", "duration_months": 36}],
        "education": [{"level": "bachelor", "field": "Ciência da Computação"}],
        "total_experience_months": 36,
    })


def _make_fake_ai_service(content: str = None, raise_exc: Exception | None = None):
    from src.application.ports.ai_service import AIAnalysisResponse

    class FakeAIService:
        async def analyze(self, request):
            if raise_exc is not None:
                raise raise_exc
            return AIAnalysisResponse(
                content=content or _valid_ai_response_json(),
                input_tokens=100,
                output_tokens=50,
                cache_read_tokens=0,
                cache_write_tokens=0,
                processing_time_ms=300,
                finish_reason="STOP",
            )

    return FakeAIService()


def _mock_sessionmaker():
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory


class FakeJob:
    title = "Desenvolvedor Python"
    requirements = "FastAPI, SQLAlchemy"
    responsibilities = "Desenvolver APIs"
    description = None


class TestEngineCallsProvider:
    @pytest.mark.asyncio
    async def test_calls_provider_with_valid_prompt(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 90.0, raising=True)

        fake_service = _make_fake_ai_service()

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create",
                return_value=fake_service,
            ),
            patch(
                "src.application.services.ai_usage_log_service.safe_persist_ai_usage_log",
                new_callable=AsyncMock,
            ),
        ):
            result = await run_analysis(
                resume_text="Desenvolvedor Python com experiência em FastAPI",
                job=FakeJob(),
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-id",
                queue_name="analysis",
                sessionmaker=_mock_sessionmaker(),
            )

        assert isinstance(result, AnalysisEngineResult)
        assert result.result_fields is not None
        assert result.input_tokens == 100
        assert result.output_tokens == 50

    @pytest.mark.asyncio
    async def test_returns_parsed_result_fields(self, monkeypatch) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 90.0, raising=True)

        fake_service = _make_fake_ai_service()

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create",
                return_value=fake_service,
            ),
            patch(
                "src.application.services.ai_usage_log_service.safe_persist_ai_usage_log",
                new_callable=AsyncMock,
            ),
        ):
            result = await run_analysis(
                resume_text="Senior Python developer",
                job=None,
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-id",
                queue_name="analysis",
                sessionmaker=_mock_sessionmaker(),
            )

        assert "seniority_level" in result.result_fields
        assert "total_experience_years" in result.result_fields
        assert result.result_fields["total_experience_years"] == 3.0


class TestEnginePromptGuard:
    @pytest.mark.asyncio
    async def test_does_not_call_provider_when_prompt_exceeds_limit(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create"
            ) as factory_mock,
            pytest.raises(AnalysisPromptTooLargeError),
        ):
            await run_analysis(
                resume_text="developer with experience",
                job=FakeJob(),
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-id",
                queue_name="analysis",
                sessionmaker=_mock_sessionmaker(),
            )

        factory_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_analysis_prompt_too_large_not_runtime_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 50, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)

        with patch("src.infrastructure.ai.factory.AIServiceFactory.create"):
            with pytest.raises(AnalysisPromptTooLargeError):
                await run_analysis(
                    resume_text="developer",
                    job=None,
                    provider="google",
                    model_id="gemini-2.5-flash",
                    prompt_version="7",
                    prompt_max_tokens=1200,
                    prompt_temperature=0.1,
                    analysis_id="test-id",
                    queue_name="analysis",
                    sessionmaker=_mock_sessionmaker(),
                )


class TestEngineErrorPropagation:
    @pytest.mark.asyncio
    async def test_invalid_json_raises_analysis_execution_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 90.0, raising=True)

        fake_service = _make_fake_ai_service(content="{invalid-json")

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create",
                return_value=fake_service,
            ),
            patch(
                "src.application.services.ai_usage_log_service.safe_persist_ai_usage_log",
                new_callable=AsyncMock,
            ),
            pytest.raises(AnalysisExecutionError) as exc_info,
        ):
            await run_analysis(
                resume_text="Desenvolvedor Python",
                job=None,
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-id",
                queue_name="analysis",
                sessionmaker=_mock_sessionmaker(),
            )

        assert "ai_response_invalid_json" in str(exc_info.value)
        assert exc_info.value.details.raw_llm_response == "{invalid-json"

    @pytest.mark.asyncio
    async def test_timeout_raises_analysis_execution_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 0.001, raising=True)

        class SlowAIService:
            async def analyze(self, request):
                import asyncio
                await asyncio.sleep(10)

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create",
                return_value=SlowAIService(),
            ),
            patch(
                "src.application.services.ai_usage_log_service.safe_persist_ai_usage_log",
                new_callable=AsyncMock,
            ),
            pytest.raises(AnalysisExecutionError) as exc_info,
        ):
            await run_analysis(
                resume_text="Desenvolvedor Python",
                job=None,
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-id",
                queue_name="analysis",
                sessionmaker=_mock_sessionmaker(),
            )

        assert "timed out" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_provider_exception_wraps_as_analysis_execution_error(
        self, monkeypatch
    ) -> None:
        from src.core.settings import settings
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_PROMPT_CHARS", 30000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_RESUME_CHARS", 25000, raising=True)
        monkeypatch.setattr(settings, "AI_ANALYSIS_MAX_JOB_CHARS", 5000, raising=True)
        monkeypatch.setattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 90.0, raising=True)

        fake_service = _make_fake_ai_service(raise_exc=RuntimeError("provider exploded"))

        with (
            patch(
                "src.infrastructure.ai.factory.AIServiceFactory.create",
                return_value=fake_service,
            ),
            patch(
                "src.application.services.ai_usage_log_service.safe_persist_ai_usage_log",
                new_callable=AsyncMock,
            ),
            pytest.raises(AnalysisExecutionError),
        ):
            await run_analysis(
                resume_text="Python developer",
                job=None,
                provider="google",
                model_id="gemini-2.5-flash",
                prompt_version="7",
                prompt_max_tokens=1200,
                prompt_temperature=0.1,
                analysis_id="test-id",
                queue_name="analysis",
                sessionmaker=_mock_sessionmaker(),
            )
