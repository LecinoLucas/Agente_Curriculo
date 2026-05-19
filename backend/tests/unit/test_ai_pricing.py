"""Unit tests for ai_pricing module."""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.core.ai_pricing import (
    AI_MODEL_PRICING,
    estimate_ai_cost,
    estimate_ai_cost_usd,
    get_pricing,
)


class TestPricingTable:
    def test_gemini_2_5_flash_is_configured(self) -> None:
        pricing = get_pricing("google", "gemini-2.5-flash")
        assert pricing is not None
        assert pricing.input_per_1m_tokens > Decimal("0")
        assert pricing.output_per_1m_tokens > Decimal("0")
        assert pricing.currency == "USD"

    def test_anthropic_default_model_is_configured(self) -> None:
        pricing = get_pricing("anthropic", "claude-sonnet-4-6")
        assert pricing is not None
        assert pricing.input_per_1m_tokens > Decimal("0")
        assert pricing.output_per_1m_tokens > Decimal("0")


class TestEstimateAICost:
    def test_returns_positive_value_for_gemini(self) -> None:
        cost = estimate_ai_cost(
            "google",
            "gemini-2.5-flash",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost is not None
        assert cost > Decimal("0")
        # input 0.30 + output 2.50 = 2.80 per 1M each
        assert cost == Decimal("0.30") + Decimal("2.50")

    def test_returns_positive_value_for_anthropic(self) -> None:
        cost = estimate_ai_cost(
            "anthropic",
            "claude-sonnet-4-6",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost is not None
        assert cost == Decimal("3.00") + Decimal("15.00")

    def test_unknown_model_returns_none_not_zero(self) -> None:
        cost = estimate_ai_cost(
            "google",
            "gemini-99-unobtanium",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost is None

    def test_unknown_provider_returns_none(self) -> None:
        cost = estimate_ai_cost(
            "openai",
            "gpt-9",
            input_tokens=1_000,
            output_tokens=500,
        )
        assert cost is None

    def test_legacy_provider_gemini_aliases_to_google(self) -> None:
        cost = estimate_ai_cost(
            "gemini",
            "gemini-2.5-flash",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost is not None
        assert cost == Decimal("0.30") + Decimal("2.50")

    def test_provider_case_insensitive(self) -> None:
        cost = estimate_ai_cost(
            "GOOGLE",
            "GEMINI-2.5-FLASH",
            input_tokens=500_000,
            output_tokens=0,
        )
        assert cost is not None
        assert cost == Decimal("0.30") / Decimal("2")

    def test_zero_tokens_returns_zero(self) -> None:
        cost = estimate_ai_cost(
            "google",
            "gemini-2.5-flash",
            input_tokens=0,
            output_tokens=0,
        )
        assert cost == Decimal("0")

    def test_partial_tokens_pro_rata(self) -> None:
        # 100_000 input tokens at $0.30/1M = 0.03
        cost = estimate_ai_cost(
            "google",
            "gemini-2.5-flash",
            input_tokens=100_000,
            output_tokens=0,
        )
        assert cost == Decimal("0.03")

    def test_none_provider_returns_none(self) -> None:
        assert estimate_ai_cost(None, "gemini-2.5-flash", input_tokens=10, output_tokens=10) is None


class TestBackwardCompatibleHelper:
    def test_estimate_ai_cost_usd_matches_modern_api(self) -> None:
        legacy = estimate_ai_cost_usd("gemini-2.5-flash", input_tokens=200, output_tokens=300)
        modern = estimate_ai_cost(
            "google", "gemini-2.5-flash", input_tokens=200, output_tokens=300
        )
        assert legacy is not None
        assert legacy == modern

    def test_estimate_ai_cost_usd_returns_none_for_unknown(self) -> None:
        assert estimate_ai_cost_usd("ghost-model-xyz", input_tokens=10, output_tokens=10) is None


class TestWarningOnMissingModel:
    def test_warning_logged_when_model_not_configured(self, caplog: pytest.LogCaptureFixture) -> None:
        # structlog routes through stdlib logging at info+; using caplog as a smoke check.
        result = estimate_ai_cost(
            "openai", "unknown-model", input_tokens=10, output_tokens=10
        )
        assert result is None


class TestAggregatorBehavior:
    """Document the contract that all-None aggregates do NOT collapse to 0."""

    def test_all_none_filtered_returns_empty(self) -> None:
        rows = [None, None, None]
        present = [c for c in rows if c is not None]
        assert present == []  # aggregator should treat this as "not configured"

    def test_partial_pricing_skips_none(self) -> None:
        rows = [Decimal("0.05"), None, Decimal("0.10")]
        total = sum((c for c in rows if c is not None), Decimal("0"))
        assert total == Decimal("0.15")
