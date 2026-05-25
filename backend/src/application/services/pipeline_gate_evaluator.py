"""Pipeline stage gate evaluator (Fase 2).

Pure read-only service that, given a candidate+job and an attempted forward
transition, returns the list of `MissingGate` items that prevent the move.

Gates only fire for forward transitions (target order > current order) and for
the ``rejected`` terminal (reason gate). Backwards movements bypass the
evaluator at the caller layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)


_TECHNICAL_INTERVIEW_TYPES: tuple[str, ...] = ("technical", "manager")
_HR_INTERVIEW_TYPES: tuple[str, ...] = ("hr", "screening")

_BLOCKING_INTERVIEW_STATUSES: frozenset[str] = frozenset(
    {"scheduled", "rescheduled", "awaiting_feedback", "cancelled", "no_show"}
)


@dataclass(frozen=True)
class MissingGate:
    code: str
    label: str
    description: str
    action: str
    action_payload: dict[str, Any] | None = None
    severity: str = "block"
    # True when an admin is allowed to force-bypass the gate with a written
    # justification. Structural pendencies (interview/scorecard/IA/decision)
    # are forceable. The disqualification-reason gate is NOT — rejection must
    # always carry a reason from the actor.
    forceable: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "label": self.label,
            "description": self.description,
            "action": self.action,
            "action_payload": self.action_payload,
            "severity": self.severity,
            "forceable": self.forceable,
        }


@dataclass
class GateEvaluationResult:
    target_stage: str
    current_stage: str | None
    missing_gates: list[MissingGate] = field(default_factory=list)

    @property
    def is_blocked(self) -> bool:
        return bool(self.missing_gates)

    @property
    def all_forceable(self) -> bool:
        """True when every pending gate accepts an admin force-bypass."""
        return all(gate.forceable for gate in self.missing_gates)


def can_force_transition(
    *,
    actor_role: str | None,
    missing_gates: list[MissingGate],
) -> bool:
    """Whether the current actor may force-bypass the listed gates.

    `True` only when the actor is admin AND every gate is marked forceable.
    The reason-required gate for `rejected` is intentionally non-forceable —
    admins cannot bypass it either; they must still write a reason.
    """
    if actor_role != "admin":
        return False
    if not missing_gates:
        return False
    return all(gate.forceable for gate in missing_gates)


class PipelineGateEvaluator:
    """Evaluates structural gates that must be satisfied before advancing a
    candidate to a given pipeline stage.

    Pure read-only; never writes to the database, never dispatches events.
    """

    def __init__(self, repository: SQLAlchemyPipelineRepository) -> None:
        self._repository = repository

    async def evaluate(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        job: JobModel,
        current_stage: str | None,
        target_stage: str,
        reason: str | None,
    ) -> GateEvaluationResult:
        result = GateEvaluationResult(target_stage=target_stage, current_stage=current_stage)

        if target_stage == "rejected":
            if not (reason or "").strip():
                result.missing_gates.append(
                    MissingGate(
                        code="disqualification_reason_required",
                        label="Motivo da desclassificação obrigatório",
                        description="Informe um motivo para desclassificar o candidato.",
                        action="add_reason",
                        forceable=False,
                    )
                )
            return result

        if target_stage == "final":
            await self._collect_final_gates(
                result=result,
                candidate_id=candidate_id,
                job_id=job_id,
                job=job,
            )
            return result

        if target_stage == "offer":
            await self._collect_offer_gates(
                result=result,
                candidate_id=candidate_id,
                job_id=job_id,
                job=job,
            )
            return result

        if target_stage == "hired":
            await self._collect_hired_gates(
                result=result,
                candidate_id=candidate_id,
                job_id=job_id,
                job=job,
            )
            return result

        return result

    # ------------------------------------------------------------------
    # Gate helpers per target stage
    # ------------------------------------------------------------------

    async def _collect_final_gates(
        self,
        *,
        result: GateEvaluationResult,
        candidate_id: UUID,
        job_id: UUID,
        job: JobModel,
    ) -> None:
        latest_interview = None
        if bool(job.requires_interview):
            latest_interview = await self._repository.find_latest_interview_for_gate(
                candidate_id=candidate_id,
                job_id=job_id,
                interview_types=_TECHNICAL_INTERVIEW_TYPES,
            )
            if latest_interview is None or latest_interview.status != "completed":
                result.missing_gates.append(
                    MissingGate(
                        code="technical_interview_not_completed",
                        label="Entrevista técnica ainda não concluída",
                        description=(
                            "Registre o feedback da entrevista técnica para continuar."
                            if latest_interview is not None
                            else "Agende e conclua a entrevista técnica antes de avançar."
                        ),
                        action="open_interview",
                        action_payload=(
                            {"interview_id": str(latest_interview.id)}
                            if latest_interview is not None
                            else None
                        ),
                    )
                )

        if bool(job.requires_scorecard):
            scorecard = None
            if latest_interview is not None and latest_interview.status == "completed":
                scorecard = await self._repository.find_scorecard_for_interview(
                    interview_id=latest_interview.id,
                )
            elif latest_interview is not None:
                scorecard = await self._repository.find_scorecard_for_interview(
                    interview_id=latest_interview.id,
                )
            if scorecard is None or scorecard.status != "submitted":
                result.missing_gates.append(
                    MissingGate(
                        code="scorecard_not_submitted",
                        label="Scorecard da entrevista pendente",
                        description=(
                            "Preencha e submeta o scorecard da entrevista técnica para continuar."
                        ),
                        action="open_scorecard",
                        action_payload=(
                            {"interview_id": str(latest_interview.id)}
                            if latest_interview is not None
                            else None
                        ),
                    )
                )

    async def _collect_offer_gates(
        self,
        *,
        result: GateEvaluationResult,
        candidate_id: UUID,
        job_id: UUID,
        job: JobModel,
    ) -> None:
        if bool(job.requires_behavioral_assessment):
            assignment = await self._repository.find_behavioral_assignment(
                candidate_id=candidate_id,
                job_id=job_id,
            )
            if assignment is None or assignment.status != "submitted":
                result.missing_gates.append(
                    MissingGate(
                        code="behavioral_assessment_pending",
                        label="Avaliação comportamental pendente",
                        description=(
                            "Aguarde o candidato responder a avaliação comportamental antes de avançar."
                        ),
                        action="open_behavioral_assessment",
                        action_payload=(
                            {"assignment_id": str(assignment.id)} if assignment is not None else None
                        ),
                    )
                )
                assignment_for_ai = None
            else:
                assignment_for_ai = assignment

            if bool(job.requires_behavioral_ai_evaluation):
                if assignment_for_ai is None:
                    result.missing_gates.append(
                        MissingGate(
                            code="behavioral_ai_pending",
                            label="IA comportamental pendente",
                            description=(
                                "Aguarde a IA comportamental concluir a análise da avaliação."
                            ),
                            action="open_behavioral_ai",
                        )
                    )
                else:
                    ai_evaluation = await self._repository.find_latest_behavioral_ai_evaluation(
                        assignment_id=assignment_for_ai.id,
                    )
                    if ai_evaluation is None or ai_evaluation.status != "completed":
                        result.missing_gates.append(
                            MissingGate(
                                code="behavioral_ai_pending",
                                label="IA comportamental pendente",
                                description=(
                                    "Aguarde a IA comportamental concluir a análise"
                                    " (status atual: "
                                    f"{ai_evaluation.status if ai_evaluation is not None else 'não iniciada'})."
                                ),
                                action="open_behavioral_ai",
                                action_payload=(
                                    {"ai_evaluation_id": str(ai_evaluation.id)}
                                    if ai_evaluation is not None
                                    else {"assignment_id": str(assignment_for_ai.id)}
                                ),
                            )
                        )
        elif bool(job.requires_behavioral_ai_evaluation):
            # AI evaluation requested without behavioral assignment policy — gate
            # cannot be satisfied without the assignment first.
            result.missing_gates.append(
                MissingGate(
                    code="behavioral_ai_pending",
                    label="IA comportamental pendente",
                    description="Avaliação comportamental obrigatória para IA comportamental.",
                    action="open_behavioral_ai",
                )
            )

        if bool(job.requires_scorecard):
            scorecard = await self._repository.find_latest_submitted_scorecard(
                candidate_id=candidate_id,
                job_id=job_id,
            )
            if (
                scorecard is None
                or scorecard.status != "submitted"
                or not (scorecard.final_recommendation or "").strip()
            ):
                result.missing_gates.append(
                    MissingGate(
                        code="scorecard_not_submitted",
                        label="Scorecard final pendente",
                        description=(
                            "Submeta o scorecard final com a recomendação preenchida antes da oferta."
                        ),
                        action="open_scorecard",
                        action_payload=(
                            {"scorecard_id": str(scorecard.id)} if scorecard is not None else None
                        ),
                    )
                )

        if bool(job.requires_manager_review):
            decision = await self._repository.find_active_hiring_decision(
                candidate_id=candidate_id,
                job_id=job_id,
            )
            if (
                decision is None
                or decision.decision_status != "submitted"
                or decision.decision_outcome not in ("advance", "hire")
            ):
                result.missing_gates.append(
                    MissingGate(
                        code="manager_decision_missing",
                        label="Decisão de gestor pendente",
                        description=(
                            "Registre uma decisão final aprovando o avanço (advance ou hire) antes da oferta."
                        ),
                        action="open_decision",
                        action_payload=(
                            {"decision_id": str(decision.id)} if decision is not None else None
                        ),
                    )
                )

    async def _collect_hired_gates(
        self,
        *,
        result: GateEvaluationResult,
        candidate_id: UUID,
        job_id: UUID,
        job: JobModel,
    ) -> None:
        # Keep existing behavioral policy gates aligned with prior contract.
        assignment = None
        if bool(job.requires_behavioral_assessment) and job.behavioral_template_id is not None:
            assignment = await self._repository.find_latest_behavioral_assignment(
                candidate_id=candidate_id,
                job_id=job_id,
                template_id=job.behavioral_template_id,
            )
            if assignment is None or assignment.status != "submitted":
                result.missing_gates.append(
                    MissingGate(
                        code="behavioral_assessment_pending",
                        label="Avaliação comportamental pendente",
                        description=(
                            "Contratação exige avaliação comportamental submetida conforme política da vaga."
                        ),
                        action="open_behavioral_assessment",
                        action_payload=(
                            {"assignment_id": str(assignment.id)} if assignment is not None else None
                        ),
                    )
                )

        if (
            bool(job.requires_behavioral_ai_evaluation)
            and job.behavioral_template_id is not None
            and assignment is not None
            and assignment.status == "submitted"
        ):
            ai_evaluation = await self._repository.find_latest_behavioral_ai_evaluation(
                assignment_id=assignment.id,
            )
            if ai_evaluation is None or ai_evaluation.status != "completed":
                result.missing_gates.append(
                    MissingGate(
                        code="behavioral_ai_pending",
                        label="IA comportamental pendente",
                        description=(
                            "Contratação exige avaliação de IA comportamental concluída"
                            " conforme política da vaga."
                        ),
                        action="open_behavioral_ai",
                        action_payload=(
                            {"ai_evaluation_id": str(ai_evaluation.id)}
                            if ai_evaluation is not None
                            else {"assignment_id": str(assignment.id)}
                        ),
                    )
                )

        decision = await self._repository.find_active_hiring_decision(
            candidate_id=candidate_id,
            job_id=job_id,
        )
        if (
            decision is None
            or decision.decision_status != "submitted"
            or decision.decision_outcome != "hire"
        ):
            result.missing_gates.append(
                MissingGate(
                    code="final_decision_not_submitted",
                    label="Decisão final de contratação pendente",
                    description=(
                        "Registre e submeta uma decisão final com outcome 'hire' antes de contratar."
                    ),
                    action="open_decision",
                    action_payload=(
                        {"decision_id": str(decision.id)} if decision is not None else None
                    ),
                )
            )
