"""IA-assisted behavioral assessment analysis with Gemini.

STRICT GUARDRAILS:
- No approvals/rejections
- No pipeline changes
- No ranking/score changes
- Evidence-based language only (GEMINI)
- Assistive, not decisive
- No clinical/diagnostic language
- No psychological profiles

Only evaluates SUBMITTED assignments.
Reuses completed evaluations by default.
IA failures are non-blocking.
"""

import json
import re
from dataclasses import dataclass
from datetime import timedelta
from datetime import UTC, datetime
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
import structlog
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.application.services.ai_provider_credential_service import (
    AIProviderCredentialService,
    InvalidAIProviderCredentialError,
    normalize_ai_provider,
)
from src.core.settings import settings
from src.core.log_sanitizer import sanitize_log_text
from src.domain.exceptions import ValidationException
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError
from src.infrastructure.database.models import (
    AIProviderCredentialModel,
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentAnswerModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
    CandidateModel,
    JobModel,
)
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_ai_repository import (
    SQLAlchemyBehavioralAssignmentAIRepository,
)

logger = structlog.get_logger(__name__)

_BEHAVIORAL_AI_PROCESSING_STUCK_AFTER = timedelta(minutes=30)
_BEHAVIORAL_AI_PENDING_STALE_AFTER = timedelta(hours=2)
_BEHAVIORAL_AI_RETRY_BACKOFF_SECONDS = {1: 15, 2: 45, 3: 120}
_BEHAVIORAL_AI_MAX_RETRIES = 3
_BEHAVIORAL_AI_RETRY_MESSAGE = "Alta demanda no provedor IA. Nova tentativa automática agendada."
_BEHAVIORAL_AI_RATE_LIMIT_MESSAGE = "Limite temporário do provedor IA. Nova tentativa automática agendada."
_BEHAVIORAL_AI_CREDENTIAL_ERROR_TYPES = {
    "ai_credential_invalid",
    "credential_invalid",
    "invalid_api_key",
    "no_ai_credential_available",
}
_BEHAVIORAL_AI_RATE_LIMIT_ERROR_TYPES = {"rate_limited", "ai_rate_limited"}
_BEHAVIORAL_AI_PROHIBITED_OUTPUT_MARKERS = {
    "api_key",
    "encrypted_api_key",
    "authorization",
    "bearer ",
    "prompt",
    "raw_response",
    "traceback",
    "stack trace",
}
SAFE_BEHAVIORAL_AI_ERROR_MESSAGES = {
    "no_ai_credential_available": "Nenhuma credencial IA ativa está disponível para este provider/modelo.",
    "ai_credential_invalid": "Credencial IA inválida ou indisponível para este provider/modelo.",
    "ai_rate_limited": "Rate limit temporário do provedor IA.",
    "enqueue_failed": "Falha ao enfileirar avaliação comportamental.",
    "behavioral_answers_missing": "O teste comportamental não possui respostas suficientes para análise IA.",
    "evaluation_already_processing": "A IA comportamental já está em andamento.",
    "provider_response_invalid": "O provedor IA retornou uma resposta inválida para análise comportamental.",
    "provider_timeout": "Tempo limite ao chamar o provedor IA.",
    "retry_not_allowed": "Retry não permitido para o estado atual.",
    "unexpected_error": "Erro inesperado ao solicitar IA comportamental.",
}

# Prohibited clinical/diagnostic language
PROHIBITED_TERMS = {
    "ansioso",
    "ansiedade",
    "instável",
    "depressivo",
    "depressão",
    "narcisista",
    "narcisismo",
    "dominante",
    "perfil psicológico",
    "diagnóstico",
    "transtorno",
    "distúrbio",
    "psicopatia",
    "psicose",
}


def behavioral_ai_safe_message(code: str, fallback: str | None = None) -> str:
    return SAFE_BEHAVIORAL_AI_ERROR_MESSAGES.get(code) or fallback or SAFE_BEHAVIORAL_AI_ERROR_MESSAGES["unexpected_error"]


def behavioral_ai_safe_detail(
    code: str,
    *,
    message: str | None = None,
    evaluation_id: UUID | str | None = None,
    retryable: bool | None = None,
    next_retry_at: datetime | None = None,
    provider_status_code: int | None = None,
) -> dict:
    detail: dict[str, object] = {
        "code": code,
        "message": behavioral_ai_safe_message(code, message),
    }
    if evaluation_id is not None:
        detail["evaluation_id"] = str(evaluation_id)
    if retryable is not None:
        detail["retryable"] = retryable
    if next_retry_at is not None:
        detail["next_retry_at"] = next_retry_at.isoformat()
    if provider_status_code is not None:
        detail["provider_status_code"] = provider_status_code
    return detail


@dataclass(slots=True)
class BehavioralAIOperationalError(Exception):
    code: str
    message: str | None = None
    status_code: int = 400
    evaluation_id: UUID | None = None
    retryable: bool | None = None
    next_retry_at: datetime | None = None
    provider_status_code: int | None = None

    def __post_init__(self) -> None:
        Exception.__init__(self, behavioral_ai_safe_message(self.code, self.message))

    def to_detail(self) -> dict:
        return behavioral_ai_safe_detail(
            self.code,
            message=self.message,
            evaluation_id=self.evaluation_id,
            retryable=self.retryable,
            next_retry_at=self.next_retry_at,
            provider_status_code=self.provider_status_code,
        )


class BehavioralAIProviderResponseInvalidError(ValueError):
    """Raised when the provider response cannot be safely used."""


class BehavioralAIEvaluationService:
    """Manages IA evaluation of behavioral assessment responses."""

    def __init__(self, session: AsyncSession, ai_service: AIService | None = None):
        self.session = session
        self.ai_service = ai_service
        self.repository = SQLAlchemyBehavioralAssignmentAIRepository(session)

    async def evaluate_assignment(
        self,
        job_id: UUID,
        candidate_id: UUID,
        assignment_id: UUID,
    ) -> BehavioralAssessmentAIEvaluationModel:
        """
        Trigger IA evaluation of behavioral assignment.

        Returns: stored evaluation record (completed or processing)
        Raises: ValidationException if assignment not submitted or not found
        """
        # Fetch assignment
        assignment = await self._fetch_assignment(assignment_id, job_id, candidate_id)

        # Validate status
        if assignment.status != "submitted":
            raise ValidationException(
                f"Cannot evaluate assignment in '{assignment.status}' status. Only 'submitted' assignments can be evaluated."
            )

        evaluation, should_process = await self._prepare_evaluation_record(
            assignment=assignment,
            retry_failed=True,
            enqueue_mode=False,
        )

        if should_process:
            # Trigger IA evaluation in-process (legacy/service path)
            await self._evaluate_async(evaluation, assignment)

        return evaluation

    async def request_evaluation(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
        assignment_id: UUID,
        retry_failed: bool = False,
    ) -> tuple[BehavioralAssessmentAIEvaluationModel, bool]:
        """Prepare evaluation record and indicate whether worker enqueue is required."""
        assignment = await self._fetch_assignment(assignment_id, job_id, candidate_id)

        if assignment.status != "submitted":
            raise ValidationException(
                f"Cannot evaluate assignment in '{assignment.status}' status. Only 'submitted' assignments can be evaluated."
            )

        evaluation, should_enqueue = await self._prepare_evaluation_record(
            assignment=assignment,
            retry_failed=retry_failed,
            enqueue_mode=True,
        )
        if should_enqueue:
            try:
                await self._ensure_behavioral_answers_available(assignment.id)
                await self._ensure_ai_credentials_available()
            except BehavioralAIOperationalError as exc:
                provider_error_type = "rate_limited" if exc.code == "ai_rate_limited" else exc.code
                await self._save_failed_evaluation(
                    evaluation,
                    behavioral_ai_safe_message(exc.code, exc.message),
                    provider_error_type=provider_error_type,
                    provider_status_code=exc.provider_status_code,
                )
                exc.evaluation_id = evaluation.id
                raise

        return evaluation, should_enqueue

    async def mark_enqueued(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
    ) -> BehavioralAssessmentAIEvaluationModel:
        return await self.repository.mark_queued(evaluation)

    async def mark_enqueue_failed(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        error_message: str = "behavioral_ai_enqueue_failed",
    ) -> BehavioralAssessmentAIEvaluationModel:
        now = datetime.now(UTC)
        evaluation.status = "failed"
        evaluation.error_message = behavioral_ai_safe_message("enqueue_failed")
        evaluation.failed_at = now
        evaluation.started_at = None
        evaluation.next_retry_at = None
        evaluation.provider_error_type = "enqueue_failed"
        evaluation.provider_status_code = None
        evaluation.updated_at = now
        await self.session.flush()
        return evaluation

    async def process_evaluation(
        self,
        *,
        evaluation_id: UUID,
        task_id: str | None = None,
    ) -> BehavioralAssessmentAIEvaluationModel | None:
        if self.ai_service is None:
            raise RuntimeError("AI service is required to process behavioral evaluation")

        evaluation = await self.repository.get_evaluation_by_id(evaluation_id)
        if evaluation is None:
            return None
        if evaluation.status == "completed":
            return evaluation
        if evaluation.status == "processing" and not self._is_stuck(evaluation, now=datetime.now(UTC)):
            return evaluation

        assignment = await self._fetch_assignment(
            assignment_id=evaluation.assignment_id,
            job_id=evaluation.job_id,
            candidate_id=evaluation.candidate_id,
        )
        if assignment.status != "submitted":
            await self._save_failed_evaluation(
                evaluation,
                "Assignment is not submitted for behavioral AI evaluation.",
            )
            return evaluation

        await self._evaluate_async(evaluation, assignment, task_id=task_id)
        refreshed = await self.repository.get_evaluation_by_id(evaluation_id)
        return refreshed or evaluation

    async def get_evaluation_by_id(self, evaluation_id: UUID) -> Optional[BehavioralAssessmentAIEvaluationModel]:
        return await self.repository.get_evaluation_by_id(evaluation_id)

    async def get_evaluation(
        self,
        job_id: UUID,
        candidate_id: UUID,
        assignment_id: UUID,
    ) -> Optional[BehavioralAssessmentAIEvaluationModel]:
        """Fetch evaluation record if exists."""
        return await self.repository.get_evaluation(assignment_id)

    async def list_stuck_behavioral_ai_evaluations(
        self,
        *,
        limit: int = 200,
    ) -> list[BehavioralAssessmentAIEvaluationModel]:
        now = datetime.now(UTC)
        processing_threshold = now - _BEHAVIORAL_AI_PROCESSING_STUCK_AFTER
        pending_threshold = now - _BEHAVIORAL_AI_PENDING_STALE_AFTER

        stmt = (
            sa.select(BehavioralAssessmentAIEvaluationModel)
            .where(
                sa.or_(
                    sa.and_(
                        BehavioralAssessmentAIEvaluationModel.status == "processing",
                        sa.or_(
                            BehavioralAssessmentAIEvaluationModel.started_at < processing_threshold,
                            sa.and_(
                                BehavioralAssessmentAIEvaluationModel.started_at.is_(None),
                                BehavioralAssessmentAIEvaluationModel.updated_at < processing_threshold,
                            ),
                        ),
                    ),
                    sa.and_(
                        BehavioralAssessmentAIEvaluationModel.status == "pending",
                        BehavioralAssessmentAIEvaluationModel.updated_at < pending_threshold,
                    ),
                    sa.and_(
                        BehavioralAssessmentAIEvaluationModel.status == "retry_scheduled",
                        BehavioralAssessmentAIEvaluationModel.next_retry_at.is_not(None),
                        BehavioralAssessmentAIEvaluationModel.next_retry_at <= now,
                    ),
                )
            )
            .order_by(BehavioralAssessmentAIEvaluationModel.updated_at.asc())
            .limit(max(1, min(limit, 1000)))
        )
        result = await self.session.execute(stmt)
        stuck = list(result.scalars().all())
        for evaluation in stuck:
            logger.warning(
                "behavioral_ai.stuck_detected",
                evaluation_id=str(evaluation.id),
                assignment_id=str(evaluation.assignment_id),
                status=evaluation.status,
                started_at=evaluation.started_at.isoformat() if evaluation.started_at else None,
                updated_at=evaluation.updated_at.isoformat() if evaluation.updated_at else None,
            )
        return stuck

    async def mark_stuck_as_failed(
        self,
        *,
        limit: int = 200,
        stuck_evaluations: list[BehavioralAssessmentAIEvaluationModel] | None = None,
    ) -> int:
        now = datetime.now(UTC)
        stuck = (
            stuck_evaluations
            if stuck_evaluations is not None
            else await self.list_stuck_behavioral_ai_evaluations(limit=limit)
        )
        for evaluation in stuck:
            if evaluation.status == "processing":
                reason = "behavioral_ai_stuck_processing_timeout"
            elif evaluation.status == "retry_scheduled":
                reason = "behavioral_ai_retry_scheduled_timeout"
            else:
                reason = "behavioral_ai_stale_pending_timeout"
            evaluation.status = "failed"
            evaluation.error_message = reason
            evaluation.failed_at = now
            evaluation.updated_at = now
        if stuck:
            await self.session.flush()
        return len(stuck)

    async def retry_failed_or_stuck(
        self,
        *,
        evaluation_id: UUID,
    ) -> tuple[BehavioralAssessmentAIEvaluationModel, bool]:
        evaluation = await self.repository.get_evaluation_by_id(evaluation_id)
        if evaluation is None:
            raise ValidationException("Behavioral AI evaluation not found")

        is_stuck = self._is_stuck(evaluation, now=datetime.now(UTC))
        if evaluation.status == "completed":
            raise ValidationException("Completed evaluation cannot be retried")
        if evaluation.status in {"pending", "processing"} and not is_stuck:
            logger.info(
                "behavioral_ai.enqueue_skipped_existing_status",
                evaluation_id=str(evaluation.id),
                assignment_id=str(evaluation.assignment_id),
                status=evaluation.status,
            )
            return evaluation, False
        if evaluation.status not in {"failed", "pending", "processing"} and not is_stuck:
            raise ValidationException(f"Retry not allowed for status '{evaluation.status}'")

        logger.info(
            "behavioral_ai.retry_requested",
            evaluation_id=str(evaluation.id),
            assignment_id=str(evaluation.assignment_id),
            status=evaluation.status,
            stuck=is_stuck,
        )
        await self.repository.mark_pending_for_retry(evaluation)
        return evaluation, True

    async def get_operational_metrics(self) -> dict[str, int]:
        now = datetime.now(UTC)
        last_24h = now - timedelta(hours=24)

        pending_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.status == "pending"
        )
        retry_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.status == "retry_scheduled"
        )
        processing_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.status == "processing"
        )
        completed_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.status == "completed",
            BehavioralAssessmentAIEvaluationModel.completed_at >= last_24h,
        )
        failed_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.status == "failed",
            sa.func.coalesce(
                BehavioralAssessmentAIEvaluationModel.failed_at,
                BehavioralAssessmentAIEvaluationModel.updated_at,
            )
            >= last_24h,
        )
        stuck_count_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            sa.or_(
                sa.and_(
                    BehavioralAssessmentAIEvaluationModel.status == "processing",
                    sa.or_(
                        BehavioralAssessmentAIEvaluationModel.started_at
                        < (now - _BEHAVIORAL_AI_PROCESSING_STUCK_AFTER),
                        sa.and_(
                            BehavioralAssessmentAIEvaluationModel.started_at.is_(None),
                            BehavioralAssessmentAIEvaluationModel.updated_at
                            < (now - _BEHAVIORAL_AI_PROCESSING_STUCK_AFTER),
                        ),
                    ),
                ),
                sa.and_(
                    BehavioralAssessmentAIEvaluationModel.status == "pending",
                    BehavioralAssessmentAIEvaluationModel.updated_at < (now - _BEHAVIORAL_AI_PENDING_STALE_AFTER),
                ),
                sa.and_(
                    BehavioralAssessmentAIEvaluationModel.status == "retry_scheduled",
                    BehavioralAssessmentAIEvaluationModel.next_retry_at.is_not(None),
                    BehavioralAssessmentAIEvaluationModel.next_retry_at <= now,
                ),
            )
        )
        rate_limited_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.provider_error_type.in_(_BEHAVIORAL_AI_RATE_LIMIT_ERROR_TYPES)
        )
        credential_invalid_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.provider_error_type.in_(_BEHAVIORAL_AI_CREDENTIAL_ERROR_TYPES)
        )
        next_retries_stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.status == "retry_scheduled",
            BehavioralAssessmentAIEvaluationModel.next_retry_at.is_not(None),
            BehavioralAssessmentAIEvaluationModel.next_retry_at > now,
        )

        pending = int((await self.session.scalar(pending_stmt)) or 0)
        retry_scheduled = int((await self.session.scalar(retry_stmt)) or 0)
        processing = int((await self.session.scalar(processing_stmt)) or 0)
        completed_24h = int((await self.session.scalar(completed_stmt)) or 0)
        failed_24h = int((await self.session.scalar(failed_stmt)) or 0)
        stuck = int((await self.session.scalar(stuck_count_stmt)) or 0)
        rate_limited = int((await self.session.scalar(rate_limited_stmt)) or 0)
        credential_invalid = int((await self.session.scalar(credential_invalid_stmt)) or 0)
        next_retries = int((await self.session.scalar(next_retries_stmt)) or 0)

        return {
            "pending": pending,
            "processing": processing,
            "retry_scheduled": retry_scheduled,
            "completed_last_24h": completed_24h,
            "failed_last_24h": failed_24h,
            "rate_limited": rate_limited,
            "credential_invalid": credential_invalid,
            "next_retries": next_retries,
            "stuck": stuck,
        }

    async def list_operational_evaluations(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None,
        operational_status: str | None = None,
        candidate_id: UUID | None = None,
        job_id: UUID | None = None,
        provider: str | None = None,
        model: str | None = None,
        provider_error_type: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        filters: list[sa.ColumnElement] = []
        if status_filter:
            filters.append(BehavioralAssessmentAIEvaluationModel.status == status_filter)
        if candidate_id is not None:
            filters.append(BehavioralAssessmentAIEvaluationModel.candidate_id == candidate_id)
        if job_id is not None:
            filters.append(BehavioralAssessmentAIEvaluationModel.job_id == job_id)
        if provider:
            filters.append(BehavioralAssessmentAIEvaluationModel.provider == provider.strip())
        if model:
            filters.append(BehavioralAssessmentAIEvaluationModel.model == model.strip())
        if provider_error_type:
            filters.append(BehavioralAssessmentAIEvaluationModel.provider_error_type == provider_error_type.strip())
        if date_from is not None:
            filters.append(BehavioralAssessmentAIEvaluationModel.created_at >= date_from)
        if date_to is not None:
            filters.append(BehavioralAssessmentAIEvaluationModel.created_at <= date_to)
        if operational_status:
            filters.extend(self._operational_status_filters(operational_status))
        if search:
            term = f"%{search.lower().strip()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(CandidateModel.full_name).like(term),
                    sa.func.lower(CandidateModel.email).like(term),
                    sa.func.lower(JobModel.title).like(term),
                )
            )

        total = int(
            (
                await self.session.scalar(
                    sa.select(sa.func.count())
                    .select_from(BehavioralAssessmentAIEvaluationModel)
                    .join(CandidateModel, CandidateModel.id == BehavioralAssessmentAIEvaluationModel.candidate_id)
                    .join(JobModel, JobModel.id == BehavioralAssessmentAIEvaluationModel.job_id)
                    .where(*filters)
                )
            )
            or 0
        )
        offset = (page - 1) * page_size
        result = await self.session.execute(
            sa.select(
                BehavioralAssessmentAIEvaluationModel.id,
                BehavioralAssessmentAIEvaluationModel.assignment_id,
                BehavioralAssessmentAIEvaluationModel.job_id,
                JobModel.title.label("job_title"),
                BehavioralAssessmentAIEvaluationModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.email.label("candidate_email"),
                BehavioralAssessmentAIEvaluationModel.status,
                BehavioralAssessmentAIEvaluationModel.error_message,
                BehavioralAssessmentAIEvaluationModel.requested_at,
                BehavioralAssessmentAIEvaluationModel.provider,
                BehavioralAssessmentAIEvaluationModel.model,
                BehavioralAssessmentAIEvaluationModel.retry_count,
                BehavioralAssessmentAIEvaluationModel.queued_at,
                BehavioralAssessmentAIEvaluationModel.started_at,
                BehavioralAssessmentAIEvaluationModel.completed_at,
                BehavioralAssessmentAIEvaluationModel.failed_at,
                BehavioralAssessmentAIEvaluationModel.next_retry_at,
                BehavioralAssessmentAIEvaluationModel.provider_error_type,
                BehavioralAssessmentAIEvaluationModel.provider_status_code,
                BehavioralAssessmentAIEvaluationModel.created_at,
                BehavioralAssessmentAIEvaluationModel.updated_at,
            )
            .select_from(BehavioralAssessmentAIEvaluationModel)
            .join(CandidateModel, CandidateModel.id == BehavioralAssessmentAIEvaluationModel.candidate_id)
            .join(JobModel, JobModel.id == BehavioralAssessmentAIEvaluationModel.job_id)
            .where(*filters)
            .order_by(BehavioralAssessmentAIEvaluationModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        rows = []
        now = datetime.now(UTC)
        for row in result.mappings().all():
            item = self._to_operational_item(dict(row), now=now)
            rows.append(item)
        return rows, total

    async def get_operational_evaluation_detail(self, evaluation_id: UUID) -> dict | None:
        result = await self.session.execute(
            sa.select(
                BehavioralAssessmentAIEvaluationModel.id,
                BehavioralAssessmentAIEvaluationModel.assignment_id,
                BehavioralAssessmentAIEvaluationModel.job_id,
                JobModel.title.label("job_title"),
                BehavioralAssessmentAIEvaluationModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.email.label("candidate_email"),
                BehavioralAssessmentAIEvaluationModel.status,
                BehavioralAssessmentAIEvaluationModel.error_message,
                BehavioralAssessmentAIEvaluationModel.requested_at,
                BehavioralAssessmentAIEvaluationModel.provider,
                BehavioralAssessmentAIEvaluationModel.model,
                BehavioralAssessmentAIEvaluationModel.prompt_version,
                BehavioralAssessmentAIEvaluationModel.retry_count,
                BehavioralAssessmentAIEvaluationModel.queued_at,
                BehavioralAssessmentAIEvaluationModel.started_at,
                BehavioralAssessmentAIEvaluationModel.completed_at,
                BehavioralAssessmentAIEvaluationModel.failed_at,
                BehavioralAssessmentAIEvaluationModel.next_retry_at,
                BehavioralAssessmentAIEvaluationModel.provider_error_type,
                BehavioralAssessmentAIEvaluationModel.provider_status_code,
                BehavioralAssessmentAIEvaluationModel.confidence,
                BehavioralAssessmentAIEvaluationModel.summary,
                BehavioralAssessmentAIEvaluationModel.created_at,
                BehavioralAssessmentAIEvaluationModel.updated_at,
            )
            .select_from(BehavioralAssessmentAIEvaluationModel)
            .join(CandidateModel, CandidateModel.id == BehavioralAssessmentAIEvaluationModel.candidate_id)
            .join(JobModel, JobModel.id == BehavioralAssessmentAIEvaluationModel.job_id)
            .where(BehavioralAssessmentAIEvaluationModel.id == evaluation_id)
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        item = self._to_operational_item(dict(row), now=datetime.now(UTC))
        item["prompt_version"] = int(row["prompt_version"] or 1)
        if row["status"] == "completed":
            item["confidence"] = row["confidence"]
            item["summary"] = row["summary"]
        else:
            item["confidence"] = None
            item["summary"] = None
        return item

    # Private methods

    @classmethod
    def _to_operational_item(cls, row: dict, *, now: datetime) -> dict:
        stuck = cls._is_stuck(row, now=now)
        operational_status = cls._derive_operational_status(
            status=row.get("status"),
            provider_error_type=row.get("provider_error_type"),
        )
        can_retry, retry_allowed_reason = cls._retry_capability(
            status=row.get("status"),
            provider_error_type=row.get("provider_error_type"),
            stuck=stuck,
            next_retry_at=row.get("next_retry_at"),
            now=now,
        )
        evaluation_id = row["id"]
        return {
            "id": evaluation_id,
            "evaluation_id": evaluation_id,
            "assignment_id": row["assignment_id"],
            "candidate_id": row["candidate_id"],
            "candidate_name": row["candidate_name"],
            "candidate_email": row.get("candidate_email"),
            "job_id": row["job_id"],
            "job_title": row["job_title"],
            "type": "behavioral_ai",
            "status": row["status"],
            "operational_status": operational_status,
            "provider": row["provider"],
            "model": row["model"],
            "retry_count": int(row.get("retry_count") or 0),
            "can_retry": can_retry,
            "retry_allowed_reason": retry_allowed_reason,
            "requested_at": row.get("requested_at"),
            "queued_at": row.get("queued_at"),
            "started_at": row.get("started_at"),
            "completed_at": row.get("completed_at"),
            "failed_at": row.get("failed_at"),
            "next_retry_at": row.get("next_retry_at"),
            "provider_error_type": row.get("provider_error_type"),
            "provider_status_code": row.get("provider_status_code"),
            "safe_error_message": cls._safe_output_error(
                row.get("error_message"),
                provider_error_type=row.get("provider_error_type"),
            ),
            "stuck": stuck,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _derive_operational_status(*, status: str | None, provider_error_type: str | None) -> str:
        error_type = (provider_error_type or "").strip()
        if error_type in _BEHAVIORAL_AI_CREDENTIAL_ERROR_TYPES:
            return "credential_invalid"
        if error_type in _BEHAVIORAL_AI_RATE_LIMIT_ERROR_TYPES:
            return "rate_limited"
        if status in {"pending", "processing", "retry_scheduled", "completed", "failed"}:
            return status
        return "failed"

    @classmethod
    def _retry_capability(
        cls,
        *,
        status: str | None,
        provider_error_type: str | None,
        stuck: bool,
        next_retry_at: datetime | None,
        now: datetime,
    ) -> tuple[bool, str | None]:
        error_type = (provider_error_type or "").strip()
        if status == "completed":
            return False, "completed"
        if error_type in _BEHAVIORAL_AI_CREDENTIAL_ERROR_TYPES:
            return False, "credential_action_required"
        if status in {"pending", "processing"}:
            return (True, "stuck") if stuck else (False, "already_in_progress")
        if status == "retry_scheduled":
            if stuck:
                return True, "retry_due"
            if next_retry_at is not None and cls._comparable(next_retry_at) > cls._comparable(now):
                return False, "waiting_next_retry"
            return False, "retry_not_due"
        if status == "failed":
            return True, "failed"
        return False, "retry_not_allowed"

    @staticmethod
    def _safe_output_error(error_message: str | None, *, provider_error_type: str | None) -> str | None:
        if not error_message:
            return None
        sanitized = sanitize_log_text(str(error_message)) or ""
        lower = sanitized.lower()
        if any(marker in lower for marker in _BEHAVIORAL_AI_PROHIBITED_OUTPUT_MARKERS):
            return BehavioralAIEvaluationService._safe_failure_message(provider_error_type or "unexpected_error")
        return sanitized[:500]

    @staticmethod
    def _operational_status_filters(operational_status: str) -> list[sa.ColumnElement]:
        value = operational_status.strip()
        if value == "credential_invalid":
            return [BehavioralAssessmentAIEvaluationModel.provider_error_type.in_(_BEHAVIORAL_AI_CREDENTIAL_ERROR_TYPES)]
        if value == "rate_limited":
            return [BehavioralAssessmentAIEvaluationModel.provider_error_type.in_(_BEHAVIORAL_AI_RATE_LIMIT_ERROR_TYPES)]
        if value in {"pending", "processing", "retry_scheduled", "completed", "failed"}:
            return [
                BehavioralAssessmentAIEvaluationModel.status == value,
                sa.or_(
                    BehavioralAssessmentAIEvaluationModel.provider_error_type.is_(None),
                    BehavioralAssessmentAIEvaluationModel.provider_error_type.not_in(
                        _BEHAVIORAL_AI_CREDENTIAL_ERROR_TYPES | _BEHAVIORAL_AI_RATE_LIMIT_ERROR_TYPES
                    ),
                ),
            ]
        return [sa.false()]

    @staticmethod
    def _comparable(timestamp: datetime) -> datetime:
        if timestamp.tzinfo is None:
            return timestamp.replace(tzinfo=UTC)
        return timestamp

    @staticmethod
    def _is_stuck(
        evaluation,
        *,
        now: datetime,
    ) -> bool:
        def value(name: str):
            if isinstance(evaluation, dict):
                return evaluation.get(name)
            try:
                return evaluation[name]
            except Exception:
                return getattr(evaluation, name)

        def comparable(timestamp: datetime | None) -> datetime | None:
            if timestamp is None:
                return None
            if timestamp.tzinfo is None:
                return timestamp.replace(tzinfo=UTC)
            return timestamp

        status = value("status")
        if status == "processing":
            reference = comparable(value("started_at") or value("updated_at"))
            if reference is None:
                return False
            return reference < (now - _BEHAVIORAL_AI_PROCESSING_STUCK_AFTER)
        if status == "retry_scheduled":
            next_retry_at = comparable(value("next_retry_at"))
            return next_retry_at is not None and next_retry_at <= now
        if status == "pending":
            updated_at = comparable(value("updated_at"))
            return updated_at is not None and updated_at < (now - _BEHAVIORAL_AI_PENDING_STALE_AFTER)
        return False

    async def _fetch_assignment(
        self,
        assignment_id: UUID,
        job_id: UUID,
        candidate_id: UUID,
    ) -> BehavioralAssessmentAssignmentModel:
        """Fetch and validate assignment."""
        import sqlalchemy as sa

        stmt = sa.select(BehavioralAssessmentAssignmentModel).where(
            BehavioralAssessmentAssignmentModel.id == assignment_id,
            BehavioralAssessmentAssignmentModel.job_id == job_id,
            BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
        )
        result = await self.session.execute(stmt)
        assignment = result.scalar_one_or_none()

        if not assignment:
            raise ValidationException("Behavioral assignment not found")

        return assignment

    async def _prepare_evaluation_record(
        self,
        *,
        assignment: BehavioralAssessmentAssignmentModel,
        retry_failed: bool,
        enqueue_mode: bool,
    ) -> tuple[BehavioralAssessmentAIEvaluationModel, bool]:
        existing = await self.repository.get_evaluation(assignment.id)
        if existing is not None:
            if existing.status == "completed":
                logger.info(
                    "behavioral_ai.enqueue_skipped_existing_status",
                    assignment_id=str(assignment.id),
                    evaluation_id=str(existing.id),
                    status=existing.status,
                )
                return existing, False
            if existing.status == "processing":
                if self._is_stuck(existing, now=datetime.now(UTC)):
                    logger.info(
                        "behavioral_ai.retry_requested",
                        assignment_id=str(assignment.id),
                        evaluation_id=str(existing.id),
                        status=existing.status,
                        stuck=True,
                    )
                    await self.repository.mark_pending_for_retry(existing)
                    return existing, True
                logger.info(
                    "behavioral_ai.enqueue_skipped_existing_status",
                    assignment_id=str(assignment.id),
                    evaluation_id=str(existing.id),
                    status=existing.status,
                )
                return existing, False
            if existing.status == "retry_scheduled":
                if self._is_stuck(existing, now=datetime.now(UTC)):
                    await self.repository.mark_pending_for_retry(existing)
                    return existing, True
                logger.info(
                    "behavioral_ai.enqueue_skipped_existing_status",
                    assignment_id=str(assignment.id),
                    evaluation_id=str(existing.id),
                    status=existing.status,
                )
                return existing, False
            if existing.status == "pending" and enqueue_mode:
                if self._is_stuck(existing, now=datetime.now(UTC)):
                    logger.info(
                        "behavioral_ai.retry_requested",
                        assignment_id=str(assignment.id),
                        evaluation_id=str(existing.id),
                        status=existing.status,
                        stuck=True,
                    )
                    await self.repository.mark_pending_for_retry(existing)
                    return existing, True
                logger.info(
                    "behavioral_ai.enqueue_skipped_existing_status",
                    assignment_id=str(assignment.id),
                    evaluation_id=str(existing.id),
                    status=existing.status,
                )
                return existing, False
            if existing.status == "failed":
                if not retry_failed:
                    logger.info(
                        "behavioral_ai.enqueue_skipped_existing_status",
                        assignment_id=str(assignment.id),
                        evaluation_id=str(existing.id),
                        status=existing.status,
                    )
                    return existing, False
                logger.info(
                    "behavioral_ai.retry_requested",
                    assignment_id=str(assignment.id),
                    evaluation_id=str(existing.id),
                    status=existing.status,
                )
                await self.repository.mark_pending_for_retry(existing)
                return existing, True
            logger.info(
                "behavioral_ai.enqueue_skipped_existing_status",
                assignment_id=str(assignment.id),
                evaluation_id=str(existing.id),
                status=existing.status,
            )
            return existing, False

        created = await self.repository.create_evaluation(
            assignment_id=assignment.id,
            candidate_id=assignment.candidate_id,
            job_id=assignment.job_id,
            template_id=assignment.template_id,
            provider=normalize_ai_provider(settings.AI_PROVIDER),
            model=settings.AI_MODEL_ID,
        )
        return created, True

    async def _ensure_behavioral_answers_available(self, assignment_id: UUID) -> None:
        stmt = sa.select(sa.func.count()).select_from(BehavioralAssessmentAnswerModel).where(
            BehavioralAssessmentAnswerModel.assignment_id == assignment_id,
            sa.or_(
                sa.and_(
                    BehavioralAssessmentAnswerModel.answer_text.is_not(None),
                    sa.func.length(sa.func.trim(BehavioralAssessmentAnswerModel.answer_text)) > 0,
                ),
                BehavioralAssessmentAnswerModel.answer_value.is_not(None),
                BehavioralAssessmentAnswerModel.selected_options_json.is_not(None),
            ),
        )
        count = int((await self.session.scalar(stmt)) or 0)
        if count <= 0:
            raise BehavioralAIOperationalError(
                code="behavioral_answers_missing",
                status_code=400,
                retryable=True,
            )

    async def _ensure_ai_credentials_available(self) -> None:
        try:
            provider = normalize_ai_provider(settings.AI_PROVIDER)
        except InvalidAIProviderCredentialError as exc:
            raise BehavioralAIOperationalError(
                code="ai_credential_invalid",
                status_code=409,
                retryable=False,
            ) from exc

        model_id = settings.AI_MODEL_ID
        credential_service = AIProviderCredentialService(self.session)
        configured_count = await credential_service.count_matching_credentials(
            provider=provider,
            model_id=model_id,
        )
        if configured_count <= 0:
            raise BehavioralAIOperationalError(
                code="no_ai_credential_available",
                status_code=409,
                retryable=True,
            )

        next_retry_at = await self._next_ai_credential_cooldown(provider=provider, model_id=model_id)
        try:
            available_credentials = await credential_service.get_available_credentials(
                provider=provider,
                model_id=model_id,
            )
        except InvalidAIProviderCredentialError as exc:
            raise BehavioralAIOperationalError(
                code="ai_credential_invalid",
                status_code=409,
                retryable=False,
            ) from exc
        except Exception as exc:
            logger.warning(
                "behavioral_ai.credential_preflight_failed",
                provider=provider,
                model=model_id,
                error_type=type(exc).__name__,
            )
            raise BehavioralAIOperationalError(
                code="ai_credential_invalid",
                status_code=409,
                retryable=False,
            ) from exc

        if available_credentials:
            return

        if next_retry_at is not None:
            raise BehavioralAIOperationalError(
                code="ai_rate_limited",
                status_code=429,
                retryable=True,
                next_retry_at=next_retry_at,
                provider_status_code=429,
            )

        raise BehavioralAIOperationalError(
            code="ai_credential_invalid",
            status_code=409,
            retryable=False,
        )

    async def _next_ai_credential_cooldown(
        self,
        *,
        provider: str,
        model_id: str | None,
    ) -> datetime | None:
        now = datetime.now(UTC)
        stmt = sa.select(sa.func.min(AIProviderCredentialModel.cooldown_until)).where(
            AIProviderCredentialModel.provider == provider,
            AIProviderCredentialModel.status == "rate_limited",
            AIProviderCredentialModel.cooldown_until.is_not(None),
            AIProviderCredentialModel.cooldown_until > now,
        )
        if model_id is not None:
            stmt = stmt.where(
                sa.or_(
                    AIProviderCredentialModel.model_id.is_(None),
                    AIProviderCredentialModel.model_id == model_id,
                )
            )
        return await self.session.scalar(stmt)

    async def _evaluate_async(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        assignment: BehavioralAssessmentAssignmentModel,
        *,
        task_id: str | None = None,
    ) -> None:
        """Execute IA evaluation using Gemini (non-blocking)."""
        if self.ai_service is None:
            raise RuntimeError("AI service is required to run behavioral evaluation")
        try:
            now = datetime.now(UTC)
            # Update status to processing
            evaluation.status = "processing"
            evaluation.started_at = evaluation.started_at or now
            evaluation.failed_at = None
            evaluation.next_retry_at = None
            evaluation.provider_error_type = None
            evaluation.provider_status_code = None
            evaluation.task_id = task_id or evaluation.task_id
            evaluation.updated_at = now
            logger.info(
                "behavioral_ai.task_started",
                evaluation_id=str(evaluation.id),
                assignment_id=str(assignment.id),
                task_id=evaluation.task_id,
                retry_count=int(evaluation.retry_count or 0),
            )
            await self.session.commit()

            # Fetch competencies, questions, answers
            competencies = await self._fetch_competencies(assignment.template_id)
            questions_and_answers = await self._fetch_questions_with_answers(assignment.id)

            # Build prompt with all context
            prompt_text = self._build_evaluation_prompt(
                assignment=assignment,
                competencies=competencies,
                questions_and_answers=questions_and_answers,
            )

            # Call Gemini API via AIService
            ai_request = AIAnalysisRequest(
                resume_text="",  # Not used for behavioral analysis
                prompt_template=prompt_text,
                system_prompt="Você é um especialista em análise comportamental assistida por IA para recrutamento. Forneça análise baseada em evidências, sem fazer julgamentos, diagnósticos ou decisões de contratação.",
                max_tokens=2000,
                temperature=0.7,
                job_description=None,
            )

            ai_response = await self.ai_service.analyze(ai_request)
            response_text = ai_response.content

            # Check for prohibited language before parsing
            if self._contains_prohibited_language(response_text):
                raise BehavioralAIProviderResponseInvalidError("provider_response_invalid")

            # Parse and validate response
            evaluation_data = self._parse_evaluation_response(response_text)

            # Save completed evaluation
            await self._save_completed_evaluation(
                evaluation=evaluation,
                data=evaluation_data,
                provider=settings.AI_PROVIDER,
                model=settings.AI_MODEL_ID,
            )

        except (AIProviderRateLimitedError, httpx.TimeoutException, httpx.ConnectError, httpx.HTTPStatusError) as e:
            retry_count = int(evaluation.retry_count or 0) + 1
            provider_error_type = self._provider_error_type(e)
            if self._is_retryable_provider_error(provider_error_type) and retry_count <= _BEHAVIORAL_AI_MAX_RETRIES:
                await self._save_retry_scheduled_evaluation(
                    evaluation,
                    e,
                    retry_count=retry_count,
                    task_id=task_id or evaluation.task_id,
                )
                raise

            await self._save_failed_evaluation(
                evaluation,
                self._safe_failure_message(provider_error_type),
                provider_error_type=provider_error_type,
                provider_status_code=self._provider_status_code(e),
            )
        except Exception as e:
            provider_error_type = self._classify_unexpected_failure(e)
            error_msg = self._safe_failure_message(provider_error_type)
            logger.error(
                "behavioral_ai.task_failed",
                evaluation_id=str(evaluation.id),
                assignment_id=str(assignment.id),
                task_id=task_id or evaluation.task_id,
                error_type=type(e).__name__,
                provider_error_type=provider_error_type,
            )
            await self._save_failed_evaluation(
                evaluation,
                error_msg,
                provider_error_type=provider_error_type,
                provider_status_code=None,
            )

    async def _fetch_competencies(
        self, template_id: UUID
    ) -> list[BehavioralTemplateCompetencyModel]:
        """Fetch template competencies."""
        import sqlalchemy as sa

        stmt = (
            sa.select(BehavioralTemplateCompetencyModel)
            .where(BehavioralTemplateCompetencyModel.template_id == template_id)
            .order_by(BehavioralTemplateCompetencyModel.display_order)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def _fetch_questions_with_answers(
        self, assignment_id: UUID
    ) -> list[dict]:
        """Fetch questions with answers for assignment."""
        import sqlalchemy as sa

        stmt = (
            sa.select(
                BehavioralTemplateQuestionModel,
                BehavioralTemplateCompetencyModel,
                BehavioralAssessmentAnswerModel,
            )
            .join(
                BehavioralTemplateCompetencyModel,
                BehavioralTemplateQuestionModel.competency_id
                == BehavioralTemplateCompetencyModel.id,
            )
            .outerjoin(
                BehavioralAssessmentAnswerModel,
                (BehavioralAssessmentAnswerModel.question_id == BehavioralTemplateQuestionModel.id)
                & (BehavioralAssessmentAnswerModel.assignment_id == assignment_id),
            )
            .order_by(
                BehavioralTemplateCompetencyModel.display_order,
                BehavioralTemplateQuestionModel.display_order,
            )
        )

        result = await self.session.execute(stmt)
        rows = result.all()

        qa_list = []
        for question, competency, answer in rows:
            answer_text = None
            if answer:
                if answer.answer_text:
                    answer_text = answer.answer_text
                elif answer.answer_value is not None:
                    answer_text = str(answer.answer_value)
                elif answer.selected_options_json:
                    answer_text = ", ".join(answer.selected_options_json)

            qa_list.append({
                "competency": competency.name,
                "question": question.question_text,
                "answer_type": question.answer_type,
                "answer": answer_text or "[No answer provided]",
            })

        return qa_list

    def _contains_prohibited_language(self, text: str) -> bool:
        """Check if text contains prohibited clinical/diagnostic terms."""
        text_lower = text.lower()
        for term in PROHIBITED_TERMS:
            if term in text_lower:
                logger.warning(f"Prohibited term detected: {term}")
                return True
        return False

    def _build_evaluation_prompt(
        self,
        assignment,
        competencies,
        questions_and_answers,
    ) -> str:
        """Build prompt for Gemini with strict guardrails."""
        qa_text = "\n".join([
            f"- **{qa['competency']} ({qa['answer_type']})**: {qa['question']}\n"
            f"  Answer: {qa['answer']}"
            for qa in questions_and_answers
        ])

        competencies_text = ", ".join([c.name for c in competencies])

        prompt = f"""Você é um especialista em análise comportamental assistida por IA para processos de recrutamento.

Sua tarefa é ANÁLISE ASSISTIDA, não tomada de decisão. A análise deve ajudar o recrutador a entender o candidato melhor.

RESPOSTAS COMPORTAMENTAIS DO CANDIDATO:
{qa_text}

COMPETÊNCIAS DO TEMPLATE: {competencies_text}

INSTRUÇÕES CRÍTICAS:
1. Proibido: aprovar, reprovar, fazer diagnósticos, usar linguagem clínica
2. Obrigatório: usar linguagem baseada em evidências ("há sinal de...", "não há evidência suficiente...")
3. Forneça sinais por competência, não notas
4. Identifique pontos a validar na entrevista
5. Marque respostas insuficientes
6. Não calcule score eliminatório

Responda com JSON válido neste formato exato:
{{
  "confidence": "low|medium|high",
  "summary": "Resumo operacional curto do perfil comportamental",
  "competency_signals": [
    {{
      "competency": "Nome da Competência",
      "signal": "weak|moderate|strong",
      "evidence": "Descrição baseada nas respostas fornecidas",
      "concerns": ["Ponto a validar", "Outro ponto"]
    }}
  ],
  "strengths": ["Força identificada", "Outra força"],
  "concerns": ["Ponto de atenção", "Outro ponto"],
  "suggested_interview_questions": ["Pergunta 1", "Pergunta 2"],
  "risk_flags": [
    {{
      "code": "insufficient_evidence|unexpected_pattern",
      "message": "Descrição do risco ou limitação da análise"
    }}
  ]
}}
"""
        return prompt

    def _parse_evaluation_response(self, response_text: str) -> dict:
        """Parse and validate IA response."""
        try:
            # Extract JSON from response
            json_str = response_text
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0]

            data = json.loads(json_str.strip())

            # Validate required fields
            if not isinstance(data.get("confidence"), str) or data["confidence"] not in ["low", "medium", "high"]:
                raise BehavioralAIProviderResponseInvalidError("Invalid confidence level")

            if not isinstance(data.get("summary"), str):
                raise BehavioralAIProviderResponseInvalidError("Summary is required")

            if not isinstance(data.get("competency_signals"), list):
                raise BehavioralAIProviderResponseInvalidError("competency_signals must be a list")

            return data

        except json.JSONDecodeError as e:
            raise BehavioralAIProviderResponseInvalidError("Invalid JSON in IA response") from e

    async def _save_completed_evaluation(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        data: dict,
        provider: str,
        model: str | None = None,
    ) -> None:
        """Save completed evaluation with provider/model info."""
        evaluation.status = "completed"
        evaluation.provider = provider
        evaluation.model = model or settings.AI_MODEL_ID
        evaluation.confidence = data.get("confidence")
        evaluation.summary = data.get("summary")
        evaluation.strengths_json = data.get("strengths", [])
        evaluation.concerns_json = data.get("concerns", [])
        evaluation.competency_signals_json = data.get("competency_signals", [])
        evaluation.suggested_interview_questions_json = data.get("suggested_interview_questions", [])
        evaluation.risk_flags_json = data.get("risk_flags", [])
        evaluation.error_message = None
        evaluation.next_retry_at = None
        evaluation.provider_error_type = None
        evaluation.provider_status_code = None
        now = datetime.now(UTC)
        evaluation.completed_at = now
        evaluation.failed_at = None
        evaluation.updated_at = now

        await self.session.commit()
        logger.info(
            "behavioral_ai.task_completed",
            evaluation_id=str(evaluation.id),
            assignment_id=str(evaluation.assignment_id),
            status=evaluation.status,
            provider=provider,
            model=model or settings.AI_MODEL_ID,
        )

    async def _save_retry_scheduled_evaluation(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        exc: Exception,
        *,
        retry_count: int,
        task_id: str | None,
    ) -> None:
        now = datetime.now(UTC)
        retry_after_seconds = self._retry_after_seconds(exc, retry_count=retry_count)
        provider_error_type = self._provider_error_type(exc)
        evaluation.status = "retry_scheduled"
        evaluation.error_message = (
            _BEHAVIORAL_AI_RATE_LIMIT_MESSAGE
            if provider_error_type == "rate_limited"
            else _BEHAVIORAL_AI_RETRY_MESSAGE
        )
        evaluation.retry_count = retry_count
        evaluation.task_id = task_id or evaluation.task_id
        evaluation.started_at = None
        evaluation.failed_at = None
        evaluation.next_retry_at = now + timedelta(seconds=retry_after_seconds)
        evaluation.provider_error_type = provider_error_type
        evaluation.provider_status_code = self._provider_status_code(exc)
        evaluation.updated_at = now
        await self.session.commit()
        logger.warning(
            "behavioral_ai.retry_scheduled",
            evaluation_id=str(evaluation.id),
            assignment_id=str(evaluation.assignment_id),
            status=evaluation.status,
            provider_error_type=provider_error_type,
            retry_count=retry_count,
            next_retry_at=evaluation.next_retry_at.isoformat(),
        )

    async def _save_failed_evaluation(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        error_message: str,
        *,
        provider_error_type: str | None = None,
        provider_status_code: int | None = None,
    ) -> None:
        """Save failed evaluation."""
        now = datetime.now(UTC)
        evaluation.status = "failed"
        evaluation.error_message = (sanitize_log_text(error_message) or "behavioral_ai_failed")[:2000]
        evaluation.failed_at = now
        evaluation.next_retry_at = None
        evaluation.provider_error_type = provider_error_type
        evaluation.provider_status_code = provider_status_code
        evaluation.updated_at = now

        await self.session.commit()
        logger.error(
            "behavioral_ai.task_failed",
            evaluation_id=str(evaluation.id),
            assignment_id=str(evaluation.assignment_id),
            status=evaluation.status,
            provider_error_type=provider_error_type,
        )

    @staticmethod
    def _provider_error_type(exc: Exception) -> str:
        if isinstance(exc, AIProviderRateLimitedError):
            return exc.provider_error_type or "rate_limited"
        if isinstance(exc, httpx.HTTPStatusError):
            status_code = int(exc.response.status_code)
            if status_code == 429:
                return "rate_limited"
            if status_code in {400, 401, 403}:
                return "ai_credential_invalid"
            if status_code in {500, 502, 503, 504}:
                return "provider_unavailable"
            return "provider_http_error"
        if isinstance(exc, httpx.TimeoutException):
            return "provider_timeout"
        if isinstance(exc, httpx.ConnectError):
            return "connection_error"
        return "temporary_error"

    @staticmethod
    def _is_retryable_provider_error(provider_error_type: str) -> bool:
        return provider_error_type in {
            "rate_limited",
            "provider_unavailable",
            "provider_timeout",
            "connection_error",
            "temporary_error",
        }

    @staticmethod
    def _classify_unexpected_failure(exc: Exception) -> str:
        if isinstance(exc, BehavioralAIProviderResponseInvalidError):
            return "provider_response_invalid"
        message = str(exc).lower()
        if "no gemini credentials configured" in message or "no ai credentials configured" in message:
            return "no_ai_credential_available"
        if "timeout" in message or "timed out" in message:
            return "provider_timeout"
        if "api key" in message or "credential" in message or "credentials" in message:
            return "ai_credential_invalid"
        return "unexpected_error"

    @staticmethod
    def _safe_failure_message(provider_error_type: str) -> str:
        if provider_error_type == "rate_limited":
            return _BEHAVIORAL_AI_RATE_LIMIT_MESSAGE
        if provider_error_type == "provider_unavailable":
            return _BEHAVIORAL_AI_RETRY_MESSAGE
        if provider_error_type in {"provider_timeout", "connection_error", "temporary_error"}:
            return SAFE_BEHAVIORAL_AI_ERROR_MESSAGES["provider_timeout"]
        if provider_error_type in SAFE_BEHAVIORAL_AI_ERROR_MESSAGES:
            return SAFE_BEHAVIORAL_AI_ERROR_MESSAGES[provider_error_type]
        if provider_error_type == "provider_http_error":
            return "Falha temporária no provedor IA."
        return SAFE_BEHAVIORAL_AI_ERROR_MESSAGES["unexpected_error"]

    @staticmethod
    def _provider_status_code(exc: Exception) -> int | None:
        if isinstance(exc, AIProviderRateLimitedError):
            return exc.status_code
        if isinstance(exc, httpx.HTTPStatusError):
            return int(exc.response.status_code)
        return None

    @staticmethod
    def _retry_after_seconds(exc: Exception, *, retry_count: int) -> int:
        if isinstance(exc, AIProviderRateLimitedError):
            return max(1, int(exc.retry_after_seconds or 0))
        if isinstance(exc, httpx.HTTPStatusError):
            retry_after = exc.response.headers.get("retry-after")
            if retry_after:
                try:
                    return max(1, int(float(retry_after)))
                except ValueError:
                    pass
        return _BEHAVIORAL_AI_RETRY_BACKOFF_SECONDS.get(retry_count, 300)
