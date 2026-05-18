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
from datetime import timedelta
from datetime import UTC, datetime
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.core.settings import settings
from src.core.log_sanitizer import sanitize_log_text
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentAnswerModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_ai_repository import (
    SQLAlchemyBehavioralAssignmentAIRepository,
)

logger = structlog.get_logger(__name__)

_BEHAVIORAL_AI_PROCESSING_STUCK_AFTER = timedelta(minutes=30)
_BEHAVIORAL_AI_PENDING_STALE_AFTER = timedelta(hours=2)

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

        return await self._prepare_evaluation_record(
            assignment=assignment,
            retry_failed=retry_failed,
            enqueue_mode=True,
        )

    async def mark_enqueued(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
    ) -> BehavioralAssessmentAIEvaluationModel:
        return await self.repository.mark_queued(evaluation)

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
        if evaluation.status == "processing":
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
            reason = (
                "behavioral_ai_stuck_processing_timeout"
                if evaluation.status == "processing"
                else "behavioral_ai_stale_pending_timeout"
            )
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
            )
        )

        pending = int((await self.session.scalar(pending_stmt)) or 0)
        processing = int((await self.session.scalar(processing_stmt)) or 0)
        completed_24h = int((await self.session.scalar(completed_stmt)) or 0)
        failed_24h = int((await self.session.scalar(failed_stmt)) or 0)
        stuck = int((await self.session.scalar(stuck_count_stmt)) or 0)

        return {
            "pending": pending,
            "processing": processing,
            "completed_last_24h": completed_24h,
            "failed_last_24h": failed_24h,
            "stuck": stuck,
        }

    # Private methods

    @staticmethod
    def _is_stuck(
        evaluation: BehavioralAssessmentAIEvaluationModel,
        *,
        now: datetime,
    ) -> bool:
        if evaluation.status == "processing":
            reference = evaluation.started_at or evaluation.updated_at
            return reference < (now - _BEHAVIORAL_AI_PROCESSING_STUCK_AFTER)
        if evaluation.status == "pending":
            return evaluation.updated_at < (now - _BEHAVIORAL_AI_PENDING_STALE_AFTER)
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
                logger.info(
                    "behavioral_ai.enqueue_skipped_existing_status",
                    assignment_id=str(assignment.id),
                    evaluation_id=str(existing.id),
                    status=existing.status,
                )
                return existing, False
            if existing.status == "pending" and enqueue_mode:
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
            model=settings.AI_MODEL_ID,
        )
        return created, True

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
                raise ValueError("Response contains prohibited clinical/diagnostic language")

            # Parse and validate response
            evaluation_data = self._parse_evaluation_response(response_text)

            # Save completed evaluation
            await self._save_completed_evaluation(
                evaluation=evaluation,
                data=evaluation_data,
                provider="gemini",
                model=self.ai_service.__class__.__name__,
            )

        except Exception as e:
            error_msg = sanitize_log_text(str(e)) or type(e).__name__
            logger.error(
                "behavioral_ai.task_failed",
                evaluation_id=str(evaluation.id),
                assignment_id=str(assignment.id),
                task_id=task_id or evaluation.task_id,
                error=error_msg,
            )
            await self._save_failed_evaluation(evaluation, error_msg)

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
                raise ValueError("Invalid confidence level")

            if not isinstance(data.get("summary"), str):
                raise ValueError("Summary is required")

            if not isinstance(data.get("competency_signals"), list):
                raise ValueError("competency_signals must be a list")

            return data

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in IA response: {str(e)}")

    async def _save_completed_evaluation(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        data: dict,
        provider: str = "gemini",
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

    async def _save_failed_evaluation(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        error_message: str,
    ) -> None:
        """Save failed evaluation."""
        now = datetime.now(UTC)
        evaluation.status = "failed"
        evaluation.error_message = (sanitize_log_text(error_message) or "behavioral_ai_failed")[:2000]
        evaluation.failed_at = now
        evaluation.updated_at = now

        await self.session.commit()
        logger.error(
            "behavioral_ai.task_failed",
            evaluation_id=str(evaluation.id),
            assignment_id=str(evaluation.assignment_id),
            status=evaluation.status,
            error=evaluation.error_message,
        )
