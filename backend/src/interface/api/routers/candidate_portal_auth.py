from __future__ import annotations

from html import escape
from urllib.parse import urlencode

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import (
    CandidatePasswordSetupToken,
    CandidatePortalAuthService,
    CandidatePortalPasswordSetupInvalidTokenError,
)
from src.core.settings import settings
from src.infrastructure.email.smtp_email_sender import (
    EmailDeliveryConfigurationError,
    EmailDeliveryError,
    SMTPEmailSender,
)
from src.interface.api.dependencies import get_db
from src.interface.api.schemas.candidate_portal_schemas import (
    CandidatePasswordSetupConfirmRequest,
    CandidatePasswordSetupRequest,
    CandidatePasswordSetupResponse,
)

router = APIRouter(prefix="/candidate-portal/auth", tags=["candidate-portal-auth"])
logger = structlog.get_logger(__name__)

PASSWORD_SETUP_REQUEST_MESSAGE = (
    "Se houver um cadastro com este e-mail, enviaremos as instruções de acesso."
)
PASSWORD_SETUP_CONFIRM_MESSAGE = "Senha definida com sucesso. Acesse sua área do candidato."
INVALID_PASSWORD_SETUP_TOKEN_MESSAGE = "Link inválido ou expirado."
PASSWORD_SETUP_EMAIL_SUBJECT = "Acesso ao Portal do Candidato - Marajó RH"


async def request_password_setup_response(
    body: CandidatePasswordSetupRequest,
    request: Request,
    db: AsyncSession,
) -> CandidatePasswordSetupResponse:
    # Phase 1: DB operations — rollback only makes sense here.
    try:
        setup_token = await CandidatePortalAuthService(db).request_password_setup(
            email=str(body.email),
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent", ""),
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.exception("candidate_portal.password_setup_request_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível processar a solicitação.",
        ) from exc

    # Phase 2: e-mail delivery — non-fatal in all cases.
    # Any failure (known or unexpected) is logged and swallowed so the
    # endpoint always returns the generic 200 response, never leaking
    # candidate existence and never causing an unhandled 500.
    if setup_token is not None:
        try:
            await send_candidate_password_setup_email(setup_token)
        except (EmailDeliveryConfigurationError, EmailDeliveryError):
            logger.warning("candidate_portal.password_setup_delivery_failed")
        except Exception:
            logger.warning("candidate_portal.password_setup_unexpected_delivery_error")

    return CandidatePasswordSetupResponse(message=PASSWORD_SETUP_REQUEST_MESSAGE)


async def send_candidate_password_setup_email(setup_token: CandidatePasswordSetupToken) -> None:
    setup_url = build_candidate_password_setup_url(setup_token.token)
    candidate_name = (setup_token.full_name or "candidato").strip() or "candidato"
    text_body = (
        f"Olá, {candidate_name}.\n\n"
        "Recebemos uma solicitação para criar ou redefinir sua senha no Portal do Candidato "
        "da Marajó RH.\n\n"
        f"Acesse o link abaixo para definir sua senha:\n{setup_url}\n\n"
        "Este link expira em 2 horas. Se você não solicitou este acesso, ignore esta mensagem."
    )
    safe_name = escape(candidate_name)
    safe_url = escape(setup_url, quote=True)
    html_body = (
        f"<p>Olá, {safe_name}.</p>"
        "<p>Recebemos uma solicitação para criar ou redefinir sua senha no Portal do "
        "Candidato da Marajó RH.</p>"
        f'<p><a href="{safe_url}">Definir senha</a></p>'
        "<p>Este link expira em 2 horas. Se você não solicitou este acesso, ignore esta "
        "mensagem.</p>"
    )
    await SMTPEmailSender().send(
        to_email=setup_token.email,
        subject=PASSWORD_SETUP_EMAIL_SUBJECT,
        text_body=text_body,
        html_body=html_body,
    )


def build_candidate_password_setup_url(token: str) -> str:
    base_url = settings.candidate_portal_public_url
    if not base_url:
        raise EmailDeliveryConfigurationError("Candidate portal public URL is required")
    return f"{base_url}/definir-senha?{urlencode({'token': token})}"


async def confirm_password_setup_response(
    body: CandidatePasswordSetupConfirmRequest,
    db: AsyncSession,
) -> CandidatePasswordSetupResponse:
    try:
        await CandidatePortalAuthService(db).confirm_password_setup(
            token=body.token,
            password=body.password,
        )
        await db.commit()
    except CandidatePortalPasswordSetupInvalidTokenError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=INVALID_PASSWORD_SETUP_TOKEN_MESSAGE,
        ) from exc
    except Exception as exc:
        await db.rollback()
        logger.exception("candidate_portal.password_setup_confirm_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível definir a senha.",
        ) from exc
    return CandidatePasswordSetupResponse(message=PASSWORD_SETUP_CONFIRM_MESSAGE)


@router.post(
    "/request-password-setup",
    response_model=CandidatePasswordSetupResponse,
    summary="Solicita primeiro acesso ou recuperação de senha do candidato",
)
async def request_password_setup(
    body: CandidatePasswordSetupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CandidatePasswordSetupResponse:
    return await request_password_setup_response(body, request, db)


@router.post(
    "/confirm-password-setup",
    response_model=CandidatePasswordSetupResponse,
    summary="Confirma definição ou recuperação de senha do candidato",
)
async def confirm_password_setup(
    body: CandidatePasswordSetupConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> CandidatePasswordSetupResponse:
    return await confirm_password_setup_response(body, db)
