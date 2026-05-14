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
import logging
import re
from datetime import UTC, datetime
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisRequest, AIService
from src.core.settings import settings
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

logger = logging.getLogger(__name__)

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

    def __init__(self, session: AsyncSession, ai_service: AIService):
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

        # Check for existing completed evaluation
        existing = await self.repository.get_evaluation(assignment_id)
        if existing and existing.status == "completed":
            logger.info(f"Reusing completed evaluation for assignment {assignment_id}")
            return existing

        # Create or update evaluation record as pending
        evaluation = await self.repository.get_or_create_evaluation(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=assignment.template_id,
        )

        # Trigger IA evaluation async (non-blocking)
        await self._evaluate_async(evaluation, assignment)

        return evaluation

    async def get_evaluation(
        self,
        job_id: UUID,
        candidate_id: UUID,
        assignment_id: UUID,
    ) -> Optional[BehavioralAssessmentAIEvaluationModel]:
        """Fetch evaluation record if exists."""
        return await self.repository.get_evaluation(assignment_id)

    # Private methods

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

    async def _evaluate_async(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        assignment: BehavioralAssessmentAssignmentModel,
    ) -> None:
        """Execute IA evaluation using Gemini (non-blocking)."""
        try:
            # Update status to processing
            evaluation.status = "processing"
            evaluation.updated_at = datetime.now(UTC)
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
            error_msg = str(e)
            logger.error(f"Error evaluating assignment {assignment.id}: {error_msg}")
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
        evaluation.completed_at = datetime.now(UTC)
        evaluation.updated_at = datetime.now(UTC)

        await self.session.commit()
        logger.info(f"Saved completed evaluation for assignment {evaluation.assignment_id} using {provider}/{model}")

    async def _save_failed_evaluation(
        self,
        evaluation: BehavioralAssessmentAIEvaluationModel,
        error_message: str,
    ) -> None:
        """Save failed evaluation."""
        evaluation.status = "failed"
        evaluation.error_message = error_message
        evaluation.updated_at = datetime.now(UTC)

        await self.session.commit()
        logger.error(f"Saved failed evaluation for assignment {evaluation.assignment_id}: {error_message}")
