from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import sqlalchemy as sa
import structlog

from src.application.ports.file_storage import FileStorageService
from src.application.services.audit_service import AuditService
from src.application.services.candidate_salary_expectation import normalize_salary_expectation
from src.application.services.candidate_score_status_deriver import (
    derive_candidate_score_status,
)
from src.application.services.pipeline_gate_evaluator import PipelineGateEvaluator
from src.application.services.resume_service import extraction_retry_eligibility_from_values
from src.core.pipeline_stages import is_post_hiring_active_stage, is_success_terminal_stage
from src.domain.entities.user import User
from src.infrastructure.database.models.analysis_model import AnalysisModel
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
    CandidateLatestAnalysisPipelineResponse,
    CandidateLatestAnalysisResponse,
    CandidateLatestMovementResponse,
    CandidateLatestNoteResponse,
    CandidateListSummaryResponse,
    CandidateNextInterviewSummary,
    CandidateOverviewResponse,
    CandidatePipelineEntryResponse,
    CandidatePreviewPendencyResponse,
    CandidateProcessHistoryBehavioralResponse,
    CandidateProcessHistoryDecisionResponse,
    CandidateProcessHistoryInterviewResponse,
    CandidateProcessHistoryItemResponse,
    CandidateProcessHistoryResponse,
    CandidateProcessHistoryScorecardResponse,
    CandidateResponse,
    CandidateResumeSummaryResponse,
    CandidateScoreDimensionsResponse,
    CandidateSkillPreviewResponse,
    CreateCandidateRequest,
    UpdateCandidateRequest,
)

logger = structlog.get_logger(__name__)
_ANALYSIS_PENDING_STALE_AFTER = timedelta(hours=2)
_ANALYSIS_PROCESSING_STALE_AFTER = timedelta(minutes=30)

APPLICATION_SOURCE_MANUAL = "manual"
APPLICATION_SOURCE_PUBLIC = "public_application"
APPLICATION_SOURCE_GOOGLE = "google_oauth"


def _unique_limited_strings(*groups: object, limit: int) -> list[str]:
    values: list[str] = []
    seen: set[str] = set()
    for group in groups:
        if not isinstance(group, list):
            continue
        for item in group:
            if not isinstance(item, str):
                continue
            cleaned = item.strip()
            key = cleaned.lower()
            if not cleaned or key in seen:
                continue
            values.append(cleaned)
            seen.add(key)
            if len(values) >= limit:
                return values
    return values


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
        gate_evaluator: PipelineGateEvaluator | None = None,
    ) -> None:
        self._repository = repository
        self._audit_service = audit_service
        self._file_storage = file_storage
        self._gate_evaluator = gate_evaluator

    async def create(
        self,
        body: CreateCandidateRequest,
        created_by: UUID | None,
        *,
        application_source: str = APPLICATION_SOURCE_MANUAL,
    ) -> CandidateModel:
        """
        Create a new Candidate.

        Args:
            body: CreateCandidateRequest with candidate details.
            created_by: UUID of the user creating the candidate. 
                       Can be None for public application candidates.
            application_source: Source of the application (manual, public, google, etc).

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
            if application_source not in {APPLICATION_SOURCE_MANUAL, APPLICATION_SOURCE_PUBLIC, APPLICATION_SOURCE_GOOGLE}
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
            salary_expectation=normalize_salary_expectation(body.salary_expectation),
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
        city: str | None = None,
        state: str | None = None,
        salary_min: float | None = None,
        salary_max: float | None = None,
        desired_contract_type: str | None = None,
        link_status_filter: str | None = None,
        has_resume: bool | None = None,
        skill: str | None = None,
        seniority: str | None = None,
    ) -> tuple[list[CandidateModel], int]:
        return await self._repository.list_active(
            page,
            page_size,
            search,
            archived,
            application_source=application_source,
            city=city,
            state=state,
            salary_min=salary_min,
            salary_max=salary_max,
            desired_contract_type=desired_contract_type,
            link_status_filter=link_status_filter,
            has_resume=has_resume,
            skill=skill,
            seniority=seniority,
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
        city: str | None = None,
        state: str | None = None,
        salary_min: float | None = None,
        salary_max: float | None = None,
        desired_contract_type: str | None = None,
        link_status_filter: str | None = None,
        skill: str | None = None,
        seniority: str | None = None,
        include_admitted: bool = False,
    ) -> tuple[list[CandidateListSummaryResponse], int]:
        rows, total = await self._repository.list_summaries(
            page,
            page_size,
            search,
            has_resume,
            ai_status_filter,
            archived,
            application_source=application_source,
            city=city,
            state=state,
            salary_min=salary_min,
            salary_max=salary_max,
            desired_contract_type=desired_contract_type,
            link_status_filter=link_status_filter,
            skill=skill,
            seniority=seniority,
            include_admitted=include_admitted,
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
                next_interview=(
                    CandidateNextInterviewSummary(
                        scheduled_start=row["ni_start"],
                        scheduled_end=row["ni_end"],
                        interview_type=row["ni_type"],
                        interview_format=row["ni_format"],
                    )
                    if row.get("ni_start") is not None
                    else None
                ),
            )
            for row in rows
        ]
        return items, total

    async def get(self, candidate_id: UUID) -> CandidateModel:
        candidate = await self._repository.find_active_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError
        return candidate

    async def _mark_stale_current_analysis_as_failed(self, analysis_id: UUID) -> None:
        session = self._repository._session
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(
                AnalysisModel.id == analysis_id,
                sa.cast(AnalysisModel.status, sa.String).in_(["pending", "processing"]),
            )
        )
        if analysis is None:
            return

        now = datetime.now(UTC)
        reason: str | None = None
        if (
            analysis.status == "pending"
            and analysis.created_at is not None
            and analysis.created_at < now - _ANALYSIS_PENDING_STALE_AFTER
            and analysis.next_retry_at is None
        ):
            reason = "analysis_stuck_pending_timeout"
        elif analysis.status == "processing" and (
            (analysis.stale_at is not None and analysis.stale_at < now)
            or (
                analysis.started_at is not None
                and analysis.started_at < now - _ANALYSIS_PROCESSING_STALE_AFTER
            )
            or (
                analysis.started_at is None
                and analysis.updated_at is not None
                and analysis.updated_at < now - _ANALYSIS_PROCESSING_STALE_AFTER
            )
        ):
            reason = (
                "analysis_worker_claim_expired"
                if analysis.stale_at is not None and analysis.stale_at < now
                else "analysis_stuck_processing_timeout"
            )

        if reason is None:
            return

        analysis.status = "failed"
        analysis.failure_reason = reason
        analysis.failed_at = now
        analysis.next_retry_at = None
        analysis.worker_claim_id = None
        analysis.claimed_at = None
        analysis.stale_at = None
        analysis.updated_at = now
        await session.flush()

    async def get_overview(self, candidate_id: UUID, job_id: UUID | None = None) -> CandidateOverviewResponse:
        candidate = await self.get(candidate_id)
        resume_rows = await self._repository.list_resume_summaries(candidate_id)
        match_rows = await self._repository.list_top_job_matches(candidate_id)
        pipeline_rows = await self._repository.list_pipeline_entries(candidate_id)

        if job_id is not None:
            active_pipeline_row = next(
                (row for row in pipeline_rows if str(row.get("job_id")) == str(job_id)),
                None,
            )
        else:
            active_pipeline_row = next(
                (row for row in pipeline_rows if row.get("relationship_status") == "active"),
                None,
            )
            if active_pipeline_row is None:
                active_pipeline_row = next(
                    (
                        row
                        for row in pipeline_rows
                        if row.get("relationship_status") == "hired" or is_success_terminal_stage(row.get("stage"))
                    ),
                    None,
                )
        active_job_id = active_pipeline_row["job_id"] if active_pipeline_row is not None else None
        pipeline_current_analysis_id = (
            active_pipeline_row.get("current_analysis_id")
            if active_pipeline_row is not None
            else None
        )

        if pipeline_current_analysis_id is not None:
            await self._mark_stale_current_analysis_as_failed(pipeline_current_analysis_id)

        latest_analysis_row = None
        if pipeline_current_analysis_id is not None:
            latest_analysis_row = await self._repository.find_analysis_summary_by_id_for_candidate(
                candidate_id=candidate_id,
                analysis_id=pipeline_current_analysis_id,
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

        active_job_score = None
        if active_job_id is not None and pipeline_current_analysis_id is not None:
            active_job_score = await self._repository.find_candidate_job_score_for_analysis(
                pipeline_current_analysis_id,
                active_job_id,
            )

        active_job_skill_preview = None
        if active_job_score is not None:
            active_job_skill_preview = self._build_skill_preview(active_job_score)
        active_job_score_dimensions = self._build_score_dimensions(active_job_score)

        latest_note_row = await self._repository.find_latest_candidate_note_summary(candidate_id)
        latest_movement_row = (
            await self._repository.find_latest_pipeline_movement_summary(
                candidate_id=candidate_id,
                job_id=active_job_id,
            )
            if active_job_id is not None
            else None
        )
        preview_flags = (
            await self._repository.get_preview_pending_flags(
                candidate_id=candidate_id,
                job_id=active_job_id,
                active_stage=active_pipeline_row["stage"],
            )
            if active_pipeline_row is not None and active_job_id is not None
            else {}
        )

        # Gate-based pendencies: peek at gates for the next forward stage.
        # These are authoritative — they are the same gates the pipeline move
        # endpoint evaluates when the user tries to advance the candidate.
        gate_pendencies: list[CandidatePreviewPendencyResponse] = []
        gate_pendencies_evaluated = False
        if (
            self._gate_evaluator is not None
            and active_pipeline_row is not None
            and active_job_id is not None
            and not bool(active_pipeline_row.get("is_terminal", False))
        ):
            job = await self._gate_evaluator.find_job(active_job_id)
            if job is not None:
                gate_result = await self._gate_evaluator.peek_next_stage_gates(
                    candidate_id=candidate_id,
                    job_id=active_job_id,
                    job=job,
                    current_stage=active_pipeline_row["stage"],
                )
                gate_pendencies_evaluated = gate_result is not None
                if gate_result is not None and gate_result.is_blocked:
                    gate_pendencies = [
                        CandidatePreviewPendencyResponse(
                            id=g.code,
                            label=g.label,
                            tone="block",
                            action=g.action,
                            description=g.description,
                            action_payload=g.action_payload,
                        )
                        for g in gate_result.missing_gates
                    ]

        def _build_resume_summary(row: dict) -> CandidateResumeSummaryResponse:
            uploaded_at = row.get("uploaded_at")
            can_retry, reason, label = (
                extraction_retry_eligibility_from_values(
                    extraction_status=row.get("extraction_status"),
                    uploaded_at=uploaded_at,
                    word_count=row.get("word_count"),
                )
                if uploaded_at is not None
                else (False, None, None)
            )
            return CandidateResumeSummaryResponse(
                resume_id=row["resume_id"],
                title=row["title"],
                status=row["status"],
                current_version=row["current_version"],
                current_version_id=row.get("current_version_id"),
                current_file_name=row.get("current_file_name"),
                extraction_status=row.get("extraction_status"),
                can_retry_extraction=can_retry,
                retry_extraction_reason=reason,
                extraction_status_label=label,
                updated_at=row["updated_at"],
            )

        return CandidateOverviewResponse(
            candidate=CandidateResponse.model_validate(candidate),
            resumes=[_build_resume_summary(row) for row in resume_rows],
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
                    pipeline_id=row.get("pipeline_id"),
                    resume_version_id=row.get("resume_version_id"),
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
            active_job_skill_preview=active_job_skill_preview,
            active_job_score_dimensions=active_job_score_dimensions,
            latest_note=(
                CandidateLatestNoteResponse(**latest_note_row)
                if latest_note_row is not None
                else None
            ),
            preview_pendencies=(
                gate_pendencies + self._build_preview_pendencies(
                    has_resume=bool(resume_rows),
                    latest_analysis=latest_analysis,
                    active_stage=active_pipeline_row["stage"] if active_pipeline_row is not None else None,
                    flags=preview_flags,
                )
            ),
            latest_movement=(
                CandidateLatestMovementResponse(**latest_movement_row)
                if latest_movement_row is not None
                else None
            ),
        )

    async def get_process_history(
        self,
        candidate_id: UUID,
        *,
        job_id: UUID | None = None,
    ) -> CandidateProcessHistoryResponse:
        await self.get(candidate_id)
        rows = await self._repository.list_process_history(candidate_id=candidate_id, job_id=job_id)
        return CandidateProcessHistoryResponse(
            candidate_id=candidate_id,
            processes=[self._build_process_history_item(row) for row in rows],
        )

    def _build_process_history_item(self, row: dict) -> CandidateProcessHistoryItemResponse:
        return CandidateProcessHistoryItemResponse(
            pipeline_id=row["pipeline_id"],
            job_id=row["job_id"],
            job_title=row["job_title"],
            is_current=bool(row.get("is_current")),
            started_at=row.get("started_at"),
            closed_at=row.get("closed_at"),
            current_or_final_stage=row.get("current_or_final_stage") or "entry",
            result_label=self._process_result_label(
                row.get("relationship_status"),
                row.get("current_or_final_stage"),
                bool(row.get("is_current")),
            ),
            closure_reason=row.get("closure_reason"),
            events_count=int(row.get("events_count") or 0),
            interviews=[
                CandidateProcessHistoryInterviewResponse(**item)
                for item in row.get("interviews", [])
            ],
            scorecards=[
                CandidateProcessHistoryScorecardResponse(**item)
                for item in row.get("scorecards", [])
            ],
            behavioral_assessment=(
                CandidateProcessHistoryBehavioralResponse(**row["behavioral_assessment"])
                if row.get("behavioral_assessment")
                else None
            ),
            hiring_decision=(
                CandidateProcessHistoryDecisionResponse(**row["hiring_decision"])
                if row.get("hiring_decision")
                else None
            ),
        )

    @staticmethod
    def _process_result_label(
        relationship_status: str | None,
        stage: str | None,
        is_current: bool,
    ) -> str:
        if stage == "admitted":
            return "Admitido"
        if relationship_status == "hired" or is_post_hiring_active_stage(stage):
            return "Contratado"
        if is_current and relationship_status == "active":
            return "Em andamento"
        if relationship_status == "rejected" or stage == "rejected":
            return "Não selecionado"
        if relationship_status == "withdrawn":
            return "Desistência"
        if relationship_status == "archived":
            return "Arquivado"
        return "Processo encerrado" if not is_current else "Em andamento"

    @staticmethod
    def _build_skill_preview(score: object | None) -> CandidateSkillPreviewResponse | None:
        if score is None:
            return None

        breakdown = getattr(score, "breakdown", None)
        if not isinstance(breakdown, dict):
            return None

        matched = _unique_limited_strings(
            breakdown.get("matched_priority_skills"),
            breakdown.get("matched_required_skills"),
            breakdown.get("matched_eliminatory_skills"),
            breakdown.get("matched_complementary_skills"),
            limit=3,
        )
        attention = _unique_limited_strings(
            breakdown.get("missing_eliminatory_skills"),
            breakdown.get("missing_required_skills"),
            breakdown.get("missing_priority_skills"),
            breakdown.get("weak_evidence_priority_skills"),
            breakdown.get("missing_complementary_skills"),
            limit=3,
        )

        if not matched and not attention:
            return None

        return CandidateSkillPreviewResponse(
            matched_skills=matched,
            attention_points=attention,
        )

    @staticmethod
    def _build_score_dimensions(score: object | None) -> CandidateScoreDimensionsResponse | None:
        if score is None:
            return None

        breakdown = getattr(score, "breakdown", None)
        if not isinstance(breakdown, dict):
            return None

        def _pick_number(*keys: str) -> float | None:
            for key in keys:
                value = breakdown.get(key)
                if isinstance(value, (int, float)):
                    return float(value)
            return None

        dimensions = CandidateScoreDimensionsResponse(
            skills=_pick_number("skills_score", "skills", "skill_match_score"),
            experience=_pick_number("experience_score", "experience", "experience_match_score"),
            seniority=_pick_number("seniority_score", "seniority", "seniority_match_score"),
            education=_pick_number("education_score", "education"),
            confidence=_pick_number("confidence_score", "confidence", "data_confidence_score"),
        )

        if all(
            value is None
            for value in (
                dimensions.skills,
                dimensions.experience,
                dimensions.seniority,
                dimensions.education,
                dimensions.confidence,
            )
        ):
            return None

        return dimensions

    @staticmethod
    def _build_preview_pendencies(
        *,
        has_resume: bool,
        latest_analysis: CandidateLatestAnalysisResponse | None,
        active_stage: str | None,
        flags: dict[str, bool],
    ) -> list[CandidatePreviewPendencyResponse]:
        pendencies: list[CandidatePreviewPendencyResponse] = []

        def add(id_: str, label: str, tone: str = "info") -> None:
            if len(pendencies) < 3 and not any(item.id == id_ for item in pendencies):
                pendencies.append(CandidatePreviewPendencyResponse(id=id_, label=label, tone=tone))

        if flags.get("behavioral_assignment_pending"):
            add("behavioral_assignment", "Teste comportamental pendente", "warning")
        if flags.get("behavioral_ai_pending"):
            add("behavioral_ai", "IA comportamental pendente", "warning")
        if (
            active_stage in {"hr_interview", "technical_interview"}
        ):
            if flags.get("interview_not_scheduled"):
                add("interview_not_scheduled", "Entrevista não agendada", "warning")
            elif flags.get("interview_scheduled"):
                add("interview_scheduled", "Entrevista em andamento", "info")
            elif flags.get("interview_feedback_pending"):
                add("interview_feedback_pending", "Feedback da entrevista pendente", "warning")
            elif flags.get("interview_scorecard_pending"):
                add("interview_scorecard_pending", "Scorecard da entrevista pendente", "warning")
        if not has_resume:
            add("resume", "Currículo ausente", "warning")
        if has_resume and latest_analysis is None:
            add("analysis", "Análise pendente", "info")
        elif latest_analysis is not None and latest_analysis.status in {"pending", "processing", "retry_scheduled"}:
            add("analysis_processing", "Análise pendente", "info")
        elif latest_analysis is not None and latest_analysis.status == "failed":
            add("analysis_failed", "Análise falhou", "warning")
        if flags.get("document_pending"):
            add("document", "Documento pendente", "warning")

        return pendencies

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
        if body.salary_expectation is not None:
            candidate.salary_expectation = normalize_salary_expectation(body.salary_expectation)
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
            "hired": "Contratado",
            "pre_admission": "Pré-admissão",
            "protheus": "Protheus",
            "admitted": "Admitido",
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
