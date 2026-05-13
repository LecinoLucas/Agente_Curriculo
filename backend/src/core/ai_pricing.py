from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class AIModelPricing:
    input_per_1m_tokens: Decimal
    output_per_1m_tokens: Decimal


# Billing oficial varia por conta/projeto e pode mudar ao longo do tempo.
# Mantenha vazio até configurar explicitamente os modelos desejados.
AI_MODEL_PRICING: dict[str, AIModelPricing] = {}


def estimate_ai_cost_usd(
    model: str,
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
) -> Decimal | None:
    pricing = AI_MODEL_PRICING.get(model)
    if pricing is None:
        return None

    input_cost = (Decimal(input_tokens) / Decimal(1_000_000)) * pricing.input_per_1m_tokens
    output_cost = (Decimal(output_tokens) / Decimal(1_000_000)) * pricing.output_per_1m_tokens
    return input_cost + output_cost
