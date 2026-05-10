import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, NAMESPACE_URL, uuid5

import sqlalchemy as sa
import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.domain_events import CandidateStageChangedEvent, dispatch_event
from src.application.services.strict_payload import require_key
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
    CandidateJobPipelineEventModel,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
    _candidate_job_pipeline_key,
)
from src.observability.domain_events import DomainEvent, DomainEventType, publish_domain_event
from src.interface.api.schemas.pipeline_schemas import (
    AddCandidateToJobRequest,
    AddCandidateToJobResponse,
    CandidatePipelineHistoryResponse,
    JobMatchCandidateResponse,
    MoveCandidateRequest,
    MoveCandidateResponse,
    PipelineBoardResponse,
    PipelineColumnResponse,
    PipelineJobSummaryResponse,
    StageTransitionResponse,
    TransferCandidateJobRequest,
    TransferCandidateJobResponse,
    UpdateCandidateStageRequest,
    UpdateCandidateStageResponse,
)

KANBAN_STAGES: list[str] = [
    "entry",
    "screening",
    "hr_interview",
    "technical_interview",
    "final",
    "offer",
    "hired",
    "rejected",
]

STAGE_LABELS: dict[str, str] = {
    "entry": "Entrada",
    "screening": "Triagem",
    "hr_interview": "Entrevista RH",
    "technical_interview": "Técnica",
    "final": "Final",
    "offer": "Oferta",
    "hired": "Contratado",
    "rejected": "Reprovado",
}

STAGE_TO_CANDIDATE_STATUS: dict[str, str] = {
    "entry": "Recebido",
    "screening": "Em análise",
    "hr_interview": "Em processo",
    "technical_interview": "Em processo",
    "final": "Etapa final",
    "offer": "Aprovado",
    "hired": "Aprovado",
    "rejected": "Reprovado",
}

_TERMINAL_STAGES: frozenset[str] = frozenset({"hired", "rejected"})

# Stages that resolve to a terminal outcome status.
_STAGE_TO_OUTCOME: dict[str, str] = {
    "hired": "hired",
    "rejected": "rejected",
}

logger = structlog.get_logger(__name__)


def _parse_required_json_object(raw: object, *, field_name: str) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("pipeline.invalid_json", field=field_name, error=str(exc))
            raise ValueError(f"{field_name} contains invalid JSON") from exc
        if not isinstance(parsed, dict):
            raise ValueError(f"{field_name} must decode to dict")
        return parsed
    raise ValueError(f"{field_name} must be dict or JSON object string")


def _parse_required_json_list(raw: object, *, field_name: str, required: bool = True) -> list:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            if required:
                logger.error("pipeline.invalid_json", field=field_name, error=str(exc))
                raise ValueError(f"{field_name} contains invalid JSON") from exc
            else:
                logger.warning("pipeline.invalid_json_ignored", field=field_name, error=str(exc))
                return []
        if not isinstance(parsed, list):
            if required:
                raise ValueError(f"{field_name} must decode to list")
            else:
                logger.warning("pipeline.invalid_json_type", field=field_name, expected="list", got=type(parsed).__name__)
                return []
        return parsed
    if not required:
        logger.warning("pipeline.invalid_field_type", field=field_name, type=type(raw).__name__)
        return []
    raise ValueError(f"{field_name} must be list or JSON array string")


# ---------------------------------------------------------------------------
# Event idempotency key builder
# ---------------------------------------------------------------------------

def _build_event_idempotency_key(
    pipeline_id: UUID,
    event_type: str,
    from_stage: str | None,
    to_stage: str | None,
    actor_id: UUID | None,
) -> str:
    """Generate deterministic idempotency key for pipeline events."""
    return ":".join([
        "pipeline",
        str(pipeline_id),
        event_type,
        from_stage or "null",
        to_stage or "null",
        str(actor_id) if actor_id else "null",
    ])


# ---------------------------------------------------------------------------
# Stage flow-control metadata
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _StageConfig:
    order: int
    # When True, moving FROM this stage to a lower-order stage is permitted.
    allow_backwards: bool = False
    # Terminal stages cannot be moved FROM. Only terminal stages may set outcome status.
    is_terminal: bool = False
    # The outcome status to write on CandidatePipeline when this stage is reached.
    # None means the outcome stays 'active'.
    terminal_status: str | None = None


# Single source of truth for all stage metadata.
# 'rejected' shares order 6 with 'hired' — it's always reachable from any non-terminal stage.
STAGE_CONFIG: dict[str, _StageConfig] = {
    "entry":                _StageConfig(order=0),
    "screening":            _StageConfig(order=1),
    "hr_interview":         _StageConfig(order=2, allow_backwards=True),
    "technical_interview":  _StageConfig(order=3, allow_backwards=True),
    "final":                _StageConfig(order=4, allow_backwards=True),
    "offer":                _StageConfig(order=5, allow_backwards=True),
    "hired":                _StageConfig(order=6, is_terminal=True, terminal_status="hired"),
    "rejected":             _StageConfig(order=6, is_terminal=True, terminal_status="rejected"),
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class PipelineJobNotFoundError(Exception):
    pass


class PipelineCandidateNotFoundError(Exception):
    pass


class PipelineEntryNotFoundError(Exception):
    pass


class PipelineTerminalStageError(Exception):
    """Raised when a move is attempted from a terminal stage (hired/rejected)."""


class PipelineSameStageError(Exception):
    """Raised when the target stage is the same as the current stage."""


class PipelineInvalidTransitionError(Exception):
    """Raised when stage flow-control rules block the requested transition."""


class PipelineConcurrentModificationError(Exception):
    """Raised when a concurrent request changed the candidate's stage before this one committed."""


class PipelineDuplicateEntryError(Exception):
    pass


class PipelineDestinationJobUnavailableError(Exception):
    pass


class PipelineTransferNotAllowedError(Exception):
    pass


class PipelineCandidateAlreadyHiredError(Exception):
    pass


class PipelineCandidateAlreadyActiveInSameJobError(Exception):
    pass


class PipelineCandidateAlreadyActiveInAnotherJobError(Exception):
    pass


class PipelineCandidateWithoutActiveJobError(Exception):
    pass


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class PipelineService:
    def __init__(self, repository: SQLAlchemyPipelineRepository, session: AsyncSession | None = None) -> None:
        self._repository = repository
        self._session = session

    # ------------------------------------------------------------------
    # Board (existing — unchanged)
    # ------------------------------------------------------------------

    async def list_job_matches(self, job_id: UUID) -> list[JobMatchCandidateResponse]:
        await self._ensure_active_job(job_id)
        rows = await self._repository.list_job_matches(job_id)
        return [self._row_to_match_response(row) for row in rows]

    async def get_board(self, job_id: UUID) -> PipelineBoardResponse:
        matches = await self.list_job_matches(job_id)
        by_stage: dict[str, list[JobMatchCandidateResponse]] = {stage: [] for stage in KANBAN_STAGES}
        for item in matches:
            by_stage[item.stage].append(item)

        columns = [
            PipelineColumnResponse(
                stage=stage,  # type: ignore[arg-type]
                label=STAGE_LABELS[stage],
                candidates=by_stage[stage],
            )
            for stage in KANBAN_STAGES
        ]
        return PipelineBoardResponse(job_id=job_id, columns=columns)

    # ------------------------------------------------------------------
    # Legacy stage update (existing — unchanged, kept for backwards compat)
    # ------------------------------------------------------------------

    async def update_candidate_stage(
        self,
        candidate_id: UUID,
        body: UpdateCandidateStageRequest,
    ) -> UpdateCandidateStageResponse:
        await self._ensure_active_job(body.job_id)
        await self._ensure_active_candidate(candidate_id)

        entry = await self._repository.find_active_entry(candidate_id, body.job_id)
        if entry is None:
            raise PipelineEntryNotFoundError

        to_cfg = STAGE_CONFIG[body.stage]
        terminal_status = to_cfg.terminal_status

        entry.pipeline_stage = body.stage
        if terminal_status is not None:
            entry.link_status = terminal_status
            entry.pipeline_status = "terminal"
            entry.relationship_status = terminal_status
            entry.is_terminal = True
            entry.terminated_at = datetime.now(UTC)
            entry.termination_reason = None
        else:
            entry.link_status = "active"
            entry.pipeline_status = "active"
            entry.relationship_status = "active"
            entry.is_terminal = False
            entry.terminated_at = None
            entry.termination_reason = None
        entry.updated_at = datetime.now(UTC)
        saved = await self._repository.save_entry(entry)

        return UpdateCandidateStageResponse(
            candidate_id=saved.candidate_id,
            job_id=saved.job_id,
            stage=saved.pipeline_stage,  # type: ignore[arg-type]
            candidate_status=STAGE_TO_CANDIDATE_STATUS[saved.pipeline_stage],
            updated_at=saved.updated_at,
        )

    async def register_match_entry(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> None:
        await self._repository.upsert_and_record_transition(analysis_id, job_id)

    # ------------------------------------------------------------------
    # New: move candidate with full transition recording
    # ------------------------------------------------------------------

    async def move_candidate(
        self,
        candidate_id: UUID,
        body: MoveCandidateRequest,
        moved_by: UUID,
    ) -> MoveCandidateResponse:
        await self._ensure_active_job(body.job_id)
        await self._ensure_active_candidate(candidate_id)

        entry = await self._repository.find_active_entry(candidate_id, body.job_id)
        if entry is None:
            raise PipelineEntryNotFoundError

        from_stage = entry.pipeline_stage
        from_cfg = STAGE_CONFIG[from_stage]

        # Task 2: derive terminal check from STAGE_CONFIG — single source of truth.
        if from_cfg.is_terminal:
            raise PipelineTerminalStageError

        if from_stage == body.stage:
            raise PipelineSameStageError

        # Task 4: flow control — block invalid backwards transitions.
        # 'rejected' is always reachable from any non-terminal stage.
        to_cfg = STAGE_CONFIG[body.stage]
        if body.stage != "rejected" and to_cfg.order < from_cfg.order and not from_cfg.allow_backwards:
            raise PipelineInvalidTransitionError(
                f"Cannot move backwards from '{from_stage}' to '{body.stage}'"
            )

        now = datetime.now(UTC)
        new_status = to_cfg.terminal_status or "active"

        # Task 1: atomic conditional UPDATE — only succeeds if stage hasn't changed since our SELECT.
        saved_row = await self._repository.update_entry_stage_if_current(
            candidate_id=candidate_id,
            job_id=body.job_id,
            expected_stage=from_stage,
            new_stage=body.stage,
            new_status=new_status,
            last_moved_by=moved_by,
            updated_at=now,
            termination_reason=body.reason,
        )
        if saved_row is None:
            raise PipelineConcurrentModificationError(
                f"Stage was modified concurrently (expected '{from_stage}'). Please retry."
            )

        pipeline_id = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=body.job_id)
        transition = CandidateJobPipelineEventModel(
            candidate_id=candidate_id,
            job_id=body.job_id,
            event_type="stage_moved",
            from_stage=from_stage,
            to_stage=body.stage,
            actor_id=moved_by,
            idempotency_key=_build_event_idempotency_key(
                pipeline_id, "stage_moved", from_stage, body.stage, moved_by
            ),
            metadata_payload={
                "trigger": "manual",
                "notes": body.notes,
                "reason": body.reason,
            },
            created_at=now,
        )
        saved_transition = await self._repository.save_transition(transition)

        # Task 3: dispatch domain event through the extension point.
        dispatch_event(CandidateStageChangedEvent(
            candidate_id=candidate_id,
            job_id=body.job_id,
            from_stage=from_stage,
            to_stage=body.stage,
            trigger="manual",
            moved_by=moved_by,
            moved_at=now,
            reason=body.reason,
        ))

        return MoveCandidateResponse(
            candidate_id=saved_row["candidate_id"],
            job_id=saved_row["job_id"],
            stage=saved_row["stage"],  # type: ignore[arg-type]
            candidate_status=STAGE_TO_CANDIDATE_STATUS[saved_row["stage"]],
            status=saved_row["status"],  # type: ignore[arg-type]
            transition_id=saved_transition.id,
            updated_at=saved_row["updated_at"],
        )

    async def add_candidate_to_job(
        self,
        candidate_id: UUID,
        body: AddCandidateToJobRequest,
        moved_by: UUID,
    ) -> AddCandidateToJobResponse:
        if body.initial_stage != "entry":
            raise PipelineInvalidTransitionError("initial_stage deve ser 'entry'")

        await self._ensure_available_job(body.job_id)
        await self._ensure_active_candidate(candidate_id)

        active_entry = await self._repository.find_active_entry_by_candidate(candidate_id)
        if active_entry is not None:
            if active_entry.job_id == body.job_id:
                raise PipelineCandidateAlreadyActiveInSameJobError
            raise PipelineCandidateAlreadyActiveInAnotherJobError

        existing_entry = await self._repository.find_any_entry(candidate_id, body.job_id)

        now = datetime.now(UTC)
        if existing_entry is not None:
            saved_row = await self._repository.reactivate_entry(
                candidate_id=candidate_id,
                job_id=body.job_id,
                stage=body.initial_stage,
                status="active",
                moved_by=moved_by,
                updated_at=now,
            )
            if saved_row is None:
                raise PipelineConcurrentModificationError(
                    "Não foi possível reativar o pipeline desta vaga. Recarregue e tente novamente."
                )
        else:
            saved_row = await self._repository.create_entry(
                candidate_id=candidate_id,
                job_id=body.job_id,
                stage=body.initial_stage,
                status="active",
                moved_by=moved_by,
                updated_at=now,
            )
        pipeline_id = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=body.job_id)
        transition = await self._repository.save_transition(
            CandidateJobPipelineEventModel(
                candidate_id=candidate_id,
                job_id=body.job_id,
                event_type="candidate_added",
                from_stage=existing_entry.pipeline_stage if existing_entry is not None else None,
                to_stage=body.initial_stage,
                actor_id=moved_by,
                idempotency_key=_build_event_idempotency_key(
                    pipeline_id, "candidate_added",
                    existing_entry.pipeline_stage if existing_entry else None,
                    body.initial_stage,
                    moved_by,
                ),
                metadata_payload={
                    "trigger": "manual",
                    "reason": "Adicionado manualmente à vaga",
                },
                created_at=now,
            )
        )

        return AddCandidateToJobResponse(
            candidate_id=saved_row["candidate_id"],
            job_id=saved_row["job_id"],
            stage=saved_row["stage"],  # type: ignore[arg-type]
            candidate_status=STAGE_TO_CANDIDATE_STATUS[saved_row["stage"]],
            status=saved_row["status"],  # type: ignore[arg-type]
            transition_id=transition.id,
            updated_at=saved_row["updated_at"],
        )

    async def transfer_candidate_job(
        self,
        candidate_id: UUID,
        body: TransferCandidateJobRequest,
        moved_by: UUID,
    ) -> TransferCandidateJobResponse:
        await self._ensure_active_candidate(candidate_id)
        await self._ensure_published_transfer_job(body.to_job_id)

        source_entry = await self._repository.find_active_entry_by_candidate(candidate_id)
        if source_entry is None:
            source_any_entry = await self._repository.find_any_entry(candidate_id, body.from_job_id)
            if source_any_entry is not None and (
                source_any_entry.link_status == "hired" or source_any_entry.pipeline_stage == "hired"
            ):
                raise PipelineCandidateAlreadyHiredError
            raise PipelineCandidateWithoutActiveJobError
        if source_entry.job_id != body.from_job_id:
            raise PipelineEntryNotFoundError

        destination_active_entry = await self._repository.find_active_entry(candidate_id, body.to_job_id)
        if destination_active_entry is not None:
            raise PipelineCandidateAlreadyActiveInSameJobError
        destination_any_entry = await self._repository.find_any_entry(candidate_id, body.to_job_id)

        now = datetime.now(UTC)
        try:
            await self._repository.deactivate_active_entries_for_candidate(
                candidate_id=candidate_id,
                last_moved_by=moved_by,
                updated_at=now,
            )
            source_row = await self._repository.find_any_entry(candidate_id, body.from_job_id)
            if source_row is None:
                raise PipelineEntryNotFoundError

            source_pipeline_id = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=body.from_job_id)
            source_transition = await self._repository.save_transition(
                CandidateJobPipelineEventModel(
                    candidate_id=candidate_id,
                    job_id=body.from_job_id,
                    event_type="job_transferred_out",
                    from_stage=source_entry.pipeline_stage,
                    to_stage=source_entry.pipeline_stage,
                    from_job_id=body.from_job_id,
                    to_job_id=body.to_job_id,
                    actor_id=moved_by,
                    idempotency_key=_build_event_idempotency_key(
                        source_pipeline_id, "job_transferred_out",
                        source_entry.pipeline_stage, source_entry.pipeline_stage, moved_by,
                    ),
                    metadata_payload={
                        "trigger": "manual",
                        "notes": f"Transferido para a vaga {body.to_job_id}",
                        "reason": body.reason,
                    },
                    created_at=now,
                )
            )

            if destination_any_entry is not None:
                destination_row = await self._repository.reactivate_entry(
                    candidate_id=candidate_id,
                    job_id=body.to_job_id,
                    stage="entry",
                    status="active",
                    moved_by=moved_by,
                    updated_at=now,
                )
                if destination_row is None:
                    raise PipelineConcurrentModificationError(
                        "Não foi possível reativar o pipeline da vaga destino. Recarregue e tente novamente."
                    )
            else:
                destination_row = await self._repository.create_entry(
                    candidate_id=candidate_id,
                    job_id=body.to_job_id,
                    stage="entry",
                    status="active",
                    moved_by=moved_by,
                    updated_at=now,
                )
            dest_pipeline_id = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=body.to_job_id)
            destination_transition = await self._repository.save_transition(
                CandidateJobPipelineEventModel(
                    candidate_id=candidate_id,
                    job_id=body.to_job_id,
                    event_type="job_transferred_in",
                    from_stage=destination_any_entry.pipeline_stage if destination_any_entry is not None else None,
                    to_stage="entry",
                    from_job_id=body.from_job_id,
                    to_job_id=body.to_job_id,
                    actor_id=moved_by,
                    idempotency_key=_build_event_idempotency_key(
                        dest_pipeline_id, "job_transferred_in",
                        destination_any_entry.pipeline_stage if destination_any_entry is not None else None,
                        "entry", moved_by,
                    ),
                    metadata_payload={
                        "trigger": "manual",
                        "reason": body.reason,
                    },
                    created_at=now,
                )
            )
        except IntegrityError as exc:
            raise PipelineConcurrentModificationError(
                "Não foi possível concluir a transferência. Recarregue e tente novamente."
            ) from exc

        await publish_domain_event(
            DomainEvent(
                event_type=DomainEventType.CANDIDATE_JOB_TRANSFERRED,
                entity_id=candidate_id,
                payload={
                    "candidate_id": str(candidate_id),
                    "from_job_id": str(body.from_job_id),
                    "to_job_id": str(body.to_job_id),
                    "reason": body.reason,
                    "moved_by_user_id": str(moved_by),
                    "timestamp": now.isoformat(),
                },
                timestamp=now,
            )
        )

        return TransferCandidateJobResponse(
            candidate_id=candidate_id,
            from_job_id=body.from_job_id,
            to_job_id=body.to_job_id,
            from_stage=source_entry.pipeline_stage,  # type: ignore[arg-type]
            to_stage="entry",
            source_status=source_row.link_status,  # type: ignore[arg-type]
            destination_status=destination_row["status"],  # type: ignore[arg-type]
            source_transition_id=source_transition.id,
            destination_transition_id=destination_transition.id,
            updated_at=destination_row["updated_at"],
        )

    async def remove_candidate_from_job(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        moved_by: UUID,
    ) -> None:
        await self._ensure_active_candidate(candidate_id)
        await self._ensure_active_job(job_id)

        entry = await self._repository.find_entry(candidate_id, job_id)
        if entry is None:
            raise PipelineEntryNotFoundError

        now = datetime.now(UTC)
        updated = await self._repository.update_entry_status(
            candidate_id=candidate_id,
            job_id=job_id,
            new_status="removed",
            last_moved_by=moved_by,
            updated_at=now,
            termination_reason="candidate_removed",
        )
        if updated is None:
            raise PipelineEntryNotFoundError

        pipeline_id = _candidate_job_pipeline_key(candidate_id=candidate_id, job_id=job_id)
        await self._repository.save_transition(
            CandidateJobPipelineEventModel(
                candidate_id=candidate_id,
                job_id=job_id,
                event_type="candidate_removed",
                from_stage=entry.pipeline_stage,
                to_stage=entry.pipeline_stage,
                actor_id=moved_by,
                idempotency_key=_build_event_idempotency_key(
                    pipeline_id, "candidate_removed",
                    entry.pipeline_stage, entry.pipeline_stage, moved_by,
                ),
                metadata_payload={"trigger": "manual", "reason": "candidate_removed"},
                created_at=now,
            )
        )

    # ------------------------------------------------------------------
    # New: candidate history in a job's pipeline
    # ------------------------------------------------------------------

    async def get_candidate_history(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidatePipelineHistoryResponse:
        await self._ensure_active_job(job_id)
        await self._ensure_active_candidate(candidate_id)

        entry = await self._repository.find_entry_with_details(candidate_id, job_id)
        if entry is None:
            raise PipelineEntryNotFoundError

        transition_rows = await self._repository.list_transitions(candidate_id, job_id)
        transitions = [
            StageTransitionResponse(
                id=row["id"],
                candidate_id=row["candidate_id"],
                job_id=row["job_id"],
                from_stage=row["from_stage"],  # type: ignore[arg-type]
                to_stage=row["to_stage"],  # type: ignore[arg-type]
                moved_by=row["moved_by"],
                moved_by_name=row["moved_by_name"],
                moved_at=row["moved_at"],
                trigger=row["trigger"],  # type: ignore[arg-type]
                notes=row["notes"],
                reason=row.get("reason"),
            )
            for row in transition_rows
        ]

        return CandidatePipelineHistoryResponse(
            candidate_id=entry["candidate_id"],
            candidate_name=entry["candidate_name"],
            job_id=entry["job_id"],
            job_title=entry["job_title"],
            current_stage=entry["stage"],  # type: ignore[arg-type]
            status=entry.get("status", "active"),  # type: ignore[arg-type]
            entered_at=entry["entered_at"],
            updated_at=entry["updated_at"],
            transitions=transitions,
        )

    # ------------------------------------------------------------------
    # New: jobs list with pipeline stats
    # ------------------------------------------------------------------

    async def list_pipeline_jobs(self, *, include_closed: bool = False) -> list[PipelineJobSummaryResponse]:
        jobs = await self._repository.list_pipeline_jobs(include_closed=include_closed)
        stage_count_rows = await self._repository.list_pipeline_stage_counts()

        # Build a lookup: job_id → {stage: count, latest: datetime}
        job_stats: dict[UUID, dict] = {}
        for row in stage_count_rows:
            jid: UUID = row["job_id"]
            if jid not in job_stats:
                job_stats[jid] = {"counts": {}, "latest": None}
            job_stats[jid]["counts"][row["stage"]] = int(row["cnt"])
            latest = row.get("latest")
            if latest and (
                job_stats[jid]["latest"] is None
                or latest > job_stats[jid]["latest"]
            ):
                job_stats[jid]["latest"] = latest

        return [
            PipelineJobSummaryResponse(
                job_id=job["job_id"],
                job_title=job["job_title"],
                job_status=job["job_status"],
                seniority_level=job.get("seniority_level"),
                work_model=job.get("work_model"),
                location=job.get("location"),
                deal_breakers=job.get("deal_breakers") or [],
                total_candidates=sum(job_stats.get(job["job_id"], {}).get("counts", {}).values()),
                stage_counts=job_stats.get(job["job_id"], {}).get("counts", {}),
                latest_activity=job_stats.get(job["job_id"], {}).get("latest"),
            )
            for job in jobs
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _ensure_active_job(self, job_id: UUID) -> None:
        if await self._repository.find_active_job(job_id) is None:
            raise PipelineJobNotFoundError

    async def _ensure_available_job(self, job_id: UUID) -> None:
        if await self._repository.find_available_job(job_id) is None:
            raise PipelineDestinationJobUnavailableError

    async def _ensure_published_transfer_job(self, job_id: UUID) -> None:
        job = await self._repository.find_active_job(job_id)
        if job is None or job.status != "published":
            raise PipelineTransferNotAllowedError

    async def _ensure_active_candidate(self, candidate_id: UUID) -> None:
        if await self._repository.find_active_candidate(candidate_id) is None:
            raise PipelineCandidateNotFoundError

    @staticmethod
    def _row_to_match_response(row: dict) -> JobMatchCandidateResponse:
        raw_skills = row["top_skills"]
        parsed_skills = _parse_required_json_list(raw_skills, field_name="top_skills", required=False)
        top_skills = [str(skill) for skill in parsed_skills if str(skill).strip()][:5]
        stage = str(require_key(row, "stage"))

        # ai_status comes from the latest analysis for this candidate (any status).
        # It is read-only here — stage moves never touch it.
        raw_ai_status = row.get("ai_status")
        ai_status = str(raw_ai_status) if raw_ai_status is not None else None
        raw_job_fit_score = row.get("job_fit_score")
        job_fit_score = Decimal(str(raw_job_fit_score)) if raw_job_fit_score is not None else None

        return JobMatchCandidateResponse(
            candidate_id=row["candidate_id"],
            candidate_name=row["candidate_name"],
            job_id=row["job_id"],
            stage=stage,  # type: ignore[arg-type]
            candidate_status=STAGE_TO_CANDIDATE_STATUS.get(stage, "Em processo"),
            status=row.get("status", "active"),  # type: ignore[arg-type]
            entered_at=row.get("entered_at"),
            top_skills=top_skills,
            updated_at=row["updated_at"],
            ai_status=ai_status,  # type: ignore[arg-type]
            job_fit_score=job_fit_score,
        )
