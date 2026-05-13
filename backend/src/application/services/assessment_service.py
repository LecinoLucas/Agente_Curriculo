from __future__ import annotations

from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from src.domain.exceptions import ForbiddenException, NotFoundException, ValidationException
from src.infrastructure.database.models.assessment_model import (
    AssessmentOptionModel,
    AssessmentQuestionModel,
    AssessmentTemplateModel,
    CandidateAssessmentAnswerModel,
)
from src.infrastructure.repositories.sqlalchemy_assessment_repository import (
    SQLAlchemyAssessmentRepository,
)
from src.interface.api.schemas.assessment_schemas import (
    AssessmentOptionCreateRequest,
    AssessmentOptionResponse,
    AssessmentOptionUpdateRequest,
    AssessmentQuestionCreateRequest,
    AssessmentQuestionResponse,
    AssessmentQuestionUpdateRequest,
    AssessmentTemplateDuplicateRequest,
    AssessmentTemplateDetailResponse,
    AssessmentTemplateCreateRequest,
    AssessmentTemplateListFilters,
    AssessmentTemplateResponse,
    AssessmentTemplateUpdateRequest,
    CandidateAssessmentAnswerInput,
    CandidateAssessmentDetailResponse,
    CandidateAssessmentOptionResponse,
    CandidateAssessmentQuestionResponse,
    RecruiterAssessmentAnswerResponse,
    RecruiterCandidateAssessmentResponse,
    CandidateAssessmentSubmitResponse,
    JobAssessmentCreateRequest,
    JobAssessmentResponse,
    JobAssessmentUpdateRequest,
)


class AssessmentService:
    def __init__(self, repository: SQLAlchemyAssessmentRepository) -> None:
        self._repository = repository

    async def create_template(self, body: AssessmentTemplateCreateRequest) -> AssessmentTemplateResponse:
        questions = []
        for question_body in body.questions:
            self._validate_question_payload(
                question_type=question_body.question_type,
                options_count=len(question_body.options),
                metadata=question_body.metadata,
            )
            question = AssessmentQuestionModel(
                question_text=question_body.question_text.strip(),
                question_type=question_body.question_type,
                required=question_body.required,
                order_index=question_body.order_index,
                metadata_payload=question_body.metadata,
            )
            options = [
                AssessmentOptionModel(
                    option_text=option.option_text.strip(),
                    score_value=option.score_value,
                    metadata_payload=option.metadata,
                    order_index=option.order_index,
                )
                for option in question_body.options
            ]
            questions.append((question, options))

        if body.status == "active" and len(questions) == 0:
            raise ValidationException("Template ativo precisa ter pelo menos uma pergunta")

        template = await self._repository.create_template(
            AssessmentTemplateModel(
                title=body.title.strip(),
                description=body.description.strip() if body.description else None,
                type=body.type,
                status=body.status,
                version=body.version,
            ),
            questions,
        )
        detail = await self._repository.get_template(template.id)
        if detail is None:
            raise NotFoundException("Template de avaliação não encontrado")
        return AssessmentTemplateResponse(**detail)

    async def list_templates(self, filters: AssessmentTemplateListFilters | None = None) -> list[AssessmentTemplateResponse]:
        filter_payload = filters or AssessmentTemplateListFilters()
        rows = await self._repository.list_templates(
            type_filter=filter_payload.type,
            status_filter=filter_payload.status,
        )
        return [AssessmentTemplateResponse(**item) for item in rows]

    async def get_template(self, template_id: UUID) -> AssessmentTemplateDetailResponse:
        row = await self._repository.get_template(template_id)
        if row is None:
            raise NotFoundException("Template de avaliação não encontrado")
        usage = await self._repository.count_template_usage(template_id)
        return AssessmentTemplateDetailResponse(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            type=row["type"],
            status=row["status"],
            version=row["version"],
            question_count=row.get("question_count", 0),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            job_link_count=usage["job_links"],
            assignment_count=usage["assignments"],
            is_used=(usage["job_links"] + usage["assignments"]) > 0,
            questions=[
                AssessmentQuestionResponse(
                    id=item["id"],
                    question_text=item["question_text"],
                    question_type=item["question_type"],
                    required=item["required"],
                    order_index=item["order_index"],
                    metadata=item["metadata"],
                    options=[
                        AssessmentOptionResponse(
                            id=option["id"],
                            option_text=option["option_text"],
                            score_value=option["score_value"],
                            metadata=option["metadata"],
                            order_index=option["order_index"],
                        )
                        for option in item["options"]
                    ],
                )
                for item in row.get("questions", [])
            ],
        )

    async def update_template(
        self,
        template_id: UUID,
        body: AssessmentTemplateUpdateRequest,
    ) -> AssessmentTemplateResponse:
        values = body.model_dump(exclude_unset=True)
        if "title" in values and values["title"] is not None:
            values["title"] = values["title"].strip()
        if "description" in values and values["description"] is not None:
            values["description"] = values["description"].strip() or None
        if values.get("status") == "active":
            detail = await self._repository.get_template(template_id)
            if detail is None:
                raise NotFoundException("Template de avaliação não encontrado")
            if len(detail.get("questions", [])) == 0:
                raise ValidationException("Template ativo precisa ter pelo menos uma pergunta")
        result = await self._repository.update_template(template_id, values)
        if result is None:
            raise NotFoundException("Template de avaliação não encontrado")
        detail = await self._repository.get_template(template_id)
        if detail is None:
            raise NotFoundException("Template de avaliação não encontrado")
        return AssessmentTemplateResponse(**detail)

    async def duplicate_template(
        self,
        template_id: UUID,
        body: AssessmentTemplateDuplicateRequest,
    ) -> AssessmentTemplateResponse:
        source = await self._repository.get_template(template_id)
        if source is None:
            raise NotFoundException("Template de avaliação não encontrado")
        if body.status == "active" and len(source.get("questions", [])) == 0:
            raise ValidationException("Template ativo precisa ter pelo menos uma pergunta")
        title = body.title.strip() if body.title else f"{source['title']} (cópia)"
        duplicated = await self._repository.duplicate_template(
            source_template_id=template_id,
            title=title,
            status=body.status,
        )
        if duplicated is None:
            raise NotFoundException("Template de avaliação não encontrado")
        detail = await self._repository.get_template(duplicated.id)
        if detail is None:
            raise NotFoundException("Template de avaliação não encontrado")
        return AssessmentTemplateResponse(**detail)

    async def archive_template(self, template_id: UUID) -> AssessmentTemplateResponse:
        result = await self._repository.update_template(template_id, {"status": "archived"})
        if result is None:
            raise NotFoundException("Template de avaliação não encontrado")
        detail = await self._repository.get_template(template_id)
        if detail is None:
            raise NotFoundException("Template de avaliação não encontrado")
        return AssessmentTemplateResponse(**detail)

    async def create_question(
        self,
        template_id: UUID,
        body: AssessmentQuestionCreateRequest,
    ) -> AssessmentQuestionResponse:
        template = await self._repository.get_template(template_id)
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        await self._assert_template_mutable(template)
        self._validate_question_payload(
            question_type=body.question_type,
            options_count=len(body.options),
            metadata=body.metadata,
        )

        created = await self._repository.create_question(
            template_id=template_id,
            question=AssessmentQuestionModel(
                question_text=body.question_text.strip(),
                question_type=body.question_type,
                required=body.required,
                order_index=body.order_index,
                metadata_payload=body.metadata,
            ),
            options=[
                AssessmentOptionModel(
                    option_text=option.option_text.strip(),
                    score_value=option.score_value,
                    metadata_payload=option.metadata,
                    order_index=option.order_index,
                )
                for option in body.options
            ],
        )
        return AssessmentQuestionResponse(
            id=created["id"],
            question_text=created["question_text"],
            question_type=created["question_type"],
            required=created["required"],
            order_index=created["order_index"],
            metadata=created["metadata"],
            options=[
                AssessmentOptionResponse(
                    id=option["id"],
                    option_text=option["option_text"],
                    score_value=option["score_value"],
                    metadata=option["metadata"],
                    order_index=option["order_index"],
                )
                for option in created["options"]
            ],
        )

    async def update_question(self, question_id: UUID, body: AssessmentQuestionUpdateRequest) -> AssessmentQuestionResponse:
        current = await self._repository.get_question(question_id)
        if current is None:
            raise NotFoundException("Pergunta não encontrada")
        template = await self._repository.get_template(current["template_id"])
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        await self._assert_template_mutable(template)

        question_type = body.question_type or current["question_type"]
        options_count = len(current["options"])
        self._validate_question_payload(
            question_type=question_type,
            options_count=options_count,
            metadata=body.metadata if body.metadata is not None else current["metadata"],
        )

        values = body.model_dump(exclude_unset=True)
        if "question_text" in values and values["question_text"] is not None:
            values["question_text"] = values["question_text"].strip()
        if "metadata" in values:
            values["metadata_payload"] = values.pop("metadata")

        updated = await self._repository.update_question(question_id, values)
        if updated is None:
            raise NotFoundException("Pergunta não encontrada")
        return AssessmentQuestionResponse(
            id=updated["id"],
            question_text=updated["question_text"],
            question_type=updated["question_type"],
            required=updated["required"],
            order_index=updated["order_index"],
            metadata=updated["metadata"],
            options=[
                AssessmentOptionResponse(
                    id=option["id"],
                    option_text=option["option_text"],
                    score_value=option["score_value"],
                    metadata=option["metadata"],
                    order_index=option["order_index"],
                )
                for option in updated["options"]
            ],
        )

    async def delete_question(self, question_id: UUID) -> None:
        template_id = await self._repository.get_question_template_id(question_id)
        if template_id is None:
            raise NotFoundException("Pergunta não encontrada")
        template = await self._repository.get_template(template_id)
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        usage = await self._repository.count_template_usage(template_id)
        if template["status"] == "active" and (usage["job_links"] > 0 or usage["assignments"] > 0):
            raise ValidationException(
                "Não é possível remover pergunta de template ativo já utilizado. Duplique o template."
            )
        deleted = await self._repository.delete_question(question_id)
        if not deleted:
            raise NotFoundException("Pergunta não encontrada")

    async def create_option(
        self,
        question_id: UUID,
        body: AssessmentOptionCreateRequest,
    ) -> AssessmentOptionResponse:
        question = await self._repository.get_question(question_id)
        if question is None:
            raise NotFoundException("Pergunta não encontrada")
        template = await self._repository.get_template(question["template_id"])
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        await self._assert_template_mutable(template)
        if question["question_type"] not in {"single_choice", "multiple_choice"}:
            raise ValidationException("Apenas perguntas de escolha aceitam alternativas")
        created = await self._repository.create_option(
            question_id=question_id,
            option=AssessmentOptionModel(
                option_text=body.option_text.strip(),
                score_value=body.score_value,
                metadata_payload=body.metadata,
                order_index=body.order_index,
            ),
        )
        return AssessmentOptionResponse(
            id=created["id"],
            option_text=created["option_text"],
            score_value=created["score_value"],
            metadata=created["metadata"],
            order_index=created["order_index"],
        )

    async def update_option(self, option_id: UUID, body: AssessmentOptionUpdateRequest) -> AssessmentOptionResponse:
        template_id = await self._repository.get_option_template_id(option_id)
        if template_id is None:
            raise NotFoundException("Alternativa não encontrada")
        template = await self._repository.get_template(template_id)
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        await self._assert_template_mutable(template)
        values = body.model_dump(exclude_unset=True)
        if "option_text" in values and values["option_text"] is not None:
            values["option_text"] = values["option_text"].strip()
        if "metadata" in values:
            values["metadata_payload"] = values.pop("metadata")
        updated = await self._repository.update_option(option_id, values)
        if updated is None:
            raise NotFoundException("Alternativa não encontrada")
        return AssessmentOptionResponse(
            id=updated["id"],
            option_text=updated["option_text"],
            score_value=updated["score_value"],
            metadata=updated["metadata"],
            order_index=updated["order_index"],
        )

    async def delete_option(self, option_id: UUID) -> None:
        template_id = await self._repository.get_option_template_id(option_id)
        if template_id is None:
            raise NotFoundException("Alternativa não encontrada")
        template = await self._repository.get_template(template_id)
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        await self._assert_template_mutable(template)
        deleted = await self._repository.delete_option(option_id)
        if not deleted:
            raise NotFoundException("Alternativa não encontrada")

    async def attach_template_to_job(
        self,
        job_id: UUID,
        body: JobAssessmentCreateRequest,
    ) -> JobAssessmentResponse:
        template = await self._repository.get_template(body.template_id)
        if template is None:
            raise NotFoundException("Template de avaliação não encontrado")
        if template["status"] != "active":
            raise ValidationException("Apenas templates ativos podem ser vinculados a vagas")
        result = await self._repository.create_job_assessment(
            job_id=job_id,
            template_id=body.template_id,
            required=body.required,
            trigger_stage=body.trigger_stage,
            order_index=body.order_index,
        )
        active_candidates = await self._repository.list_active_candidates_for_job(job_id)
        for row in active_candidates:
            candidate_id = row["candidate_id"]
            pipeline_id = row.get("pipeline_id") or uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
            await self._repository.create_assignments_for_job(
                candidate_id=candidate_id,
                job_id=job_id,
                pipeline_id=pipeline_id,
            )
        return JobAssessmentResponse(**result)

    async def list_job_assessments(self, job_id: UUID) -> list[JobAssessmentResponse]:
        rows = await self._repository.list_job_assessments(job_id)
        return [JobAssessmentResponse(**row) for row in rows]

    async def update_job_assessment(
        self,
        *,
        job_id: UUID,
        job_assessment_id: UUID,
        body: JobAssessmentUpdateRequest,
    ) -> JobAssessmentResponse:
        values = body.model_dump(exclude_unset=True)
        if not values:
            raise ValidationException("Nenhuma alteração informada")
        result = await self._repository.update_job_assessment(
            job_id=job_id,
            job_assessment_id=job_assessment_id,
            values=values,
        )
        if result is None:
            raise NotFoundException("Avaliação da vaga não encontrada")
        return JobAssessmentResponse(**result)

    async def delete_job_assessment(self, *, job_id: UUID, job_assessment_id: UUID) -> None:
        deleted = await self._repository.delete_job_assessment(
            job_id=job_id,
            job_assessment_id=job_assessment_id,
        )
        if not deleted:
            raise NotFoundException("Avaliação da vaga não encontrada")

    async def create_assignments_for_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID | None,
        pipeline_id: UUID | None,
    ) -> list[dict]:
        if job_id is None:
            return []
        return await self._repository.create_assignments_for_job(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=pipeline_id,
        )

    async def list_public_assignments(
        self,
        *,
        candidate_id: UUID,
        pipeline_id: UUID | None,
        job_id: UUID | None = None,
    ) -> list[dict]:
        if pipeline_id is None and job_id is None:
            return []
        return await self._repository.list_candidate_assignments(
            candidate_id,
            pipeline_id=pipeline_id,
            job_id=job_id,
        )

    async def list_recruiter_assignments(
        self,
        candidate_id: UUID,
        *,
        include_answers: bool = False,
    ) -> list[RecruiterCandidateAssessmentResponse]:
        rows = await self._repository.list_candidate_assignments(candidate_id)
        responses: list[RecruiterCandidateAssessmentResponse] = []
        for row in rows:
            answers: list[RecruiterAssessmentAnswerResponse] = []
            if include_answers:
                answer_rows = await self._repository.list_assignment_answers(row["id"])
                answers = [
                    RecruiterAssessmentAnswerResponse(
                        id=item["id"],
                        question_id=item["question_id"],
                        question_text=item["question_text"],
                        question_type=item["question_type"],
                        option_id=item["option_id"],
                        option_text=item["option_text"],
                        answer_text=item["answer_text"],
                        answer_value=item["answer_value"],
                        created_at=item["created_at"],
                    )
                    for item in answer_rows
                ]

            responses.append(
                RecruiterCandidateAssessmentResponse(
                    id=row["id"],
                    type=row["type"],
                    title=row["title"],
                    description=row["description"],
                    status=row["status"],
                    required=bool((row.get("metadata_payload") or {}).get("required", True)),
                    due_at=row["due_at"],
                    assigned_at=row["assigned_at"],
                    started_at=row["started_at"],
                    completed_at=row["completed_at"],
                    result_summary=row["result_summary"],
                    answers=answers,
                )
            )
        return responses

    async def get_public_assignment(
        self,
        *,
        candidate_id: UUID,
        assignment_id: UUID,
    ) -> CandidateAssessmentDetailResponse:
        assignment = await self._repository.get_assignment_for_candidate(assignment_id, candidate_id)
        if assignment is None:
            raise NotFoundException("Avaliação não encontrada")
        questions = await self._repository.list_questions_with_options(assignment["template_id"])
        return CandidateAssessmentDetailResponse(
            id=assignment["id"],
            type=assignment["type"],
            title=assignment["title"],
            description=assignment["description"],
            status=assignment["status"],
            required=bool((assignment.get("metadata_payload") or {}).get("required", True)),
            due_at=assignment["due_at"],
            questions=[
                CandidateAssessmentQuestionResponse(
                    id=question["id"],
                    question_text=question["question_text"],
                    question_type=question["question_type"],
                    required=question["required"],
                    order_index=question["order_index"],
                    metadata=question["metadata"],
                    options=[
                        CandidateAssessmentOptionResponse(
                            id=option["id"],
                            option_text=option["option_text"],
                            order_index=option["order_index"],
                        )
                        for option in question["options"]
                    ],
                )
                for question in questions
            ],
        )

    async def start_public_assignment(self, *, candidate_id: UUID, assignment_id: UUID) -> CandidateAssessmentDetailResponse:
        assignment = await self._repository.get_assignment_for_candidate(assignment_id, candidate_id)
        if assignment is None:
            raise NotFoundException("Avaliação não encontrada")
        if assignment["status"] == "completed":
            raise ValidationException("Esta avaliação já foi concluída")
        await self._repository.mark_started(assignment_id)
        return await self.get_public_assignment(candidate_id=candidate_id, assignment_id=assignment_id)

    async def submit_public_assignment(
        self,
        *,
        candidate_id: UUID,
        assignment_id: UUID,
        answers: list[CandidateAssessmentAnswerInput],
    ) -> CandidateAssessmentSubmitResponse:
        assignment = await self._repository.get_assignment_for_candidate(assignment_id, candidate_id)
        if assignment is None:
            raise NotFoundException("Avaliação não encontrada")
        if assignment["status"] == "completed":
            raise ValidationException("Esta avaliação já foi concluída")
        if await self._repository.has_answers(assignment_id):
            raise ValidationException("Esta avaliação já foi respondida")

        detail = await self.get_public_assignment(candidate_id=candidate_id, assignment_id=assignment_id)
        questions = {question.id: question for question in detail.questions}
        provided_question_ids = {answer.question_id for answer in answers}
        missing = [question for question in detail.questions if question.required and question.id not in provided_question_ids]
        if missing:
            raise ValidationException("Responda todas as perguntas obrigatórias")

        score = Decimal("0")
        saved_answers: list[CandidateAssessmentAnswerModel] = []
        for answer in answers:
            question = questions.get(answer.question_id)
            if question is None:
                raise ForbiddenException("Pergunta não pertence a esta avaliação")
            selected_ids = answer.option_ids or ([answer.option_id] if answer.option_id else [])
            if question.question_type in {"single_choice", "multiple_choice"} and not selected_ids:
                raise ValidationException("Selecione uma alternativa")
            if question.question_type == "single_choice" and len(selected_ids) > 1:
                raise ValidationException("Selecione apenas uma alternativa")
            if question.question_type == "scale" and answer.answer_value is None:
                raise ValidationException("Informe um valor para a escala")
            if question.question_type == "text" and not (answer.answer_text or "").strip():
                raise ValidationException("Informe uma resposta textual")

            valid_option_ids = {option.id for option in question.options}
            for option_id in selected_ids:
                if option_id not in valid_option_ids:
                    raise ForbiddenException("Alternativa não pertence a esta avaliação")
                saved_answers.append(
                    CandidateAssessmentAnswerModel(
                        assignment_id=assignment_id,
                        question_id=answer.question_id,
                        option_id=option_id,
                    )
                )
            if not selected_ids:
                saved_answers.append(
                    CandidateAssessmentAnswerModel(
                        assignment_id=assignment_id,
                        question_id=answer.question_id,
                        answer_text=answer.answer_text.strip() if answer.answer_text else None,
                        answer_value=answer.answer_value,
                    )
                )

        await self._repository.save_answers_and_complete(
            assignment_id=assignment_id,
            answers=saved_answers,
            score=float(score) if saved_answers else None,
            result_summary="Avaliação concluída pelo candidato.",
        )
        return CandidateAssessmentSubmitResponse(
            id=assignment_id,
            status="completed",
            message="Respostas enviadas com sucesso.",
        )

    @staticmethod
    def _validate_question_payload(
        *,
        question_type: str,
        options_count: int,
        metadata: dict | None,
    ) -> None:
        if question_type in {"single_choice", "multiple_choice"} and options_count < 2:
            raise ValidationException("Perguntas de escolha precisam de pelo menos duas opções")
        if question_type == "scale":
            if not isinstance(metadata, dict):
                raise ValidationException("Perguntas de escala precisam de faixa mínima e máxima")
            min_value = metadata.get("min")
            max_value = metadata.get("max")
            if not isinstance(min_value, (int, float)) or not isinstance(max_value, (int, float)):
                raise ValidationException("Escala inválida: defina min e max numéricos")
            if min_value >= max_value:
                raise ValidationException("Escala inválida: min deve ser menor que max")

    async def _assert_template_mutable(self, template: dict) -> None:
        if template["status"] == "archived":
            raise ValidationException("Template arquivado não pode ser alterado")
        usage = await self._repository.count_template_usage(template["id"])
        if template["status"] == "active" and (usage["job_links"] > 0 or usage["assignments"] > 0):
            raise ValidationException(
                "Template ativo já utilizado não pode ser alterado estruturalmente. Duplique a versão."
            )
