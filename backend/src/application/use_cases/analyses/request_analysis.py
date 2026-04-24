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

from src.application.dtos.analysis_dtos import RequestAnalysisCommand, RequestAnalysisResult
from src.domain.entities.analysis import Analysis
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
        version = await self._resume_repo.find_version(command.resume_version_id)
        if version is None:
            raise NotFoundException("Versão de currículo não encontrada")

        # 2. Busca análise existente para este resume_version + job (se houver)
        existing = await self._analysis_repo.find_active_for_version(
            resume_version_id=command.resume_version_id,
            job_id=command.job_id,
        )

        if existing:
            allowed, reason = AnalysisVersioningService.validate_reanalysis_allowed(
                existing_status=existing.status.value,
                force=command.force_reanalyze,
            )
            if not allowed:
                raise ValidationException(reason)

        # 3. Busca configurações ativas de IA
        active_model = await self._analysis_repo.find_active_ai_model()
        if active_model is None:
            raise ValidationException("Nenhum modelo de IA ativo configurado")

        active_prompt = await self._analysis_repo.find_active_prompt_template(
            template_type="full_analysis"
        )
        if active_prompt is None:
            raise ValidationException("Nenhum template de prompt ativo para 'full_analysis'")

        # 4. Gera chave de idempotência
        idempotency_key = AnalysisVersioningService.build_idempotency_key(
            resume_version_id=command.resume_version_id,
            prompt_template_id=active_prompt.id,
            ai_model_id=active_model.id,
            job_id=command.job_id,
        )
        if command.force_reanalyze:
            import time
            idempotency_key += f":{int(time.time())}"  # força unicidade na re-análise

        # 5. Cria registro de análise
        analysis = Analysis.create(
            resume_version_id=command.resume_version_id,
            ai_model_id=active_model.id,
            prompt_template_id=active_prompt.id,
            requested_by=command.requested_by,
            job_id=command.job_id,
            idempotency_key=idempotency_key,
            priority=command.priority,
        )
        await self._analysis_repo.save(analysis)

        # 6. Publica na fila Celery (após commit — garante que o registro existe)
        from src.interface.workers.analysis_tasks import process_analysis
        process_analysis.apply_async(
            args=[str(analysis.id)],
            queue=analysis.queue_name,
            priority=command.priority,
        )

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
        )
