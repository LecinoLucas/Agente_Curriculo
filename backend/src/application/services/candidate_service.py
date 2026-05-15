import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import structlog

from src.application.ports.file_storage import FileStorageService
from src.application.services.audit_service import AuditService
from src.application.services.candidate_score_status_deriver import (
    derive_candidate_score_status,
)
from src.domain.entities.user import User
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    CandidateDeleteSummary,
    SQLAlchemyCandidateRepository,
)
from src.interface.api.schemas.candidate_schemas import (
    CandidateActiveJobDecisionResponse,
    CandidateActiveJobResponse,
    CandidateCheckResponse,
    CandidateJobMatchSummaryResponse,
    CandidateListSummaryResponse,
    CandidateLatestAnalysisPipelineResponse,
    CandidateLatestAnalysisResponse,
    CandidateOverviewResponse,
    CandidatePipelineEntryResponse,
    CandidateResponse,
    CandidateResumeSummaryResponse,
    CreateCandidateRequest,
    UpdateCandidateRequest,
)

logger = structlog.get_logger(__name__)

APPLICATION_SOURCE_MANUAL = "manual"
APPLICATION_SOURCE_PUBLIC = "public_application"


class CandidateNotFoundError(Exception):
    pass


class CandidateEmailConflictError(Exception):
    pass


class CandidateCpfConflictError(Exception):
    pass


class InvalidCandidateTextError(Exception):
    pass


class InvalidCandidateCpfError(Exception):
    pass


class CandidateNotAllowedUserIdError(Exception):
    pass


class CandidateDeleteReasonRequiredError(Exception):
    pass


class CandidateDeleteConfirmationError(Exception):
    pass


class CandidateCriticalHistoryError(Exception):
    pass


class CandidateArchiveReasonRequiredError(Exception):
    pass


class CandidateService:
    def __init__(
        self,
        repository: SQLAlchemyCandidateRepository,
        *,
        audit_service: AuditService | None = None,
        file_storage: FileStorageService | None = None,
    ) -> None:
        self._repository = repository
        self._audit_service = audit_service
        self._file_storage = file_storage

    async def create(
        self,
        body: CreateCandidateRequest,
        created_by: UUID,
        *,
        application_source: str = APPLICATION_SOURCE_MANUAL,
    ) -> CandidateModel:
        """
        Create a new Candidate.

        The user_id field in CreateCandidateRequest is RESERVED for future portal use.
        Currently, it MUST be NULL. Creating Candidates with user_id requires explicit
        linking outside Candidate creation.

        This prevents:
        - Accidental User creation when Candidate is created
        - Mixing User and Candidate creation flows
        - Race conditions between User and Candidate
        """
        # GUARDRAIL: Reject user_id in candidate creation
        if body.user_id is not None:
            raise CandidateNotAllowedUserIdError(
                "Não é permitido especificar user_id durante criação de candidato. "
                "O vínculo com usuário será feito via portal do candidato."
            )

        email = self._clean_email(body.email)
        if await self._repository.find_active_by_email(email):
            raise CandidateEmailConflictError

        cpf = (
            self._clean_cpf(body.cpf)
            if application_source not in {APPLICATION_SOURCE_MANUAL, APPLICATION_SOURCE_PUBLIC}
            else self._clean_manual_cpf(body.cpf)
        )
        if cpf is not None and await self._repository.find_active_by_cpf(cpf):
            raise CandidateCpfConflictError

        from uuid import uuid4

        candidate = CandidateModel(
            id=uuid4(),
            full_name=self._clean_required_text(body.full_name),
            email=email,
            phone=body.phone,
            cpf=cpf,
            location_city=body.location_city,
            location_state=body.location_state,
            location_country=body.location_country.upper().strip(),
            linkedin_url=body.linkedin_url,
            github_url=body.github_url,
            portfolio_url=body.portfolio_url,
            internal_notes=body.internal_notes,
            tags=self._clean_tags(body.tags),
            user_id=None,
            created_by=created_by,
            application_source=application_source,
        )
        return await self._repository.create(candidate)

    async def list(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        archived: bool = False,
        application_source: str | None = None,
    ) -> tuple[list[CandidateModel], int]:
        return await self._repository.list_active(
            page,
            page_size,
            search,
            archived,
            application_source=application_source,
        )

    async def list_summaries(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        has_resume: bool | None = None,
        ai_status_filter: list[str] | None = None,
        archived: bool = False,
        application_source: str | None = None,
    ) -> tuple[list[CandidateListSummaryResponse], int]:
        rows, total = await self._repository.list_summaries(
            page,
            page_size,
            search,
            has_resume,
            ai_status_filter,
            archived,
            application_source=application_source,
        )
        items = [
            CandidateListSummaryResponse(
                id=row["id"],
                full_name=row["full_name"],
                email=row["email"],
                phone=row["phone"],
                cpf=row["cpf"],
                tags=row["tags"] or [],
                created_at=row["created_at"],
                archived_at=row.get("archived_at"),
                archive_reason=row.get("archive_reason"),
                application_source=row.get("application_source"),
                resume_count=int(row["resume_count"] or 0),
                linked_job_count=int(row["linked_job_count"] or 0),
                latest_job_id=row.get("latest_job_id"),
                latest_job_title=row.get("latest_job_title"),
                latest_job_stage=row.get("latest_job_stage"),
                latest_relationship_status=row.get("latest_relationship_status"),
                active_job_id=row["active_job_id"],
                active_job_title=row["active_job_title"],
                active_job_stage=row["active_job_stage"],
                active_job_job_fit_score=(
                    float(row["active_job_job_fit_score"])
                    if row["active_job_job_fit_score"] is not None
                    else None
                ),
                ai_status=row["ai_status"],
            )
            for row in rows
        ]
        return items, total

    async def get(self, candidate_id: UUID) -> CandidateModel:
        candidate = await self._repository.find_active_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError
        return candidate

    async def get_overview(self, candidate_id: UUID) -> CandidateOverviewResponse:
        candidate = await self.get(candidate_id)
        resume_rows = await self._repository.list_resume_summaries(candidate_id)
        match_rows = await self._repository.list_top_job_matches(candidate_id)
        pipeline_rows = await self._repository.list_pipeline_entries(candidate_id)
        active_pipeline_row = next(
            (row for row in pipeline_rows if row.get("relationship_status") == "active"),
            None,
        )
        active_job_id = active_pipeline_row["job_id"] if active_pipeline_row is not None else None

        latest_analysis_row = None
        if active_job_id is not None:
            latest_analysis_row = await self._repository.find_latest_analysis_summary_for_job(
                candidate_id,
                active_job_id,
            )

        latest_analysis = (
            CandidateLatestAnalysisResponse(**latest_analysis_row)
            if latest_analysis_row is not None
            else None
        )
        latest_analysis_pipeline = None
        if latest_analysis is not None:
            target_job_id = latest_analysis.job_id
            has_current_score = False
            if target_job_id is not None:
                has_current_score = (
                    await self._repository.find_candidate_job_score_for_analysis(
                        latest_analysis.analysis_id,
                        target_job_id,
                    )
                ) is not None

            published_jobs_total = 1 if target_job_id is not None else 0
            matched_jobs_count = 1 if has_current_score else 0
            pending_jobs_count = (
                1 if target_job_id is not None and not has_current_score else 0
            )

            if latest_analysis.status in {"failed", "cancelled"}:
                matching_status = "blocked"
            elif latest_analysis.status != "completed":
                matching_status = "waiting_analysis"
            elif target_job_id is None:
                matching_status = "idle"
            elif has_current_score:
                matching_status = "completed"
            else:
                matching_status = "idle"

            latest_analysis_pipeline = CandidateLatestAnalysisPipelineResponse(
                analysis_id=latest_analysis.analysis_id,
                job_id=target_job_id,
                matching_status=matching_status,
                published_jobs_total=published_jobs_total,
                matched_jobs_count=matched_jobs_count,
                pending_jobs_count=pending_jobs_count,
            )

        pipeline_current_analysis_id = (
            active_pipeline_row.get("current_analysis_id")
            if active_pipeline_row is not None
            else None
        )
        current_match_score = None
        if active_job_id is not None:
            top_match_for_active_job = next(
                (m for m in match_rows if str(m.get("job_id")) == str(active_job_id)),
                None,
            )
            if (
                top_match_for_active_job
                and top_match_for_active_job.get("job_fit_score") is not None
            ):
                current_match_score = float(top_match_for_active_job["job_fit_score"])

        has_fresh_score_for_active = (
            has_current_score
            if latest_analysis is not None
            and latest_analysis.job_id == active_job_id
            else False
        )

        status_result = derive_candidate_score_status(
            active_job_id=active_job_id,
            pipeline_current_analysis_id=pipeline_current_analysis_id,
            latest_analysis_id=latest_analysis.analysis_id if latest_analysis else None,
            latest_analysis_status=latest_analysis.status if latest_analysis else None,
            latest_analysis_job_id=latest_analysis.job_id if latest_analysis else None,
            has_fresh_score=has_fresh_score_for_active,
            match_score=current_match_score,
        )
        active_job_decision = CandidateActiveJobDecisionResponse(
            score_status=status_result.score_status,
            analysis_status=status_result.analysis_status,
            current_analysis_id=status_result.current_analysis_id,
            match_score=status_result.match_score,
            warnings=status_result.warnings,
            next_action=status_result.next_action,
        )

        return CandidateOverviewResponse(
            candidate=CandidateResponse.model_validate(candidate),
            resumes=[
                CandidateResumeSummaryResponse(**row)
                for row in resume_rows
            ],
            latest_analysis=latest_analysis,
            latest_analysis_pipeline=latest_analysis_pipeline,
            top_matches=[
                CandidateJobMatchSummaryResponse(**row)
                for row in match_rows
            ],
            active_job_id=active_job_id,
            active_job=(
                CandidateActiveJobResponse(
                    id=active_job_id,
                    title=active_pipeline_row["job_title"],
                    status=active_pipeline_row["job_status"],
                )
                if active_pipeline_row is not None
                else None
            ),
            pipeline_entries=[
                CandidatePipelineEntryResponse(
                    candidate_id=row["candidate_id"],
                    job_id=row["job_id"],
                    job_title=row["job_title"],
                    stage=row["stage"],
                    relationship_status=row["relationship_status"],
                    is_terminal=bool(row["is_terminal"]),
                    terminated_at=row.get("terminated_at"),
                    termination_reason=row.get("termination_reason"),
                    candidate_status=self._pipeline_stage_to_candidate_status(row["stage"]),
                    updated_at=row["updated_at"],
                )
                for row in pipeline_rows
            ],
            active_job_decision=active_job_decision,
        )

    async def update(self, candidate_id: UUID, body: UpdateCandidateRequest) -> CandidateModel:
        candidate = await self.get(candidate_id)

        if body.email is not None:
            email = self._clean_email(body.email)
            if email != candidate.email:
                conflict = (
                    await self._repository.find_active_by_email(email)
                    if email is not None
                    else None
                )
                if conflict is not None and conflict.id != candidate_id:
                    raise CandidateEmailConflictError
            candidate.email = email

        if body.cpf is not None:
            cpf = self._clean_manual_cpf(body.cpf)
            if cpf != candidate.cpf:
                conflict = await self._find_existing_candidate_by_cpf(cpf)
                if conflict is not None and conflict.id != candidate_id:
                    raise CandidateCpfConflictError
            candidate.cpf = cpf

        if body.full_name is not None:
            candidate.full_name = self._clean_required_text(body.full_name)
        if body.phone is not None:
            candidate.phone = body.phone
        if body.location_city is not None:
            candidate.location_city = body.location_city
        if body.location_state is not None:
            candidate.location_state = body.location_state
        if body.location_country is not None:
            candidate.location_country = body.location_country.upper().strip()
        if body.linkedin_url is not None:
            candidate.linkedin_url = body.linkedin_url
        if body.github_url is not None:
            candidate.github_url = body.github_url
        if body.portfolio_url is not None:
            candidate.portfolio_url = body.portfolio_url
        if body.internal_notes is not None:
            candidate.internal_notes = body.internal_notes
        if body.tags is not None:
            candidate.tags = self._clean_tags(body.tags)

        candidate.updated_at = datetime.now(UTC)
        return await self._repository.save(candidate)

    async def archive(
        self,
        candidate_id: UUID,
        *,
        actor: User,
        reason: str | None,
        note: str | None,
    ) -> CandidateModel:
        candidate = await self._get_any(candidate_id)
        archive_reason = self._clean_optional_text(reason)
        if archive_reason is None:
            raise CandidateArchiveReasonRequiredError
        if candidate.archived_at is not None:
            return candidate

        previous_state = {"archived": False}
        now = datetime.now(UTC)
        candidate.archived_at = now
        candidate.archived_by = actor.id
        candidate.archive_reason = archive_reason
        candidate.archive_reason_note = self._clean_optional_text(note)
        candidate.updated_at = now
        saved = await self._repository.save(candidate)
        await self._log_state_audit(
            action="archive_candidate",
            candidate=saved,
            actor=actor,
            reason=archive_reason,
            note=candidate.archive_reason_note,
            before_state=previous_state,
            after_state={"archived": True},
        )
        return saved

    async def restore(
        self,
        candidate_id: UUID,
        *,
        actor: User,
    ) -> CandidateModel:
        candidate = await self._get_any(candidate_id)
        if candidate.archived_at is None:
            return candidate

        before_state = {
            "archived": True,
            "archive_reason": candidate.archive_reason,
        }
        candidate.archived_at = None
        candidate.archived_by = None
        candidate.archive_reason = None
        candidate.archive_reason_note = None
        candidate.updated_at = datetime.now(UTC)
        saved = await self._repository.save(candidate)
        await self._log_state_audit(
            action="restore_candidate",
            candidate=saved,
            actor=actor,
            reason=None,
            note=None,
            before_state=before_state,
            after_state={"archived": False},
        )
        return saved

    async def soft_delete(self, candidate_id: UUID) -> None:
        candidate = await self.get(candidate_id)
        now = datetime.now(UTC)
        candidate.deleted_at = now
        candidate.updated_at = now
        await self._repository.save(candidate)

    async def hard_delete(
        self,
        candidate_id: UUID,
        *,
        actor: User,
        reason: str | None,
        note: str | None,
        confirmation: str | None,
    ) -> None:
        candidate = await self.get(candidate_id)
        delete_reason = self._clean_optional_text(reason)
        if delete_reason is None:
            raise CandidateDeleteReasonRequiredError
        if confirmation != "EXCLUIR":
            raise CandidateDeleteConfirmationError

        summary = await self._repository.get_delete_summary(candidate_id)
        if summary.has_final_decision or summary.has_hiring_record:
            raise CandidateCriticalHistoryError(
                "Este candidato possui histórico crítico no processo e não pode ser excluído definitivamente. Use inativar candidato."
            )

        cleaned_note = self._clean_optional_text(note)
        await self._log_delete_audit(
            candidate=candidate,
            actor=actor,
            reason=delete_reason,
            note=cleaned_note,
            summary=summary,
        )
        await self._repository.hard_delete(candidate_id)
        await self._cleanup_candidate_files(summary)

    async def check_duplicate(
        self,
        email: str | None,
        cpf: str | None,
    ) -> CandidateCheckResponse:
        if email:
            clean_email = self._clean_email(email)
            if clean_email:
                candidate = await self._repository.find_active_by_email(clean_email)
                if candidate:
                    return CandidateCheckResponse(
                        exists=True,
                        candidate_id=candidate.id,
                        full_name=candidate.full_name,
                    )
        if cpf:
            candidate = await self._find_existing_candidate_by_cpf(cpf)
            if candidate:
                return CandidateCheckResponse(
                    exists=True,
                    candidate_id=candidate.id,
                    full_name=candidate.full_name,
                )
        return CandidateCheckResponse(exists=False)

    async def _get_any(self, candidate_id: UUID) -> CandidateModel:
        candidate = await self._repository.find_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError
        return candidate

    @staticmethod
    def _clean_email(email: str | None) -> str | None:
        return email.lower().strip() if email else None

    @staticmethod
    def _clean_cpf(cpf: str | None) -> str | None:
        if not cpf:
            return None
        digits = re.sub(r"\D", "", cpf)
        if len(digits) != 11:
            raise InvalidCandidateCpfError
        return digits

    @staticmethod
    def _clean_manual_cpf(cpf: str | None) -> str | None:
        if cpf is None:
            return None
        cleaned = cpf.strip()
        return cleaned or None

    async def _find_existing_candidate_by_cpf(self, cpf: str | None) -> CandidateModel | None:
        if cpf is None:
            return None

        candidate = await self._repository.find_active_by_cpf(cpf)
        if candidate is not None:
            return candidate

        digits = re.sub(r"\D", "", cpf)
        if digits and digits != cpf:
            return await self._repository.find_active_by_cpf(digits)

        return None

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidCandidateTextError
        return cleaned

    @staticmethod
    def _clean_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @staticmethod
    def _clean_tags(tags: list[str]) -> list[str]:
        return sorted({tag.lower().strip() for tag in tags if tag.strip()})

    @staticmethod
    def _pipeline_stage_to_candidate_status(stage: str) -> str:
        mapping = {
            "entry": "Recebido",
            "screening": "Em análise",
            "hr_interview": "Em processo",
            "technical_interview": "Em processo",
            "final": "Etapa final",
            "offer": "Aprovado",
            "hired": "Aprovado",
            "rejected": "Reprovado",
        }
        return mapping.get(stage, "Em processo")

    async def _log_delete_audit(
        self,
        *,
        candidate: CandidateModel,
        actor: User,
        reason: str,
        note: str | None,
        summary: CandidateDeleteSummary,
    ) -> None:
        if self._audit_service is None:
            return
        try:
            audit_session = getattr(self._audit_service, "_session", None)
            if audit_session is None:
                await self._audit_service.log_event(
                    action="delete_candidate",
                    resource_type="candidate",
                    resource_id=candidate.id,
                    user_id=actor.id,
                    metadata={
                        "entityType": "candidate",
                        "entityId": str(candidate.id),
                        "reason": reason,
                        "note": note,
                        "candidate_name": candidate.full_name,
                        "candidate_email": candidate.email,
                        "linked_jobs_count": summary.linked_jobs_count,
                        "analyses_count": summary.analyses_count,
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                    before_state={
                        "full_name": candidate.full_name,
                        "email": candidate.email,
                    },
                    after_state={"deleted": True},
                )
                return

            async with audit_session.begin_nested():
                await self._audit_service.log_event(
                    action="delete_candidate",
                    resource_type="candidate",
                    resource_id=candidate.id,
                    user_id=actor.id,
                    metadata={
                        "entityType": "candidate",
                        "entityId": str(candidate.id),
                        "reason": reason,
                        "note": note,
                        "candidate_name": candidate.full_name,
                        "candidate_email": candidate.email,
                        "linked_jobs_count": summary.linked_jobs_count,
                        "analyses_count": summary.analyses_count,
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                    before_state={
                        "full_name": candidate.full_name,
                        "email": candidate.email,
                    },
                    after_state={"deleted": True},
                )
        except Exception as exc:
            logger.warning(
                "candidate_delete_audit_log_failed",
                action="delete_candidate",
                candidate_id=str(candidate.id),
                actor_id=str(actor.id),
                error=str(exc),
            )

    async def _cleanup_candidate_files(self, summary: CandidateDeleteSummary) -> None:
        if self._file_storage is not None:
            for s3_key in summary.resume_s3_keys:
                await self._file_storage.delete(s3_key)

        for file_path in summary.candidate_document_paths:
            path = Path(file_path)
            if not path.is_absolute() or not path.exists() or not path.is_file():
                continue
            path.unlink(missing_ok=True)

    async def _log_state_audit(
        self,
        *,
        action: str,
        candidate: CandidateModel,
        actor: User,
        reason: str | None,
        note: str | None,
        before_state: dict[str, object],
        after_state: dict[str, object],
    ) -> None:
        if self._audit_service is None:
            return
        try:
            await self._audit_service.log_event(
                action=action,
                resource_type="candidate",
                resource_id=candidate.id,
                user_id=actor.id,
                metadata={
                    "entityType": "candidate",
                    "entityId": str(candidate.id),
                    "candidate_name": candidate.full_name,
                    "candidate_email": candidate.email,
                    "reason": reason,
                    "note": note,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
                before_state=before_state,
                after_state=after_state,
            )
        except Exception as exc:
            logger.warning(
                "candidate_state_audit_log_failed",
                action=action,
                candidate_id=str(candidate.id),
                actor_id=str(actor.id),
                error=str(exc),
            )
