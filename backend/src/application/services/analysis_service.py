import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

# Penalidade de sobre-qualificação em senioridade só é aplicada quando
# a diferença de níveis é >= este limiar (configurável).
_SENIORITY_PENALTY_THRESHOLD = 2

from src.domain.entities.user import User
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.interface.api.schemas.analysis_schemas import (
    AnalysisGlobalItemResponse,
    AnalysisMatchResponse,
    AnalysisPipelineJobMatchResponse,
    AnalysisPipelineResponse,
)
from src.application.services.pipeline_service import PipelineService


# Handles c#, c++, react.js, node.js and plain words as atomic tokens.
_TOKEN_RE = re.compile(r'[a-z][a-z0-9]*(?:\+\+|#|\.[a-z][a-z0-9]*)*')


def _tokenize(text: str) -> frozenset[str]:
    return frozenset(_TOKEN_RE.findall(text.lower()))


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

    async def list_global(
        self,
        page: int,
        page_size: int,
        status_filter: str | None = None,
        search: str | None = None,
        used_real_ai: bool | None = None,
    ) -> tuple[list[AnalysisGlobalItemResponse], int]:
        rows, total = await self._repository.list_global(
            page, page_size, status_filter, search, used_real_ai
        )
        items = [
            AnalysisGlobalItemResponse(
                id=row["id"],
                candidate_id=row["candidate_id"],
                candidate_name=row["candidate_name"],
                candidate_email=row["candidate_email"],
                resume_file_name=row["resume_file_name"],
                resume_version_id=row["resume_version_id"],
                status=row["status"],
                failure_reason=row["failure_reason"],
                used_real_ai=row["used_real_ai"],
                overall_score=float(row["overall_score"]) if row.get("overall_score") is not None else None,
                retry_count=row["retry_count"],
                created_at=row["created_at"],
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                failed_at=row["failed_at"],
            )
            for row in rows
        ]
        return items, total

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

        # Pre-tokenize candidate skills once for O(n) matching.
        candidate_token_sets = [_tokenize(s) for s in all_candidate_skills if s]

        mandatory_skills = [row for row in job_skills if row.JobRequiredSkillModel.is_mandatory]
        optional_skills = [row for row in job_skills if not row.JobRequiredSkillModel.is_mandatory]

        def skill_matched(skill_name: str) -> bool:
            job_tokens = _tokenize(skill_name)
            return bool(job_tokens) and any(
                bool(job_tokens & cand_tokens) for cand_tokens in candidate_token_sets
            )

        mandatory_matched = sum(1 for row in mandatory_skills if skill_matched(row.skill_name))
        optional_matched = sum(1 for row in optional_skills if skill_matched(row.skill_name))
        matched_skill_names = [
            row.skill_name for row in job_skills if skill_matched(row.skill_name)
        ]
        missing_skill_names = [
            row.skill_name for row in mandatory_skills if not skill_matched(row.skill_name)
        ]

        # Candidate skills that don't overlap with any required job skill token.
        job_skill_token_sets = [_tokenize(row.skill_name) for row in job_skills]

        def _is_bonus(cand: str) -> bool:
            cand_tokens = _tokenize(cand)
            return bool(cand_tokens) and not any(
                bool(cand_tokens & jt) for jt in job_skill_token_sets
            )

        bonus_skill_names = sorted(s for s in all_candidate_skills if s and _is_bonus(s))

        total_mandatory = len(mandatory_skills)
        total_optional = len(optional_skills)

        # Pure-Decimal scores; avoid float arithmetic entirely.
        mandatory_score = (
            Decimal(mandatory_matched) / Decimal(total_mandatory) * Decimal("100")
            if total_mandatory > 0
            else Decimal("0")
        )
        optional_score = (
            Decimal(optional_matched) / Decimal(total_optional) * Decimal("100")
            if total_optional > 0
            else Decimal("0")
        )

        # Auto-reweight when a category has no skills.
        w_mand = Decimal("0.40")
        w_opt = Decimal("0.20")
        w_sen = Decimal("0.20")
        w_ai = Decimal("0.20")

        if total_mandatory == 0 and total_optional > 0:
            w_opt += w_mand
            w_mand = Decimal("0")
        elif total_mandatory == 0 and total_optional == 0:
            half = (w_mand + w_opt) / 2
            w_sen += half
            w_ai += half
            w_mand = Decimal("0")
            w_opt = Decimal("0")
        elif total_optional == 0:
            w_mand += w_opt
            w_opt = Decimal("0")

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
        if candidate_sen > job_sen and distance >= _SENIORITY_PENALTY_THRESHOLD:
            seniority_score = seniority_score * Decimal("0.90")

        raw_ai = result.overall_score
        if raw_ai is None:
            ai_score = Decimal("0")
        elif isinstance(raw_ai, Decimal):
            ai_score = min(raw_ai, Decimal("100"))
        else:
            ai_score = min(Decimal(str(raw_ai)), Decimal("100"))

        overall = min(
            mandatory_score * w_mand
            + optional_score * w_opt
            + seniority_score * w_sen
            + ai_score * w_ai,
            Decimal("100"),
        ).quantize(Decimal("0.01"))

        enough_mandatory_for_strong = (
            Decimal(mandatory_matched) / Decimal(total_mandatory) >= Decimal("0.90")
            if total_mandatory else True
        )
        enough_mandatory_for_good = (
            Decimal(mandatory_matched) / Decimal(total_mandatory) >= Decimal("0.75")
            if total_mandatory else True
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
        await PipelineService(
            SQLAlchemyPipelineRepository(self._repository.session)
        ).register_match_entry(
            analysis_id=analysis_id,
            job_id=job_id,
            match_score=overall,
        )

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
