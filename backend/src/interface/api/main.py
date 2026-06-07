from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from src.core.app_metadata import APP_VERSION
from src.core.settings import settings
from src.domain.exceptions import (
    ConflictException,
    DomainException,
    ForbiddenException,
    InvalidPreAdmissionStatusTransition,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)
from src.infrastructure.cache.redis_client import close_redis
from src.infrastructure.database.connection import check_database_health, engine
from src.infrastructure.security.encryption_service import validate_ai_credentials_encryption_key
from src.interface.api.middlewares.audit_middleware import AuditMiddleware
from src.interface.api.middlewares.request_id_middleware import RequestIDMiddleware
from src.interface.api.middlewares.security_headers_middleware import SecurityHeadersMiddleware
from src.interface.api.routers import (
    admin_ai_knowledge,
    admin_ai_limits,
    admin_ai_provider_credentials,
    admin_ai_provider_health,
    admin_assistant,
    admin_audit_logs,
    admin_behavioral_ai,
    admin_bi,
    admin_diagnostics,
    admin_notifications,
    admin_system_health,
    admission_packages,
    admissions,
    ai_assistant,
    ai_models,
    analyses,
    applications,
    auth,
    behavioral_templates,
    candidate_behavioral_assessments,
    candidate_portal_area,
    candidate_portal_auth,
    candidates,
    candidaturas,
    collaboration,
    communications,
    conversations,
    conversation_upload,
    dashboard,
    decision_summary,
    document_ai,
    hiring_decisions,
    internal_users,
    interview_schedules,
    interview_scorecards,
    job_areas,
    jobs,
    manager,
    observability,
    operational_master,
    pipeline,
    pre_admission,
    public,
    public_candidate_portal,
    resumes,
    rh_dashboard,
    skill_equivalences,
    skills,
    users,
)
from src.interface.api.routers.integrations import google_calendar
from src.observability.logging import configure_structured_logging


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    configure_structured_logging()
    validate_ai_credentials_encryption_key()
    yield
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="Resume AI System",
    version=APP_VERSION,
    description="Sistema de análise inteligente de currículos com IA",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Middlewares (ordem importa: executados de baixo para cima no stack) ──────
# SecurityHeadersMiddleware runs LAST in the response phase (first added →
# outermost wrapper), so the headers it sets are applied to every response
# regardless of where it was generated (handler, exception handler, static).
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(RequestIDMiddleware)

_cors_allow_origin_regex = (
    None
    if settings.is_production
    else r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$"
)

# ── Routers ──────────────────────────────────────────────────────────────────
_PREFIX = "/api/v1"

app.include_router(public.router, prefix=_PREFIX)
app.include_router(public_candidate_portal.router, prefix=_PREFIX)
app.include_router(candidate_portal_area.router, prefix=_PREFIX)
app.include_router(candidate_portal_area.public_router, prefix=_PREFIX)
app.include_router(candidate_portal_auth.router, prefix=_PREFIX)
app.include_router(auth.router, prefix=_PREFIX)
app.include_router(users.router, prefix=_PREFIX)
app.include_router(internal_users.router, prefix=_PREFIX)
app.include_router(admin_assistant.router, prefix=_PREFIX)
app.include_router(ai_assistant.router, prefix=_PREFIX)
app.include_router(ai_assistant.status_router, prefix=_PREFIX)
app.include_router(admin_bi.router, prefix=_PREFIX)
app.include_router(admin_diagnostics.router, prefix=_PREFIX)
app.include_router(admin_audit_logs.router, prefix=_PREFIX)
app.include_router(admin_system_health.router, prefix=_PREFIX)
app.include_router(admin_notifications.router, prefix=_PREFIX)
app.include_router(admin_ai_limits.router, prefix=_PREFIX)
app.include_router(admin_ai_provider_credentials.router, prefix=_PREFIX)
app.include_router(admin_ai_provider_health.router, prefix=_PREFIX)
app.include_router(admin_ai_knowledge.router, prefix=_PREFIX)
app.include_router(admin_behavioral_ai.router, prefix=_PREFIX)
app.include_router(candidaturas.router, prefix=_PREFIX)
app.include_router(candidates.router, prefix=_PREFIX)
app.include_router(communications.router, prefix=_PREFIX)
app.include_router(conversations.router, prefix=_PREFIX)
app.include_router(conversation_upload.router, prefix=_PREFIX)
app.include_router(resumes.router, prefix=_PREFIX)
app.include_router(analyses.router, prefix=_PREFIX)
app.include_router(applications.router, prefix=_PREFIX)
app.include_router(behavioral_templates.router, prefix=_PREFIX)
app.include_router(candidate_behavioral_assessments.router, prefix=_PREFIX)
app.include_router(decision_summary.router, prefix=_PREFIX)
app.include_router(hiring_decisions.router, prefix=_PREFIX)
app.include_router(jobs.router, prefix=_PREFIX)
app.include_router(pipeline.router, prefix=_PREFIX)
app.include_router(skill_equivalences.router, prefix=_PREFIX)
app.include_router(skills.router, prefix=_PREFIX)
app.include_router(job_areas.router, prefix=_PREFIX)
app.include_router(operational_master.router, prefix=_PREFIX)
app.include_router(interview_schedules.router, prefix=_PREFIX)
app.include_router(interview_schedules.operational_router, prefix=_PREFIX)
app.include_router(interview_scorecards.router, prefix=_PREFIX)
app.include_router(pre_admission.router, prefix=_PREFIX)
app.include_router(admissions.router, prefix=_PREFIX)
app.include_router(admission_packages.router, prefix=_PREFIX)
app.include_router(manager.router, prefix=_PREFIX)
app.include_router(collaboration.router, prefix=_PREFIX)
app.include_router(google_calendar.router, prefix=_PREFIX)
app.include_router(ai_models.router, prefix=_PREFIX)
app.include_router(document_ai.router, prefix=_PREFIX)
app.include_router(observability.router, prefix=_PREFIX)
app.include_router(dashboard.router, prefix=_PREFIX)
app.include_router(rh_dashboard.router, prefix=_PREFIX)


# ── Static files ──────────────────────────────────────────────────────────────
# LGPD/R13: NEVER mount `/uploads` as a whole. That directory contains resume
# PDFs and pre-admission documents (CPF, RG, comprovante de endereço) under
# `uploads/resumes/` and `uploads/pre_admission/`. Serving them as static files
# would let anyone with the path download personal data without auth.
#
# Resume downloads go through `GET /api/v1/candidates/{id}/resume/download`,
# which checks `RecruiterOrAdmin` permission and writes an audit log.
# Pre-admission documents go through `GET /api/v1/pre-admission/documents/{id}/download`,
# which requires an authenticated session.
#
# Only `uploads/avatars/` stays public (intentional, referenced by absolute path
# in `users.avatar_url`).
uploads_dir = Path(__file__).parent.parent.parent.parent / "uploads"
avatars_dir = uploads_dir / "avatars"
avatars_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory=str(avatars_dir)), name="uploads_avatars")


# ── Exception handlers globais ───────────────────────────────────────────────
def _error_response(code: str, message: str, status_code: int, request: Request) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {"code": code, "message": message},
            "request_id": str(getattr(request.state, "request_id", "")),
            "correlation_id": str(getattr(request.state, "correlation_id", "")),
        },
    )


@app.exception_handler(NotFoundException)
async def handle_not_found(request: Request, exc: NotFoundException) -> JSONResponse:
    return _error_response("NOT_FOUND", exc.message, status.HTTP_404_NOT_FOUND, request)


@app.exception_handler(UnauthorizedException)
async def handle_unauthorized(request: Request, exc: UnauthorizedException) -> JSONResponse:
    return _error_response("UNAUTHORIZED", exc.message, status.HTTP_401_UNAUTHORIZED, request)


@app.exception_handler(ForbiddenException)
async def handle_forbidden(request: Request, exc: ForbiddenException) -> JSONResponse:
    return _error_response("FORBIDDEN", exc.message, status.HTTP_403_FORBIDDEN, request)


@app.exception_handler(ConflictException)
async def handle_conflict(request: Request, exc: ConflictException) -> JSONResponse:
    return _error_response("CONFLICT", exc.message, status.HTTP_409_CONFLICT, request)


@app.exception_handler(InvalidPreAdmissionStatusTransition)
async def handle_invalid_pre_admission_transition(
    request: Request,
    exc: InvalidPreAdmissionStatusTransition,
) -> JSONResponse:
    return _error_response(
        "INVALID_PRE_ADMISSION_STATUS_TRANSITION",
        exc.message,
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        request,
    )


@app.exception_handler(ValidationException)
async def handle_validation(request: Request, exc: ValidationException) -> JSONResponse:
    return _error_response(
        "VALIDATION_ERROR",
        exc.message,
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        request,
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
    if request.url.path.startswith("/api/v1/admin/ai-provider-credentials"):
        return _error_response(
            "VALIDATION_ERROR",
            "Dados inválidos para credencial IA",
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            request,
        )
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(DomainException)
async def handle_domain(request: Request, exc: DomainException) -> JSONResponse:
    return _error_response("DOMAIN_ERROR", exc.message, status.HTTP_400_BAD_REQUEST, request)


# SQLAlchemyError is NOT subclass of Exception registered via (500, Exception),
# so FastAPI routes it to ExceptionMiddleware — which runs INSIDE CORSMiddleware.
# This guarantees that DB errors return CORS headers to the browser.
@app.exception_handler(SQLAlchemyError)
async def handle_sqlalchemy_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    return _error_response(
        "DATABASE_ERROR",
        "Erro interno do servidor",
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        request,
    )


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["infra"])
async def health() -> dict[str, Any]:
    database_connected = await check_database_health()
    return {
        "status": "ok" if database_connected else "degraded",
        "version": APP_VERSION,
        "database": {
            "connected": database_connected,
        },
    }


# CORS global wrapper:
# garante headers CORS inclusive em respostas 500 geradas fora do ExceptionMiddleware.
app = CORSMiddleware(
    app=app,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=_cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Correlation-ID"],
)
