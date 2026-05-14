"""Real Protheus adapter with security gates, credential masking, and audit logging."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ProtheusRealAdapterResult:
    """Result of Protheus real send operation."""

    success: bool
    message: str
    external_reference: str | None = None
    error_code: str | None = None
    http_status: int | None = None
    request_headers: dict | None = None
    response_headers: dict | None = None
    error_details: str | None = None


def _mask_secrets(data: dict | str) -> dict | str:
    """Mask sensitive values in headers/payloads for logging."""
    if isinstance(data, str):
        return data
    if not isinstance(data, dict):
        return data

    masked = {}
    sensitive_keys = {
        "authorization",
        "x-auth-token",
        "x-api-key",
        "password",
        "token",
        "secret",
        "credential",
    }

    for key, value in data.items():
        if key.lower() in sensitive_keys and isinstance(value, str) and value:
            masked[key] = f"***{value[-1]}" if len(value) > 0 else "***"
        else:
            masked[key] = value

    return masked


class ProtheusRealAdapter:
    """Real Protheus adapter for homologation environment.

    Security gates:
    - Only active in homologation/development (not production)
    - Requires explicit feature flag enablement
    - All secrets masked in logs
    - Idempotency enforced
    - Timeout protection
    """

    def __init__(
        self,
        *,
        base_url: str,
        auth_mode: str,
        username: str | None = None,
        password: str | None = None,
        token: str | None = None,
        timeout_seconds: float = 30.0,
        app_env: str = "development",
        allow_real_send: bool = False,
    ):
        """Initialize real adapter with Protheus credentials.

        Args:
            base_url: Protheus base URL (must be HTTPS in production)
            auth_mode: "basic" or "token"
            username: For basic auth
            password: For basic auth
            token: For token auth
            timeout_seconds: HTTP timeout
            app_env: Application environment (development/staging/production)
            allow_real_send: Must be explicitly True to allow sends
        """
        if not base_url:
            raise ValueError("base_url é obrigatório")

        if app_env == "production" and not base_url.startswith("https://"):
            raise ValueError("Em produção, base_url deve ser HTTPS")

        if auth_mode not in {"basic", "token"}:
            raise ValueError("auth_mode deve ser 'basic' ou 'token'")

        if auth_mode == "basic" and (not username or not password):
            raise ValueError("auth_mode=basic requer username e password")

        if auth_mode == "token" and not token:
            raise ValueError("auth_mode=token requer token")

        self.base_url = base_url.rstrip("/")
        self.auth_mode = auth_mode
        self.username = username
        self.password = password
        self.token = token
        self.timeout_seconds = timeout_seconds
        self.app_env = app_env
        self.allow_real_send = allow_real_send

    def _check_send_allowed(self) -> None:
        """Enforce security gates before allowing real send."""
        if not self.allow_real_send:
            raise RuntimeError(
                "Envio real para Protheus está desabilitado. "
                "Configure ERP_ALLOW_REAL_SEND=true apenas em homologação."
            )

        if self.app_env == "production":
            raise RuntimeError(
                "Envio real para Protheus é proibido em produção. "
                "Configure APP_ENV != production para usar este adapter."
            )

    def _build_headers(self, idempotency_key: str) -> dict[str, str]:
        """Build request headers with auth and idempotency key."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "ResumeAI/1.0",
            "X-Idempotency-Key": idempotency_key,
            "X-Integration-Mode": "homolog",
        }

        if self.auth_mode == "basic":
            import base64

            credentials = base64.b64encode(
                f"{self.username}:{self.password}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {credentials}"
        elif self.auth_mode == "token":
            headers["Authorization"] = f"Bearer {self.token}"

        return headers

    async def send(
        self,
        *,
        payload: dict,
        idempotency_key: str,
    ) -> ProtheusRealAdapterResult:
        """Send payload to real Protheus (homolog environment).

        Args:
            payload: Request payload
            idempotency_key: Unique key for idempotency

        Returns:
            Result with success status, reference, and audit info
        """
        self._check_send_allowed()

        headers = self._build_headers(idempotency_key)

        # Log request (masked)
        logger.info(
            "Protheus real send initiated",
            extra={
                "idempotency_key": idempotency_key,
                "url": self.base_url,
                "headers": _mask_secrets(headers),
            },
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/admissao",
                    json=payload,
                    headers=headers,
                )

                # Extract response headers (sanitized)
                response_headers = dict(response.headers)

                # Log response (masked)
                logger.info(
                    "Protheus real send response",
                    extra={
                        "idempotency_key": idempotency_key,
                        "http_status": response.status_code,
                        "response_headers": _mask_secrets(response_headers),
                    },
                )

                if response.status_code in {200, 201}:
                    try:
                        response_data = response.json()
                    except Exception:
                        response_data = {"raw": response.text}

                    external_ref = response_data.get(
                        "id", response_data.get("external_reference", "")
                    )

                    return ProtheusRealAdapterResult(
                        success=True,
                        message="Enviado para Protheus com sucesso em homologação.",
                        external_reference=external_ref or idempotency_key,
                        http_status=response.status_code,
                        request_headers=_mask_secrets(headers),
                        response_headers=_mask_secrets(response_headers),
                    )

                elif response.status_code in {400, 422}:
                    try:
                        error_data = response.json()
                    except Exception:
                        error_data = {"raw": response.text}

                    error_msg = error_data.get("message", response.text)

                    return ProtheusRealAdapterResult(
                        success=False,
                        error_code="PROTHEUS_VALIDATION_ERROR",
                        message=f"Erro de validação no Protheus: {error_msg}",
                        error_details=json.dumps(error_data, ensure_ascii=False),
                        http_status=response.status_code,
                        request_headers=_mask_secrets(headers),
                        response_headers=_mask_secrets(response_headers),
                    )

                elif response.status_code in {401, 403}:
                    return ProtheusRealAdapterResult(
                        success=False,
                        error_code="PROTHEUS_AUTH_ERROR",
                        message="Falha de autenticação com Protheus. Verifique credenciais.",
                        http_status=response.status_code,
                        request_headers=_mask_secrets(headers),
                        response_headers=_mask_secrets(response_headers),
                    )

                else:
                    return ProtheusRealAdapterResult(
                        success=False,
                        error_code="PROTHEUS_ERROR",
                        message=f"Erro {response.status_code} do Protheus.",
                        error_details=response.text[:500],
                        http_status=response.status_code,
                        request_headers=_mask_secrets(headers),
                        response_headers=_mask_secrets(response_headers),
                    )

        except httpx.TimeoutException:
            logger.error(
                "Protheus real send timeout",
                extra={"idempotency_key": idempotency_key, "timeout_seconds": self.timeout_seconds},
            )
            return ProtheusRealAdapterResult(
                success=False,
                error_code="PROTHEUS_TIMEOUT",
                message=f"Timeout na comunicação com Protheus ({self.timeout_seconds}s).",
                request_headers=_mask_secrets(headers),
            )

        except httpx.ConnectError as e:
            logger.error(
                "Protheus real send connection error",
                extra={
                    "idempotency_key": idempotency_key,
                    "error": str(e)[:200],
                },
            )
            return ProtheusRealAdapterResult(
                success=False,
                error_code="PROTHEUS_CONNECTION_ERROR",
                message="Não foi possível conectar ao Protheus.",
                error_details=str(e)[:200],
                request_headers=_mask_secrets(headers),
            )

        except Exception as e:
            logger.error(
                "Protheus real send unexpected error",
                extra={
                    "idempotency_key": idempotency_key,
                    "error": str(e)[:200],
                },
                exc_info=True,
            )
            return ProtheusRealAdapterResult(
                success=False,
                error_code="PROTHEUS_UNEXPECTED_ERROR",
                message="Erro inesperado na comunicação com Protheus.",
                error_details=str(e)[:200],
                request_headers=_mask_secrets(headers),
            )
