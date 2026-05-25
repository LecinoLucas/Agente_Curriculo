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
from datetime import UTC, datetime, timedelta
from uuid import uuid4, UUID
from decimal import Decimal
from typing import Any

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from unittest.mock import AsyncMock

from src.application.ports.ai_service import AIAnalysisResponse, AIService
from src.application.services.behavioral_ai_evaluation_service import BehavioralAIEvaluationService
from src.application.services import behavioral_ai_evaluation_service as behavioral_ai_service_module
from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.domain.exceptions import ValidationException
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError
from src.infrastructure.database.models import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
    BehavioralAssessmentAssignmentModel,
    BehavioralAssessmentAnswerModel,
    BehavioralAssessmentAIEvaluationModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.interface.workers.behavioral_ai_tasks import (
    _detect_stuck_behavioral_ai_evaluations_async,
    _process_behavioral_ai_evaluation_async,
)
from tests.integration.helpers import _auth_headers, _create_active_user


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


async def _create_answer(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    template_id: UUID,
    answer_text: str = "Resposta comportamental com evidências suficientes para análise.",
) -> BehavioralAssessmentAnswerModel:
    question = await session.scalar(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id.in_(
                sa.select(BehavioralTemplateCompetencyModel.id).where(
                    BehavioralTemplateCompetencyModel.template_id == template_id
                )
            )
        )
    )
    assert question is not None
    answer = BehavioralAssessmentAnswerModel(
        id=uuid4(),
        assignment_id=assignment_id,
        question_id=question.id,
        answer_text=answer_text,
        answer_value=None,
        selected_options_json=None,
    )
    session.add(answer)
    await session.flush()
    return answer


def _skip_request_preflight(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _noop_answers(self, assignment_id: UUID) -> None:
        return None

    async def _noop_credentials(self) -> None:
        return None

    monkeypatch.setattr(
        BehavioralAIEvaluationService,
        "_ensure_behavioral_answers_available",
        _noop_answers,
    )
    monkeypatch.setattr(
        BehavioralAIEvaluationService,
        "_ensure_ai_credentials_available",
        _noop_credentials,
    )


async def _create_job_and_candidate(
    session: AsyncSession,
    *,
    created_by: UUID,
    template_id: UUID,
) -> tuple[JobModel, CandidateModel]:
    job = JobModel(
        id=uuid4(),
        title="Gestor de Operações",
        description="Vaga de gestão operacional",
        location="Remoto",
        minimum_years_experience=Decimal("5.0"),
        behavioral_template_id=template_id,
        created_by=created_by,
        requires_behavioral_assessment=True,
        requires_behavioral_ai_evaluation=True,
    )
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Alice Teste",
        email=f"alice-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=created_by,
    )
    session.add(job)
    session.add(candidate)
    await session.flush()
    return job, candidate


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
    assert evaluation.provider == settings.AI_PROVIDER
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
    assert evaluation.provider_error_type == "provider_response_invalid"


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
    assert evaluation.provider_error_type == "provider_response_invalid"
    assert "resposta inválida" in evaluation.error_message.lower()


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


@pytest.mark.asyncio
async def test_evaluate_endpoint_returns_202_and_enqueues_without_sync_call(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"behavioral-async-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    _skip_request_preflight(monkeypatch)
    await db_session.commit()

    enqueued: list[str] = []

    def _fake_enqueue(evaluation_id: UUID) -> None:
        enqueued.append(str(evaluation_id))

    async def _forbidden_evaluate_async(*_args, **_kwargs):
        raise AssertionError("Endpoint must not execute sync AI evaluation")

    monkeypatch.setattr(
        "src.interface.workers.behavioral_ai_dispatcher.enqueue_behavioral_ai_evaluation",
        _fake_enqueue,
    )
    monkeypatch.setattr(
        BehavioralAIEvaluationService,
        "_evaluate_async",
        _forbidden_evaluate_async,
    )

    response = await client.post(
        f"/api/v1/jobs/{job.id}/candidates/{candidate.id}/behavioral-assessment/evaluate",
        headers=headers,
    )

    assert response.status_code == status.HTTP_202_ACCEPTED, response.text
    payload = response.json()
    assert payload["assignment_id"] == str(assignment.id)
    assert payload["status"] == "pending"
    assert payload["message"] == "Avaliação enfileirada"
    assert len(enqueued) == 1

    stored = await db_session.scalar(
        sa.select(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.assignment_id == assignment.id
        )
    )
    assert stored is not None
    assert stored.status == "pending"


@pytest.mark.asyncio
async def test_evaluate_endpoint_marks_failed_when_enqueue_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"behavioral-enqueue-fail-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    _skip_request_preflight(monkeypatch)
    await db_session.commit()

    def _fail_enqueue(_evaluation_id: UUID) -> None:
        raise RuntimeError("broker unavailable api_key=secret")

    monkeypatch.setattr(
        "src.interface.workers.behavioral_ai_dispatcher.enqueue_behavioral_ai_evaluation",
        _fail_enqueue,
    )

    response = await client.post(
        f"/api/v1/jobs/{job.id}/candidates/{candidate.id}/behavioral-assessment/evaluate",
        headers=headers,
    )

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE, response.text
    payload = response.json()
    assert payload["detail"]["code"] == "enqueue_failed"

    stored = await db_session.scalar(
        sa.select(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.assignment_id == assignment.id
        )
    )
    assert stored is not None
    assert stored.status == "failed"
    assert stored.provider_error_type == "enqueue_failed"
    assert stored.error_message == "Falha ao enfileirar avaliação comportamental."
    assert stored.failed_at is not None


@pytest.mark.asyncio
async def test_evaluate_endpoint_missing_answers_returns_safe_code(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"behavioral-missing-answers-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )

    async def _noop_credentials(self) -> None:
        return None

    monkeypatch.setattr(
        BehavioralAIEvaluationService,
        "_ensure_ai_credentials_available",
        _noop_credentials,
    )
    await db_session.commit()

    response = await client.post(
        f"/api/v1/jobs/{job.id}/candidates/{candidate.id}/behavioral-assessment/evaluate",
        headers=headers,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    payload = response.json()
    assert payload["detail"]["code"] == "behavioral_answers_missing"
    assert "Evaluation failed" not in response.text

    stored = await db_session.scalar(
        sa.select(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.assignment_id == assignment.id
        )
    )
    assert stored is not None
    assert stored.status == "failed"
    assert stored.provider_error_type == "behavioral_answers_missing"


@pytest.mark.asyncio
async def test_evaluate_endpoint_missing_ai_credential_returns_safe_code(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"behavioral-missing-credential-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    await _create_answer(
        db_session,
        assignment_id=assignment.id,
        template_id=template.id,
    )
    await db_session.commit()

    response = await client.post(
        f"/api/v1/jobs/{job.id}/candidates/{candidate.id}/behavioral-assessment/evaluate",
        headers=headers,
    )

    assert response.status_code == status.HTTP_409_CONFLICT, response.text
    payload = response.json()
    assert payload["detail"]["code"] == "no_ai_credential_available"
    assert "Evaluation failed" not in response.text
    assert "api_key" not in response.text
    assert "encrypted_api_key" not in response.text

    stored = await db_session.scalar(
        sa.select(BehavioralAssessmentAIEvaluationModel).where(
            BehavioralAssessmentAIEvaluationModel.assignment_id == assignment.id
        )
    )
    assert stored is not None
    assert stored.status == "failed"
    assert stored.provider_error_type == "no_ai_credential_available"


@pytest.mark.asyncio
async def test_request_evaluation_idempotency_by_status(
    db_session: AsyncSession,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    await db_session.commit()

    service = BehavioralAIEvaluationService(db_session)

    pending_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
    )
    db_session.add(pending_eval)
    await db_session.commit()

    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
    )
    assert evaluation.id == pending_eval.id
    assert evaluation.status == "pending"
    assert should_enqueue is False

    pending_eval.status = "processing"
    await db_session.commit()
    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
    )
    assert evaluation.status == "processing"
    assert should_enqueue is False

    pending_eval.status = "completed"
    pending_eval.completed_at = datetime.now(UTC)
    await db_session.commit()
    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
    )
    assert evaluation.status == "completed"
    assert should_enqueue is False


@pytest.mark.asyncio
async def test_retry_scheduled_evaluation_is_idempotent_until_due(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    retry_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="retry_scheduled",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        retry_count=1,
        next_retry_at=datetime.now(UTC) + timedelta(minutes=5),
        error_message="retry scheduled",
    )
    db_session.add(retry_eval)
    await db_session.commit()
    _skip_request_preflight(monkeypatch)

    service = BehavioralAIEvaluationService(db_session)
    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
    )
    assert evaluation.id == retry_eval.id
    assert evaluation.status == "retry_scheduled"
    assert should_enqueue is False

    retry_eval.next_retry_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
    )
    assert evaluation.id == retry_eval.id
    assert evaluation.status == "pending"
    assert evaluation.next_retry_at is None
    assert should_enqueue is True


@pytest.mark.asyncio
async def test_failed_evaluation_requires_explicit_retry(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    failed_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="failed",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        error_message="timeout",
    )
    db_session.add(failed_eval)
    await db_session.commit()
    _skip_request_preflight(monkeypatch)

    service = BehavioralAIEvaluationService(db_session)
    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
        retry_failed=False,
    )
    assert evaluation.id == failed_eval.id
    assert evaluation.status == "failed"
    assert should_enqueue is False

    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
        retry_failed=True,
    )
    assert evaluation.id == failed_eval.id
    assert evaluation.status == "pending"
    assert evaluation.error_message is None
    assert should_enqueue is True


@pytest.mark.asyncio
async def test_worker_processes_pending_to_completed(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, competencies = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )

    question = await db_session.scalar(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id == competencies[0].id
        )
    )
    assert question is not None
    db_session.add(
        BehavioralAssessmentAnswerModel(
            id=uuid4(),
            assignment_id=assignment.id,
            question_id=question.id,
            answer_text="Coordeno conflitos com comunicação clara e feedback estruturado.",
            answer_value=None,
            selected_options_json=None,
        )
    )
    evaluation = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
    )
    db_session.add(evaluation)
    await db_session.commit()

    valid_response = {
        "confidence": "medium",
        "summary": "Sinais comportamentais consistentes para liderança.",
        "competency_signals": [
            {
                "competency": "Communication",
                "signal": "moderate",
                "evidence": "Há sinal de comunicação estruturada nas respostas fornecidas",
                "concerns": [],
            }
        ],
        "strengths": ["Clareza"],
        "concerns": [],
        "suggested_interview_questions": ["Descreva um conflito liderado por você."],
        "risk_flags": [],
    }

    class _EngineHandle:
        async def dispose(self) -> None:
            return None

    async def _fake_sessionmaker_factory():
        session_factory = async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return _EngineHandle(), session_factory

    class _FakeAIService:
        async def analyze(self, _request):
            return AIAnalysisResponse(
                content=json.dumps(valid_response),
                input_tokens=30,
                output_tokens=40,
                cache_read_tokens=0,
                cache_write_tokens=0,
                processing_time_ms=20,
                finish_reason="STOP",
                parsed_data=valid_response,
            )

    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_sessionmaker_factory,
    )
    monkeypatch.setattr(
        "src.infrastructure.ai.factory.AIServiceFactory.create",
        lambda *_args, **_kwargs: _FakeAIService(),
    )

    result = await _process_behavioral_ai_evaluation_async(str(evaluation.id), "task-1")
    assert result["status"] == "completed"
    assert result["evaluation_id"] == str(evaluation.id)

    await db_session.refresh(evaluation)
    assert evaluation.status == "completed"
    assert evaluation.completed_at is not None


@pytest.mark.asyncio
async def test_worker_marks_failed_on_exception(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, competencies = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    question = await db_session.scalar(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id == competencies[0].id
        )
    )
    assert question is not None
    db_session.add(
        BehavioralAssessmentAnswerModel(
            id=uuid4(),
            assignment_id=assignment.id,
            question_id=question.id,
            answer_text="Resposta para disparar falha de IA.",
            answer_value=None,
            selected_options_json=None,
        )
    )
    evaluation = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
    )
    db_session.add(evaluation)
    await db_session.commit()

    class _EngineHandle:
        async def dispose(self) -> None:
            return None

    async def _fake_sessionmaker_factory():
        session_factory = async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return _EngineHandle(), session_factory

    class _FailingAIService:
        async def analyze(self, _request):
            raise RuntimeError("provider timeout")

    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_sessionmaker_factory,
    )
    monkeypatch.setattr(
        "src.infrastructure.ai.factory.AIServiceFactory.create",
        lambda *_args, **_kwargs: _FailingAIService(),
    )

    result = await _process_behavioral_ai_evaluation_async(str(evaluation.id), "task-2")
    assert result["status"] == "failed"

    await db_session.refresh(evaluation)
    assert evaluation.status == "failed"
    assert evaluation.error_message is not None
    assert evaluation.failed_at is not None


@pytest.mark.asyncio
async def test_worker_marks_rate_limit_as_retry_scheduled(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, competencies = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    question = await db_session.scalar(
        sa.select(BehavioralTemplateQuestionModel).where(
            BehavioralTemplateQuestionModel.competency_id == competencies[0].id
        )
    )
    assert question is not None
    sensitive_answer = "Resposta sensível com CPF 123.456.789-10 e detalhes pessoais."
    db_session.add(
        BehavioralAssessmentAnswerModel(
            id=uuid4(),
            assignment_id=assignment.id,
            question_id=question.id,
            answer_text=sensitive_answer,
            answer_value=None,
            selected_options_json=None,
        )
    )
    evaluation = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
    )
    db_session.add(evaluation)
    await db_session.commit()

    class _EngineHandle:
        async def dispose(self) -> None:
            return None

    async def _fake_sessionmaker_factory():
        session_factory = async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return _EngineHandle(), session_factory

    class _RateLimitedAIService:
        async def analyze(self, _request):
            raise AIProviderRateLimitedError(
                "quota exceeded api_key=secret",
                provider=settings.AI_PROVIDER,
                model_id=settings.AI_MODEL_ID,
                retry_after_seconds=30,
                cooldown_until=datetime.now(UTC) + timedelta(seconds=30),
            )

    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_sessionmaker_factory,
    )
    monkeypatch.setattr(
        "src.infrastructure.ai.factory.AIServiceFactory.create",
        lambda *_args, **_kwargs: _RateLimitedAIService(),
    )

    with pytest.raises(AIProviderRateLimitedError):
        await _process_behavioral_ai_evaluation_async(str(evaluation.id), "task-rate-limit")

    await db_session.refresh(evaluation)
    assert evaluation.status == "retry_scheduled"
    assert evaluation.retry_count == 1
    assert evaluation.next_retry_at is not None
    assert evaluation.provider_error_type == "rate_limited"
    assert evaluation.provider_status_code == 429
    assert "CPF 123.456.789-10" not in (evaluation.error_message or "")
    assert "api_key" not in (evaluation.error_message or "")


@pytest.mark.asyncio
async def test_enqueue_logs_skip_when_pending_existing(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    existing_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
    )
    db_session.add(existing_eval)
    await db_session.commit()

    events: list[str] = []

    class _FakeLogger:
        def info(self, event: str, **kwargs) -> None:
            events.append(event)

        def warning(self, event: str, **kwargs) -> None:
            events.append(event)

        def error(self, event: str, **kwargs) -> None:
            events.append(event)

    monkeypatch.setattr(behavioral_ai_service_module, "logger", _FakeLogger())

    service = BehavioralAIEvaluationService(db_session)
    evaluation, should_enqueue = await service.request_evaluation(
        job_id=job.id,
        candidate_id=candidate.id,
        assignment_id=assignment.id,
    )
    assert evaluation.id == existing_eval.id
    assert should_enqueue is False
    assert "behavioral_ai.enqueue_skipped_existing_status" in events


@pytest.mark.asyncio
async def test_processing_older_than_threshold_is_detected_as_stuck(
    db_session: AsyncSession,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    candidate2 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 2",
        email=f"candidate2-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    candidate3 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 3",
        email=f"candidate3-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    candidate4 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 4",
        email=f"candidate4-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    db_session.add_all([candidate2, candidate3, candidate4])
    await db_session.flush()
    assignment2 = await _create_assignment(
        db_session, job.id, candidate2.id, template, status="submitted"
    )
    assignment3 = await _create_assignment(
        db_session, job.id, candidate3.id, template, status="submitted"
    )
    assignment4 = await _create_assignment(
        db_session, job.id, candidate4.id, template, status="submitted"
    )
    candidate5 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 5",
        email=f"candidate5-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    db_session.add(candidate5)
    await db_session.flush()
    assignment5 = await _create_assignment(
        db_session, job.id, candidate5.id, template, status="submitted"
    )
    now = datetime.now(UTC)
    stuck_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="processing",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        started_at=now.replace(microsecond=0),
    )
    stuck_eval.started_at = now - timedelta(minutes=31)
    stuck_eval.updated_at = now - timedelta(minutes=31)
    db_session.add(stuck_eval)
    await db_session.commit()

    service = BehavioralAIEvaluationService(db_session)
    stuck = await service.list_stuck_behavioral_ai_evaluations()
    assert any(item.id == stuck_eval.id for item in stuck)


@pytest.mark.asyncio
async def test_completed_evaluation_cannot_retry(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"retry-completed-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    evaluation = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="completed",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        completed_at=datetime.now(UTC),
    )
    db_session.add(evaluation)
    await db_session.commit()

    response = await client.post(
        f"/api/v1/admin/behavioral-ai/{evaluation.id}/retry",
        headers=headers,
    )
    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_failed_and_stuck_can_retry_without_duplication(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"retry-failed-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    failed_eval = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="failed",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        error_message="provider_error",
    )
    db_session.add(failed_eval)
    await db_session.commit()

    enqueued: list[str] = []

    def _fake_enqueue(evaluation_id: UUID) -> None:
        enqueued.append(str(evaluation_id))

    monkeypatch.setattr(
        "src.interface.api.routers.admin_behavioral_ai.enqueue_behavioral_ai_evaluation",
        _fake_enqueue,
    )

    retry_failed_response = await client.post(
        f"/api/v1/admin/behavioral-ai/{failed_eval.id}/retry",
        headers=headers,
    )
    assert retry_failed_response.status_code == status.HTTP_202_ACCEPTED
    payload = retry_failed_response.json()
    assert payload["enqueued"] is True
    assert payload["status"] == "pending"
    assert payload["retry_count"] == 1
    assert enqueued == [str(failed_eval.id)]

    rows_after_failed_retry = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(BehavioralAssessmentAIEvaluationModel)
        .where(BehavioralAssessmentAIEvaluationModel.assignment_id == assignment.id)
    )
    assert rows_after_failed_retry == 1

    failed_eval.status = "processing"
    failed_eval.started_at = datetime.now(UTC) - timedelta(minutes=45)
    failed_eval.updated_at = datetime.now(UTC) - timedelta(minutes=45)
    await db_session.commit()

    retry_stuck_response = await client.post(
        f"/api/v1/admin/behavioral-ai/{failed_eval.id}/retry",
        headers=headers,
    )
    assert retry_stuck_response.status_code == status.HTTP_202_ACCEPTED
    payload_stuck = retry_stuck_response.json()
    assert payload_stuck["enqueued"] is True
    assert payload_stuck["status"] == "pending"
    assert payload_stuck["retry_count"] == 2

    rows_after_stuck_retry = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(BehavioralAssessmentAIEvaluationModel)
        .where(BehavioralAssessmentAIEvaluationModel.assignment_id == assignment.id)
    )
    assert rows_after_stuck_retry == 1


@pytest.mark.asyncio
async def test_admin_behavioral_ai_metrics_endpoint_returns_operational_counts(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin = await _create_active_user(
        db_session, f"behavioral-metrics-{uuid4()}@test.com", "password123", UserRole.ADMIN
    )
    headers = await _auth_headers(client, admin.email, "password123")

    response = await client.get("/api/v1/admin/behavioral-ai/metrics", headers=headers)
    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    for key in ["pending", "processing", "retry_scheduled", "completed_last_24h", "failed_last_24h", "stuck"]:
        assert key in payload


@pytest.mark.asyncio
async def test_admin_behavioral_ai_evaluations_endpoint_lists_queue_items(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session, f"behavioral-list-{uuid4()}@test.com", "password123", UserRole.RECRUITER
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    template, _ = await _create_template_with_competencies(db_session)
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=recruiter.id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    evaluation = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="retry_scheduled",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        retry_count=2,
        next_retry_at=datetime.now(UTC) + timedelta(minutes=2),
    )
    db_session.add(evaluation)
    await db_session.commit()

    response = await client.get(
        "/api/v1/admin/behavioral-ai/evaluations?status=retry_scheduled",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["total"] >= 1
    item = next(row for row in payload["data"] if row["id"] == str(evaluation.id))
    assert item["type"] == "behavioral_ai"
    assert item["candidate_name"] == candidate.full_name
    assert item["job_title"] == job.title
    assert item["status"] == "retry_scheduled"
    assert item["retry_count"] == 2
    assert item["next_retry_at"] is not None


@pytest.mark.asyncio
async def test_stuck_detection_task_marks_processing_and_pending_only(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    candidate2 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 2",
        email=f"candidate2-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    candidate3 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 3",
        email=f"candidate3-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    candidate4 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 4",
        email=f"candidate4-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    db_session.add_all([candidate2, candidate3, candidate4])
    await db_session.flush()
    assignment2 = await _create_assignment(
        db_session, job.id, candidate2.id, template, status="submitted"
    )
    assignment3 = await _create_assignment(
        db_session, job.id, candidate3.id, template, status="submitted"
    )
    assignment4 = await _create_assignment(
        db_session, job.id, candidate4.id, template, status="submitted"
    )
    candidate5 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 5",
        email=f"candidate5-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    candidate6 = CandidateModel(
        id=uuid4(),
        full_name="Candidate 6",
        email=f"candidate6-{uuid4()}@example.com",
        cpf=f"{str(uuid4().int)[:11]}",
        created_by=owner_id,
    )
    db_session.add_all([candidate5, candidate6])
    await db_session.flush()
    assignment5 = await _create_assignment(
        db_session, job.id, candidate5.id, template, status="submitted"
    )
    assignment6 = await _create_assignment(
        db_session, job.id, candidate6.id, template, status="submitted"
    )
    now = datetime.now(UTC)

    stuck_processing = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="processing",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        started_at=now - timedelta(minutes=45),
        updated_at=now - timedelta(minutes=45),
    )
    stale_pending = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment2.id,
        candidate_id=candidate2.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        updated_at=now - timedelta(hours=3),
    )
    completed = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment3.id,
        candidate_id=candidate3.id,
        job_id=job.id,
        template_id=template.id,
        status="completed",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        completed_at=now - timedelta(minutes=10),
        updated_at=now - timedelta(minutes=10),
    )
    recent_processing = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment4.id,
        candidate_id=candidate4.id,
        job_id=job.id,
        template_id=template.id,
        status="processing",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        started_at=now - timedelta(minutes=5),
        updated_at=now - timedelta(minutes=5),
    )
    recent_pending = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment5.id,
        candidate_id=candidate5.id,
        job_id=job.id,
        template_id=template.id,
        status="pending",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        updated_at=now - timedelta(minutes=20),
    )
    due_retry = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment6.id,
        candidate_id=candidate6.id,
        job_id=job.id,
        template_id=template.id,
        status="retry_scheduled",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        retry_count=1,
        next_retry_at=now - timedelta(minutes=1),
        updated_at=now - timedelta(minutes=5),
    )
    db_session.add_all([stuck_processing, stale_pending, completed, recent_processing, recent_pending, due_retry])
    await db_session.commit()

    class _EngineHandle:
        async def dispose(self) -> None:
            return None

    async def _fake_sessionmaker_factory():
        session_factory = async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return _EngineHandle(), session_factory

    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_sessionmaker_factory,
    )
    enqueue_calls: list[str] = []

    def _fake_enqueue(_evaluation_id: UUID) -> None:
        enqueue_calls.append("called")

    monkeypatch.setattr(
        "src.interface.workers.behavioral_ai_dispatcher.enqueue_behavioral_ai_evaluation",
        _fake_enqueue,
    )

    result = await _detect_stuck_behavioral_ai_evaluations_async("stuck-task-1")
    assert result["status"] == "ok"
    assert result["total_found"] == 3
    assert result["total_marked"] == 3
    assert result["evaluations_marked_failed"] == 3

    await db_session.refresh(stuck_processing)
    await db_session.refresh(stale_pending)
    await db_session.refresh(completed)
    await db_session.refresh(recent_processing)
    await db_session.refresh(recent_pending)
    await db_session.refresh(due_retry)

    assert stuck_processing.status == "failed"
    assert stale_pending.status == "failed"
    assert due_retry.status == "failed"
    assert completed.status == "completed"
    assert recent_processing.status == "processing"
    assert recent_pending.status == "pending"
    assert stuck_processing.error_message == "behavioral_ai_stuck_processing_timeout"
    assert stale_pending.error_message == "behavioral_ai_stale_pending_timeout"
    assert due_retry.error_message == "behavioral_ai_retry_scheduled_timeout"
    assert enqueue_calls == []


@pytest.mark.asyncio
async def test_stuck_detection_error_message_is_sanitized_and_no_sensitive_payload(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    template, _ = await _create_template_with_competencies(db_session)
    owner_id = uuid4()
    job, candidate = await _create_job_and_candidate(
        db_session,
        created_by=owner_id,
        template_id=template.id,
    )
    assignment = await _create_assignment(
        db_session, job.id, candidate.id, template, status="submitted"
    )
    sensitive_text = "CPF 123.456.789-10 CV completo do candidato"
    eval_row = BehavioralAssessmentAIEvaluationModel(
        id=uuid4(),
        assignment_id=assignment.id,
        candidate_id=candidate.id,
        job_id=job.id,
        template_id=template.id,
        status="processing",
        provider="gemini",
        model="gemini-2.5-flash",
        prompt_version=1,
        started_at=datetime.now(UTC) - timedelta(minutes=50),
        updated_at=datetime.now(UTC) - timedelta(minutes=50),
        summary=sensitive_text,
    )
    db_session.add(eval_row)
    await db_session.commit()

    class _EngineHandle:
        async def dispose(self) -> None:
            return None

    async def _fake_sessionmaker_factory():
        session_factory = async_sessionmaker(
            db_session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return _EngineHandle(), session_factory

    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _fake_sessionmaker_factory,
    )

    result = await _detect_stuck_behavioral_ai_evaluations_async("stuck-task-2")
    assert result["evaluations_marked_failed"] == 1
    await db_session.refresh(eval_row)
    assert eval_row.status == "failed"
    assert eval_row.error_message == "behavioral_ai_stuck_processing_timeout"
    assert "CPF 123.456.789-10" not in (eval_row.error_message or "")
