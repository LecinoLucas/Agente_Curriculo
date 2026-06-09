"""
RequestAnalysisUseCase

Fluxo completo de requisição de análise:
  1. Valida que o resume_version existe e pertence ao solicitante (ou admin)
  2. Verifica se já existe análise em andamento (versioning rules)
  3. Busca o prompt_template ativo e o ai_model ativo
  4. Cria o registro Analysis com status PENDING
  5. Gera idempotency_key
  6. Publica a task na fila Celery
  7. Retorna analysis_id e status imediatamente (fluxo assíncrono)
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import structlog
from sqlalchemy.exc import IntegrityError

from src.application.dtos.analysis_dtos import RequestAnalysisCommand, RequestAnalysisResult
from src.application.services.ai_limit_override_service import AILimitOverrideService
from src.core.analysis_observability import record_analysis_audit_event
from src.core.resume_text_quality import is_extracted_text_useful
from src.domain.exceptions import NotFoundException, ValidationException
from src.domain.services.analysis_versioning import AnalysisVersioningService
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)

logger = structlog.get_logger(__name__)

_ESTIMATED_WAIT_SECONDS_PER_POSITION = 45  # estimativa conservadora por posição na fila
_PENDING_STALE_AFTER = timedelta(hours=2)
_PROCESSING_STALE_AFTER = timedelta(minutes=30)
_SUPPORTED_ANALYSIS_RESUME_MIME_TYPES = {"application/pdf"}
_SUPPORTED_ANALYSIS_RESUME_EXTENSIONS = {".pdf"}
_EXTRACTION_NOT_READY_MESSAGE = (
    "A extração do currículo ainda não foi concluída. "
    "Aguarde a extração antes de reprocessar a análise."
)
_EXTRACTION_FAILED_MESSAGE = (
    "A extração do currículo falhou. Envie um novo PDF ou tente extrair novamente."
)
_EXTRACTED_TEXT_INVALID_MESSAGE = (
    "Não foi possível reprocessar: o currículo não possui texto extraído válido."
)
_UNSUPPORTED_RESUME_FORMAT_MESSAGE = (
    "Não foi possível reprocessar: o currículo está em formato não suportado. Envie um novo PDF."
)


class _ResumeAnalysisReadiness(SimpleNamespace):
    ready: bool
    pending_extraction: bool
    message: str | None


def _is_supported_resume_format(version) -> bool:
    mime_type = (getattr(version, "mime_type", "") or "").strip().lower()
    original_extension = Path(getattr(version, "original_file_name", "") or "").suffix.lower()
    return (
        mime_type in _SUPPORTED_ANALYSIS_RESUME_MIME_TYPES
        and original_extension in _SUPPORTED_ANALYSIS_RESUME_EXTENSIONS
    )


def _resume_analysis_readiness(version) -> _ResumeAnalysisReadiness:
    if not _is_supported_resume_format(version):
        return _ResumeAnalysisReadiness(
            ready=False,
            pending_extraction=False,
            message=_UNSUPPORTED_RESUME_FORMAT_MESSAGE,
        )

    extraction_status = str(getattr(version, "extraction_status", "") or "").lower()
    if extraction_status == "failed":
        return _ResumeAnalysisReadiness(
            ready=False,
            pending_extraction=False,
            message=_EXTRACTION_FAILED_MESSAGE,
        )

    if extraction_status != "completed":
        return _ResumeAnalysisReadiness(
            ready=False,
            pending_extraction=True,
            message=_EXTRACTION_NOT_READY_MESSAGE,
        )

    extracted_text = getattr(version, "extracted_text", None)
    if not is_extracted_text_useful(extracted_text):
        return _ResumeAnalysisReadiness(
            ready=False,
            pending_extraction=False,
            message=_EXTRACTED_TEXT_INVALID_MESSAGE,
        )

    return _ResumeAnalysisReadiness(ready=True, pending_extraction=False, message=None)


def _is_stale_in_flight_analysis(analysis) -> bool:
    """
    [TECNICO: STATE_MACHINE]
    Determina se uma análise presa precisa ser reenfileirada.
    O status 'waiting_extraction' nunca é considerado obsoleto (stale) aqui,
    pois ele aguarda ativamente o fim do OCR e será acordado pelo próprio
    worker de extração, não precisando de expiração baseada em tempo.
    """
    now = datetime.now(UTC)
    status = str(analysis.status)
    if status == "waiting_extraction":
        return False
    if status == "pending":
        return analysis.created_at is not None and analysis.created_at < now - _PENDING_STALE_AFTER
    if status == "processing":
        if analysis.stale_at is not None and analysis.stale_at < now:
            return True
        if analysis.started_at is not None:
            return analysis.started_at < now - _PROCESSING_STALE_AFTER
        return (
            analysis.updated_at is not None
            and analysis.updated_at < now - _PROCESSING_STALE_AFTER
        )
    if status == "retry_scheduled":
        return analysis.next_retry_at is not None and analysis.next_retry_at <= now
    return False


def _reset_stale_analysis_for_reenqueue(analysis) -> None:
    now = datetime.now(UTC)
    analysis.status = "pending"
    analysis.failure_reason = None
    analysis.failed_at = None
    analysis.started_at = None
    analysis.completed_at = None
    analysis.worker_claim_id = None
    analysis.claimed_at = None
    analysis.stale_at = None
    analysis.worker_id = None
    analysis.task_id = None
    analysis.next_retry_at = None
    analysis.provider_error_type = None
    analysis.provider_status_code = None
    analysis.updated_at = now


class RequestAnalysisUseCase:
    def __init__(
        self,
        analysis_repo: SQLAlchemyAnalysisRepository,
        resume_repo: SQLAlchemyResumeRepository,
        limit_service: AILimitOverrideService | None = None,
    ) -> None:
        self._analysis_repo = analysis_repo
        self._resume_repo = resume_repo
        # Optional so legacy unit tests that don't exercise the daily-limit
        # path keep compiling. The router always wires it; only construct
        # without it for tests where the check is irrelevant.
        self._limit_service = limit_service

    async def execute(self, command: RequestAnalysisCommand) -> RequestAnalysisResult:
        if command.force_reanalyze:
            logger.info(
                "analysis.force_recompute_requested",
                resume_version_id=str(command.resume_version_id),
                job_id=str(command.job_id) if command.job_id else None,
                requested_by=str(command.requested_by),
            )

        # 1. Valida existência do resume_version
        version = await self._resume_repo.find_version_by_id(command.resume_version_id)
        if version is None:
            raise NotFoundException("Versão de currículo não encontrada")

        if not command.job_id:
            raise ValidationException("job_id é obrigatório para análise")

        job = await self._analysis_repo.find_active_job(command.job_id)
        if job is None:
            raise ValidationException(
                "A vaga não está disponível para novas análises. Reative a vaga antes de continuar."
            )

        # 2. Busca análise em andamento para este resume_version + job (se houver)
        existing = await self._analysis_repo.find_active_for_version(
            resume_version_id=command.resume_version_id,
            job_id=command.job_id,
        )

        # [TECNICO: IDEMPOTENCIA]
        # Se já existe uma análise em andamento (active) para os mesmos parâmetros,
        # retornamos o ID existente sem reenfileirar. Isso previne que double-clicks
        # no frontend ou falhas de rede dupliquem o processamento caro na IA.
        if existing and not command.force_reanalyze:
            queue_length = await self._analysis_repo.count_pending()
            estimated_wait = max(1, queue_length) * _ESTIMATED_WAIT_SECONDS_PER_POSITION
            logger.info(
                "analysis.cache_hit",
                analysis_id=str(existing.id),
                resume_version_id=str(command.resume_version_id),
                job_id=str(command.job_id),
                status=existing.status,
                hit_type="active",
            )
            logger.info(
                "analysis.skipped_due_to_existing",
                analysis_id=str(existing.id),
                resume_version_id=str(command.resume_version_id),
                job_id=str(command.job_id),
                status=existing.status,
            )
            return RequestAnalysisResult(
                analysis_id=existing.id,
                status=existing.status,
                estimated_wait_seconds=estimated_wait,
                enqueue_required=False,
                created=False,
                reused=True,
                reason=(
                    "analysis_already_in_progress"
                    if str(existing.status)
                    in {"waiting_extraction", "pending", "processing", "retry_scheduled"}
                    else "analysis_reused_existing"
                ),
            )

        # 3. Reutiliza análise concluída para o mesmo resume_version + vaga (cache)
        # [TECNICO: REGRA_DE_NEGOCIO]
        # Diferente do hit "active" acima (que evita duplicação na fila),
        # este hit "completed" poupa créditos de IA. Ambas situações marcam
        # `reused=True`, mas por motivos operacionais distintos.
        latest_completed = await self._analysis_repo.find_latest_completed_for_version(
            resume_version_id=command.resume_version_id,
            job_id=command.job_id,
        )
        if latest_completed is not None and not command.force_reanalyze:
            logger.info(
                "analysis.cache_hit",
                analysis_id=str(latest_completed.id),
                resume_version_id=str(command.resume_version_id),
                job_id=str(command.job_id),
                status=latest_completed.status,
                hit_type="completed",
            )
            logger.info(
                "analysis.skipped_due_to_existing",
                analysis_id=str(latest_completed.id),
                resume_version_id=str(command.resume_version_id),
                job_id=str(command.job_id),
                status=latest_completed.status,
            )
            return RequestAnalysisResult(
                analysis_id=latest_completed.id,
                status=latest_completed.status,
                estimated_wait_seconds=0,
                enqueue_required=False,
                created=False,
                reused=True,
                reason="analysis_existing_completed_reused",
            )

        resume_readiness = _resume_analysis_readiness(version)
        extraction_ready = resume_readiness.ready
        if not extraction_ready and (
            not command.allow_pending_resume_extraction
            or not resume_readiness.pending_extraction
        ):
            raise ValidationException(
                resume_readiness.message or _EXTRACTED_TEXT_INVALID_MESSAGE
            )

        if existing and command.force_reanalyze:
            in_flight_status = str(existing.status) in {
                "pending",
                "processing",
                "retry_scheduled",
            }
            if in_flight_status and _is_stale_in_flight_analysis(existing):
                _reset_stale_analysis_for_reenqueue(existing)
                await self._analysis_repo.save_existing(existing)
                queue_length = await self._analysis_repo.count_pending()
                estimated_wait = max(1, queue_length) * _ESTIMATED_WAIT_SECONDS_PER_POSITION
                return RequestAnalysisResult(
                    analysis_id=existing.id,
                    status=existing.status,
                    estimated_wait_seconds=estimated_wait,
                    enqueue_required=True,
                    created=False,
                    reused=True,
                    stuck=True,
                    reason="analysis_stale_requeued",
                )
            allowed, reason = AnalysisVersioningService.validate_reanalysis_allowed(
                existing_status=str(existing.status),
                force=command.force_reanalyze,
            )
            if not allowed:
                raise ValidationException(reason)

        logger.info(
            "analysis.cache_miss",
            resume_version_id=str(command.resume_version_id),
            job_id=str(command.job_id),
        )

        # [TECNICO: ARQUITETURA]
        # 3.5 P0.2B — A verificação de limites diários ocorre DEPOIS da checagem
        # de reuso (cache/idempotência) para não descontar do limite do usuário
        # quando a resposta já estava pronta. A checagem ocorre ANTES de inserir
        # a linha para evitar lixo no banco caso o limite tenha estourado.
        if self._limit_service is not None:
            await self._limit_service.check_request_allowed(
                user_id=command.requested_by,
                job_id=command.job_id,
            )

        # 4. Busca configurações ativas de IA
        active_model = await self._analysis_repo.find_preferred_ai_model()
        if active_model is None:
            raise ValidationException("Nenhum modelo de IA ativo configurado")

        active_prompt = await self._analysis_repo.find_preferred_prompt_template("full_analysis")

        # 5. Gera chave de idempotência (R07 — formato v1 namespaced).
        # Inclui requested_by para evitar colisão entre solicitantes distintos
        # com o mesmo (resume_version, prompt, modelo, vaga).
        idempotency_key = AnalysisVersioningService.build_idempotency_key(
            resume_version_id=command.resume_version_id,
            prompt_template_id=active_prompt.id,
            ai_model_id=active_model.id,
            job_id=command.job_id,
            requested_by=command.requested_by,
        )
        # [TECNICO: FEATURE_FLAG]
        latest_by_key = await self._analysis_repo.find_by_idempotency_key(idempotency_key)
        if command.force_reanalyze or (latest_by_key and str(latest_by_key.status) in ("failed", "cancelled", "discarded")):
            import time
            # O sufixo de timestamp quebra a chave de idempotência intencionalmente
            # para forçar a criação de um novo registro e um novo processamento na IA.
            idempotency_key += f":force:{int(time.time())}"

        # 6. Cria registro de análise
        from src.infrastructure.database.models.analysis_model import AnalysisModel

        analysis = AnalysisModel(
            resume_version_id=command.resume_version_id,
            ai_model_id=active_model.id,
            prompt_template_id=active_prompt.id,
            requested_by=command.requested_by,
            job_id=command.job_id,
            idempotency_key=idempotency_key,
            priority=command.priority,
            status="pending" if extraction_ready else "waiting_extraction",
        )
        try:
            await self._analysis_repo.save(analysis)
            await record_analysis_audit_event(
                self._analysis_repo.session,
                action="analysis_requested",
                resource_id=analysis.id,
                user_id=command.requested_by,
                metadata={
                    "resume_version_id": command.resume_version_id,
                    "job_id": command.job_id,
                    "ai_model_id": active_model.id,
                    "provider": active_model.provider,
                    "model": active_model.model_id,
                    "prompt_template_id": active_prompt.id,
                    "prompt_version": active_prompt.version,
                    "status": analysis.status,
                    "force_reanalyze": command.force_reanalyze,
                    "allow_pending_resume_extraction": command.allow_pending_resume_extraction,
                    "extraction_ready": extraction_ready,
                },
            )
        except IntegrityError:
            # [TECNICO: FALLBACK / CORRIDA]
            # Dois workers ou requisições paralelas tentaram criar a análise exata
            # no mesmo milissegundo. O banco rejeitou a segunda pela constraint unique
            # da idempotency_key. O fallback busca quem "venceu" e retorna como reuso.
            existing_by_key = await self._analysis_repo.find_by_idempotency_key(idempotency_key)
            if existing_by_key is None:
                raise
            queue_length = await self._analysis_repo.count_pending()
            estimated_wait = max(1, queue_length) * _ESTIMATED_WAIT_SECONDS_PER_POSITION
            return RequestAnalysisResult(
                analysis_id=existing_by_key.id,
                status=existing_by_key.status,
                estimated_wait_seconds=estimated_wait,
                enqueue_required=False,
                created=False,
                reused=True,
                reason="analysis_reused_by_idempotency_key",
            )

        queue_length = await self._analysis_repo.count_pending()
        estimated_wait = max(1, queue_length) * _ESTIMATED_WAIT_SECONDS_PER_POSITION

        logger.info(
            "analysis.requested",
            analysis_id=str(analysis.id),
            resume_version_id=str(command.resume_version_id),
            job_id=str(command.job_id) if command.job_id else None,
            force=command.force_reanalyze,
            extraction_ready=extraction_ready,
        )

        if not extraction_ready:
            if not command.allow_pending_resume_extraction:
                raise ValidationException(
                    "Currículo ainda em processamento. Faça upload do PDF e aguarde "
                    "extração antes de solicitar análise."
                )
            return RequestAnalysisResult(
                analysis_id=analysis.id,
                status=analysis.status,
                estimated_wait_seconds=estimated_wait,
                enqueue_required=False,
                created=True,
                reused=False,
                reason="analysis_created_waiting_resume_extraction",
            )

        return RequestAnalysisResult(
            analysis_id=analysis.id,
            status=analysis.status,
            estimated_wait_seconds=estimated_wait,
            enqueue_required=True,
            created=True,
            reused=False,
            reason="analysis_created",
        )
