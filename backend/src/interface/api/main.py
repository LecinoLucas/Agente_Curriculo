from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, status
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
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)
from src.infrastructure.cache.redis_client import close_redis
from src.infrastructure.database.connection import check_database_health, engine
from src.interface.api.middlewares.audit_middleware import AuditMiddleware
from src.interface.api.middlewares.request_id_middleware import RequestIDMiddleware
from src.interface.api.routers import (
    admin_diagnostics,
    admin_bi,
    admin_audit_logs,
    admin_system_health,
    admission_packages,
    ai_models,
    analyses,
    auth,
    behavioral_templates,
    candidate_behavioral_assessments,
    candidates,
    collaboration,
    communications,
    decision_summary,
    document_ai,
    hiring_decisions,
    internal_users,
    interview_schedules,
    interview_scorecards,
    jobs,
    manager,
    observability,
    pipeline,
    pre_admission,
    public,
    resumes,
    skill_equivalences,
    skills,
    users,
    dashboard,
    job_areas,
)
from src.interface.api.routers.integrations import google_calendar
from src.observability.logging import configure_structured_logging


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    configure_structured_logging()
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
app.include_router(auth.router, prefix=_PREFIX)
app.include_router(users.router, prefix=_PREFIX)
app.include_router(internal_users.router, prefix=_PREFIX)
app.include_router(admin_bi.router, prefix=_PREFIX)
app.include_router(admin_diagnostics.router, prefix=_PREFIX)
app.include_router(admin_audit_logs.router, prefix=_PREFIX)
app.include_router(admin_system_health.router, prefix=_PREFIX)
app.include_router(candidates.router, prefix=_PREFIX)
app.include_router(communications.router, prefix=_PREFIX)
app.include_router(resumes.router, prefix=_PREFIX)
app.include_router(analyses.router, prefix=_PREFIX)
app.include_router(behavioral_templates.router, prefix=_PREFIX)
app.include_router(candidate_behavioral_assessments.router, prefix=_PREFIX)
app.include_router(decision_summary.router, prefix=_PREFIX)
app.include_router(hiring_decisions.router, prefix=_PREFIX)
app.include_router(jobs.router, prefix=_PREFIX)
app.include_router(pipeline.router, prefix=_PREFIX)
app.include_router(skill_equivalences.router, prefix=_PREFIX)
app.include_router(skills.router, prefix=_PREFIX)
app.include_router(job_areas.router, prefix=_PREFIX)
app.include_router(interview_schedules.router, prefix=_PREFIX)
app.include_router(interview_schedules.operational_router, prefix=_PREFIX)
app.include_router(interview_scorecards.router, prefix=_PREFIX)
app.include_router(pre_admission.router, prefix=_PREFIX)
app.include_router(admission_packages.router, prefix=_PREFIX)
app.include_router(manager.router, prefix=_PREFIX)
app.include_router(collaboration.router, prefix=_PREFIX)
app.include_router(google_calendar.router, prefix=_PREFIX)
app.include_router(ai_models.router, prefix=_PREFIX)
app.include_router(document_ai.router, prefix=_PREFIX)
app.include_router(observability.router, prefix=_PREFIX)
app.include_router(dashboard.router, prefix=_PREFIX)


# ── Static files ──────────────────────────────────────────────────────────────
uploads_dir = Path(__file__).parent.parent.parent.parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


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


@app.exception_handler(ValidationException)
async def handle_validation(request: Request, exc: ValidationException) -> JSONResponse:
    return _error_response("VALIDATION_ERROR", exc.message, status.HTTP_422_UNPROCESSABLE_ENTITY, request)


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
