from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.application.services.decision_summary_service import DecisionSummaryService
from src.application.services.pipeline_service import PipelineService
from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel
from src.infrastructure.repositories.sqlalchemy_decision_summary_repository import SQLAlchemyDecisionSummaryRepository
from src.infrastructure.repositories.sqlalchemy_hiring_decision_repository import SQLAlchemyHiringDecisionRepository
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository
from src.interface.api.schemas.hiring_decision_schemas import (
    HiringDecisionCreateRequest,
    HiringDecisionEnvelopeResponse,
    HiringDecisionHistoryResponse,
    HiringDecisionPatchRequest,
    HiringDecisionResponse,
)
from src.interface.api.schemas.pipeline_schemas import MoveCandidateRequest


class HiringDecisionService:
    def __init__(
        self,
        repository: SQLAlchemyHiringDecisionRepository,
        decision_summary_repository: SQLAlchemyDecisionSummaryRepository,
        pipeline_repository: SQLAlchemyPipelineRepository,
    ) -> None:
        self._repository = repository
        self._summary_service = DecisionSummaryService(decision_summary_repository)
        self._pipeline_service = PipelineService(pipeline_repository, pipeline_repository._session)

    async def get_current(self, *, candidate_id: UUID, job_id: UUID) -> HiringDecisionEnvelopeResponse:
        decision = await self._repository.get_current(candidate_id=candidate_id, job_id=job_id)
        return HiringDecisionEnvelopeResponse(decision=self._response(decision) if decision else None)

    async def list_history(self, *, candidate_id: UUID, job_id: UUID) -> HiringDecisionHistoryResponse:
        decisions = await self._repository.list_history(candidate_id=candidate_id, job_id=job_id)
        return HiringDecisionHistoryResponse(decisions=[self._response(decision) for decision in decisions])

    async def create(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        decided_by: UUID | None,
        body: HiringDecisionCreateRequest,
    ) -> HiringDecisionResponse:
        await self._assert_job_exists(job_id)
        notes = self._clean_text(body.notes)
        await self._validate_business_rules(
            candidate_id=candidate_id,
            job_id=job_id,
            decision_outcome=body.decision_outcome,
            reason_code=body.reason_code,
            notes=notes,
        )

        summary_snapshot = await self._summary_snapshot(candidate_id=candidate_id, job_id=job_id)
        refs = await self._basis_refs(candidate_id=candidate_id, job_id=job_id)
        pipeline = await self._repository.get_active_pipeline(candidate_id=candidate_id, job_id=job_id)
        current = await self._repository.get_current(candidate_id=candidate_id, job_id=job_id)
        now = datetime.now(UTC)
        if current is not None:
            current.decision_status = "superseded"
            current.updated_at = now
            await self._repository.flush()

        decision = CandidateJobHiringDecisionModel(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=pipeline["candidate_job_pipeline_id"] if pipeline is not None else None,
            decided_by=decided_by,
            decision_status="submitted" if body.submit else "draft",
            decision_outcome=body.decision_outcome,
            reason_code=body.reason_code,
            notes=notes,
            based_on_decision_summary_snapshot=summary_snapshot,
            based_on_scorecard_id=refs["scorecard_id"],
            based_on_behavioral_assignment_id=refs["assignment_id"],
            based_on_behavioral_ai_evaluation_id=refs["ai_evaluation_id"],
            submitted_at=now if body.submit else None,
            created_at=now,
            updated_at=now,
        )
        await self._repository.add(decision)

        transition_id = None
        if body.pipeline_action and body.pipeline_action.enabled:
            if body.pipeline_action.target_stage is None:
                raise ValidationException("target_stage é obrigatório quando pipeline_action.enabled=true.")
            if decided_by is None:
                raise ValidationException("Usuário decisor é obrigatório para mover pipeline.")
            move = await self._pipeline_service.move_candidate(
                candidate_id=candidate_id,
                body=MoveCandidateRequest(
                    job_id=job_id,
                    stage=body.pipeline_action.target_stage,
                    notes=notes,
                    reason=body.pipeline_action.reason or "Decisão final humana registrada.",
                ),
                moved_by=decided_by,
            )
            transition_id = move.transition_id

        return self._response(decision, pipeline_transition_id=transition_id)

    async def patch(
        self,
        *,
        decision_id: UUID,
        body: HiringDecisionPatchRequest,
    ) -> HiringDecisionResponse:
        decision = await self._repository.get(decision_id)
        if decision is None:
            raise NotFoundException("Decisão final não encontrada.")
        if decision.decision_status == "submitted":
            raise ConflictException("Decisão final submitted não pode ser editada diretamente.")
        if decision.decision_status == "superseded":
            raise ConflictException("Decisão final superseded não pode ser editada.")

        outcome = body.decision_outcome or decision.decision_outcome
        reason_code = body.reason_code or decision.reason_code
        notes = self._clean_text(body.notes) if "notes" in body.model_fields_set else decision.notes

        await self._validate_business_rules(
            candidate_id=decision.candidate_id,
            job_id=decision.job_id,
            decision_outcome=outcome,
            reason_code=reason_code,
            notes=notes,
        )

        now = datetime.now(UTC)
        decision.decision_outcome = outcome
        decision.reason_code = reason_code
        decision.notes = notes
        decision.updated_at = now
        if body.submit:
            decision.decision_status = "submitted"
            decision.submitted_at = now
            decision.based_on_decision_summary_snapshot = await self._summary_snapshot(
                candidate_id=decision.candidate_id,
                job_id=decision.job_id,
            )
            refs = await self._basis_refs(candidate_id=decision.candidate_id, job_id=decision.job_id)
            decision.based_on_scorecard_id = refs["scorecard_id"]
            decision.based_on_behavioral_assignment_id = refs["assignment_id"]
            decision.based_on_behavioral_ai_evaluation_id = refs["ai_evaluation_id"]
        await self._repository.flush()
        return self._response(decision)

    async def _assert_job_exists(self, job_id: UUID) -> None:
        job = await self._repository.get_job(job_id)
        if job is None or job.deleted_at is not None:
            raise NotFoundException("Vaga não encontrada.")

    async def _validate_business_rules(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        decision_outcome: str,
        reason_code: str,
        notes: str | None,
    ) -> None:
        if decision_outcome in {"hire", "reject"} and not notes:
            raise ValidationException("Observações são obrigatórias para decisões de contratação ou rejeição.")

        if decision_outcome == "hire" and reason_code != "other":
            job = await self._repository.get_job(job_id)

            if job is not None and job.requires_scorecard:
                scorecard = await self._repository.latest_submitted_scorecard(candidate_id=candidate_id, job_id=job_id)
                if scorecard is None:
                    raise ValidationException("Contratação exige scorecard enviado conforme política da vaga.")

            assignment = None
            if job is not None and job.requires_behavioral_assessment and job.behavioral_template_id is not None:
                assignment = await self._repository.latest_behavioral_assignment(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    template_id=job.behavioral_template_id,
                )
                if assignment is None or assignment.status != "submitted":
                    raise ValidationException("Contratação exige avaliação comportamental submetida conforme política da vaga.")

            if job is not None and job.requires_behavioral_ai_evaluation and job.behavioral_template_id is not None and assignment is not None:
                ai_eval = await self._repository.ai_evaluation_for_assignment(assignment.id)
                if ai_eval is None or ai_eval.status != "completed":
                    raise ValidationException("Contratação exige avaliação de IA comportamental concluída conforme política da vaga.")

            if job is not None and job.requires_interview:
                interview = await self._repository.latest_completed_interview(candidate_id=candidate_id, job_id=job_id)
                if interview is None:
                    raise ValidationException("Contratação exige entrevista realizada conforme política da vaga.")

            if job is not None and job.requires_manager_review:
                has_feedback = await self._repository.has_manager_feedback(candidate_id=candidate_id, job_id=job_id)
                if not has_feedback:
                    raise ValidationException("Contratação exige revisão do gestor conforme política da vaga.")

    async def _summary_snapshot(self, *, candidate_id: UUID, job_id: UUID) -> dict:
        summary = await self._summary_service.get_summary(candidate_id=candidate_id, job_id=job_id)
        return summary.model_dump(mode="json")

    async def _basis_refs(self, *, candidate_id: UUID, job_id: UUID) -> dict[str, UUID | None]:
        scorecard = await self._repository.latest_submitted_scorecard(candidate_id=candidate_id, job_id=job_id)
        job = await self._repository.get_job(job_id)
        assignment = None
        ai_evaluation = None
        if job is not None and job.behavioral_template_id is not None:
            assignment = await self._repository.latest_behavioral_assignment(
                candidate_id=candidate_id,
                job_id=job_id,
                template_id=job.behavioral_template_id,
            )
            if assignment is not None:
                ai_evaluation = await self._repository.ai_evaluation_for_assignment(assignment.id)
        return {
            "scorecard_id": scorecard.id if scorecard is not None else None,
            "assignment_id": assignment.id if assignment is not None else None,
            "ai_evaluation_id": ai_evaluation.id if ai_evaluation is not None else None,
        }

    @staticmethod
    def _clean_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @staticmethod
    def _response(
        decision: CandidateJobHiringDecisionModel,
        *,
        pipeline_transition_id: UUID | None = None,
    ) -> HiringDecisionResponse:
        return HiringDecisionResponse(
            id=decision.id,
            candidate_id=decision.candidate_id,
            job_id=decision.job_id,
            pipeline_id=decision.pipeline_id,
            decided_by=decision.decided_by,
            decision_status=decision.decision_status,  # type: ignore[arg-type]
            decision_outcome=decision.decision_outcome,  # type: ignore[arg-type]
            reason_code=decision.reason_code,  # type: ignore[arg-type]
            notes=decision.notes,
            based_on_decision_summary_snapshot=decision.based_on_decision_summary_snapshot,
            based_on_scorecard_id=decision.based_on_scorecard_id,
            based_on_behavioral_assignment_id=decision.based_on_behavioral_assignment_id,
            based_on_behavioral_ai_evaluation_id=decision.based_on_behavioral_ai_evaluation_id,
            created_at=decision.created_at,
            updated_at=decision.updated_at,
            submitted_at=decision.submitted_at,
            pipeline_transition_id=pipeline_transition_id,
        )
