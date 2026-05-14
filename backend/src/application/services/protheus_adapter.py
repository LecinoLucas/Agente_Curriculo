"""Isolated Protheus adapter with mock/homologation mode."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4


@dataclass
class ProtheusAdapterResult:
    success: bool
    message: str
    external_reference: str | None = None
    error_code: str | None = None
    http_status: int | None = None
    request_headers: dict | None = None
    response_headers: dict | None = None


class ProtheusMockAdapter:
    """Mock adapter for homologation without real ERP traffic."""

    def send(
        self,
        *,
        payload: dict,
        idempotency_key: str,
        simulate_failure: bool = False,
    ) -> ProtheusAdapterResult:
        request_headers = {
            "content-type": "application/json",
            "x-idempotency-key": idempotency_key,
            "x-integration-mode": "mock",
        }
        if simulate_failure:
            return ProtheusAdapterResult(
                success=False,
                error_code="PROTHEUS_MOCK_VALIDATION_ERROR",
                message="Falha simulada no Protheus.",
                http_status=422,
                request_headers=request_headers,
                response_headers={"x-mock-provider": "protheus"},
            )

        external_reference = f"PROTHEUS-MOCK-{uuid4().hex[:12].upper()}"
        return ProtheusAdapterResult(
            success=True,
            message="Mock Protheus processado com sucesso. Nenhum dado real foi enviado.",
            external_reference=external_reference,
            http_status=200,
            request_headers=request_headers,
            response_headers={
                "x-mock-provider": "protheus",
                "x-external-reference": external_reference,
            },
        )
