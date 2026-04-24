import time
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.audit_model import AuditLogModel

logger = structlog.get_logger(__name__)

# Rotas que NÃO geram entradas de audit (ruído sem valor)
_EXCLUDED_PATHS = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}

# Apenas erros HTTP são auditados pelo middleware.
# Eventos de negócio são auditados diretamente nos use cases via AuditService.
_AUDIT_ON_STATUS = {401, 403, 404, 422, 429, 500}


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        if request.url.path in _EXCLUDED_PATHS:
            return await call_next(request)

        start = time.monotonic()
        response = await call_next(request)
        duration_ms = int((time.monotonic() - start) * 1000)

        structlog.contextvars.bind_contextvars(
            request_id=str(getattr(request.state, "request_id", "")),
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )

        if response.status_code in _AUDIT_ON_STATUS:
            await self._write_http_error_audit(request, response.status_code, duration_ms)

        structlog.contextvars.clear_contextvars()
        return response

    @staticmethod
    async def _write_http_error_audit(
        request: Request, status_code: int, duration_ms: int
    ) -> None:
        request_id: UUID | None = getattr(request.state, "request_id", None)
        user_id: UUID | None = getattr(request.state, "user_id", None)

        try:
            async with AsyncSessionFactory() as session:
                log = AuditLogModel(
                    action="http.error",
                    resource_type="http",
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                    request_id=request_id,
                    user_id=user_id,
                    http_method=request.method,
                    http_path=str(request.url.path),
                    http_status_code=status_code,
                    metadata_={"duration_ms": duration_ms},
                )
                session.add(log)
                await session.commit()
        except Exception:
            # Auditoria nunca pode quebrar a resposta ao usuário
            logger.warning("audit.write_failed", path=request.url.path, status=status_code)
