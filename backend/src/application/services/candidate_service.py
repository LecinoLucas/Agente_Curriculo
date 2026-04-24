from datetime import UTC, datetime
from uuid import UUID

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.interface.api.schemas.candidate_schemas import (
    CandidateJobMatchSummaryResponse,
    CandidateLatestAnalysisPipelineResponse,
    CandidateLatestAnalysisResponse,
    CandidateOverviewResponse,
    CandidateResponse,
    CandidateResumeSummaryResponse,
    CreateCandidateRequest,
    UpdateCandidateRequest,
)


class CandidateNotFoundError(Exception):
    pass


class CandidateEmailConflictError(Exception):
    pass


class InvalidCandidateTextError(Exception):
    pass


class CandidateService:
    def __init__(self, repository: SQLAlchemyCandidateRepository) -> None:
        self._repository = repository

    async def create(self, body: CreateCandidateRequest, created_by: UUID) -> CandidateModel:
        email = self._clean_email(body.email)
        if email is not None and await self._repository.find_active_by_email(email):
            raise CandidateEmailConflictError

        candidate = CandidateModel(
            full_name=self._clean_required_text(body.full_name),
            email=email,
            phone=body.phone,
            location_city=body.location_city,
            location_state=body.location_state,
            location_country=body.location_country.upper().strip(),
            linkedin_url=body.linkedin_url,
            github_url=body.github_url,
            portfolio_url=body.portfolio_url,
            internal_notes=body.internal_notes,
            tags=self._clean_tags(body.tags),
            user_id=body.user_id,
            created_by=created_by,
        )
        return await self._repository.create(candidate)

    async def list(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
    ) -> tuple[list[CandidateModel], int]:
        return await self._repository.list_active(page, page_size, search)

    async def get(self, candidate_id: UUID) -> CandidateModel:
        candidate = await self._repository.find_active_by_id(candidate_id)
        if candidate is None:
            raise CandidateNotFoundError
        return candidate

    async def get_overview(self, candidate_id: UUID) -> CandidateOverviewResponse:
        candidate = await self.get(candidate_id)
        resume_rows = await self._repository.list_resume_summaries(candidate_id)
        latest_analysis_row = await self._repository.find_latest_analysis_summary(candidate_id)
        match_rows = await self._repository.list_top_job_matches(candidate_id)

        latest_analysis = (
            CandidateLatestAnalysisResponse(**latest_analysis_row)
            if latest_analysis_row is not None
            else None
        )
        latest_analysis_pipeline = None
        if latest_analysis is not None:
            published_jobs_total = await self._repository.count_published_jobs()
            matched_jobs_count = await self._repository.count_published_matches_for_analysis(
                latest_analysis.analysis_id
            )
            pending_jobs_count = max(published_jobs_total - matched_jobs_count, 0)

            if latest_analysis.status in {"failed", "cancelled"}:
                matching_status = "blocked"
            elif latest_analysis.status != "completed":
                matching_status = "waiting_analysis"
            elif published_jobs_total == 0:
                matching_status = "idle"
            elif pending_jobs_count > 0:
                matching_status = "processing"
            else:
                matching_status = "completed"

            latest_analysis_pipeline = CandidateLatestAnalysisPipelineResponse(
                analysis_id=latest_analysis.analysis_id,
                matching_status=matching_status,
                published_jobs_total=published_jobs_total,
                matched_jobs_count=matched_jobs_count,
                pending_jobs_count=pending_jobs_count,
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

    async def soft_delete(self, candidate_id: UUID) -> None:
        candidate = await self.get(candidate_id)
        now = datetime.now(UTC)
        candidate.deleted_at = now
        candidate.updated_at = now
        await self._repository.save(candidate)

    @staticmethod
    def _clean_email(email: str | None) -> str | None:
        return email.lower().strip() if email else None

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidCandidateTextError
        return cleaned

    @staticmethod
    def _clean_tags(tags: list[str]) -> list[str]:
        return sorted({tag.lower().strip() for tag in tags if tag.strip()})
