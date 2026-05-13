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

import structlog
from sqlalchemy.exc import IntegrityError

from src.application.dtos.analysis_dtos import RequestAnalysisCommand, RequestAnalysisResult
from src.domain.exceptions import NotFoundException, ValidationException
from src.domain.services.analysis_versioning import AnalysisVersioningService
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)

logger = structlog.get_logger(__name__)

_ESTIMATED_WAIT_SECONDS_PER_POSITION = 45  # estimativa conservadora por posição na fila


class RequestAnalysisUseCase:
    def __init__(
        self,
        analysis_repo: SQLAlchemyAnalysisRepository,
        resume_repo: SQLAlchemyResumeRepository,
    ) -> None:
        self._analysis_repo = analysis_repo
        self._resume_repo = resume_repo

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
                    if str(existing.status) in {"pending", "processing", "retry_scheduled"}
                    else "analysis_reused_existing"
                ),
            )

        if existing and command.force_reanalyze:
            allowed, reason = AnalysisVersioningService.validate_reanalysis_allowed(
                existing_status=str(existing.status),
                force=command.force_reanalyze,
            )
            if not allowed:
                raise ValidationException(reason)

        # 3. Reutiliza análise concluída para o mesmo resume_version + vaga (cache)
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

        extraction_ready = str(getattr(version, "extraction_status", "")).lower() == "completed" and bool(
            (version.extracted_text or "").strip()
        )

        logger.info(
            "analysis.cache_miss",
            resume_version_id=str(command.resume_version_id),
            job_id=str(command.job_id),
        )

        # 4. Busca configurações ativas de IA
        active_model = await self._analysis_repo.find_preferred_ai_model()
        if active_model is None:
            raise ValidationException("Nenhum modelo de IA ativo configurado")

        active_prompt = await self._analysis_repo.find_preferred_prompt_template("full_analysis")

        # 5. Gera chave de idempotência
        idempotency_key = AnalysisVersioningService.build_idempotency_key(
            resume_version_id=command.resume_version_id,
            prompt_template_id=active_prompt.id,
            ai_model_id=active_model.id,
            job_id=command.job_id,
        )
        if command.force_reanalyze:
            import time
            idempotency_key += f":force:{int(time.time())}"  # força unicidade na re-análise

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
        )
        try:
            await self._analysis_repo.save(analysis)
        except IntegrityError:
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
                    "Currículo ainda em processamento. Faça upload do PDF e aguarde extração antes de solicitar análise."
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
