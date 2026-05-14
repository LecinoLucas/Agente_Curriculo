"""Integration tests for behavioral AI evaluation with Gemini.

Tests verify:
- Only submitted assignments evaluate
- Gemini response parsing
- Prohibited language detection
- Provider/model persistence
- Failed evaluations
- Completed evaluation reuse
"""

import json
from datetime import UTC, datetime
from uuid import uuid4, UUID
from typing import Any

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, MagicMock

from src.application.ports.ai_service import AIAnalysisResponse, AIService
from src.application.services.behavioral_ai_evaluation_service import BehavioralAIEvaluationService
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAIEvaluationModel,
)
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_ai_repository import (
    SQLAlchemyBehavioralAssignmentAIRepository,
)


async def _create_template_with_competencies(
    session: AsyncSession,
) -> tuple[BehavioralAssessmentTemplateModel, list[BehavioralTemplateCompetencyModel]]:
    """Create a behavioral template with competencies and questions."""
    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name="Communication Assessment",
        description="Assessment for communication skills",
        status="active",
        created_by=uuid4(),
    )
    session.add(template)
    await session.flush()

    competencies = []
    for i, comp_name in enumerate(["Communication", "Problem Solving"]):
        competency = BehavioralTemplateCompetencyModel(
            id=uuid4(),
            template_id=template.id,
            name=comp_name,
            description=f"{comp_name} competency",
            weight=1.0,
            display_order=i,
        )
        session.add(competency)
        competencies.append(competency)
        await session.flush()

        # Add question to competency
        question = BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text=f"How do you approach {comp_name.lower()}?",
            answer_type="text",
            is_required=True,
            weight=1.0,
            display_order=0,
        )
        session.add(question)

    await session.flush()
    return template, competencies


async def _create_assignment(
    session: AsyncSession,
    job_id: UUID,
    candidate_id: UUID,
    template: BehavioralAssessmentTemplateModel,
    status: str = "submitted",
) -> BehavioralAssessmentAssignmentModel:
    """Create a behavioral assignment."""
    assignment = BehavioralAssessmentAssignmentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template.id,
        status=status,
        assigned_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        submitted_at=datetime.now(UTC) if status == "submitted" else None,
        expires_at=None,
    )
    session.add(assignment)
    await session.flush()
    return assignment


@pytest.mark.asyncio
async def test_cannot_evaluate_pending_assignment(
    db_session: AsyncSession,
) -> None:
    """Test that pending assignments cannot be evaluated."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="pending"
    )

    mock_ai_service = AsyncMock(spec=AIService)
    service = BehavioralAIEvaluationService(db_session, mock_ai_service)

    with pytest.raises(ValidationException) as exc_info:
        await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert "pending" in str(exc_info.value).lower()
    mock_ai_service.analyze.assert_not_called()


@pytest.mark.asyncio
async def test_evaluate_submitted_assignment_with_valid_response(
    db_session: AsyncSession,
) -> None:
    """Test evaluating a submitted assignment with valid Gemini response."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Create answer
    questions = await db_session.execute(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id.in_(
                sa.select(BehavioralTemplateCompetencyModel.id).where(
                    BehavioralTemplateCompetencyModel.template_id == template.id
                )
            )
        )
    )
    question = questions.scalars().first()

    answer = BehavioralAssessmentAnswerModel(
        id=uuid4(),
        assignment_id=assignment.id,
        question_id=question.id,
        answer_text="I communicate effectively by listening first and speaking clearly",
        answer_value=None,
        selected_options_json=None,
    )
    db_session.add(answer)
    await db_session.flush()

    # Mock Gemini response
    valid_json_response = {
        "confidence": "high",
        "summary": "Candidato apresenta forte comunicação com evidência em respostas",
        "competency_signals": [
            {
                "competency": "Communication",
                "signal": "strong",
                "evidence": "Há sinal de comunicação clara nas respostas fornecidas",
                "concerns": [],
            }
        ],
        "strengths": ["Escuta ativa"],
        "concerns": ["Validar clareza em ambientes de pressão"],
        "suggested_interview_questions": ["Como você se comunica sob pressão?"],
        "risk_flags": [],
    }

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content=json.dumps(valid_json_response),
            input_tokens=100,
            output_tokens=200,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
            parsed_data=valid_json_response,
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.status == "completed"
    assert evaluation.confidence == "high"
    assert evaluation.provider == "gemini"
    assert evaluation.completed_at is not None
    mock_ai_service.analyze.assert_called_once()


@pytest.mark.asyncio
async def test_invalid_json_response_saves_failed(
    db_session: AsyncSession,
) -> None:
    """Test that invalid JSON response is saved as failed."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content="This is not valid JSON",
            input_tokens=100,
            output_tokens=50,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.status == "failed"
    assert evaluation.error_message is not None


@pytest.mark.asyncio
async def test_prohibited_language_saves_failed(
    db_session: AsyncSession,
) -> None:
    """Test that response with prohibited language is marked as failed."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Response with prohibited term
    prohibited_response = {
        "confidence": "medium",
        "summary": "Candidato parece ansioso",  # PROHIBITED: ansioso
        "competency_signals": [],
        "strengths": [],
        "concerns": [],
        "suggested_interview_questions": [],
        "risk_flags": [],
    }

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content=json.dumps(prohibited_response),
            input_tokens=100,
            output_tokens=200,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.status == "failed"
    assert "prohibited" in evaluation.error_message.lower() or "clinical" in evaluation.error_message.lower()


@pytest.mark.asyncio
async def test_reuse_completed_evaluation(
    db_session: AsyncSession,
) -> None:
    """Test that existing completed evaluation is reused."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Create a completed evaluation
    existing_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template.id,
        status="completed",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        confidence="high",
        summary="Já avaliado",
        completed_at=datetime.now(UTC),
    )
    db_session.add(existing_eval)
    await db_session.commit()

    mock_ai_service = AsyncMock(spec=AIService)
    service = BehavioralAIEvaluationService(db_session, mock_ai_service)

    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.id == existing_eval.id
    assert evaluation.status == "completed"
    assert evaluation.confidence == "high"
    mock_ai_service.analyze.assert_not_called()  # Should not call AI again


@pytest.mark.asyncio
async def test_retry_after_failed_evaluation(
    db_session: AsyncSession,
) -> None:
    """Test that failed evaluation can be retried."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Create a failed evaluation
    failed_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate_id,
        job_id=job_id,
        template_id=template.id,
        status="failed",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        error_message="Previous error",
    )
    db_session.add(failed_eval)
    await db_session.commit()

    valid_response = {
        "confidence": "medium",
        "summary": "Avaliação realizada com sucesso",
        "competency_signals": [],
        "strengths": [],
        "concerns": [],
        "suggested_interview_questions": [],
        "risk_flags": [],
    }

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content=json.dumps(valid_response),
            input_tokens=100,
            output_tokens=200,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    # After retry, status should be updated
    assert evaluation.status == "completed" or evaluation.status == "processing"
    mock_ai_service.analyze.assert_called_once()


@pytest.mark.asyncio
async def test_ai_failure_does_not_modify_assignment(
    db_session: AsyncSession,
) -> None:
    """Test that IA failure does not modify the assignment."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    original_status = assignment.status
    original_updated_at = assignment.updated_at

    # Mock IA service failure
    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(side_effect=Exception("IA service error"))

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    # Verify assignment is unchanged
    await db_session.refresh(assignment)
    assert assignment.status == original_status
    assert assignment.status == "submitted"


@pytest.mark.asyncio
async def test_good_detailed_response_generates_strong_signals(
    db_session: AsyncSession,
) -> None:
    """Test evaluation with good detailed response generates strong signals."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Create detailed answer
    questions = await db_session.execute(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id.in_(
                sa.select(BehavioralTemplateCompetencyModel.id).where(
                    BehavioralTemplateCompetencyModel.template_id == template.id
                )
            )
        )
    )
    question = questions.scalars().first()

    answer = BehavioralAssessmentAnswerModel(
        id=uuid4(),
        assignment_id=assignment.id,
        question_id=question.id,
        answer_text="Eu me comunico efetivamente através de escuta ativa, feedback claro e adaptação ao público. Preparo mensagens antecipadamente e em conflitos, busco entender diferentes perspectivas.",
        answer_value=None,
        selected_options_json=None,
    )
    db_session.add(answer)
    await db_session.flush()

    # Mock strong response
    good_response = {
        "confidence": "high",
        "summary": "Candidato demonstra forte habilidade de comunicação com evidências claras em suas respostas",
        "competency_signals": [
            {
                "competency": "Communication",
                "signal": "strong",
                "evidence": "Há sinal de escuta ativa nas respostas fornecidas",
                "concerns": [],
            }
        ],
        "strengths": ["Comunicação clara", "Escuta ativa"],
        "concerns": [],
        "suggested_interview_questions": ["Como você lida com comunicação em times remotos?"],
        "risk_flags": [],
    }

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content=json.dumps(good_response),
            input_tokens=100,
            output_tokens=200,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
            parsed_data=good_response,
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.status == "completed"
    assert evaluation.confidence == "high"
    assert "Comunicação clara" in evaluation.strengths_json
    assert len(evaluation.risk_flags_json) == 0


@pytest.mark.asyncio
async def test_short_response_flags_insufficient_evidence(
    db_session: AsyncSession,
) -> None:
    """Test evaluation with short response flags insufficient evidence."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Create short answer
    questions = await db_session.execute(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id.in_(
                sa.select(BehavioralTemplateCompetencyModel.id).where(
                    BehavioralTemplateCompetencyModel.template_id == template.id
                )
            )
        )
    )
    question = questions.scalars().first()

    answer = BehavioralAssessmentAnswerModel(
        id=uuid4(),
        assignment_id=assignment.id,
        question_id=question.id,
        answer_text="Eu comunico bem.",
        answer_value=None,
        selected_options_json=None,
    )
    db_session.add(answer)
    await db_session.flush()

    # Mock response with insufficient evidence flag
    short_response = {
        "confidence": "low",
        "summary": "Não há evidência suficiente para avaliar a competência de comunicação",
        "competency_signals": [
            {
                "competency": "Communication",
                "signal": "weak",
                "evidence": "Resposta muito breve para extrair sinais claros",
                "concerns": ["Resposta insuficiente"],
            }
        ],
        "strengths": [],
        "concerns": ["Resposta muito breve"],
        "suggested_interview_questions": ["Pode elaborar mais sobre como você se comunica?"],
        "risk_flags": [
            {
                "code": "insufficient_evidence",
                "message": "Resposta muito breve para análise adequada"
            }
        ],
    }

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content=json.dumps(short_response),
            input_tokens=100,
            output_tokens=200,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
            parsed_data=short_response,
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.status == "completed"
    assert evaluation.confidence == "low"
    assert len(evaluation.risk_flags_json) > 0
    assert evaluation.risk_flags_json[0]["code"] == "insufficient_evidence"


@pytest.mark.asyncio
async def test_ambiguous_response_with_moderate_signals(
    db_session: AsyncSession,
) -> None:
    """Test evaluation with ambiguous response generates moderate signals."""
    job_id = uuid4()
    candidate_id = uuid4()
    template, _ = await _create_template_with_competencies(db_session)
    assignment = await _create_assignment(
        db_session, job_id, candidate_id, template, status="submitted"
    )

    # Create ambiguous answer
    questions = await db_session.execute(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id.in_(
                sa.select(BehavioralTemplateCompetencyModel.id).where(
                    BehavioralTemplateCompetencyModel.template_id == template.id
                )
            )
        )
    )
    question = questions.scalars().first()

    answer = BehavioralAssessmentAnswerModel(
        id=uuid4(),
        assignment_id=assignment.id,
        question_id=question.id,
        answer_text="Às vezes me comunico bem, mas depende da situação. Algumas pessoas entendem melhor que outras.",
        answer_value=None,
        selected_options_json=None,
    )
    db_session.add(answer)
    await db_session.flush()

    # Mock response with moderate signals
    ambiguous_response = {
        "confidence": "medium",
        "summary": "Há indícios de competência de comunicação, mas com consistência variável",
        "competency_signals": [
            {
                "competency": "Communication",
                "signal": "moderate",
                "evidence": "Há sinal de comunicação, mas com variações dependendo do contexto",
                "concerns": ["Consistência variável"],
            }
        ],
        "strengths": ["Capacidade de adaptação"],
        "concerns": ["Consistência em diferentes situações"],
        "suggested_interview_questions": ["Como você garante consistência na comunicação?"],
        "risk_flags": [
            {
                "code": "unexpected_pattern",
                "message": "Padrão de comunicação variável que merece exploração"
            }
        ],
    }

    mock_ai_service = AsyncMock(spec=AIService)
    mock_ai_service.analyze = AsyncMock(
        return_value=AIAnalysisResponse(
            content=json.dumps(ambiguous_response),
            input_tokens=100,
            output_tokens=200,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=500,
            finish_reason="STOP",
            parsed_data=ambiguous_response,
        )
    )

    service = BehavioralAIEvaluationService(db_session, mock_ai_service)
    evaluation = await service.evaluate_assignment(job_id, candidate_id, assignment.id)

    assert evaluation.status == "completed"
    assert evaluation.confidence == "medium"
    signals = evaluation.competency_signals_json
    assert len(signals) > 0
    assert signals[0]["signal"] == "moderate"
