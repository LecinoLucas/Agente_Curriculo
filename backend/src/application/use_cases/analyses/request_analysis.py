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
from datetime import UTC, datetime

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
        # 1. Valida existência do resume_version
        version = await self._resume_repo.find_version_by_id(command.resume_version_id)
        if version is None:
            raise NotFoundException("Versão de currículo não encontrada")

        if not command.job_id:
            raise ValidationException("job_id é obrigatório para análise")

        if str(getattr(version, "extraction_status", "")).lower() != "completed" or not (
            (version.extracted_text or "").strip()
        ):
            raise ValidationException(
                "Currículo ainda em processamento. Faça upload do PDF e aguarde extração antes de solicitar análise."
            )

        # 2. Evita retry imediato após rate limit (429)
        latest_for_scope = await self._analysis_repo.find_latest_for_version(
            resume_version_id=command.resume_version_id,
            job_id=command.job_id,
        )
        if (
            latest_for_scope is not None
            and latest_for_scope.status == "failed"
            and latest_for_scope.next_retry_at is not None
            and latest_for_scope.next_retry_at > datetime.now(UTC)
            and "status_code=429" in (latest_for_scope.failure_reason or "")
            and not command.force_reanalyze
        ):
            wait_seconds = int(
                (latest_for_scope.next_retry_at - datetime.now(UTC)).total_seconds()
            )
            logger.warning(
                "analysis.skipped_due_to_rate_limit",
                analysis_id=str(latest_for_scope.id),
                resume_version_id=str(command.resume_version_id),
                job_id=str(command.job_id),
                retry_after_seconds=max(wait_seconds, 1),
            )
            raise ValidationException(
                "Análise bloqueada temporariamente por limite da IA. Aguarde alguns minutos antes de tentar novamente."
            )

        # 3. Busca análise em andamento para este resume_version + job (se houver)
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
            )

        if existing and command.force_reanalyze:
            allowed, reason = AnalysisVersioningService.validate_reanalysis_allowed(
                existing_status=str(existing.status),
                force=command.force_reanalyze,
            )
            if not allowed:
                raise ValidationException(reason)

        # 4. Reutiliza análise concluída para o mesmo resume_version + vaga (cache)
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
            )

        logger.info(
            "analysis.cache_miss",
            resume_version_id=str(command.resume_version_id),
            job_id=str(command.job_id),
        )

        # 5. Busca configurações ativas de IA
        active_model = await self._analysis_repo.find_preferred_ai_model()
        if active_model is None:
            raise ValidationException("Nenhum modelo de IA ativo configurado")

        active_prompt = await self._analysis_repo.find_preferred_prompt_template("full_analysis")

        # 6. Gera chave de idempotência
        idempotency_key = AnalysisVersioningService.build_idempotency_key(
            resume_version_id=command.resume_version_id,
            prompt_template_id=active_prompt.id,
            ai_model_id=active_model.id,
            job_id=command.job_id,
        )
        if command.force_reanalyze:
            import time
            idempotency_key += f":{int(time.time())}"  # força unicidade na re-análise

        # 7. Cria registro de análise
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
        await self._analysis_repo.save(analysis)

        queue_length = await self._analysis_repo.count_pending()
        estimated_wait = max(1, queue_length) * _ESTIMATED_WAIT_SECONDS_PER_POSITION

        logger.info(
            "analysis.requested",
            analysis_id=str(analysis.id),
            resume_version_id=str(command.resume_version_id),
            job_id=str(command.job_id) if command.job_id else None,
            force=command.force_reanalyze,
        )

        return RequestAnalysisResult(
            analysis_id=analysis.id,
            status=analysis.status,
            estimated_wait_seconds=estimated_wait,
            enqueue_required=True,
        )
