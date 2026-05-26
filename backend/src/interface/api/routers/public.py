from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
    PORTAL_SESSION_TTL_HOURS,
    CandidatePortalAuthService,
    CandidatePortalInvalidCredentialsError,
    CandidatePortalLockedError,
)
from src.application.services.candidate_google_auth_service import (
    CandidateGoogleAuthConflictError,
    CandidateGoogleAuthEmailNotVerifiedError,
    CandidateGoogleAuthService,
)
from src.application.services.candidate_portal_service import (
    CandidatePortalIncompleteProfileError,
    CandidatePortalInvalidFileError,
    CandidatePortalProfileConflictError,
    CandidatePortalService,
)
from src.application.services.public_application_service import (
    PublicApplicationEmailError,
    PublicApplicationExistingAccountError,
    PublicApplicationFileError,
    PublicApplicationJobUnavailableError,
    PublicApplicationDuplicateJobError,
    PublicApplicationService,
    SYSTEM_USER_ID,
)
from src.core.settings import settings
from src.domain.exceptions import ValidationException
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.dependencies import CurrentCandidateSession, candidate_profile_incomplete_detail, get_db
from src.interface.api.rate_limiting import rate_limit_public_apply, rate_limit_public_check_exists
from src.interface.api.schemas.candidate_portal_schemas import (
    CandidateAuthGoogleRequest,
    CandidateAuthGoogleResponse,
    CandidateAuthLoginRequest,
    CandidateAuthLoginResponse,
    CandidatePortalOverviewResponse,
    CandidatePortalResumeUploadResponse,
    CandidatePortalUpdateProfileRequest,
)
from src.interface.api.schemas.public_schemas import PublicApplyResponse, PublicJobResponse
from src.interface.workers.resume_extraction_dispatcher import enqueue_resume_extraction
from src.infrastructure.security.google_identity_verifier import (
    GoogleIdentityConfigurationError,
    GoogleIdentityVerificationError,
)

router = APIRouter(prefix="/public", tags=["public"])
logger = structlog.get_logger(__name__)


@router.get("/jobs", response_model=list[PublicJobResponse])
async def list_public_jobs(
    db: AsyncSession = Depends(get_db),
) -> list[PublicJobResponse]:
    """
    Lista vagas publicadas disponíveis para candidatura pública.
    Retorna apenas vagas com status='published' e não deletadas.
    """
    job_repo = SQLAlchemyJobRepository(db)
    jobs = await job_repo.list_published()
    return [
        PublicJobResponse(
            id=job.id,
            title=job.title,
            location=job.location,
            job_area=job.job_area,
        )
        for job in jobs
    ]


@router.get("/candidates/check-exists")
async def check_candidate_exists(
    _rl: None = Depends(rate_limit_public_check_exists),
):
    """
    Compatibilidade para clientes antigos.

    Nunca expõe existência de CPF/e-mail para usuários anônimos; a validação de
    duplicidade acontece somente no submit da candidatura.
    """
    return {
        "status": "ok",
        "message": "Os dados serão validados ao enviar a candidatura.",
    }


@router.post("/candidates/apply", response_model=PublicApplyResponse, status_code=status.HTTP_201_CREATED)
async def apply(
    request: Request,
    response: Response,
    full_name: str = Form(...),
    cpf: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    salary_expectation: str = Form(default=""),
    desired_contract_type: str = Form(...),
    works_at_marajo_group: bool = Form(...),
    job_id: UUID | None = Form(default=None),
    password: str = Form(default=""),
    confirm_password: str = Form(default=""),
    lgpd_consent: bool = Form(...),
    resume_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_public_apply),
) -> PublicApplyResponse:
    """
    Endpoint público de candidatura.

    Aceita multipart/form-data com:
    - Dados pessoais (nome, CPF, email, telefone, localização)
    - Preferências (vaga, regime, pretensão salarial, grupo Marajó)
    - Arquivo PDF do currículo

    Sem autenticação requerida.
    """
    try:
        if not full_name.strip():
            raise ValidationException("Nome completo é obrigatório")

        # Validar estado (UF)
        state_upper = state.strip().upper()
        if len(state_upper) != 2:
            raise ValidationException("Estado deve ser uma sigla de 2 caracteres (ex: SP, RJ)")

        # Validar regime
        valid_contract_types = {"CLT", "PJ", "Indiferente"}
        if desired_contract_type not in valid_contract_types:
            raise ValidationException(f"Regime desejado deve ser um de: {', '.join(valid_contract_types)}")
        token = request.cookies.get(CANDIDATE_PORTAL_COOKIE_NAME)
        use_existing_session = not password and not confirm_password
        candidate_session = None
        if token and use_existing_session:
            try:
                candidate_session = await CandidatePortalAuthService(db).authenticate(token)
            except Exception:
                candidate_session = None

        if candidate_session is None and password != confirm_password:
            raise ValidationException("Confirmação de senha não confere")

        # Ler arquivo
        file_bytes = await resume_file.read(settings.max_upload_size_bytes + 1)
        file_name = resume_file.filename or "resume.pdf"
        file_content_type = resume_file.content_type

        # Executar aplicação
        service = PublicApplicationService(db)
        result = await service.apply(
            full_name=full_name,
            cpf=cpf,
            email=email,
            phone=phone,
            city=city,
            state=state_upper,
            salary_expectation=salary_expectation,
            desired_contract_type=desired_contract_type,
            works_at_marajo_group=works_at_marajo_group,
            job_id=job_id,
            password=password,
            file_bytes=file_bytes,
            file_name=file_name,
            file_content_type=file_content_type,
            lgpd_consent=lgpd_consent,
            authenticated_candidate_id=candidate_session.candidate_id if candidate_session else None,
        )

        auth_service = CandidatePortalAuthService(db)
        session_token = token
        if candidate_session is None:
            session_token, _ = await auth_service.create_session(
                candidate_id=result.candidate_id,
                ip_address=request.client.host if request and request.client else "unknown",
                user_agent=request.headers.get("user-agent", "") if request else "",
            )
        assert session_token is not None
        response.set_cookie(
            key=CANDIDATE_PORTAL_COOKIE_NAME,
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https" if request else False,
            max_age=PORTAL_SESSION_TTL_HOURS * 3600,
            path="/",
        )

        await db.commit()
        enqueue_resume_extraction(result.resume_version_id)
        return result

    except PublicApplicationEmailError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Recebemos sua solicitação. Se já houver cadastro, atualizaremos seu processo conforme as regras do RH.",
        )
    except PublicApplicationExistingAccountError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Recebemos sua solicitação. Se já houver cadastro, atualizaremos seu processo conforme as regras do RH.",
        )
    except PublicApplicationFileError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except PublicApplicationJobUnavailableError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except PublicApplicationDuplicateJobError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        )
    except IntegrityError as exc:
        await db.rollback()
        message = str(exc.orig)
        if "uq_candidates_active_email" in message or "uq_candidates_active_cpf" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Recebemos sua solicitação. Se já houver cadastro, atualizaremos seu processo conforme as regras do RH.",
            )
        logger.exception("integrity_error_apply", exc_info=exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao processar candidatura",
        )
    except HTTPException:
        # Re-raise FastAPI HTTPException sem reescrever para não mascarar status.
        await db.rollback()
        raise
    except Exception as exc:
        # Catch-all defensivo: qualquer erro inesperado (S3, Celery init, Redis,
        # encoding, etc.) precisa ser logado com traceback completo e devolvido
        # como 500 limpo, em vez de propagar uma stacktrace nua para o navegador
        # ou derrubar a conexão.
        try:
            await db.rollback()
        except Exception:
            pass
        logger.exception("public_apply.unhandled_error", exc_info=exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro inesperado ao processar candidatura. Tente novamente em instantes.",
        )


@router.post("/candidate-auth/google", response_model=CandidateAuthGoogleResponse)
async def login_candidate_portal_with_google(
    body: CandidateAuthGoogleRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CandidateAuthGoogleResponse:
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
    except GoogleIdentityConfigurationError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login com Google não está configurado.",
        )
    except (GoogleIdentityVerificationError, CandidateGoogleAuthEmailNotVerifiedError):
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não foi possível validar sua conta Google.",
        )
    except CandidateGoogleAuthConflictError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível vincular esta conta Google com segurança.",
        )
    except Exception:
        await db.rollback()
        logger.exception("candidate_portal.google_login_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível concluir o login com Google.",
        )


@router.post("/candidate-auth/login", response_model=CandidateAuthLoginResponse)
async def login_candidate_portal(
    body: CandidateAuthLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CandidateAuthLoginResponse:
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
    except CandidatePortalLockedError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Conta temporariamente bloqueada. Tente novamente mais tarde.",
        )
    except CandidatePortalInvalidCredentialsError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
        )
    except Exception:
        await db.rollback()
        logger.exception("candidate_portal.login_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível concluir o login.",
        )


@router.post("/candidate-auth/logout")
async def logout_candidate_portal(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Logout idempotente: sempre responde 204 + limpa cookie, mesmo sem
    sessão válida ou se a invalidação no banco falhar."""
    token = request.cookies.get(CANDIDATE_PORTAL_COOKIE_NAME)
    try:
        await CandidatePortalAuthService(db).logout(token)
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.exception("candidate_portal.logout_failed")

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(CANDIDATE_PORTAL_COOKIE_NAME, path="/")
    return response


@router.get("/candidate-portal/overview", response_model=CandidatePortalOverviewResponse)
async def get_candidate_portal_overview(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalOverviewResponse:
    try:
        service = CandidatePortalService(db)
        return await service.get_overview(candidate_session.candidate_id)
    except CandidatePortalIncompleteProfileError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=candidate_profile_incomplete_detail(exc.missing_fields),
        )


@router.patch("/candidate-portal/profile", response_model=CandidatePortalOverviewResponse)
async def update_candidate_portal_profile(
    body: CandidatePortalUpdateProfileRequest,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalOverviewResponse:
    try:
        service = CandidatePortalService(db)
        result = await service.update_profile(candidate_session.candidate_id, body)
        await db.commit()
        return result
    except CandidatePortalProfileConflictError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível atualizar os dados informados",
        )
    except CandidatePortalIncompleteProfileError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=candidate_profile_incomplete_detail(exc.missing_fields),
        )


@router.post("/candidate-portal/resume", response_model=CandidatePortalResumeUploadResponse)
async def upload_candidate_portal_resume(
    candidate_session: CurrentCandidateSession,
    resume_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalResumeUploadResponse:
    try:
        file_bytes = await resume_file.read(settings.max_upload_size_bytes + 1)
        service = CandidatePortalService(db)
        result = await service.upload_resume(
            candidate_id=candidate_session.candidate_id,
            file_bytes=file_bytes,
            file_name=resume_file.filename or "resume.pdf",
            file_content_type=resume_file.content_type,
            uploaded_by=SYSTEM_USER_ID,
        )
        await db.commit()
        return result
    except CandidatePortalInvalidFileError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except CandidatePortalProfileConflictError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    except Exception:
        await db.rollback()
        logger.exception(
            "candidate_portal.resume_upload_failed",
            candidate_id=str(candidate_session.candidate_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível enviar o currículo",
        )
