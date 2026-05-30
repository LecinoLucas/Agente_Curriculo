"""
Candidaturas — entrada simples de candidatos.

POST /candidaturas/manual   — cria candidato manual e opcionalmente vincula à vaga
POST /candidaturas/import   — importa CSV com candidatos
"""
from __future__ import annotations

import csv
import io
import re
import structlog
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_dispatch_service import CandidateJobAnalysisDispatcher
from src.application.services.audit_service import AuditService
from src.application.services.candidate_service import (
    APPLICATION_SOURCE_MANUAL,
    CandidateService,
)
from src.application.services.pipeline_service import (
    PipelineCandidateAlreadyActiveInAnotherJobError,
    PipelineCandidateAlreadyActiveInSameJobError,
    PipelineDestinationJobUnavailableError,
    PipelineDuplicateEntryError,
    PipelineJobNotFoundError,
    PipelineService,
)
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.interface.api.dependencies import HrRecruiterOrAdmin, get_db
from src.interface.api.schemas.candidaturas_schemas import (
    ImportCandidatesResponse,
    ImportRowError,
    ManualCandidateRequest,
    ManualCandidateResponse,
)
from src.interface.api.schemas.pipeline_schemas import AddCandidateToJobRequest

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/candidaturas", tags=["candidaturas"])

_MAX_IMPORT_ROWS = 200
_MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
_EXPECTED_COLUMNS = {"nome", "email", "telefone", "vaga", "observacao"}
_REQUIRED_COLUMNS = {"nome"}

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _candidate_service(db: AsyncSession) -> CandidateService:
    return CandidateService(
        SQLAlchemyCandidateRepository(db),
        audit_service=AuditService(db),
    )


def _pipeline_service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db), db)


async def _link_candidate_to_job(
    candidate_id: UUID,
    job_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> bool:
    """Vincula candidato à vaga usando o fluxo canônico. Retorna True se vinculou."""
    try:
        result = await _pipeline_service(db).add_candidate_to_job(
            candidate_id=candidate_id,
            body=AddCandidateToJobRequest(job_id=job_id),
            moved_by=actor_id,
        )
        await db.commit()
        await CandidateJobAnalysisDispatcher(db).request_auto_analysis(
            candidate_id=candidate_id,
            job_id=job_id,
            requested_by=actor_id,
        )
        logger.info(
            "candidatura.manual.linked",
            candidate_id=str(candidate_id),
            job_id=str(job_id),
            stage=result.stage,
        )
        return True
    except (
        PipelineCandidateAlreadyActiveInSameJobError,
        PipelineDuplicateEntryError,
    ):
        return False
    except PipelineCandidateAlreadyActiveInAnotherJobError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já possui vínculo ativo com outra vaga.",
        )
    except (PipelineJobNotFoundError, PipelineDestinationJobUnavailableError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vaga não encontrada ou não disponível.",
        )


@router.post(
    "/manual",
    response_model=ManualCandidateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_manual_candidate(
    body: ManualCandidateRequest,
    current_user: HrRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ManualCandidateResponse:
    """Cria candidato manualmente e opcionalmente vincula a uma vaga."""
    svc = _candidate_service(db)

    # Verificar duplicidade antes de criar
    duplicate_warning: str | None = None
    if body.email:
        check = await svc.check_duplicate(body.email, None)
        if check.exists and check.candidate_id:
            # Candidato já existe por e-mail — tentar vincular à vaga se solicitado
            candidate_id = check.candidate_id
            job_linked = False
            if body.job_id:
                job_linked = await _link_candidate_to_job(candidate_id, body.job_id, current_user.id, db)
            return ManualCandidateResponse(
                candidate_id=candidate_id,
                full_name=check.full_name or body.full_name,
                email=body.email,
                phone=body.phone,
                job_id=body.job_id,
                job_linked=job_linked,
                duplicate_warning="Candidato com este e-mail já existe. Dados mantidos.",
            )

    # Criar candidato diretamente via repositório (sem validação EmailStr do CreateCandidateRequest)
    from uuid import uuid4
    from datetime import UTC, datetime

    repo = SQLAlchemyCandidateRepository(db)
    candidate_model = CandidateModel(
        id=uuid4(),
        full_name=body.full_name.strip(),
        email=body.email.lower().strip() if body.email else None,
        phone=body.phone,
        internal_notes=body.resume_summary,
        created_by=current_user.id,
        application_source=APPLICATION_SOURCE_MANUAL,
    )
    try:
        candidate = await repo.create(candidate_model)
        await db.commit()
        await db.refresh(candidate)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato com este e-mail já existe.",
        )

    # Vincular à vaga se job_id informado
    job_linked = False
    if body.job_id:
        job_linked = await _link_candidate_to_job(candidate.id, body.job_id, current_user.id, db)

    logger.info(
        "candidatura.manual.created",
        candidate_id=str(candidate.id),
        job_id=str(body.job_id) if body.job_id else None,
        job_linked=job_linked,
        actor_id=str(current_user.id),
    )

    return ManualCandidateResponse(
        candidate_id=candidate.id,
        full_name=candidate.full_name,
        email=body.email,
        phone=candidate.phone,
        job_id=body.job_id,
        job_linked=job_linked,
        duplicate_warning=duplicate_warning,
    )


@router.post(
    "/import",
    response_model=ImportCandidatesResponse,
    status_code=status.HTTP_200_OK,
)
async def import_candidates(
    current_user: HrRecruiterOrAdmin,
    file: UploadFile = File(...),
    default_job_id: UUID | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
) -> ImportCandidatesResponse:
    """
    Importa candidatos a partir de um arquivo CSV UTF-8.

    Colunas esperadas: nome, email, telefone, vaga, observacao
    - nome é obrigatório.
    - pelo menos email ou telefone deve ser preenchido.
    - vaga: título ou ID da vaga (opcional; sobrepõe default_job_id se informado).
    - Limite: 200 linhas por importação.
    """
    # Validar tipo de arquivo
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv") and "csv" not in content_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Apenas arquivos CSV são aceitos nesta versão.",
        )

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Arquivo vazio.",
        )
    if len(raw) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Arquivo muito grande. Limite: {_MAX_FILE_BYTES // 1024} KB.",
        )

    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Arquivo deve estar em UTF-8.",
        )

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV sem cabeçalho detectado.",
        )

    headers = {h.strip().lower() for h in reader.fieldnames}
    missing = _REQUIRED_COLUMNS - headers
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Coluna obrigatória ausente: {', '.join(missing)}.",
        )

    rows = list(reader)
    if len(rows) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV sem linhas de dados.",
        )
    if len(rows) > _MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Limite de {_MAX_IMPORT_ROWS} linhas por importação.",
        )

    svc = _candidate_service(db)
    created = 0
    linked = 0
    duplicates = 0
    errors: list[ImportRowError] = []
    preview: list[dict] = []

    for row_num, row in enumerate(rows, start=2):
        clean = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        nome = clean.get("nome", "")
        email_raw = clean.get("email", "")
        telefone = clean.get("telefone", "")
        observacao = clean.get("observacao", "")

        if not nome:
            errors.append(ImportRowError(row=row_num, message="Nome obrigatório."))
            continue

        if not email_raw and not telefone:
            errors.append(ImportRowError(row=row_num, message="E-mail ou telefone obrigatório."))
            continue

        email: str | None = None
        if email_raw:
            if not _EMAIL_RE.match(email_raw):
                errors.append(ImportRowError(row=row_num, message=f"E-mail inválido: {email_raw}"))
                continue
            email = email_raw.lower()

        preview_entry: dict = {"row": row_num, "nome": nome, "email": email, "telefone": telefone or None}
        preview.append(preview_entry)

        # Verificar duplicidade por e-mail
        candidate_id: UUID | None = None
        if email:
            check = await svc.check_duplicate(email, None)
            if check.exists and check.candidate_id:
                duplicates += 1
                candidate_id = check.candidate_id
                preview_entry["status"] = "duplicate"
            else:
                candidate_id = None

        if candidate_id is None:
            from uuid import uuid4
            repo = SQLAlchemyCandidateRepository(db)
            new_candidate = CandidateModel(
                id=uuid4(),
                full_name=nome.strip(),
                email=email,
                phone=telefone or None,
                internal_notes=observacao or None,
                created_by=current_user.id,
                application_source=APPLICATION_SOURCE_MANUAL,
            )
            try:
                candidate = await repo.create(new_candidate)
                await db.flush()
                candidate_id = candidate.id
                created += 1
                preview_entry["status"] = "created"
            except IntegrityError:
                await db.rollback()
                duplicates += 1
                preview_entry["status"] = "duplicate"
                if email:
                    check2 = await svc.check_duplicate(email, None)
                    if check2.exists and check2.candidate_id:
                        candidate_id = check2.candidate_id
                continue
            except Exception as e:
                await db.rollback()
                errors.append(ImportRowError(row=row_num, message=str(e)))
                continue

        # Vincular à vaga
        job_id_to_link = default_job_id
        if candidate_id and job_id_to_link:
            try:
                ok = await _link_candidate_to_job(candidate_id, job_id_to_link, current_user.id, db)
                if ok:
                    linked += 1
                    preview_entry["job_linked"] = True
            except HTTPException:
                pass

    await db.commit()

    logger.info(
        "candidatura.import.done",
        created=created,
        linked=linked,
        duplicates=duplicates,
        errors=len(errors),
        actor_id=str(current_user.id),
    )

    return ImportCandidatesResponse(
        created=created,
        linked=linked,
        duplicates=duplicates,
        errors=errors,
        preview=preview[:20],
    )
