from __future__ import annotations

import asyncio
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

import sqlalchemy as sa

from src.core.ai_pricing import estimate_ai_cost_usd
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel


@dataclass(slots=True)
class BackfillCounters:
    resume_analysis_inserted: int = 0
    candidate_profile_inserted: int = 0
    job_profile_inserted: int = 0


def _to_int(value: int | None) -> int:
    return int(value or 0)


def _estimated_cost(model: str, input_tokens: int, output_tokens: int) -> Decimal | None:
    return estimate_ai_cost_usd(model, input_tokens=input_tokens, output_tokens=output_tokens)


async def backfill_resume_analysis_logs() -> int:
    async with AsyncSessionFactory() as session:
        existing_analysis_ids = set(
            (
                await session.execute(
                    sa.select(AIUsageLogModel.analysis_id).where(
                        AIUsageLogModel.analysis_id.is_not(None),
                        AIUsageLogModel.operation == "resume_analysis",
                    )
                )
            )
            .scalars()
            .all()
        )

        rows = (
            await session.execute(
                sa.select(
                    AnalysisResultModel.analysis_id,
                    AnalysisResultModel.input_tokens,
                    AnalysisResultModel.output_tokens,
                    AnalysisResultModel.processing_time_ms,
                    AnalysisResultModel.created_at,
                    AnalysisModel.job_id,
                    AIModelModel.provider,
                    AIModelModel.model_id,
                    ResumeModel.candidate_id,
                )
                .join(AnalysisModel, AnalysisModel.id == AnalysisResultModel.analysis_id)
                .join(AIModelModel, AIModelModel.id == AnalysisModel.ai_model_id)
                .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
                .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
                .where(
                    sa.or_(
                        AnalysisResultModel.input_tokens.is_not(None),
                        AnalysisResultModel.output_tokens.is_not(None),
                    )
                )
            )
        ).all()

        inserted = 0
        for (
            analysis_id,
            input_tokens,
            output_tokens,
            processing_time_ms,
            created_at,
            job_id,
            provider,
            model_id,
            candidate_id,
        ) in rows:
            if analysis_id in existing_analysis_ids:
                continue
            normalized_input = _to_int(input_tokens)
            normalized_output = _to_int(output_tokens)
            session.add(
                AIUsageLogModel(
                    provider=provider,
                    model=model_id,
                    operation="resume_analysis",
                    analysis_id=analysis_id,
                    candidate_id=candidate_id,
                    job_id=job_id,
                    input_tokens=normalized_input,
                    output_tokens=normalized_output,
                    total_tokens=normalized_input + normalized_output,
                    estimated_cost_usd=_estimated_cost(model_id, normalized_input, normalized_output),
                    latency_ms=processing_time_ms,
                    status="success",
                    created_at=created_at,
                )
            )
            inserted += 1

        await session.commit()
        return inserted


async def backfill_candidate_profile_logs() -> int:
    async with AsyncSessionFactory() as session:
        existing_refs = set(
            (
                await session.execute(
                    sa.select(
                        AIUsageLogModel.candidate_id,
                        AIUsageLogModel.provider,
                        AIUsageLogModel.model,
                        AIUsageLogModel.created_at,
                    ).where(AIUsageLogModel.operation == "candidate_profile")
                )
            )
            .all()
        )

        rows = (
            await session.execute(
                sa.select(
                    CandidateProfileAnalysisModel.candidate_id,
                    CandidateProfileAnalysisModel.provider,
                    CandidateProfileAnalysisModel.model_id,
                    CandidateProfileAnalysisModel.input_tokens,
                    CandidateProfileAnalysisModel.output_tokens,
                    CandidateProfileAnalysisModel.created_at,
                ).where(
                    sa.or_(
                        CandidateProfileAnalysisModel.input_tokens.is_not(None),
                        CandidateProfileAnalysisModel.output_tokens.is_not(None),
                    )
                )
            )
        ).all()

        inserted = 0
        for candidate_id, provider, model_id, input_tokens, output_tokens, created_at in rows:
            reference = (candidate_id, provider, model_id, created_at)
            if reference in existing_refs:
                continue
            normalized_input = _to_int(input_tokens)
            normalized_output = _to_int(output_tokens)
            session.add(
                AIUsageLogModel(
                    provider=provider,
                    model=model_id,
                    operation="candidate_profile",
                    candidate_id=candidate_id,
                    input_tokens=normalized_input,
                    output_tokens=normalized_output,
                    total_tokens=normalized_input + normalized_output,
                    estimated_cost_usd=_estimated_cost(model_id, normalized_input, normalized_output),
                    status="success",
                    created_at=created_at,
                )
            )
            inserted += 1

        await session.commit()
        return inserted


async def backfill_job_profile_logs() -> int:
    async with AsyncSessionFactory() as session:
        existing_refs = set(
            (
                await session.execute(
                    sa.select(
                        AIUsageLogModel.job_id,
                        AIUsageLogModel.provider,
                        AIUsageLogModel.model,
                        AIUsageLogModel.created_at,
                    ).where(AIUsageLogModel.operation == "job_profile")
                )
            )
            .all()
        )

        rows = (
            await session.execute(
                sa.select(
                    JobProfileAnalysisModel.job_id,
                    JobProfileAnalysisModel.provider,
                    JobProfileAnalysisModel.model_id,
                    JobProfileAnalysisModel.input_tokens,
                    JobProfileAnalysisModel.output_tokens,
                    JobProfileAnalysisModel.created_at,
                ).where(
                    sa.or_(
                        JobProfileAnalysisModel.input_tokens.is_not(None),
                        JobProfileAnalysisModel.output_tokens.is_not(None),
                    )
                )
            )
        ).all()

        inserted = 0
        for job_id, provider, model_id, input_tokens, output_tokens, created_at in rows:
            reference = (job_id, provider, model_id, created_at)
            if reference in existing_refs:
                continue
            normalized_input = _to_int(input_tokens)
            normalized_output = _to_int(output_tokens)
            session.add(
                AIUsageLogModel(
                    provider=provider,
                    model=model_id,
                    operation="job_profile",
                    job_id=job_id,
                    input_tokens=normalized_input,
                    output_tokens=normalized_output,
                    total_tokens=normalized_input + normalized_output,
                    estimated_cost_usd=_estimated_cost(model_id, normalized_input, normalized_output),
                    status="success",
                    created_at=created_at,
                )
            )
            inserted += 1

        await session.commit()
        return inserted


async def main() -> None:
    counters = BackfillCounters(
        resume_analysis_inserted=await backfill_resume_analysis_logs(),
        candidate_profile_inserted=await backfill_candidate_profile_logs(),
        job_profile_inserted=await backfill_job_profile_logs(),
    )
    print(
        "Backfill concluido:",
        {
            "resume_analysis_inserted": counters.resume_analysis_inserted,
            "candidate_profile_inserted": counters.candidate_profile_inserted,
            "job_profile_inserted": counters.job_profile_inserted,
            "total_inserted": (
                counters.resume_analysis_inserted
                + counters.candidate_profile_inserted
                + counters.job_profile_inserted
            ),
        },
    )


if __name__ == "__main__":
    asyncio.run(main())
