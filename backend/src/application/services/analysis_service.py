from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from src.domain.entities.user import User
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.interface.api.schemas.analysis_schemas import (
    AnalysisMatchResponse,
    AnalysisPipelineJobMatchResponse,
    AnalysisPipelineResponse,
)


class ResumeVersionNotFoundError(Exception):
    pass


class ResumeVersionNotReadyError(Exception):
    pass


class AIModelUnavailableError(Exception):
    pass


class PromptTemplateUnavailableError(Exception):
    pass


class AnalysisNotFoundError(Exception):
    pass


class AnalysisNotCompletedError(Exception):
    pass


class AnalysisResultNotFoundError(Exception):
    pass


class JobNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class AnalysisResultDetails:
    analysis: AnalysisModel
    result: AnalysisResultModel


class AnalysisService:
    def __init__(self, repository: SQLAlchemyAnalysisRepository) -> None:
        self._repository = repository

    async def request(self, resume_version_id: UUID, current_user: User) -> AnalysisModel:
        resume_version = await self._repository.find_resume_version_for_user(
            resume_version_id,
            current_user,
        )
        if resume_version is None:
            raise ResumeVersionNotFoundError
        if resume_version.extraction_status != "completed" or not (
            resume_version.extracted_text or ""
        ).strip():
            raise ResumeVersionNotReadyError

        ai_model = await self._repository.find_preferred_ai_model()
        if ai_model is None:
            raise AIModelUnavailableError

        prompt_template = await self._repository.find_preferred_prompt_template()
        if prompt_template is None:
            raise PromptTemplateUnavailableError

        analysis = AnalysisModel(
            resume_version_id=resume_version_id,
            ai_model_id=ai_model.id,
            prompt_template_id=prompt_template.id,
            status="pending",
            requested_by=current_user.id,
        )
        return await self._repository.create(analysis)

    async def list(
        self,
        current_user: User,
        page: int,
        page_size: int,
        status_filter: str | None,
    ) -> tuple[list[AnalysisModel], int]:
        return await self._repository.list_for_user(current_user, page, page_size, status_filter)

    async def get(self, analysis_id: UUID, current_user: User) -> AnalysisModel:
        analysis = await self._repository.find_for_user(analysis_id, current_user)
        if analysis is None:
            raise AnalysisNotFoundError
        return analysis

    async def get_result(self, analysis_id: UUID, current_user: User) -> AnalysisResultDetails:
        analysis = await self.get(analysis_id, current_user)
        if analysis.status != "completed":
            raise AnalysisNotCompletedError

        result = await self._repository.find_result(analysis_id)
        if result is None:
            raise AnalysisResultNotFoundError
        return AnalysisResultDetails(analysis=analysis, result=result)

    async def get_pipeline_status(
        self,
        analysis_id: UUID,
        current_user: User,
    ) -> AnalysisPipelineResponse:
        analysis = await self.get(analysis_id, current_user)
        published_jobs_total = await self._repository.count_published_jobs()
        matched_jobs_count = await self._repository.count_published_matches_for_analysis(
            analysis_id
        )
        pending_jobs_count = max(published_jobs_total - matched_jobs_count, 0)
        recent_matches = await self._repository.list_recent_job_matches_for_analysis(analysis_id)

        if analysis.status in {"failed", "cancelled"}:
            matching_status = "blocked"
        elif analysis.status != "completed":
            matching_status = "waiting_analysis"
        elif published_jobs_total == 0:
            matching_status = "idle"
        elif pending_jobs_count > 0:
            matching_status = "processing"
        else:
            matching_status = "completed"

        return AnalysisPipelineResponse(
            analysis_id=analysis.id,
            analysis_status=analysis.status,
            matching_status=matching_status,
            published_jobs_total=published_jobs_total,
            matched_jobs_count=matched_jobs_count,
            pending_jobs_count=pending_jobs_count,
            recent_matches=[
                AnalysisPipelineJobMatchResponse(**row)
                for row in recent_matches
            ],
        )

    async def match_to_job(
        self,
        analysis_id: UUID,
        job_id: UUID,
        current_user: User,
    ) -> AnalysisMatchResponse:
        details = await self.get_result(analysis_id, current_user)
        return await self._match_details_to_job(details, job_id)

    async def match_completed_analysis_to_job(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> AnalysisMatchResponse:
        analysis = await self._repository.find_completed(analysis_id)
        if analysis is None:
            raise AnalysisNotCompletedError

        result = await self._repository.find_result(analysis_id)
        if result is None:
            raise AnalysisResultNotFoundError

        details = AnalysisResultDetails(analysis=analysis, result=result)
        return await self._match_details_to_job(details, job_id)

    async def auto_match_published_jobs(self, analysis_id: UUID) -> int:
        jobs = await self._repository.list_published_jobs()
        matched = 0
        for job in jobs:
            await self.match_completed_analysis_to_job(analysis_id, job.id)
            matched += 1
        return matched

    async def _match_details_to_job(
        self,
        details: AnalysisResultDetails,
        job_id: UUID,
    ) -> AnalysisMatchResponse:
        analysis_id = details.analysis.id
        result = details.result

        job = await self._repository.find_active_job(job_id)
        if job is None:
            raise JobNotFoundError

        job_skills = await self._repository.list_active_job_skill_rows(job_id)
        candidate_keywords: set[str] = {kw.lower() for kw in (result.keywords or [])}
        extracted: dict = result.extracted_data or {}
        raw_skills: list[dict] = extracted.get("skills", [])
        candidate_skill_names: set[str] = {
            skill.get("name", "").lower()
            for skill in raw_skills
            if skill.get("name")
        }
        all_candidate_skills = candidate_keywords | candidate_skill_names

        mandatory_skills = [row for row in job_skills if row.JobRequiredSkillModel.is_mandatory]
        optional_skills = [row for row in job_skills if not row.JobRequiredSkillModel.is_mandatory]

        def skill_matched(skill_name: str) -> bool:
            norm = skill_name.lower()
            return any(norm in cand or cand in norm for cand in all_candidate_skills)

        mandatory_matched = sum(1 for row in mandatory_skills if skill_matched(row.skill_name))
        optional_matched = sum(1 for row in optional_skills if skill_matched(row.skill_name))
        matched_skill_names = [
            row.skill_name for row in job_skills if skill_matched(row.skill_name)
        ]
        missing_skill_names = [
            row.skill_name for row in mandatory_skills if not skill_matched(row.skill_name)
        ]
        required_skill_names = {row.skill_name.lower() for row in job_skills}
        bonus_skill_names = sorted(
            skill for skill in all_candidate_skills if skill and skill not in required_skill_names
        )

        total_mandatory = len(mandatory_skills)
        total_optional = len(optional_skills)
        mandatory_score = (
            Decimal(str(mandatory_matched / total_mandatory * 100))
            if total_mandatory
            else Decimal("100")
        )
        optional_score = (
            Decimal(str(optional_matched / total_optional * 100))
            if total_optional
            else Decimal("100")
        )

        seniority_map = {
            "intern": 0,
            "junior": 1,
            "mid": 2,
            "senior": 3,
            "lead": 4,
            "principal": 5,
            "director": 6,
        }
        candidate_sen = seniority_map.get(result.seniority_level or "", 2)
        job_sen = seniority_map.get(job.seniority_level or "", 2)
        distance = abs(candidate_sen - job_sen)
        sen_scores = {0: Decimal("100"), 1: Decimal("75"), 2: Decimal("45"), 3: Decimal("20")}
        seniority_score = sen_scores.get(distance, Decimal("0"))
        if candidate_sen > job_sen:
            seniority_score = seniority_score * Decimal("0.90")

        overall = (
            mandatory_score * Decimal("0.40")
            + optional_score * Decimal("0.20")
            + seniority_score * Decimal("0.20")
            + Decimal(str(min(float(result.overall_score or 0), 100))) * Decimal("0.20")
        ).quantize(Decimal("0.01"))

        enough_mandatory_for_strong = (
            mandatory_matched / total_mandatory >= 0.90 if total_mandatory else True
        )
        enough_mandatory_for_good = (
            mandatory_matched / total_mandatory >= 0.75 if total_mandatory else True
        )

        if overall >= 82 and enough_mandatory_for_strong:
            recommendation = "strong_match"
        elif overall >= 65 and enough_mandatory_for_good:
            recommendation = "good_match"
        elif overall >= 45:
            recommendation = "potential"
        else:
            recommendation = "not_recommended"

        skills_score = (
            mandatory_score * Decimal("0.67") + optional_score * Decimal("0.33")
        ).quantize(Decimal("0.01"))
        summary = (
            f"{mandatory_matched}/{total_mandatory} skills obrigatórias e "
            f"{optional_matched}/{total_optional} skills opcionais atendidas."
        )
        existing_match = await self._repository.find_job_match(analysis_id, job_id)
        match = existing_match or ResumeJobMatchModel(
            analysis_id=analysis_id,
            job_id=job_id,
            created_at=datetime.now(UTC),
        )
        match.match_score = overall
        match.skills_match_score = skills_score
        match.experience_match_score = result.experience_score
        match.seniority_match_score = seniority_score.quantize(Decimal("0.01"))
        match.matched_skills = matched_skill_names
        match.missing_skills = missing_skill_names
        match.bonus_skills = bonus_skill_names
        match.match_summary = summary
        match.recommendation = recommendation
        await self._repository.save_job_match(match)

        return AnalysisMatchResponse(
            analysis_id=analysis_id,
            job_id=job_id,
            match_score=overall,
            recommendation=recommendation,
            mandatory_skills_matched=mandatory_matched,
            mandatory_skills_total=total_mandatory,
            optional_skills_matched=optional_matched,
            optional_skills_total=total_optional,
            seniority_score=seniority_score.quantize(Decimal("0.01")),
            candidate_seniority=result.seniority_level,
            job_seniority=job.seniority_level,
        )
