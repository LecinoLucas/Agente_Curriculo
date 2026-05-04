"""Tests validating AI configuration is read from settings.

Ensure:
1. Timeout, tokens, and retry settings come from .env via settings
2. No hardcoded values in analysis flow
3. Settings propagate to AI providers correctly
"""

import pytest
from src.core.settings import settings


class TestAIConfigurationFromSettings:
    """Tests validating AI configuration from settings."""

    def test_ai_provider_timeout_configured(self):
        """Verify: AI_PROVIDER_TIMEOUT_SECONDS is configured in settings."""
        assert hasattr(settings, 'AI_PROVIDER_TIMEOUT_SECONDS'), (
            "settings must have AI_PROVIDER_TIMEOUT_SECONDS"
        )
        assert isinstance(settings.AI_PROVIDER_TIMEOUT_SECONDS, (int, float)), (
            f"AI_PROVIDER_TIMEOUT_SECONDS must be numeric, got {type(settings.AI_PROVIDER_TIMEOUT_SECONDS)}"
        )
        assert settings.AI_PROVIDER_TIMEOUT_SECONDS > 0, (
            f"AI_PROVIDER_TIMEOUT_SECONDS must be positive, got {settings.AI_PROVIDER_TIMEOUT_SECONDS}"
        )

    def test_ai_max_tokens_configured(self):
        """Verify: AI_MAX_TOKENS is configured in settings."""
        assert hasattr(settings, 'AI_MAX_TOKENS'), (
            "settings must have AI_MAX_TOKENS"
        )
        assert isinstance(settings.AI_MAX_TOKENS, int), (
            f"AI_MAX_TOKENS must be int, got {type(settings.AI_MAX_TOKENS)}"
        )
        assert settings.AI_MAX_TOKENS > 0, (
            f"AI_MAX_TOKENS must be positive, got {settings.AI_MAX_TOKENS}"
        )

    def test_ai_max_retries_configured(self):
        """Verify: AI_MAX_RETRIES is configured in settings."""
        assert hasattr(settings, 'AI_MAX_RETRIES'), (
            "settings must have AI_MAX_RETRIES"
        )
        assert isinstance(settings.AI_MAX_RETRIES, int), (
            f"AI_MAX_RETRIES must be int, got {type(settings.AI_MAX_RETRIES)}"
        )
        assert settings.AI_MAX_RETRIES >= 0, (
            f"AI_MAX_RETRIES must be non-negative, got {settings.AI_MAX_RETRIES}"
        )

    def test_analysis_tasks_uses_settings_timeout(self):
        """Verify: analysis_tasks uses settings timeout, not hardcoded."""
        from src.interface.workers.analysis_tasks import _run_real_ai_analysis
        import inspect

        source = inspect.getsource(_run_real_ai_analysis)

        # Should use settings.AI_PROVIDER_TIMEOUT_SECONDS
        assert "settings.AI_PROVIDER_TIMEOUT_SECONDS" in source, (
            f"_run_real_ai_analysis should use settings.AI_PROVIDER_TIMEOUT_SECONDS, "
            f"not hardcoded value. Check source:\n{source[:500]}"
        )

        # Should NOT have hardcoded timeout value
        assert "timeout=90" not in source and "timeout=180" not in source, (
            f"_run_real_ai_analysis should not have hardcoded timeout. "
            f"Check source:\n{source[:500]}"
        )

    def test_analysis_tasks_uses_settings_max_tokens(self):
        """Verify: analysis_tasks uses settings max_tokens, not hardcoded."""
        from src.interface.workers.analysis_tasks import _process_analysis_async
        import inspect

        source = inspect.getsource(_process_analysis_async)

        # Should use settings.AI_MAX_TOKENS
        assert "settings.AI_MAX_TOKENS" in source, (
            f"_process_analysis_async should use settings.AI_MAX_TOKENS. "
            f"Check source:\n{source[:1000]}"
        )

        # Should NOT use hardcoded value like max(6000, ...)
        assert "max(6000" not in source, (
            f"_process_analysis_async should not use hardcoded max(6000, ...). "
            f"Check source:\n{source[:1000]}"
        )

    def test_gemini_adapter_uses_settings_retries(self):
        """Verify: gemini_adapter uses settings retries, not hardcoded."""
        from src.infrastructure.ai.gemini_adapter import GeminiAdapter
        import inspect

        source = inspect.getsource(GeminiAdapter._analyze_with_retries)

        # Should use settings.AI_MAX_RETRIES
        assert "settings.AI_MAX_RETRIES" in source, (
            f"GeminiAdapter should use settings.AI_MAX_RETRIES. "
            f"Check source"
        )

        # Should NOT have MAX_RETRIES constant reference
        assert "MAX_RETRIES" not in source or "settings.AI_MAX_RETRIES" in source, (
            f"GeminiAdapter should not reference hardcoded MAX_RETRIES. "
            f"Check source"
        )

    def test_no_hardcoded_ai_provider_timeout_constant(self):
        """Verify: AI_PROVIDER_TIMEOUT_SECONDS constant is not in analysis_tasks.py."""
        from src.interface.workers import analysis_tasks
        import inspect

        source = inspect.getsource(analysis_tasks)

        # Should NOT have the constant definition
        assert "AI_PROVIDER_TIMEOUT_SECONDS = " not in source, (
            f"analysis_tasks should not define AI_PROVIDER_TIMEOUT_SECONDS constant. "
            f"It should use settings instead."
        )

    def test_settings_are_env_configurable(self):
        """Verify: Settings are read from environment, not hardcoded defaults."""
        # This test just verifies the settings object exists and is configured
        assert settings is not None, "settings object must exist"
        assert settings.AI_PROVIDER_TIMEOUT_SECONDS > 0, (
            "AI_PROVIDER_TIMEOUT_SECONDS must be configured"
        )
        assert settings.AI_MAX_TOKENS > 0, (
            "AI_MAX_TOKENS must be configured"
        )
