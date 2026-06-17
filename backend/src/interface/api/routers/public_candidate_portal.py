"""
Router oficial consolidado do portal público do candidato — Fase C2.

Cria aliases/fachadas sob /api/v1/public/* para endpoints que existiam apenas
em /api/v1/candidate-portal/*. Não remove nem altera os routers antigos.
Toda a lógica de negócio é delegada aos mesmos services dos routers originais.
"""

from __future__ import annotations

from contextlib import suppress
from uuid import UUID

import sqlalchemy as sa
import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
from src.application.services.conversation_service import ConversationService
from src.application.services.candidate_google_auth_service import (
    CandidateGoogleAuthConflictError,
    CandidateGoogleAuthEmailNotVerifiedError,
    CandidateGoogleAuthService,
)
from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
    PORTAL_SESSION_TTL_HOURS,
    CandidatePortalAuthService,
    CandidatePortalInvalidCredentialsError,
    CandidatePortalLockedError,
)
from src.application.services.pre_admission_service import (
    MAX_PRE_ADMISSION_DOCUMENT_BYTES,
    PreAdmissionService,
)
from src.core.settings import settings
from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobUnitModel
from src.infrastructure.database.models.operational_master_model import OperationalUnitModel
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
    SQLAlchemyBehavioralAssignmentRepository,
)
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_conversation_repository import (
    SQLAlchemyConversationRepository,
)
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import (
    SQLAlchemyPreAdmissionRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.infrastructure.security.google_identity_verifier import (
    GoogleIdentityConfigurationError,
    GoogleIdentityVerificationError,
)
from src.interface.api.dependencies import (
    CurrentCandidateSession,
    CurrentCompleteCandidateSession,
    get_db,
)
from src.interface.api.routers.candidate_portal_auth import (
    confirm_password_setup_response,
    request_password_setup_response,
)
from src.interface.api.routers.communication_events import notify_candidate_event_safely
from src.interface.api.schemas.behavioral_assignment_schemas import (
    BehavioralAssignmentAnswersRequest,
    BehavioralAssignmentDetailResponse,
    BehavioralAssignmentSubmitRequest,
    BehavioralAssignmentSummaryResponse,
)
from src.interface.api.schemas.candidate_portal_schemas import (
    CandidateAuthGoogleRequest,
    CandidateAuthGoogleResponse,
    CandidateAuthLoginRequest,
    CandidateAuthLoginResponse,
    CandidateDevLoginRequest,
    CandidatePasswordSetupConfirmRequest,
    CandidatePasswordSetupRequest,
    CandidatePasswordSetupResponse,
    CandidateSessionResponse,
)
from src.interface.api.schemas.conversation_schemas import (
    CandidateBotMessageRequest,
    CandidateBotSessionResponse,
    ConversationTurnResponse,
)
from src.interface.api.schemas.pre_admission_schemas import (
    CandidatePortalPreAdmissionDocumentUploadResponse,
    CandidatePortalPreAdmissionEnvelopeResponse,
)
from src.interface.api.schemas.public_schemas import PublicJobDetailResponse, PublicJobUnitResponse

router = APIRouter(prefix="/public", tags=["public"])
logger = structlog.get_logger(__name__)
DEV_CANDIDATE_LOGIN_ALLOWED_ENVS = {"development", "test"}


# ──────────────────────────────────────────────────────────────────────────────
# 1. Job detail
# ──────────────────────────────────────────────────────────────────────────────


@router.get(
    "/jobs/{job_id}",
    response_model=PublicJobDetailResponse,
    summary="Detalhe de vaga publicada",
)
async def get_public_job_detail(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PublicJobDetailResponse:
    """
    Retorna detalhe de uma vaga com status='published'.

    Expõe apenas campos públicos seguros. Não inclui dados internos como
    criador, score de qualidade, configurações de triagem ou dados de pipeline.
    """
    result = await db.execute(
        sa.select(JobModel).where(
            JobModel.id == job_id,
            JobModel.status == "published",
            JobModel.deleted_at.is_(None),
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada.")

    units_result = await db.execute(
        sa.select(
            OperationalUnitModel.id,
            sa.func.coalesce(OperationalUnitModel.public_name, OperationalUnitModel.name).label("public_name"),
            OperationalUnitModel.city,
            OperationalUnitModel.state,
            OperationalUnitModel.address,
            OperationalUnitModel.reference_point,
        )
        .select_from(JobUnitModel)
        .join(OperationalUnitModel, OperationalUnitModel.id == JobUnitModel.operational_unit_id)
        .where(
            JobUnitModel.job_id == job_id,
            JobUnitModel.is_active.is_(True),
            OperationalUnitModel.is_active.is_(True),
        )
        .order_by(JobUnitModel.priority.asc().nullslast(), JobUnitModel.created_at.asc())
    )
    job_units = [
        PublicJobUnitResponse(
            id=row.id,
            public_name=row.public_name,
            city=row.city,
            state=row.state,
            address=row.address,
            reference_point=row.reference_point,
        )
        for row in units_result.mappings().all()
    ]

    return PublicJobDetailResponse(
        id=job.id,
        title=job.title,
        description=job.description,
        requirements=job.requirements,
        responsibilities=job.responsibilities,
        location=job.location,
        job_area=job.job_area,
        work_model=job.work_model,
        seniority_level=job.seniority_level,
        benefits=job.benefits or [],
        working_hours=job.working_hours,
        published_at=job.published_at,
        job_units=job_units,
    )


# ──────────────────────────────────────────────────────────────────────────────
# 2. Auth aliases (/public/auth/* → mesma lógica de /public/candidate-auth/*)
# ──────────────────────────────────────────────────────────────────────────────


@router.post(
    "/auth/google",
    response_model=CandidateAuthGoogleResponse,
    summary="[Alias] Login candidato via Google",
)
async def auth_google(
    body: CandidateAuthGoogleRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CandidateAuthGoogleResponse:
    """Alias oficial para POST /public/candidate-auth/google."""
    try:
        session_token, result = await CandidateGoogleAuthService(db).authenticate(
            id_token=body.id_token,
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent", ""),
        )
        await db.commit()
        response.set_cookie(
            key=CANDIDATE_PORTAL_COOKIE_NAME,
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
            max_age=PORTAL_SESSION_TTL_HOURS * 3600,
            path="/",
        )
        return result
    except GoogleIdentityConfigurationError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login com Google não está configurado.",
        ) from exc
    except (GoogleIdentityVerificationError, CandidateGoogleAuthEmailNotVerifiedError) as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não foi possível validar sua conta Google.",
        ) from exc
    except CandidateGoogleAuthConflictError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível vincular esta conta Google com segurança.",
        ) from exc
    except Exception as exc:
        await db.rollback()
        logger.exception("public_auth.google_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível concluir o login com Google.",
        ) from exc


@router.post(
    "/auth/login",
    response_model=CandidateAuthLoginResponse,
    summary="[Alias] Login candidato por email/senha",
)
async def auth_login(
    body: CandidateAuthLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CandidateAuthLoginResponse:
    """Alias oficial para POST /public/candidate-auth/login."""
    try:
        session_token, session_expires_at = await CandidatePortalAuthService(db).login(
            email=body.email,
            password=body.password,
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent", ""),
        )
        await db.commit()
        response.set_cookie(
            key=CANDIDATE_PORTAL_COOKIE_NAME,
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
            max_age=PORTAL_SESSION_TTL_HOURS * 3600,
            path="/",
        )
        return CandidateAuthLoginResponse(
            message="Login realizado com sucesso.",
            redirect_to="/candidato/portal",
            session_expires_at=session_expires_at,
        )
    except CandidatePortalLockedError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Conta temporariamente bloqueada."
        ) from exc
    except CandidatePortalInvalidCredentialsError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos."
        ) from exc
    except Exception as exc:
        await db.rollback()
        logger.exception("public_auth.login_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível concluir o login.",
        ) from exc


@router.post(
    "/auth/dev-login",
    response_model=CandidateAuthLoginResponse,
    include_in_schema=False,
)
async def auth_dev_login(
    body: CandidateDevLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CandidateAuthLoginResponse:
    """
    DEV/TEST ONLY. Manual candidate login for local candidate-portal QA.

    This endpoint must remain disabled in staging and production.
    """
    if (
        settings.APP_ENV not in DEV_CANDIDATE_LOGIN_ALLOWED_ENVS
        or not settings.ENABLE_DEV_CANDIDATE_LOGIN
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    try:
        candidate, session_token, session_expires_at = await CandidatePortalAuthService(
            db
        ).dev_login(
            email=str(body.email),
            name=body.name,
            ip_address=request.client.host if request.client else "unknown",
            user_agent=request.headers.get("user-agent", ""),
        )
        await db.commit()
        response.set_cookie(
            key=CANDIDATE_PORTAL_COOKIE_NAME,
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
            max_age=PORTAL_SESSION_TTL_HOURS * 3600,
            path="/",
        )
        logger.info(
            "candidate_portal.dev_login_used",
            candidate_id=str(candidate.id),
            app_env=settings.APP_ENV,
        )
        return CandidateAuthLoginResponse(
            message="Login de desenvolvimento realizado com sucesso.",
            redirect_to="/candidato/portal",
            session_expires_at=session_expires_at,
        )
    except Exception as exc:
        await db.rollback()
        logger.exception("candidate_portal.dev_login_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível concluir o login de desenvolvimento.",
        ) from exc


@router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="[Alias] Logout candidato",
)
async def auth_logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Alias oficial para POST /public/candidate-auth/logout. Idempotente."""
    token = request.cookies.get(CANDIDATE_PORTAL_COOKIE_NAME)
    try:
        await CandidatePortalAuthService(db).logout(token)
        await db.commit()
    except Exception:
        with suppress(Exception):
            await db.rollback()
        logger.exception("public_auth.logout_failed")
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(CANDIDATE_PORTAL_COOKIE_NAME, path="/")
    return response


@router.post(
    "/auth/request-password-setup",
    response_model=CandidatePasswordSetupResponse,
    summary="[Alias] Solicitar primeiro acesso ou recuperação de senha",
)
async def auth_request_password_setup(
    body: CandidatePasswordSetupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CandidatePasswordSetupResponse:
    return await request_password_setup_response(body, request, db)


@router.post(
    "/auth/confirm-password-setup",
    response_model=CandidatePasswordSetupResponse,
    summary="[Alias] Confirmar definição ou recuperação de senha",
)
async def auth_confirm_password_setup(
    body: CandidatePasswordSetupConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> CandidatePasswordSetupResponse:
    return await confirm_password_setup_response(body, db)


@router.get(
    "/auth/session",
    response_model=CandidateSessionResponse,
    summary="Probe silenciosa de sessão — nunca retorna 401",
)
async def get_candidate_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CandidateSessionResponse:
    """
    Verifica silenciosamente se o cookie de sessão do candidato é válido.

    - Sem cookie ou cookie inválido/expirado: HTTP 200 authenticated=false.
    - Cookie válido: HTTP 200 authenticated=true + nome público do candidato.

    Nunca retorna 401. Não expõe e-mail, CPF, telefone nem dados de candidatura.
    Usado pelo App.tsx para hidratar candidateName sem gerar erros no console.
    """
    token = request.cookies.get(CANDIDATE_PORTAL_COOKIE_NAME)
    if not token:
        return CandidateSessionResponse(authenticated=False, candidate_name=None)

    try:
        session = await CandidatePortalAuthService(db).authenticate(token)
        row = await db.execute(
            sa.select(CandidateModel.full_name)
            .where(CandidateModel.id == session.candidate_id)
            .limit(1)
        )
        candidate_name = row.scalar_one_or_none()
        return CandidateSessionResponse(
            authenticated=True,
            candidate_name=candidate_name,
        )
    except Exception:
        # Session invalid, expired, or DB error — always return unauthenticated.
        return CandidateSessionResponse(authenticated=False, candidate_name=None)


def _conversation_service(db: AsyncSession) -> ConversationService:
    return ConversationService(
        SQLAlchemyConversationRepository(db),
        db,
        SQLAlchemyCandidateApplicationRepository(db),
        SQLAlchemyResumeRepository(db),
    )


@router.get(
    "/candidate-bot/sessions/{session_id}",
    response_model=CandidateBotSessionResponse,
    summary="[Alias] Recuperar sessão do chat guiado do candidato",
)
async def get_candidate_bot_session(
    session_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidateBotSessionResponse:
    return await _conversation_service(db).get_candidate_portal_bot_session(
        candidate_id=candidate_session.candidate_id,
        session_id=session_id,
    )


@router.post(
    "/candidate-bot/message",
    response_model=ConversationTurnResponse,
    summary="[Alias] Enviar mensagem no chat guiado do candidato",
)
async def post_candidate_bot_message(
    body: CandidateBotMessageRequest,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> ConversationTurnResponse:
    turn = await _conversation_service(db).receive_candidate_portal_bot_message(
        candidate_id=candidate_session.candidate_id,
        session_id=body.session_id,
        message=body.message,
        job_id=body.job_id,
        operational_unit_id=body.operational_unit_id,
    )
    await db.commit()
    return turn


# ──────────────────────────────────────────────────────────────────────────────
# 3. Avaliação comportamental — aliases sob /public/candidate-portal/behavioral-assessments
# ──────────────────────────────────────────────────────────────────────────────


def _ba_service(db: AsyncSession) -> BehavioralAssignmentService:
    return BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db))


@router.get(
    "/candidate-portal/behavioral-assessments",
    response_model=list[BehavioralAssignmentSummaryResponse],
    summary="[Alias] Listar avaliações comportamentais do candidato",
)
async def list_behavioral_assessments(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> list[BehavioralAssignmentSummaryResponse]:
    """Alias oficial para GET /candidate-portal/behavioral-assessments."""
    return await _ba_service(db).list_for_candidate(candidate_session.candidate_id)


@router.get(
    "/candidate-portal/behavioral-assessments/{assignment_id}",
    response_model=BehavioralAssignmentDetailResponse,
    summary="[Alias] Detalhe de avaliação comportamental",
)
async def get_behavioral_assessment(
    assignment_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    """Alias oficial para GET /candidate-portal/behavioral-assessments/{assignment_id}."""
    try:
        return await _ba_service(db).get_detail_for_candidate(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
        )
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc


@router.post(
    "/candidate-portal/behavioral-assessments/{assignment_id}/start",
    response_model=BehavioralAssignmentDetailResponse,
    summary="[Alias] Iniciar avaliação comportamental",
)
async def start_behavioral_assessment(
    assignment_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    """Alias oficial para POST /candidate-portal/behavioral-assessments/{assignment_id}/start."""
    try:
        result = await _ba_service(db).start(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
        )
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message) from exc


@router.put(
    "/candidate-portal/behavioral-assessments/{assignment_id}/answers",
    response_model=BehavioralAssignmentDetailResponse,
    summary="[Alias] Salvar respostas da avaliação",
)
async def save_behavioral_answers(
    assignment_id: UUID,
    body: BehavioralAssignmentAnswersRequest,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    """Alias oficial para PUT /candidate-portal/behavioral-assessments/{assignment_id}/answers."""
    try:
        result = await _ba_service(db).save_answers(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
            answers=body.answers,
        )
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message) from exc
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        ) from exc


@router.post(
    "/candidate-portal/behavioral-assessments/{assignment_id}/submit",
    response_model=BehavioralAssignmentDetailResponse,
    summary="[Alias] Submeter avaliação comportamental",
)
async def submit_behavioral_assessment(
    assignment_id: UUID,
    candidate_session: CurrentCandidateSession,
    body: BehavioralAssignmentSubmitRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    """Alias oficial para POST /candidate-portal/behavioral-assessments/{assignment_id}/submit."""
    try:
        result = await _ba_service(db).submit(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
            answers=body.answers if body is not None else None,
        )
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="behavioral_assessment_submitted",
            candidate_id=candidate_session.candidate_id,
            job_id=result.job_id,
            related_entity_type="behavioral_assessment_assignment",
            related_entity_id=assignment_id,
            context={"job_title": result.job_title or ""},
            actor_id=None,
        )
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message) from exc
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        ) from exc


# ──────────────────────────────────────────────────────────────────────────────
# 4. Pré-admissão — aliases sob /public/candidate-portal/pre-admission
# ──────────────────────────────────────────────────────────────────────────────


def _pa_service(db: AsyncSession) -> PreAdmissionService:
    return PreAdmissionService(SQLAlchemyPreAdmissionRepository(db))


@router.get(
    "/candidate-portal/pre-admission",
    response_model=CandidatePortalPreAdmissionEnvelopeResponse,
    summary="[Alias] Pré-admissão do candidato (caso ativo)",
)
async def get_pre_admission(
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionEnvelopeResponse:
    """Alias oficial para GET /candidate-portal/pre-admission."""
    return await _pa_service(db).candidate_portal_get(candidate_id=candidate_session.candidate_id)


@router.get(
    "/candidate-portal/pre-admission/{case_id}",
    response_model=CandidatePortalPreAdmissionEnvelopeResponse,
    summary="[Alias] Pré-admissão do candidato por case_id",
)
async def get_pre_admission_case(
    case_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionEnvelopeResponse:
    """Alias oficial para GET /candidate-portal/pre-admission/{case_id}."""
    return await _pa_service(db).candidate_portal_get(
        candidate_id=candidate_session.candidate_id,
        case_id=case_id,
    )


@router.post(
    "/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents",
    response_model=CandidatePortalPreAdmissionDocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="[Alias] Upload de documento de pré-admissão",
)
async def upload_pre_admission_document(
    case_id: UUID,
    item_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    document_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionDocumentUploadResponse:
    """
    Alias oficial para upload de documento de pré-admissão do candidato.

    Ownership obrigatório: candidato só pode fazer upload no próprio caso.
    """
    try:
        content = await document_file.read(MAX_PRE_ADMISSION_DOCUMENT_BYTES + 1)
        result = await _pa_service(db).candidate_upload_document(
            candidate_id=candidate_session.candidate_id,
            case_id=case_id,
            item_id=item_id,
            file_name=document_file.filename or "documento",
            content_type=document_file.content_type,
            content=content,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/candidate-portal/pre-admission/documents/{document_id}/download",
    summary="[Alias] Download de documento de pré-admissão",
)
async def download_pre_admission_document(
    document_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """
    Alias oficial para GET /candidate-portal/pre-admission/documents/{document_id}/download.

    Ownership obrigatório: candidato só pode baixar o próprio documento.
    """
    try:
        document, path = await _pa_service(db).document_download(
            document_id=document_id,
            actor_type="candidate",
            candidate_id=candidate_session.candidate_id,
        )
        await db.commit()
        return FileResponse(
            path,
            media_type=document.mime_type,
            filename=document.original_filename,
        )
    except Exception:
        await db.rollback()
        raise
