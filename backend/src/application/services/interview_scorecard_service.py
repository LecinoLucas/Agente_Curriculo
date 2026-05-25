from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.interview_scorecard_model import (
    InterviewScorecardItemModel,
    InterviewScorecardModel,
)
from src.infrastructure.repositories.sqlalchemy_interview_scorecard_repository import (
    SQLAlchemyInterviewScorecardRepository,
)
from src.interface.api.schemas.interview_scorecard_schemas import (
    InterviewScorecardCreateRequest,
    InterviewScorecardEnvelopeResponse,
    InterviewScorecardItemResponse,
    InterviewScorecardItemUpsert,
    InterviewScorecardPatchRequest,
    InterviewScorecardResponse,
)


class InterviewScorecardService:
    def __init__(self, repository: SQLAlchemyInterviewScorecardRepository) -> None:
        self._repository = repository

    async def get_for_candidate_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        interview_id: UUID | None = None,
        evaluator_id: UUID | None = None,
    ) -> InterviewScorecardEnvelopeResponse:
        pipeline_id = await self._assert_active_pipeline(candidate_id=candidate_id, job_id=job_id)
        await self._validate_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            interview_id=interview_id,
            pipeline_id=pipeline_id,
        )
        scorecard = await self._repository.find_for_candidate_job(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=pipeline_id,
            interview_id=interview_id,
            evaluator_id=evaluator_id,
        )
        return InterviewScorecardEnvelopeResponse(
            scorecard=self._response(scorecard) if scorecard else None,
            suggested_behavioral_questions=await self._repository.list_suggested_behavioral_questions(
                candidate_id=candidate_id,
                job_id=job_id,
                pipeline_id=pipeline_id,
            ),
        )

    async def create(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        evaluator_id: UUID | None,
        body: InterviewScorecardCreateRequest,
    ) -> InterviewScorecardResponse:
        pipeline_id = await self._assert_active_pipeline(candidate_id=candidate_id, job_id=job_id)
        await self._validate_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            interview_id=body.interview_id,
            pipeline_id=pipeline_id,
        )

        existing = await self._repository.find_for_candidate_job(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=pipeline_id,
            interview_id=body.interview_id,
        )
        if existing is not None:
            raise ConflictException("Scorecard de entrevista já existe para este contexto.")

        scorecard = InterviewScorecardModel(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=pipeline_id,
            interview_id=body.interview_id,
            evaluator_id=evaluator_id,
            status="draft",
            final_recommendation=body.final_recommendation,
            overall_notes=self._clean_text(body.overall_notes),
        )
        scorecard.items = self._build_items(body.items)
        await self._repository.create(scorecard)
        return self._response(scorecard)

    async def patch(
        self,
        *,
        scorecard_id: UUID,
        body: InterviewScorecardPatchRequest,
    ) -> InterviewScorecardResponse:
        scorecard = await self._get_editable(scorecard_id)
        if "interview_id" in body.model_fields_set:
            await self._validate_interview(
                candidate_id=scorecard.candidate_id,
                job_id=scorecard.job_id,
                interview_id=body.interview_id,
                pipeline_id=scorecard.pipeline_id,
            )
            scorecard.interview_id = body.interview_id
        if "final_recommendation" in body.model_fields_set:
            scorecard.final_recommendation = body.final_recommendation
        if "overall_notes" in body.model_fields_set:
            scorecard.overall_notes = self._clean_text(body.overall_notes)
        scorecard.updated_at = datetime.now(UTC)

        if body.items is not None:
            await self._repository.replace_items(scorecard, self._build_items(body.items))

        await self._repository.flush()
        return self._response(scorecard)

    async def submit(self, *, scorecard_id: UUID) -> InterviewScorecardResponse:
        scorecard = await self._get_editable(scorecard_id)
        if not scorecard.final_recommendation:
            raise ValidationException("Recomendação final é obrigatória para enviar o scorecard.")

        for item in scorecard.items:
            if item.rating is not None and not self._clean_text(item.evidence):
                raise ValidationException("Evidência é obrigatória para itens com nota.")

        now = datetime.now(UTC)
        scorecard.status = "submitted"
        scorecard.submitted_at = now
        scorecard.updated_at = now
        if scorecard.interview_id is not None:
            await self._repository.mark_interview_completed_if_waiting_feedback(scorecard.interview_id)
        await self._repository.flush()
        return self._response(scorecard)

    async def _get_editable(self, scorecard_id: UUID) -> InterviewScorecardModel:
        scorecard = await self._repository.get(scorecard_id)
        if scorecard is None:
            raise NotFoundException("Scorecard de entrevista não encontrado.")
        if scorecard.status == "submitted":
            raise ConflictException("Scorecard enviado não pode ser editado nesta fase.")
        return scorecard

    async def _assert_active_pipeline(self, *, candidate_id: UUID, job_id: UUID) -> UUID:
        pipeline_id = await self._repository.get_active_pipeline_id(candidate_id=candidate_id, job_id=job_id)
        if pipeline_id is None:
            raise NotFoundException("Candidato não possui pipeline ativo nesta vaga.")
        return pipeline_id

    async def _validate_interview(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        interview_id: UUID | None,
        pipeline_id: UUID | None,
    ) -> None:
        if interview_id is None:
            return
        interview = await self._repository.get_interview(interview_id)
        if (
            interview is None
            or interview.candidate_id != candidate_id
            or interview.job_id != job_id
            or interview.pipeline_id != pipeline_id
        ):
            raise ValidationException("Entrevista não pertence ao candidato e vaga informados.")

    def _build_items(self, items: list[InterviewScorecardItemUpsert]) -> list[InterviewScorecardItemModel]:
        return [
            InterviewScorecardItemModel(
                competency_name=item.competency_name,
                question_text=self._clean_text(item.question_text),
                rating=item.rating,
                evidence=self._clean_text(item.evidence),
                weight=item.weight,
                display_order=item.display_order,
            )
            for item in items
        ]

    @staticmethod
    def _clean_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @staticmethod
    def _response(scorecard: InterviewScorecardModel) -> InterviewScorecardResponse:
        return InterviewScorecardResponse(
            id=scorecard.id,
            candidate_id=scorecard.candidate_id,
            job_id=scorecard.job_id,
            interview_id=scorecard.interview_id,
            evaluator_id=scorecard.evaluator_id,
            status=scorecard.status,  # type: ignore[arg-type]
            final_recommendation=scorecard.final_recommendation,  # type: ignore[arg-type]
            overall_notes=scorecard.overall_notes,
            submitted_at=scorecard.submitted_at,
            created_at=scorecard.created_at,
            updated_at=scorecard.updated_at,
            items=[
                InterviewScorecardItemResponse(
                    id=item.id,
                    scorecard_id=item.scorecard_id,
                    competency_name=item.competency_name,
                    question_text=item.question_text,
                    rating=item.rating,
                    evidence=item.evidence,
                    weight=item.weight,
                    display_order=item.display_order,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                for item in sorted(scorecard.items, key=lambda current: (current.display_order, current.created_at))
            ],
        )
