from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
    SQLAlchemyBehavioralAssignmentRepository,
)
from src.interface.api.schemas.behavioral_assignment_schemas import (
    BehavioralAssignmentAnswerResponse,
    BehavioralAssignmentAnswerUpsertRequest,
    BehavioralAssignmentCompetencyResponse,
    BehavioralAssignmentDetailResponse,
    BehavioralAssignmentQuestionResponse,
    BehavioralAssignmentSummaryResponse,
    RecruiterBehavioralAssessmentStatusResponse,
)


class BehavioralAssignmentService:
    def __init__(self, repository: SQLAlchemyBehavioralAssignmentRepository) -> None:
        self._repository = repository

    async def ensure_assignment_for_application(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        template_id: UUID | None,
    ) -> BehavioralAssessmentAssignmentModel | None:
        if template_id is None:
            return None

        template = await self._repository.get_active_template(template_id)
        if template is None:
            return None

        existing = await self._repository.find_assignment(
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
        )
        if existing is not None:
            return existing

        integrity_error: IntegrityError | None = None
        try:
            # Savepoint keeps outer workflow transaction intact on duplicate insert races.
            async with self._repository._session.begin_nested():
                return await self._repository.create_assignment(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    template_id=template_id,
                )
        except IntegrityError as exc:
            integrity_error = exc

        recovered = await self._repository.find_assignment(
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
        )
        if recovered is not None:
            return recovered
        if integrity_error is not None:
            raise integrity_error
        return None

    async def ensure_behavioral_assignment_for_candidate_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        requires_behavioral_assessment: bool,
        template_id: UUID | None,
        pipeline_active: bool = True,
    ) -> BehavioralAssessmentAssignmentModel | None:
        if not pipeline_active:
            return None
        if not requires_behavioral_assessment:
            return None
        return await self.ensure_assignment_for_application(
            candidate_id=candidate_id,
            job_id=job_id,
            template_id=template_id,
        )

    async def list_for_candidate(self, candidate_id: UUID) -> list[BehavioralAssignmentSummaryResponse]:
        rows = await self._repository.list_assignments_for_candidate(candidate_id)
        return [self._summary_from_row(row) for row in rows]

    async def list_for_candidate_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> list[BehavioralAssignmentSummaryResponse]:
        rows = await self._repository.list_assignments_for_candidate_job(candidate_id=candidate_id, job_id=job_id)
        return [self._summary_from_row(row) for row in rows]

    async def get_detail_for_candidate(
        self,
        *,
        assignment_id: UUID,
        candidate_id: UUID,
    ) -> BehavioralAssignmentDetailResponse:
        assignment = await self._repository.get_assignment_for_candidate(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
        )
        if assignment is None:
            raise NotFoundException("Avaliação comportamental não encontrada.")
        return await self._build_detail(assignment)

    async def start(
        self,
        *,
        assignment_id: UUID,
        candidate_id: UUID,
    ) -> BehavioralAssignmentDetailResponse:
        assignment = await self._repository.get_assignment_for_candidate(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
        )
        if assignment is None:
            raise NotFoundException("Avaliação comportamental não encontrada.")
        if assignment.status == "submitted":
            raise ConflictException("Avaliação comportamental já enviada.")
        if assignment.status == "cancelled":
            raise ConflictException("Avaliação comportamental cancelada.")

        now = datetime.now(UTC)
        if assignment.status == "pending":
            assignment.status = "in_progress"
            assignment.started_at = now
        assignment.updated_at = now
        await self._repository.update_assignment(assignment)
        return await self._build_detail(assignment)

    async def save_answers(
        self,
        *,
        assignment_id: UUID,
        candidate_id: UUID,
        answers: list[BehavioralAssignmentAnswerUpsertRequest],
    ) -> BehavioralAssignmentDetailResponse:
        assignment = await self._repository.get_assignment_for_candidate(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
        )
        if assignment is None:
            raise NotFoundException("Avaliação comportamental não encontrada.")
        if assignment.status == "submitted":
            raise ConflictException("Avaliação comportamental já enviada.")

        questions = await self._questions_by_id(assignment.template_id)
        now = datetime.now(UTC)
        for answer in answers:
            question = questions.get(answer.question_id)
            if question is None:
                raise ValidationException("Pergunta não pertence a esta avaliação.")
            normalized = self._normalize_answer(question, answer, require_required=False)
            await self._repository.upsert_answer(
                assignment_id=assignment.id,
                question_id=answer.question_id,
                answer_text=normalized["answer_text"],
                answer_value=normalized["answer_value"],
                selected_options_json=normalized["selected_options_json"],
                updated_at=now,
            )

        if assignment.status == "pending":
            assignment.status = "in_progress"
            assignment.started_at = assignment.started_at or now
        assignment.updated_at = now
        await self._repository.update_assignment(assignment)
        return await self._build_detail(assignment)

    async def submit(
        self,
        *,
        assignment_id: UUID,
        candidate_id: UUID,
        answers: list[BehavioralAssignmentAnswerUpsertRequest] | None = None,
    ) -> BehavioralAssignmentDetailResponse:
        if answers:
            await self.save_answers(
                assignment_id=assignment_id,
                candidate_id=candidate_id,
                answers=answers,
            )

        assignment = await self._repository.get_assignment_for_candidate(
            assignment_id=assignment_id,
            candidate_id=candidate_id,
        )
        if assignment is None:
            raise NotFoundException("Avaliação comportamental não encontrada.")
        if assignment.status == "submitted":
            raise ConflictException("Avaliação comportamental já enviada.")

        questions = await self._questions_by_id(assignment.template_id)
        existing_answers = {
            answer.question_id: answer
            for answer in await self._repository.list_answers(assignment.id)
        }
        for question in questions.values():
            if not question.is_required:
                continue
            answer = existing_answers.get(question.id)
            if answer is None or not self._is_answer_present(question, answer):
                raise ValidationException("Responda todas as perguntas obrigatórias antes de enviar.")

        now = datetime.now(UTC)
        assignment.status = "submitted"
        assignment.started_at = assignment.started_at or now
        assignment.submitted_at = now
        assignment.updated_at = now
        await self._repository.update_assignment(assignment)
        return await self._build_detail(assignment)

    async def get_recruiter_status(
        self,
        *,
        job_id: UUID,
        candidate_id: UUID,
    ) -> RecruiterBehavioralAssessmentStatusResponse | BehavioralAssignmentDetailResponse:
        """Get full behavioral assessment detail for recruiter view."""
        row = await self._repository.get_summary_for_job_candidate(job_id=job_id, candidate_id=candidate_id)
        if row is None:
            return RecruiterBehavioralAssessmentStatusResponse()

        # Fetch full assignment for detailed view with competencies and answers
        assignment_id = UUID(row["id"]) if isinstance(row["id"], str) else row["id"]
        assignment = await self._repository.get_assignment(assignment_id)
        if assignment is None:
            return RecruiterBehavioralAssessmentStatusResponse(
                status=row["status"],
                assigned_at=row["assigned_at"],
                started_at=row["started_at"],
                submitted_at=row["submitted_at"],
                template_name=row["template_name"],
                answered_count=int(row["answered_count"] or 0),
                question_count=int(row["question_count"] or 0),
            )

        return await self._build_detail(assignment)

    async def _build_detail(
        self,
        assignment: BehavioralAssessmentAssignmentModel,
    ) -> BehavioralAssignmentDetailResponse:
        summaries = await self._repository.list_assignments_for_candidate_job(
            candidate_id=assignment.candidate_id,
            job_id=assignment.job_id,
        )
        row = next(item for item in summaries if item["id"] == assignment.id)
        competencies = await self._repository.get_template_structure(assignment.template_id)
        questions = await self._repository.get_questions_for_template(assignment.template_id)
        answers = {
            answer.question_id: BehavioralAssignmentAnswerResponse(
                question_id=answer.question_id,
                answer_text=answer.answer_text,
                answer_value=answer.answer_value,
                selected_options_json=answer.selected_options_json,
            )
            for answer in await self._repository.list_answers(assignment.id)
        }
        questions_by_competency: dict[UUID, list[BehavioralTemplateQuestionModel]] = {}
        for question in questions:
            questions_by_competency.setdefault(question.competency_id, []).append(question)

        return BehavioralAssignmentDetailResponse(
            **self._summary_from_row(row).model_dump(),
            competencies=[
                self._competency_response(competency, questions_by_competency.get(competency.id, []), answers)
                for competency in competencies
            ],
        )

    @staticmethod
    def _competency_response(
        competency: BehavioralTemplateCompetencyModel,
        questions: list[BehavioralTemplateQuestionModel],
        answers: dict[UUID, BehavioralAssignmentAnswerResponse],
    ) -> BehavioralAssignmentCompetencyResponse:
        return BehavioralAssignmentCompetencyResponse(
            id=competency.id,
            name=competency.name,
            description=competency.description,
            display_order=competency.display_order,
            questions=[
                BehavioralAssignmentQuestionResponse(
                    id=question.id,
                    question_text=question.question_text,
                    answer_type=question.answer_type,
                    is_required=question.is_required,
                    display_order=question.display_order,
                    options_json=question.options_json,
                    answer=answers.get(question.id),
                )
                for question in questions
            ],
        )

    async def _questions_by_id(self, template_id: UUID) -> dict[UUID, BehavioralTemplateQuestionModel]:
        questions = await self._repository.get_questions_for_template(template_id)
        return {question.id: question for question in questions}

    def _normalize_answer(
        self,
        question: BehavioralTemplateQuestionModel,
        answer: BehavioralAssignmentAnswerUpsertRequest,
        *,
        require_required: bool,
    ) -> dict[str, Any]:
        answer_text = answer.answer_text.strip() if answer.answer_text is not None else None
        selected_options = [str(item).strip() for item in answer.selected_options_json or [] if str(item).strip()]
        answer_value = answer.answer_value

        if question.answer_type == "text":
            if require_required and question.is_required and not answer_text:
                raise ValidationException("Resposta obrigatória não preenchida.")
            return {
                "answer_text": answer_text or None,
                "answer_value": None,
                "selected_options_json": None,
            }

        if question.answer_type == "scale":
            if answer_value is None:
                return {"answer_text": None, "answer_value": None, "selected_options_json": None}
            minimum, maximum = self._scale_range(question.options_json)
            if answer_value < minimum or answer_value > maximum:
                raise ValidationException("Valor fora da faixa permitida para a pergunta.")
            return {
                "answer_text": None,
                "answer_value": answer_value,
                "selected_options_json": None,
            }

        if question.answer_type == "multiple_choice":
            allowed = self._allowed_options(question.options_json)
            invalid = [option for option in selected_options if option not in allowed]
            if invalid:
                raise ValidationException("Opção inválida para a pergunta.")
            return {
                "answer_text": None,
                "answer_value": None,
                "selected_options_json": selected_options or None,
            }

        raise ValidationException("Tipo de pergunta comportamental inválido.")

    def _is_answer_present(self, question: BehavioralTemplateQuestionModel, answer: Any) -> bool:
        if question.answer_type == "text":
            return bool((answer.answer_text or "").strip())
        if question.answer_type == "scale":
            return answer.answer_value is not None
        if question.answer_type == "multiple_choice":
            return bool(answer.selected_options_json)
        return False

    @staticmethod
    def _allowed_options(options_json: Any) -> set[str]:
        if not options_json:
            return set()
        allowed: set[str] = set()
        for option in options_json if isinstance(options_json, list) else []:
            if isinstance(option, dict):
                for key in ("value", "id", "label", "text"):
                    value = option.get(key)
                    if value is not None:
                        allowed.add(str(value))
            else:
                allowed.add(str(option))
        return allowed

    @staticmethod
    def _scale_range(options_json: Any) -> tuple[Decimal, Decimal]:
        if isinstance(options_json, dict):
            minimum = options_json.get("min", 1)
            maximum = options_json.get("max", 5)
        elif isinstance(options_json, list):
            numeric_values: list[Decimal] = []
            for option in options_json:
                try:
                    numeric_values.append(Decimal(str(option)))
                except (InvalidOperation, TypeError, ValueError):
                    continue
            if numeric_values:
                return min(numeric_values), max(numeric_values)
            minimum, maximum = 1, 5
        else:
            minimum, maximum = 1, 5
        return Decimal(str(minimum)), Decimal(str(maximum))

    @staticmethod
    def _summary_from_row(row: dict[str, Any]) -> BehavioralAssignmentSummaryResponse:
        return BehavioralAssignmentSummaryResponse(
            id=row["id"],
            candidate_id=row["candidate_id"],
            job_id=row["job_id"],
            job_title=row.get("job_title"),
            template_id=row["template_id"],
            template_name=row["template_name"],
            status=row["status"],
            assigned_at=row["assigned_at"],
            started_at=row["started_at"],
            submitted_at=row["submitted_at"],
            expires_at=row["expires_at"],
            ai_evaluation_status=row.get("ai_evaluation_status"),
            answered_count=int(row["answered_count"] or 0),
            question_count=int(row["question_count"] or 0),
        )
