import json
import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
from uuid import UUID

from src.core.settings import settings
from src.domain.exceptions import ValidationException
from src.interface.api.dependencies import get_db, RecruiterOrAdmin
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.repositories.sqlalchemy_google_calendar_connection_repository import (
    SQLAlchemyGoogleCalendarConnectionRepository,
)
from src.infrastructure.security.encryption_service import EncryptionService
from src.infrastructure.security.google_oauth_client import GoogleOAuthClient
from src.application.services.google_calendar_connection_service import GoogleCalendarConnectionService


router = APIRouter(prefix="/integrations/google-calendar", tags=["integrations"])
OAUTH_RESULT_MESSAGE_TYPE = "GOOGLE_CALENDAR_OAUTH_RESULT"
_LOCAL_FRONTEND_ORIGIN_RE = re.compile(
    r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$"
)


def _service(db: AsyncSession, redis: Redis) -> GoogleCalendarConnectionService:
    repo = SQLAlchemyGoogleCalendarConnectionRepository(db)
    enc = EncryptionService()
    oauth = GoogleOAuthClient()
    return GoogleCalendarConnectionService(repo, enc, oauth, redis)


def _default_redirect_context() -> dict[str, str]:
    frontend_origin = settings.frontend_base_url
    return {
        "frontend_origin": frontend_origin,
        "return_path": "/agenda",
        "frontend_redirect_url": f"{frontend_origin}/agenda",
    }


def _normalize_frontend_origin(candidate: str | None) -> str:
    if not candidate:
        return settings.frontend_base_url

    parsed = urlparse(candidate)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Origem do frontend inválida",
        )

    if origin in settings.CORS_ORIGINS:
        return origin.rstrip("/")

    if not settings.is_production and _LOCAL_FRONTEND_ORIGIN_RE.match(origin):
        return origin.rstrip("/")

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Origem do frontend não permitida",
    )


def _normalize_return_path(candidate: str | None) -> str:
    if not candidate:
        return "/agenda"
    if not candidate.startswith("/") or candidate.startswith("//"):
        return "/agenda"
    return candidate


def _frontend_context_from_request(
    request: Request,
    frontend_origin: str | None,
    return_path: str | None,
) -> tuple[str, str]:
    normalized_origin = _normalize_frontend_origin(
        frontend_origin or request.headers.get("origin")
    )

    candidate_return_path = return_path
    referer = request.headers.get("referer")
    if not candidate_return_path and referer:
        parsed_referer = urlparse(referer)
        referer_origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}"
        if referer_origin.rstrip("/") == normalized_origin:
            candidate_return_path = parsed_referer.path or "/agenda"
            if parsed_referer.query:
                candidate_return_path += f"?{parsed_referer.query}"
            if parsed_referer.fragment:
                candidate_return_path += f"#{parsed_referer.fragment}"

    return normalized_origin, _normalize_return_path(candidate_return_path)


def _build_callback_html(
    *,
    success: bool,
    redirect_context: dict[str, str],
    status_code: int,
) -> HTMLResponse:
    payload = json.dumps(
        {
            "type": OAUTH_RESULT_MESSAGE_TYPE,
            "success": success,
            "source": "google-calendar",
        }
    )
    frontend_origin = json.dumps(redirect_context["frontend_origin"])
    result = "success" if success else "error"
    split_redirect = urlsplit(redirect_context["frontend_redirect_url"])
    redirect_query = parse_qsl(split_redirect.query, keep_blank_values=True)
    redirect_query.append(("google_calendar_oauth", result))
    redirect_url = json.dumps(
        urlunsplit(
            (
                split_redirect.scheme,
                split_redirect.netloc,
                split_redirect.path,
                urlencode(redirect_query),
                split_redirect.fragment,
            )
        )
    )
    title = "Google Calendar conectado" if success else "Falha na conexão com Google Calendar"
    message = (
        "Conexão concluída. Você pode fechar esta janela."
        if success
        else "Não foi possível concluir a conexão. Volte ao sistema e tente novamente."
    )

    html = f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      body {{
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f8fb;
        color: #122033;
      }}
      main {{
        max-width: 560px;
        margin: 10vh auto 0;
        padding: 24px;
      }}
      .card {{
        background: #fff;
        border: 1px solid #d8dee7;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 12px 32px rgba(18, 32, 51, 0.08);
      }}
      h1 {{
        margin: 0 0 12px;
        font-size: 22px;
      }}
      p {{
        margin: 0 0 12px;
        line-height: 1.5;
      }}
      a {{
        color: #0f62fe;
      }}
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>{title}</h1>
        <p>{message}</p>
        <p id="manual-close" hidden>
          Se a janela não fechar automaticamente, volte ao sistema ou
          <a id="redirect-link" href={redirect_url}>clique aqui para continuar</a>.
        </p>
      </section>
    </main>
    <script>
      const payload = {payload};
      const allowedOrigin = {frontend_origin};
      const redirectUrl = {redirect_url};
      const manualClose = document.getElementById("manual-close");

      function showManualClose() {{
        if (manualClose) manualClose.hidden = false;
      }}

      if (window.opener && !window.opener.closed) {{
        try {{
          window.opener.postMessage(payload, allowedOrigin);
          window.close();
          window.setTimeout(showManualClose, 600);
        }} catch (_error) {{
          showManualClose();
        }}
      }} else {{
        window.location.replace(redirectUrl);
      }}
    </script>
  </body>
</html>"""

    return HTMLResponse(content=html, status_code=status_code)


@router.get("/status")
async def get_status(
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Retorna o status da conexão Google Calendar do usuário."""
    service = _service(db, redis)
    return await service.get_status(current_user.id)


@router.get("/auth-url")
async def get_auth_url(
    request: Request,
    current_user: RecruiterOrAdmin,
    frontend_origin: str | None = Query(default=None),
    return_path: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Gera a URL de autorização do Google."""
    normalized_origin, normalized_return_path = _frontend_context_from_request(
        request,
        frontend_origin,
        return_path,
    )
    service = _service(db, redis)
    url = await service.build_auth_url(
        current_user.id,
        frontend_origin=normalized_origin,
        return_path=normalized_return_path,
    )
    return {"auth_url": url, "url": url}


@router.get("/callback", response_class=HTMLResponse)
async def oauth_callback(
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Trata o callback do Google."""
    service = _service(db, redis)

    redirect_context = _default_redirect_context()
    if state:
        try:
            redirect_context = await service.get_oauth_redirect_context(state)
        except ValidationException:
            redirect_context = _default_redirect_context()

    if not code or not state:
        return _build_callback_html(
            success=False,
            redirect_context=redirect_context,
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    try:
        await service.handle_oauth_callback(code, state)
        return _build_callback_html(
            success=True,
            redirect_context=redirect_context,
            status_code=status.HTTP_200_OK,
        )
    except Exception:
        return _build_callback_html(
            success=False,
            redirect_context=redirect_context,
            status_code=status.HTTP_400_BAD_REQUEST,
        )


@router.post("/disconnect")
async def disconnect(
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Desconecta a conta do Google."""
    service = _service(db, redis)
    success = await service.disconnect(current_user.id)
    return {"success": success}
