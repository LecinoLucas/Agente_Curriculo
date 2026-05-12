from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from decimal import Decimal
from time import perf_counter
from typing import Any
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.application.services.analysis_service import AnalysisService
from src.application.services.skill_equivalence_service import SkillEquivalenceService
from src.core.settings import settings
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)

logger = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class MatchingComparisonContext:
    analysis_id: UUID
    candidate_id: UUID
    candidate_name: str
    resume_version_id: UUID
    job_id: UUID
    job_title: str
    analysis_created_at: datetime


@dataclass(frozen=True, slots=True)
class MatchingSourceRunResult:
    requested_source: str
    source_used: str
    fallback_occurred: bool
    load_duration_ms: float
    analysis_id: str
    candidate_id: str
    candidate_name: str
    resume_version_id: str
    job_id: str
    job_title: str
    score: float | None
    recommendation: str
    reason_codes: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    aliases_used: list[dict[str, Any]]
    relations_used: list[dict[str, Any]]
    partial_matches: list[dict[str, Any]]
    skill_evidence_details: list[dict[str, Any]]
    ranking_refresh_status: str | None
    ranking_warning: str | None


@dataclass(frozen=True, slots=True)
class MatchingSourcesComparison:
    job_id: str
    job_title: str
    analysis_id: str
    candidate_id: str
    candidate_name: str
    resume_version_id: str
    score_json: float | None
    score_database: float | None
    delta_score: float | None
    delta_status: str
    recommendation_json: str
    recommendation_database: str
    reason_codes_json: list[str]
    reason_codes_database: list[str]
    reason_codes_diff: dict[str, list[str]]
    skills_matched_json: list[str]
    skills_matched_database: list[str]
    skills_only_json: list[str]
    skills_only_database: list[str]
    required_skills_missing_json: list[str]
    required_skills_missing_database: list[str]
    required_skills_missing_only_json: list[str]
    required_skills_missing_only_database: list[str]
    aliases_used_json: list[dict[str, Any]]
    aliases_used_database: list[dict[str, Any]]
    relations_used_json: list[dict[str, Any]]
    relations_used_database: list[dict[str, Any]]
    partial_matches_json: list[dict[str, Any]]
    partial_matches_database: list[dict[str, Any]]
    source_used_json: str
    source_used_database: str
    fallback_occurred: bool
    classification: str
    notes: list[str]
    ranking_refresh_status_json: str | None
    ranking_refresh_status_database: str | None
    ranking_warning_json: str | None
    ranking_warning_database: str | None


@dataclass(frozen=True, slots=True)
class MatchingSourcesComparisonResult:
    comparison: MatchingSourcesComparison
    json_run: MatchingSourceRunResult
    database_run: MatchingSourceRunResult


@dataclass(frozen=True, slots=True)
class MatchingBatchSummary:
    total_cases: int
    acceptable_cases: int
    review_cases: int
    blocked_cases: int
    max_delta: float | None
    avg_delta: float | None
    changed_recommendations_count: int
    fallback_count: int
    missing_required_skill_cases: int


@dataclass(frozen=True, slots=True)
class MatchingBatchReport:
    summary: MatchingBatchSummary
    cases: list[MatchingSourcesComparison]


class MatchingSourceComparisonService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def resolve_context(
        self,
        *,
        job_id: UUID,
        analysis_id: UUID | None = None,
        candidate_id: UUID | None = None,
        resume_version_id: UUID | None = None,
    ) -> MatchingComparisonContext:
        async with self._session_factory() as session:
            if analysis_id is not None:
                context = await self._resolve_by_analysis_id(
                    session=session,
                    analysis_id=analysis_id,
                    job_id=job_id,
                )
            elif candidate_id is not None:
                context = await self._resolve_by_candidate_id(
                    session=session,
                    candidate_id=candidate_id,
                    job_id=job_id,
                )
            elif resume_version_id is not None:
                context = await self._resolve_by_resume_version_id(
                    session=session,
                    resume_version_id=resume_version_id,
                    job_id=job_id,
                )
            else:
                raise ValueError("Provide analysis_id, candidate_id, or resume_version_id.")

            if context is None:
                raise ValueError("No completed analysis found for the provided identifiers.")
            return context

    async def compare_context(
        self,
        context: MatchingComparisonContext,
    ) -> MatchingSourcesComparison:
        return (await self.compare_context_detailed(context)).comparison

    async def compare_context_detailed(
        self,
        context: MatchingComparisonContext,
    ) -> MatchingSourcesComparisonResult:
        json_result = await self._run_for_source(context, "json")
        database_result = await self._run_for_source(context, "database")
        return MatchingSourcesComparisonResult(
            comparison=self._build_comparison(json_result, database_result),
            json_run=json_result,
            database_run=database_result,
        )

    async def compare_batch(
        self,
        contexts: list[MatchingComparisonContext],
    ) -> MatchingBatchReport:
        results: list[MatchingSourcesComparison] = []
        for context in contexts:
            detailed = await self.compare_context_detailed(context)
            results.append(detailed.comparison)
        return build_batch_report(results)

    async def discover_contexts(
        self,
        *,
        limit: int = 15,
        candidate_limit: int = 120,
    ) -> list[MatchingComparisonContext]:
        async with self._session_factory() as session:
            stmt = (
                sa.select(
                    AnalysisModel.id.label("analysis_id"),
                    AnalysisModel.created_at.label("analysis_created_at"),
                    AnalysisModel.resume_version_id.label("resume_version_id"),
                    ResumeModel.candidate_id.label("candidate_id"),
                    CandidateModel.full_name.label("candidate_name"),
                    JobModel.id.label("job_id"),
                    JobModel.title.label("job_title"),
                    CandidateJobScoreModel.final_score.label("final_score"),
                )
                .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
                .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
                .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
                .join(JobModel, JobModel.id == AnalysisModel.job_id)
                .outerjoin(
                    CandidateJobScoreModel,
                    sa.and_(
                        CandidateJobScoreModel.candidate_id == ResumeModel.candidate_id,
                        CandidateJobScoreModel.job_id == JobModel.id,
                        CandidateJobScoreModel.freshness_status == "fresh",
                    ),
                )
                .where(
                    AnalysisModel.status == "completed",
                    AnalysisModel.job_id.is_not(None),
                    ResumeModel.deleted_at.is_(None),
                    CandidateModel.deleted_at.is_(None),
                    JobModel.deleted_at.is_(None),
                )
                .order_by(
                    JobModel.title.asc(),
                    CandidateJobScoreModel.final_score.desc().nullslast(),
                    AnalysisModel.created_at.desc(),
                )
                .limit(candidate_limit)
            )
            rows = (await session.execute(stmt)).mappings().all()

        bucketed: dict[str, list[MatchingComparisonContext]] = {}
        for row in rows:
            context = _row_to_context(row)
            if context is None:
                continue
            bucketed.setdefault(str(context.job_id), []).append(context)

        selected: list[MatchingComparisonContext] = []
        seen_pairs: set[tuple[str, str]] = set()
        while len(selected) < limit:
            progressed = False
            for job_id in sorted(bucketed):
                if not bucketed[job_id]:
                    continue
                context = bucketed[job_id].pop(0)
                marker = (str(context.job_id), str(context.candidate_id))
                if marker in seen_pairs:
                    continue
                selected.append(context)
                seen_pairs.add(marker)
                progressed = True
                if len(selected) >= limit:
                    break
            if not progressed:
                break

        return selected

    async def _run_for_source(
        self,
        context: MatchingComparisonContext,
        requested_source: str,
    ) -> MatchingSourceRunResult:
        started_at = perf_counter()
        async with self._with_catalog_source(requested_source):
            async with self._session_factory() as session:
                repository = SQLAlchemyAnalysisRepository(session)
                service = AnalysisService(repository)
                source_service = SkillEquivalenceService.for_matching()

                response = await service.match_completed_analysis_to_job(
                    context.analysis_id,
                    context.job_id,
                    force_recompute=False,
                )
                persisted_match = await repository.find_candidate_job_match_for_analysis(
                    context.analysis_id,
                    context.job_id,
                )
                if persisted_match is None:
                    raise RuntimeError("Persisted candidate_job_match not found during comparison.")

                score_row = await self._load_latest_score_row(
                    session=session,
                    candidate_id=context.candidate_id,
                    job_id=context.job_id,
                )
                breakdown = dict(persisted_match.skill_evidence_breakdown or {})
                matched_skills = [str(skill) for skill in (persisted_match.matched_skills_json or [])]
                missing_skills = [str(skill) for skill in (persisted_match.missing_skills_json or [])]
                reason_codes = [str(code) for code in (score_row.reason_codes if score_row else [])]
                await session.rollback()

        fallback_occurred = source_service._source == "database_failed_fallback_json"
        aliases_used, relations_used = _extract_equivalence_usage(breakdown)
        return MatchingSourceRunResult(
            requested_source=requested_source,
            source_used=source_service._source,
            fallback_occurred=fallback_occurred,
            load_duration_ms=round((perf_counter() - started_at) * 1000, 2),
            analysis_id=str(context.analysis_id),
            candidate_id=str(context.candidate_id),
            candidate_name=context.candidate_name,
            resume_version_id=str(context.resume_version_id),
            job_id=str(context.job_id),
            job_title=context.job_title,
            score=float(response.job_fit_score) if response.job_fit_score is not None else None,
            recommendation=response.recommendation,
            reason_codes=reason_codes,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            aliases_used=aliases_used,
            relations_used=relations_used,
            partial_matches=_dedupe_mapping_list(breakdown.get("partial_matches")),
            skill_evidence_details=_dedupe_mapping_list(breakdown.get("skill_evidence_details")),
            ranking_refresh_status=response.ranking_refresh_status,
            ranking_warning=response.ranking_warning,
        )

    async def _load_latest_score_row(
        self,
        *,
        session: AsyncSession,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobScoreModel | None:
        return await session.scalar(
            sa.select(CandidateJobScoreModel)
            .where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.freshness_status == "fresh",
            )
            .order_by(
                CandidateJobScoreModel.updated_at.desc(),
                CandidateJobScoreModel.computed_at.desc(),
                CandidateJobScoreModel.id.desc(),
            )
            .limit(1)
        )

    async def _resolve_by_analysis_id(
        self,
        *,
        session: AsyncSession,
        analysis_id: UUID,
        job_id: UUID,
    ) -> MatchingComparisonContext | None:
        stmt = (
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                AnalysisModel.created_at.label("analysis_created_at"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
                ResumeModel.candidate_id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                JobModel.id.label("job_id"),
                JobModel.title.label("job_title"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .join(JobModel, JobModel.id == AnalysisModel.job_id)
            .where(
                AnalysisModel.id == analysis_id,
                AnalysisModel.job_id == job_id,
                AnalysisModel.status == "completed",
                ResumeModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .limit(1)
        )
        row = (await session.execute(stmt)).mappings().first()
        return _row_to_context(row)

    async def _resolve_by_candidate_id(
        self,
        *,
        session: AsyncSession,
        candidate_id: UUID,
        job_id: UUID,
    ) -> MatchingComparisonContext | None:
        stmt = (
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                AnalysisModel.created_at.label("analysis_created_at"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
                ResumeModel.candidate_id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                JobModel.id.label("job_id"),
                JobModel.title.label("job_title"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .join(JobModel, JobModel.id == AnalysisModel.job_id)
            .where(
                ResumeModel.candidate_id == candidate_id,
                AnalysisModel.job_id == job_id,
                AnalysisModel.status == "completed",
                ResumeModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .order_by(AnalysisModel.created_at.desc(), AnalysisModel.id.desc())
            .limit(1)
        )
        row = (await session.execute(stmt)).mappings().first()
        return _row_to_context(row)

    async def _resolve_by_resume_version_id(
        self,
        *,
        session: AsyncSession,
        resume_version_id: UUID,
        job_id: UUID,
    ) -> MatchingComparisonContext | None:
        stmt = (
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                AnalysisModel.created_at.label("analysis_created_at"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
                ResumeModel.candidate_id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                JobModel.id.label("job_id"),
                JobModel.title.label("job_title"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .join(JobModel, JobModel.id == AnalysisModel.job_id)
            .where(
                AnalysisModel.resume_version_id == resume_version_id,
                AnalysisModel.job_id == job_id,
                AnalysisModel.status == "completed",
                ResumeModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .order_by(AnalysisModel.created_at.desc(), AnalysisModel.id.desc())
            .limit(1)
        )
        row = (await session.execute(stmt)).mappings().first()
        return _row_to_context(row)

    @asynccontextmanager
    async def _with_catalog_source(self, requested_source: str):
        previous_source = settings.SKILL_CATALOG_SOURCE
        previous_compare_flag = settings.SKILL_CATALOG_COMPARE_ON_MATCH
        settings.SKILL_CATALOG_SOURCE = requested_source
        settings.SKILL_CATALOG_COMPARE_ON_MATCH = False
        SkillEquivalenceService.clear_catalog_cache()
        try:
            yield
        finally:
            SkillEquivalenceService.clear_catalog_cache()
            settings.SKILL_CATALOG_SOURCE = previous_source
            settings.SKILL_CATALOG_COMPARE_ON_MATCH = previous_compare_flag

    def _build_comparison(
        self,
        json_result: MatchingSourceRunResult,
        database_result: MatchingSourceRunResult,
    ) -> MatchingSourcesComparison:
        delta_score = _delta_score(json_result.score, database_result.score)
        required_only_json = sorted(
            set(json_result.missing_skills) - set(database_result.missing_skills)
        )
        required_only_database = sorted(
            set(database_result.missing_skills) - set(json_result.missing_skills)
        )
        notes = build_case_notes(
            delta_score=delta_score,
            score_json=json_result.score,
            score_database=database_result.score,
            recommendation_json=json_result.recommendation,
            recommendation_database=database_result.recommendation,
            skills_only_json=sorted(
                set(json_result.matched_skills) - set(database_result.matched_skills)
            ),
            skills_only_database=sorted(
                set(database_result.matched_skills) - set(json_result.matched_skills)
            ),
            required_skills_missing_only_json=required_only_json,
            required_skills_missing_only_database=required_only_database,
            fallback_occurred=json_result.fallback_occurred or database_result.fallback_occurred,
        )
        classification = classify_comparison_case(
            delta_score=delta_score,
            score_json=json_result.score,
            score_database=database_result.score,
            recommendation_json=json_result.recommendation,
            recommendation_database=database_result.recommendation,
            required_skills_missing_only_json=required_only_json,
            required_skills_missing_only_database=required_only_database,
            fallback_occurred=json_result.fallback_occurred or database_result.fallback_occurred,
        )
        skills_only_json = sorted(
            set(json_result.matched_skills) - set(database_result.matched_skills)
        )
        skills_only_database = sorted(
            set(database_result.matched_skills) - set(json_result.matched_skills)
        )
        return MatchingSourcesComparison(
            job_id=json_result.job_id,
            job_title=json_result.job_title,
            analysis_id=json_result.analysis_id,
            candidate_id=json_result.candidate_id,
            candidate_name=json_result.candidate_name,
            resume_version_id=json_result.resume_version_id,
            score_json=json_result.score,
            score_database=database_result.score,
            delta_score=delta_score,
            delta_status=classify_score_delta(delta_score),
            recommendation_json=json_result.recommendation,
            recommendation_database=database_result.recommendation,
            reason_codes_json=json_result.reason_codes,
            reason_codes_database=database_result.reason_codes,
            reason_codes_diff={
                "only_json": sorted(set(json_result.reason_codes) - set(database_result.reason_codes)),
                "only_database": sorted(set(database_result.reason_codes) - set(json_result.reason_codes)),
            },
            skills_matched_json=json_result.matched_skills,
            skills_matched_database=database_result.matched_skills,
            skills_only_json=skills_only_json,
            skills_only_database=skills_only_database,
            required_skills_missing_json=json_result.missing_skills,
            required_skills_missing_database=database_result.missing_skills,
            required_skills_missing_only_json=required_only_json,
            required_skills_missing_only_database=required_only_database,
            aliases_used_json=json_result.aliases_used,
            aliases_used_database=database_result.aliases_used,
            relations_used_json=json_result.relations_used,
            relations_used_database=database_result.relations_used,
            partial_matches_json=json_result.partial_matches,
            partial_matches_database=database_result.partial_matches,
            source_used_json=json_result.source_used,
            source_used_database=database_result.source_used,
            fallback_occurred=json_result.fallback_occurred or database_result.fallback_occurred,
            classification=classification,
            notes=notes,
            ranking_refresh_status_json=json_result.ranking_refresh_status,
            ranking_refresh_status_database=database_result.ranking_refresh_status,
            ranking_warning_json=json_result.ranking_warning,
            ranking_warning_database=database_result.ranking_warning,
        )


def classify_score_delta(delta_score: float | None) -> str:
    if delta_score is None:
        return "unavailable"
    absolute_delta = abs(delta_score)
    if absolute_delta <= 2:
        return "acceptable"
    if absolute_delta <= 5:
        return "review"
    return "block"


def classify_comparison_case(
    *,
    delta_score: float | None,
    score_json: float | None,
    score_database: float | None,
    recommendation_json: str,
    recommendation_database: str,
    required_skills_missing_only_json: list[str],
    required_skills_missing_only_database: list[str],
    fallback_occurred: bool,
) -> str:
    if fallback_occurred:
        return "blocked"
    if recommendation_json != recommendation_database:
        return "blocked"
    if score_json is None or score_database is None:
        return "review"
    if required_skills_missing_only_json or required_skills_missing_only_database:
        return "review"
    delta_status = classify_score_delta(delta_score)
    if delta_status == "block":
        return "blocked"
    if delta_status == "review":
        return "review"
    return "acceptable"


def build_case_notes(
    *,
    delta_score: float | None,
    score_json: float | None,
    score_database: float | None,
    recommendation_json: str,
    recommendation_database: str,
    skills_only_json: list[str],
    skills_only_database: list[str],
    required_skills_missing_only_json: list[str],
    required_skills_missing_only_database: list[str],
    fallback_occurred: bool,
) -> list[str]:
    notes: list[str] = []
    if fallback_occurred:
        notes.append("database source fell back to json")
    if recommendation_json != recommendation_database:
        notes.append("recommendation changed between sources")
    if score_json is None or score_database is None:
        notes.append("numeric score unavailable for at least one source")
    if required_skills_missing_only_json:
        notes.append(
            "required skills missing only in json: " + ", ".join(required_skills_missing_only_json)
        )
    if required_skills_missing_only_database:
        notes.append(
            "required skills missing only in database: "
            + ", ".join(required_skills_missing_only_database)
        )
    if skills_only_json:
        notes.append("matched skills only in json: " + ", ".join(skills_only_json))
    if skills_only_database:
        notes.append("matched skills only in database: " + ", ".join(skills_only_database))
    if delta_score is not None and abs(delta_score) > 2:
        notes.append(f"score delta above acceptable threshold: {delta_score}")
    return notes


def build_batch_report(cases: list[MatchingSourcesComparison]) -> MatchingBatchReport:
    acceptable_cases = [case for case in cases if case.classification == "acceptable"]
    review_cases = [case for case in cases if case.classification == "review"]
    blocked_cases = [case for case in cases if case.classification == "blocked"]
    deltas = [abs(case.delta_score) for case in cases if case.delta_score is not None]
    summary = MatchingBatchSummary(
        total_cases=len(cases),
        acceptable_cases=len(acceptable_cases),
        review_cases=len(review_cases),
        blocked_cases=len(blocked_cases),
        max_delta=round(max(deltas), 2) if deltas else None,
        avg_delta=round(sum(deltas) / len(deltas), 2) if deltas else None,
        changed_recommendations_count=sum(
            1 for case in cases if case.recommendation_json != case.recommendation_database
        ),
        fallback_count=sum(1 for case in cases if case.fallback_occurred),
        missing_required_skill_cases=sum(
            1
            for case in cases
            if case.required_skills_missing_only_json or case.required_skills_missing_only_database
        ),
    )
    return MatchingBatchReport(summary=summary, cases=cases)


def comparison_to_json_ready(
    comparison: MatchingSourcesComparison,
    *,
    json_run: MatchingSourceRunResult | None = None,
    database_run: MatchingSourceRunResult | None = None,
) -> dict[str, Any]:
    payload = asdict(comparison)
    if json_run is not None:
        payload["json_run"] = asdict(json_run)
    if database_run is not None:
        payload["database_run"] = asdict(database_run)
    return payload


def _row_to_context(row: sa.RowMapping | None) -> MatchingComparisonContext | None:
    if row is None:
        return None
    return MatchingComparisonContext(
        analysis_id=row["analysis_id"],
        candidate_id=row["candidate_id"],
        candidate_name=str(row["candidate_name"] or "Candidato sem nome"),
        resume_version_id=row["resume_version_id"],
        job_id=row["job_id"],
        job_title=str(row["job_title"] or "Vaga sem título"),
        analysis_created_at=row["analysis_created_at"],
    )


def _extract_equivalence_usage(
    breakdown: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    aliases_used: list[dict[str, Any]] = []
    relations_used: list[dict[str, Any]] = []

    for item in breakdown.get("skill_evidence_details", []) or []:
        if not isinstance(item, dict):
            continue
        match_type = str(item.get("match_type") or "").strip().lower()
        detail = {
            "required": str(item.get("required") or ""),
            "candidate": str(item.get("candidate") or ""),
            "priority_level": str(item.get("priority_level") or ""),
            "coverage": float(item.get("coverage") or 0.0),
            "raw_coverage": float(item.get("raw_coverage") or 0.0),
            "equivalence_strength": str(item.get("equivalence_strength") or ""),
            "reason": str(item.get("reason") or item.get("source") or ""),
        }
        if match_type == "relation":
            relations_used.append(detail)
        elif match_type == "group":
            aliases_used.append(detail)

    return _dedupe_mapping_list(aliases_used), _dedupe_mapping_list(relations_used)


def _dedupe_mapping_list(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    seen: set[tuple[tuple[str, str], ...]] = set()
    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        cleaned = {
            str(key): _json_ready(value)
            for key, value in item.items()
        }
        marker = tuple(sorted((key, str(value)) for key, value in cleaned.items()))
        if marker in seen:
            continue
        seen.add(marker)
        normalized.append(cleaned)
    return normalized


def _delta_score(score_json: float | None, score_database: float | None) -> float | None:
    if score_json is None or score_database is None:
        return None
    return round(score_database - score_json, 2)


def _json_ready(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        integral = value.to_integral_value()
        return int(value) if value == integral else float(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value
