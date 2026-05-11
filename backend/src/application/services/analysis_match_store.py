from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from src.application.services.analysis_skill_evidence_builder import (
    SkillEvidenceBreakdownInput,
    build_skill_evidence_breakdown,
)
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)


@dataclass(frozen=True)
class PersistedCandidateJobMatchContext:
    candidate_id: UUID
    resume_version_id: UUID
    candidate_job_pipeline_id: UUID | None
    persisted_match: CandidateJobMatchModel


class AnalysisMatchStore:
    def __init__(self, repository: SQLAlchemyAnalysisRepository) -> None:
        self._repository = repository
        self._pipeline_repository = SQLAlchemyPipelineRepository(repository._session)

    async def persist_candidate_job_match(
        self,
        *,
        analysis_id: UUID,
        job_id: UUID,
        job: Any,
        candidate_profile_analysis: CandidateProfileAnalysisModel,
        job_profile_analysis: JobProfileAnalysisModel,
        result: Any,
        recommendation: str,
        matched_skill_names: list[str],
        missing_skill_names: list[str],
        skill_scores: dict[str, Any],
        partial_matches: list[dict[str, Any]],
        weak_evidence_priority_skills: list[str],
        validation_status: str,
        validation_reasons: list[str],
        failed_rule: str | None,
        failed_dimension: str | None,
        eligibility_status: str,
        candidate_years: Decimal | None,
        required_years: Decimal | None,
        priority_matched: int,
        total_priority: int,
        complementary_matched: int,
        total_complementary: int,
        eliminatory_matched: int,
        total_eliminatory: int,
        priority_component_impact: Decimal,
        complementary_component_impact: Decimal,
        experience_component_impact: Decimal,
        seniority_component_impact: Decimal,
        has_domain_evidence: bool,
        summary: str,
        score_version: str,
    ) -> PersistedCandidateJobMatchContext:
        candidate_id = await self._repository.get_candidate_id_from_analysis(analysis_id)
        resume_version_id = await self._repository.get_resume_version_id_from_analysis(analysis_id)
        if candidate_id is None or resume_version_id is None:
            raise ValueError("Could not resolve analysis context for candidate_job_match persistence")

        active_pipeline_entry = await self._pipeline_repository.find_active_entry(
            candidate_id,
            job_id,
        )
        pipeline_key = (
            active_pipeline_entry.candidate_job_pipeline_id
            if active_pipeline_entry is not None
            else None
        )

        skill_evidence_breakdown = build_skill_evidence_breakdown(
            SkillEvidenceBreakdownInput(
                job_minimum_education_level=job.minimum_education_level,
                result_highest_education_level=result.highest_education_level,
                skill_scores=skill_scores,
                partial_matches=partial_matches,
                weak_evidence_priority_skills=weak_evidence_priority_skills,
                validation_status=validation_status,
                validation_reasons=validation_reasons,
                failed_rule=failed_rule,
                failed_dimension=failed_dimension,
                eligibility_status=eligibility_status,
                candidate_years=candidate_years,
                required_years=required_years,
                priority_matched=priority_matched,
                total_priority=total_priority,
                complementary_matched=complementary_matched,
                total_complementary=total_complementary,
                eliminatory_matched=eliminatory_matched,
                total_eliminatory=total_eliminatory,
                priority_component_impact=priority_component_impact,
                complementary_component_impact=complementary_component_impact,
                experience_component_impact=experience_component_impact,
                seniority_component_impact=seniority_component_impact,
                has_domain_evidence=has_domain_evidence,
                score_version=score_version,
            )
        )

        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash during match persistence")

        persisted_match = CandidateJobMatchModel(
            candidate_id=candidate_id,
            job_id=job_id,
            resume_version_id=resume_version_id,
            candidate_profile_analysis_id=candidate_profile_analysis.id,
            job_profile_analysis_id=job_profile_analysis.id,
            candidate_job_pipeline_id=pipeline_key,
            recommendation=recommendation,
            matched_skills_json=matched_skill_names,
            missing_skills_json=missing_skill_names,
            skill_evidence_breakdown=skill_evidence_breakdown,
            explanation=summary,
            eligibility_status=eligibility_status,
            created_at=datetime.now(UTC),
            score_version=score_version if partial_matches else None,
            freshness_status="fresh",
            job_signature_hash=str(job.job_profile_hash),
        )

        persisted_match = await self._repository.upsert_candidate_job_match(persisted_match)
        return PersistedCandidateJobMatchContext(
            candidate_id=candidate_id,
            resume_version_id=resume_version_id,
            candidate_job_pipeline_id=pipeline_key,
            persisted_match=persisted_match,
        )
