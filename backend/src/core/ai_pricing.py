"""Static pricing for AI models used by the system.

This module centralizes per-model pricing (USD per 1M tokens) and exposes
``estimate_ai_cost`` so callers can compute estimated cost in USD for any
recorded usage row.

Important rules:
- A model without an entry in ``AI_MODEL_PRICING`` returns ``None`` (never 0).
  The aggregator in ``system_health_service`` already skips ``None`` values
  and surfaces "Custo não configurado" in the UI when every row is ``None``.
- Pricing changes over time; update this table when contracts change.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

import structlog

logger = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class AIModelPricing:
    input_per_1m_tokens: Decimal
    output_per_1m_tokens: Decimal
    currency: str = "USD"
    source: str = ""
    # ISO date string (YYYY-MM-DD) — last time the pricing was reviewed
    # against the official source. Update together with any price change.
    last_reviewed_at: str = ""


# Provider aliases: maps historical/alternate provider names to the canonical
# value used as the dict key. Allows legacy rows with provider="gemini" to
# still resolve to the Google pricing entries.
_PROVIDER_ALIASES: dict[str, str] = {
    "gemini": "google",
    "google_genai": "google",
}


def _normalize_provider(provider: str | None) -> str:
    if not provider:
        return ""
    return _PROVIDER_ALIASES.get(provider.strip().lower(), provider.strip().lower())


def _normalize_model(model_id: str | None) -> str:
    if not model_id:
        return ""
    return model_id.strip().lower()


# Canonical pricing table keyed by (provider, model_id).
#
# Sources (consult the official pricing pages before updating):
# - Gemini: https://ai.google.dev/gemini-api/docs/pricing
# - Anthropic: https://www.anthropic.com/pricing
AI_MODEL_PRICING: dict[tuple[str, str], AIModelPricing] = {
    ("google", "gemini-2.5-flash"): AIModelPricing(
        input_per_1m_tokens=Decimal("0.30"),
        output_per_1m_tokens=Decimal("2.50"),
        source="https://ai.google.dev/gemini-api/docs/pricing",
        last_reviewed_at="2026-05-18",
    ),
    ("anthropic", "claude-sonnet-4-6"): AIModelPricing(
        input_per_1m_tokens=Decimal("3.00"),
        output_per_1m_tokens=Decimal("15.00"),
        source="https://www.anthropic.com/pricing",
        last_reviewed_at="2026-05-18",
    ),
}


def get_pricing(provider: str | None, model_id: str | None) -> AIModelPricing | None:
    return AI_MODEL_PRICING.get((_normalize_provider(provider), _normalize_model(model_id)))


def estimate_ai_cost(
    provider: str | None,
    model_id: str | None,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
) -> Decimal | None:
    """Estimate the cost (USD) of a single AI call.

    Returns ``None`` when no pricing is configured for the
    ``(provider, model_id)`` pair — the caller must propagate ``None``
    (never silently coalesce to zero).
    """
    pricing = get_pricing(provider, model_id)
    if pricing is None:
        logger.warning(
            "ai_pricing.model_not_configured",
            provider=provider,
            model_id=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        return None

    input_cost = (Decimal(input_tokens) / Decimal(1_000_000)) * pricing.input_per_1m_tokens
    output_cost = (Decimal(output_tokens) / Decimal(1_000_000)) * pricing.output_per_1m_tokens
    return input_cost + output_cost


def estimate_ai_cost_usd(
    model: str,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
) -> Decimal | None:
    """Backward-compatible wrapper. Prefer ``estimate_ai_cost(provider, model_id, ...)``.

    This form searches the pricing table by model name alone, matching the
    first provider that has an entry for that model id. Kept so existing
    callers continue to compile; new code should call ``estimate_ai_cost``
    with both ``provider`` and ``model_id``.
    """
    normalized_model = _normalize_model(model)
    for (_provider, _model_id), _pricing in AI_MODEL_PRICING.items():
        if _model_id == normalized_model:
            return estimate_ai_cost(
                _provider,
                _model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
    logger.warning(
        "ai_pricing.model_not_configured",
        provider=None,
        model_id=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return None
