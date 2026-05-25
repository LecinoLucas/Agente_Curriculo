from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel


@dataclass(slots=True)
class BIOverviewQuery:
    date_from: date | None = None
    date_to: date | None = None
    job_id: UUID | None = None
    job_area: str | None = None
    provider: str | None = None


def _date_floor(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=UTC)


def _date_ceil(value: date) -> datetime:
    return datetime.combine(value + timedelta(days=1), time.min, tzinfo=UTC)


def _to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


class AdminBIService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._ai_usage_logs_available: bool | None = None

    async def get_overview(self, query: BIOverviewQuery) -> dict[str, Any]:
        has_ai_usage_logs = await self._has_ai_usage_logs_table()
        jobs_by_status = await self._get_jobs_by_status(query)
        candidates_by_status = await self._get_candidates_by_status(query)
        analyses_by_status = await self._get_analyses_by_status(query)
        pipeline_by_stage = await self._get_pipeline_by_stage(query)
        analyses_daily = await self._get_analyses_daily(query)
        ai_usage_daily = await self._get_ai_usage_daily(query, has_ai_usage_logs=has_ai_usage_logs)
        top_jobs_by_candidates = await self._get_top_jobs_by_candidates(query)
        top_expensive_analyses = await self._get_top_expensive_analyses(query, has_ai_usage_logs=has_ai_usage_logs)
        latest_analysis_failures = await self._get_latest_analysis_failures(query)

        total_jobs = sum(item["total"] for item in jobs_by_status)
        total_candidates = sum(item["total"] for item in candidates_by_status)
        total_analyses = sum(item["total"] for item in analyses_by_status)
        published_jobs = next((item["total"] for item in jobs_by_status if item["status"] == "published"), 0)
        archived_jobs = next((item["total"] for item in jobs_by_status if item["status"] == "archived"), 0)
        active_candidates = next((item["total"] for item in candidates_by_status if item["status"] == "active"), 0)
        archived_candidates = next((item["total"] for item in candidates_by_status if item["status"] == "archived"), 0)
        completed_analyses = next((item["total"] for item in analyses_by_status if item["status"] == "completed"), 0)
        failed_analyses = next((item["total"] for item in analyses_by_status if item["status"] == "failed"), 0)
        average_score = await self._get_average_score(query)
        hired_candidates = await self._get_hired_candidates(query)
        ai_summary = await self._get_ai_summary(query, has_ai_usage_logs=has_ai_usage_logs)

        return {
            "summary": {
                "total_candidates": total_candidates,
                "active_candidates": active_candidates,
                "archived_candidates": archived_candidates,
                "total_jobs": total_jobs,
                "published_jobs": published_jobs,
                "archived_jobs": archived_jobs,
                "completed_analyses": completed_analyses,
                "failed_analyses": failed_analyses,
                "average_score": average_score,
                "hired_candidates": hired_candidates,
                "ai_total_tokens": ai_summary["total_tokens"],
                "ai_total_calls": ai_summary["total_calls"],
                "ai_estimated_cost_usd": ai_summary["estimated_cost_usd"],
            },
            "jobs_by_status": jobs_by_status,
            "candidates_by_status": candidates_by_status,
            "analyses_by_status": analyses_by_status,
            "pipeline_by_stage": pipeline_by_stage,
            "analyses_daily": analyses_daily,
            "ai_usage_daily": ai_usage_daily,
            "top_jobs_by_candidates": top_jobs_by_candidates,
            "top_expensive_analyses": top_expensive_analyses,
            "latest_analysis_failures": latest_analysis_failures,
            "ai_usage": ai_summary,
            "total_analyses": total_analyses,
        }

    async def _has_ai_usage_logs_table(self) -> bool:
        if self._ai_usage_logs_available is not None:
            return self._ai_usage_logs_available

        def _check(sync_session: sa.orm.Session) -> bool:
            return inspect(sync_session.connection()).has_table("ai_usage_logs")

        self._ai_usage_logs_available = await self._session.run_sync(_check)
        return self._ai_usage_logs_available

    def _apply_date_filter(
        self,
        stmt: sa.Select[Any],
        column: Any,
        query: BIOverviewQuery,
    ) -> sa.Select[Any]:
        if query.date_from is not None:
            stmt = stmt.where(column >= _date_floor(query.date_from))
        if query.date_to is not None:
            stmt = stmt.where(column < _date_ceil(query.date_to))
        return stmt

    def _apply_job_filter(
        self,
        stmt: sa.Select[Any],
        job_id_column: Any,
        join_job: bool,
        query: BIOverviewQuery,
    ) -> sa.Select[Any]:
        if join_job:
            stmt = stmt.join(JobModel, JobModel.id == job_id_column)
        stmt = stmt.where(JobModel.deleted_at.is_(None) if join_job else sa.true())
        if query.job_id is not None:
            stmt = stmt.where(job_id_column == query.job_id)
        if query.job_area:
            if not join_job:
                stmt = stmt.where(JobModel.job_area == query.job_area)
            else:
                stmt = stmt.where(JobModel.job_area == query.job_area)
        return stmt

    async def _get_jobs_by_status(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        stmt = sa.select(JobModel.status, sa.func.count()).where(JobModel.deleted_at.is_(None))
        stmt = self._apply_date_filter(stmt, JobModel.created_at, query)
        if query.job_id is not None:
            stmt = stmt.where(JobModel.id == query.job_id)
        if query.job_area:
            stmt = stmt.where(JobModel.job_area == query.job_area)
        stmt = stmt.group_by(JobModel.status).order_by(JobModel.status.asc())
        rows = (await self._session.execute(stmt)).all()
        return [{"status": status, "total": total} for status, total in rows]

    async def _get_candidates_by_status(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        if query.job_id is None and not query.job_area:
            stmt = sa.select(
                sa.func.count(CandidateModel.id),
                sa.func.count(sa.case((CandidateModel.archived_at.is_(None), 1))),
                sa.func.count(sa.case((CandidateModel.archived_at.is_not(None), 1))),
            ).where(CandidateModel.deleted_at.is_(None))
            stmt = self._apply_date_filter(stmt, CandidateModel.created_at, query)
            total, active, archived = (await self._session.execute(stmt)).one()
            return [
                {"status": "active", "total": int(active or 0)},
                {"status": "archived", "total": int(archived or 0)},
            ] if (total or 0) > 0 else []

        time_column = sa.func.coalesce(
            CandidateJobPipelineModel.entered_at,
            CandidateJobPipelineModel.created_at,
        )
        stmt = (
            sa.select(
                sa.func.count(sa.distinct(CandidateModel.id)),
                sa.func.count(
                    sa.distinct(sa.case((CandidateModel.archived_at.is_(None), CandidateModel.id)))
                ),
                sa.func.count(
                    sa.distinct(sa.case((CandidateModel.archived_at.is_not(None), CandidateModel.id)))
                ),
            )
            .select_from(CandidateJobPipelineModel)
            .join(CandidateModel, CandidateModel.id == CandidateJobPipelineModel.candidate_id)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(CandidateModel.deleted_at.is_(None), JobModel.deleted_at.is_(None))
        )
        stmt = self._apply_date_filter(stmt, time_column, query)
        if query.job_id is not None:
            stmt = stmt.where(CandidateJobPipelineModel.job_id == query.job_id)
        if query.job_area:
            stmt = stmt.where(JobModel.job_area == query.job_area)
        total, active, archived = (await self._session.execute(stmt)).one()
        return [
            {"status": "active", "total": int(active or 0)},
            {"status": "archived", "total": int(archived or 0)},
        ] if (total or 0) > 0 else []

    async def _get_analyses_by_status(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        stmt = sa.select(AnalysisModel.status, sa.func.count()).select_from(AnalysisModel)
        if query.job_area:
            stmt = stmt.join(JobModel, JobModel.id == AnalysisModel.job_id)
            stmt = stmt.where(JobModel.deleted_at.is_(None), JobModel.job_area == query.job_area)
        if query.job_id is not None:
            stmt = stmt.where(AnalysisModel.job_id == query.job_id)
        stmt = self._apply_date_filter(stmt, AnalysisModel.created_at, query)
        stmt = stmt.group_by(AnalysisModel.status).order_by(AnalysisModel.status.asc())
        rows = (await self._session.execute(stmt)).all()
        return [{"status": status, "total": total} for status, total in rows]

    async def _get_pipeline_by_stage(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        time_column = sa.func.coalesce(CandidateJobPipelineModel.entered_at, CandidateJobPipelineModel.created_at)
        stmt = (
            sa.select(CandidateJobPipelineModel.pipeline_stage, sa.func.count())
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(JobModel.deleted_at.is_(None))
        )
        stmt = self._apply_date_filter(stmt, time_column, query)
        if query.job_id is not None:
            stmt = stmt.where(CandidateJobPipelineModel.job_id == query.job_id)
        if query.job_area:
            stmt = stmt.where(JobModel.job_area == query.job_area)
        stmt = stmt.group_by(CandidateJobPipelineModel.pipeline_stage).order_by(CandidateJobPipelineModel.pipeline_stage.asc())
        rows = (await self._session.execute(stmt)).all()
        return [{"stage": stage, "total": total} for stage, total in rows]

    async def _get_analyses_daily(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        day_column = sa.func.date(AnalysisModel.created_at)
        stmt = sa.select(day_column.label("day"), sa.func.count()).select_from(AnalysisModel)
        if query.job_area:
            stmt = stmt.join(JobModel, JobModel.id == AnalysisModel.job_id)
            stmt = stmt.where(JobModel.deleted_at.is_(None), JobModel.job_area == query.job_area)
        if query.job_id is not None:
            stmt = stmt.where(AnalysisModel.job_id == query.job_id)
        stmt = self._apply_date_filter(stmt, AnalysisModel.created_at, query)
        stmt = stmt.group_by(day_column).order_by(day_column.asc())
        rows = (await self._session.execute(stmt)).all()
        return [{"date": str(day), "total": total} for day, total in rows]

    async def _get_ai_usage_daily(
        self,
        query: BIOverviewQuery,
        *,
        has_ai_usage_logs: bool,
    ) -> list[dict[str, Any]]:
        if not has_ai_usage_logs:
            return []
        day_column = sa.func.date(AIUsageLogModel.created_at)
        stmt = sa.select(
            day_column.label("day"),
            sa.func.coalesce(sa.func.sum(AIUsageLogModel.total_tokens), 0),
            sa.func.count(AIUsageLogModel.id),
        ).select_from(AIUsageLogModel)
        if query.job_area:
            stmt = stmt.join(JobModel, JobModel.id == AIUsageLogModel.job_id)
            stmt = stmt.where(JobModel.deleted_at.is_(None), JobModel.job_area == query.job_area)
        if query.job_id is not None:
            stmt = stmt.where(AIUsageLogModel.job_id == query.job_id)
        if query.provider:
            stmt = stmt.where(AIUsageLogModel.provider == query.provider)
        stmt = self._apply_date_filter(stmt, AIUsageLogModel.created_at, query)
        stmt = stmt.group_by(day_column).order_by(day_column.asc())
        rows = (await self._session.execute(stmt)).all()
        return [{"date": str(day), "tokens": int(tokens or 0), "calls": calls} for day, tokens, calls in rows]

    async def _get_top_jobs_by_candidates(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        time_column = sa.func.coalesce(CandidateJobPipelineModel.entered_at, CandidateJobPipelineModel.created_at)
        stmt = (
            sa.select(
                JobModel.id,
                JobModel.title,
                JobModel.status,
                sa.func.count(sa.distinct(CandidateJobPipelineModel.candidate_id)).label("total_candidates"),
            )
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(JobModel.deleted_at.is_(None))
        )
        stmt = self._apply_date_filter(stmt, time_column, query)
        if query.job_id is not None:
            stmt = stmt.where(CandidateJobPipelineModel.job_id == query.job_id)
        if query.job_area:
            stmt = stmt.where(JobModel.job_area == query.job_area)
        stmt = stmt.group_by(JobModel.id, JobModel.title, JobModel.status).order_by(sa.text("total_candidates DESC"), JobModel.title.asc()).limit(5)
        rows = (await self._session.execute(stmt)).all()
        return [
            {"job_id": str(job_id), "title": title, "status": status, "total_candidates": total_candidates}
            for job_id, title, status, total_candidates in rows
        ]

    async def _get_top_expensive_analyses(
        self,
        query: BIOverviewQuery,
        *,
        has_ai_usage_logs: bool,
    ) -> list[dict[str, Any]]:
        if not has_ai_usage_logs:
            return []
        stmt = (
            sa.select(
                AIUsageLogModel.analysis_id,
                CandidateModel.full_name,
                sa.func.coalesce(sa.func.sum(AIUsageLogModel.total_tokens), 0).label("tokens"),
                sa.func.sum(AIUsageLogModel.estimated_cost_usd).label("estimated_cost_usd"),
            )
            .select_from(AIUsageLogModel)
            .join(CandidateModel, CandidateModel.id == AIUsageLogModel.candidate_id, isouter=True)
            .where(AIUsageLogModel.analysis_id.is_not(None))
        )
        if query.job_area:
            stmt = stmt.join(JobModel, JobModel.id == AIUsageLogModel.job_id)
            stmt = stmt.where(JobModel.deleted_at.is_(None), JobModel.job_area == query.job_area)
        if query.job_id is not None:
            stmt = stmt.where(AIUsageLogModel.job_id == query.job_id)
        if query.provider:
            stmt = stmt.where(AIUsageLogModel.provider == query.provider)
        stmt = self._apply_date_filter(stmt, AIUsageLogModel.created_at, query)
        stmt = stmt.group_by(AIUsageLogModel.analysis_id, CandidateModel.full_name)
        stmt = stmt.order_by(sa.func.coalesce(sa.func.sum(AIUsageLogModel.estimated_cost_usd), 0).desc(), sa.text("tokens DESC")).limit(5)
        rows = (await self._session.execute(stmt)).all()
        return [
            {
                "analysis_id": str(analysis_id),
                "candidate_name": candidate_name or "Candidato sem nome",
                "tokens": int(tokens or 0),
                "estimated_cost_usd": _to_float(estimated_cost_usd),
            }
            for analysis_id, candidate_name, tokens, estimated_cost_usd in rows
        ]

    async def _get_latest_analysis_failures(self, query: BIOverviewQuery) -> list[dict[str, Any]]:
        stmt = (
            sa.select(
                AnalysisModel.id,
                CandidateModel.full_name,
                JobModel.title,
                AnalysisModel.status,
                AnalysisModel.failed_at,
                AnalysisModel.failure_reason,
            )
            .select_from(AnalysisModel)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .join(JobModel, JobModel.id == AnalysisModel.job_id, isouter=True)
            .where(AnalysisModel.status == "failed")
        )
        stmt = self._apply_date_filter(stmt, AnalysisModel.created_at, query)
        if query.job_id is not None:
            stmt = stmt.where(AnalysisModel.job_id == query.job_id)
        if query.job_area:
            stmt = stmt.where(JobModel.job_area == query.job_area)
        stmt = stmt.order_by(AnalysisModel.failed_at.desc().nullslast(), AnalysisModel.created_at.desc()).limit(5)
        rows = (await self._session.execute(stmt)).all()
        return [
            {
                "analysis_id": str(analysis_id),
                "candidate_name": candidate_name or "Candidato sem nome",
                "job_title": job_title or "Sem vaga",
                "status": status,
                "failed_at": failed_at.isoformat() if failed_at else None,
                "failure_reason": failure_reason,
            }
            for analysis_id, candidate_name, job_title, status, failed_at, failure_reason in rows
        ]

    async def _get_average_score(self, query: BIOverviewQuery) -> float | None:
        stmt = sa.select(sa.func.avg(CandidateJobScoreModel.final_score)).select_from(CandidateJobScoreModel)
        if query.job_area:
            stmt = stmt.join(JobModel, JobModel.id == CandidateJobScoreModel.job_id)
            stmt = stmt.where(JobModel.deleted_at.is_(None), JobModel.job_area == query.job_area)
        if query.job_id is not None:
            stmt = stmt.where(CandidateJobScoreModel.job_id == query.job_id)
        stmt = self._apply_date_filter(stmt, CandidateJobScoreModel.computed_at, query)
        return _to_float(await self._session.scalar(stmt))

    async def _get_hired_candidates(self, query: BIOverviewQuery) -> int:
        time_column = sa.func.coalesce(
            CandidateJobPipelineModel.terminated_at,
            CandidateJobPipelineModel.updated_at,
            CandidateJobPipelineModel.created_at,
        )
        stmt = (
            sa.select(sa.func.count(sa.distinct(CandidateJobPipelineModel.candidate_id)))
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.pipeline_stage.in_(("hired", "pre_admission", "protheus", "admitted")),
                JobModel.deleted_at.is_(None),
            )
        )
        stmt = self._apply_date_filter(stmt, time_column, query)
        if query.job_id is not None:
            stmt = stmt.where(CandidateJobPipelineModel.job_id == query.job_id)
        if query.job_area:
            stmt = stmt.where(JobModel.job_area == query.job_area)
        return int(await self._session.scalar(stmt) or 0)

    async def _get_ai_summary(
        self,
        query: BIOverviewQuery,
        *,
        has_ai_usage_logs: bool,
    ) -> dict[str, Any]:
        if not has_ai_usage_logs:
            return {
                "total_calls": 0,
                "successful_calls": 0,
                "failed_calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "estimated_cost_usd": None,
                "avg_latency_ms": None,
            }
        stmt = sa.select(
            sa.func.count(AIUsageLogModel.id),
            sa.func.count(sa.case((AIUsageLogModel.status == "success", 1))),
            sa.func.count(sa.case((AIUsageLogModel.status != "success", 1))),
            sa.func.coalesce(sa.func.sum(AIUsageLogModel.input_tokens), 0),
            sa.func.coalesce(sa.func.sum(AIUsageLogModel.output_tokens), 0),
            sa.func.coalesce(sa.func.sum(AIUsageLogModel.total_tokens), 0),
            sa.func.sum(AIUsageLogModel.estimated_cost_usd),
            sa.func.avg(AIUsageLogModel.latency_ms),
        ).select_from(AIUsageLogModel)
        if query.job_area:
            stmt = stmt.join(JobModel, JobModel.id == AIUsageLogModel.job_id)
            stmt = stmt.where(JobModel.deleted_at.is_(None), JobModel.job_area == query.job_area)
        if query.job_id is not None:
            stmt = stmt.where(AIUsageLogModel.job_id == query.job_id)
        if query.provider:
            stmt = stmt.where(AIUsageLogModel.provider == query.provider)
        stmt = self._apply_date_filter(stmt, AIUsageLogModel.created_at, query)
        (
            total_calls,
            successful_calls,
            failed_calls,
            input_tokens,
            output_tokens,
            total_tokens,
            estimated_cost_usd,
            avg_latency_ms,
        ) = (await self._session.execute(stmt)).one()
        return {
            "total_calls": int(total_calls or 0),
            "successful_calls": int(successful_calls or 0),
            "failed_calls": int(failed_calls or 0),
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "total_tokens": int(total_tokens or 0),
            "estimated_cost_usd": _to_float(estimated_cost_usd),
            "avg_latency_ms": round(float(avg_latency_ms), 2) if avg_latency_ms is not None else None,
        }
