from uuid import UUID, uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Garante que toda requisição tenha um X-Request-ID único.
    Propaga o header do cliente se presente (útil para rastreamento ponta a ponta).
    """

    async def dispatch(self, request: Request, call_next: any) -> Response:  # type: ignore[override]
        incoming = request.headers.get("X-Request-ID")

        try:
            request_id = UUID(incoming) if incoming else uuid4()
        except ValueError:
            request_id = uuid4()

        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = str(request_id)
        return response
