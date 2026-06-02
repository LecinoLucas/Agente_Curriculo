"""OP-6G — Link a submitted CandidateApplication to the pipeline.

Rules (enforced in this order):
1. application must exist and not be soft-deleted.
2. application.status must be 'submitted' (not started/qualified).
3. application.candidate_id must be set.
4. application.job_id must be set.
5. No active conflicting pipeline entry for the same candidate (the unique
   partial index on candidate_job_pipeline enforces this at DB level;
   we check proactively to return a clean ConflictException).
6. If application.status is already 'linked_to_pipeline', the operation is
   idempotent: return success without creating a duplicate entry.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
)
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)

logger = structlog.get_logger(__name__)


class CandidateApplicationPipelineService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._app_repo = SQLAlchemyCandidateApplicationRepository(db)
        self._pipeline_repo = SQLAlchemyPipelineRepository(db)

    async def link_to_pipeline(
        self,
        application_id: UUID,
        actor_id: UUID | None = None,
    ) -> _LinkResult:
        """Validate and link a submitted CandidateApplication to the pipeline.

        Returns a _LinkResult with the pipeline_id and whether an entry was
        newly created (``created=True``) or already existed (``created=False``).
        """
        application = await self._app_repo.get_application(application_id)
        if application is None:
            raise NotFoundException("Candidatura não encontrada.")

        # --- Guard: must be submitted ---
        if application.status not in ("submitted", "linked_to_pipeline"):
            raise ValidationException(
                f"A candidatura precisa estar com status 'submitted' para ser enviada "
                f"à pipeline. Status atual: '{application.status}'."
            )

        # --- Guard: must have candidate ---
        if application.candidate_id is None:
            raise ValidationException(
                "A candidatura não possui candidato vinculado."
            )

        # --- Guard: must have job ---
        if application.job_id is None:
            raise ValidationException(
                "A candidatura não possui vaga vinculada. "
                "Informe a vaga antes de enviar para a pipeline."
            )

        # --- Idempotency: already linked ---
        if application.status == "linked_to_pipeline":
            existing_id = await self._pipeline_repo.find_active_pipeline_id(
                application.candidate_id,
                application.job_id,
            )
            logger.info(
                "application_pipeline_link.already_linked",
                application_id=str(application_id),
                pipeline_id=str(existing_id) if existing_id else None,
            )
            return _LinkResult(
                pipeline_id=existing_id,
                application_id=application_id,
                created=False,
            )

        # --- Guard: no conflicting active pipeline for this candidate ---
        active_any = await self._pipeline_repo.find_active_entry_by_candidate(
            application.candidate_id
        )
        if active_any is not None:
            raise ConflictException(
                "O candidato já possui uma entrada ativa na pipeline. "
                "Encerre a entrada existente antes de criar uma nova."
            )

        now = datetime.now(UTC)
        created = await self._pipeline_repo.create_entry(
            candidate_id=application.candidate_id,
            job_id=application.job_id,
            stage="entry",
            status="active",
            moved_by=actor_id,
            updated_at=now,
            source="manual",
            application_id=application_id,
        )
        pipeline_id: UUID | None = created.get("pipeline_id")

        # Record the creation event.
        await self._pipeline_repo.save_transition(
            CandidateJobPipelineEventModel(
                candidate_id=application.candidate_id,
                job_id=application.job_id,
                event_type="application_linked",
                from_stage=None,
                to_stage="entry",
                actor_id=actor_id,
                idempotency_key=f"app-link:{application_id}",
                metadata_payload={
                    "trigger": "application_link_pipeline",
                    "application_id": str(application_id),
                    "source": "candidate_application",
                },
                created_at=now,
            )
        )

        # Update application status.
        application.status = "linked_to_pipeline"
        application.updated_at = datetime.now(UTC)
        await self._app_repo.update_application(application)

        logger.info(
            "application_pipeline_link.created",
            application_id=str(application_id),
            candidate_id=str(application.candidate_id),
            job_id=str(application.job_id),
            pipeline_id=str(pipeline_id) if pipeline_id else None,
        )
        return _LinkResult(
            pipeline_id=pipeline_id,
            application_id=application_id,
            created=True,
        )


class _LinkResult:
    __slots__ = ("pipeline_id", "application_id", "created")

    def __init__(
        self,
        *,
        pipeline_id: UUID | None,
        application_id: UUID,
        created: bool,
    ) -> None:
        self.pipeline_id = pipeline_id
        self.application_id = application_id
        self.created = created
