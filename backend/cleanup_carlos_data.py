#!/usr/bin/env python3
"""
Cleanup script for Carlos's test data.
Properly handles schema relationships: analyses → resume_versions → resumes → candidates
"""

import asyncio
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel, PipelineStageTransitionModel
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel

# Carlos's candidate UUID
CANDIDATE_UUID = UUID("dc853da2-5799-40c1-8b35-968de1b1b8d0")

async def cleanup():
    # Create async engine
    engine = create_async_engine(
        "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai",
        echo=False,
    )

    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        try:
            # Step 1: Find all resume_versions for this candidate
            resume_version_ids = await session.scalars(
                sa.select(ResumeVersionModel.id)
                .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
                .where(ResumeModel.candidate_id == CANDIDATE_UUID)
            )
            resume_version_ids = list(resume_version_ids)
            print(f"Found {len(resume_version_ids)} resume versions for candidate")

            if resume_version_ids:
                # Step 2: Find all analyses for these resume versions
                analysis_ids = await session.scalars(
                    sa.select(AnalysisModel.id)
                    .where(AnalysisModel.resume_version_id.in_(resume_version_ids))
                )
                analysis_ids = list(analysis_ids)
                print(f"Found {len(analysis_ids)} analyses to delete")

                if analysis_ids:
                    # Step 3: Delete analysis dependencies (in reverse dependency order)

                    # Delete from matching_observations (if table exists)
                    try:
                        from src.infrastructure.database.models.analysis_model import MatchingObservationModel
                        count = await session.execute(
                            sa.delete(MatchingObservationModel)
                            .where(MatchingObservationModel.analysis_id.in_(analysis_ids))
                        )
                        print(f"Deleted {count.rowcount or 0} matching observations")
                    except (ImportError, AttributeError):
                        print("MatchingObservationModel not found, skipping")

                    # Delete resume_job_matches
                    count = await session.execute(
                        sa.delete(ResumeJobMatchModel)
                        .where(ResumeJobMatchModel.analysis_id.in_(analysis_ids))
                    )
                    print(f"Deleted {count.rowcount or 0} resume job matches")

                    # Delete analysis_results
                    count = await session.execute(
                        sa.delete(AnalysisResultModel)
                        .where(AnalysisResultModel.analysis_id.in_(analysis_ids))
                    )
                    print(f"Deleted {count.rowcount or 0} analysis results")

                    # Delete analyses
                    count = await session.execute(
                        sa.delete(AnalysisModel)
                        .where(AnalysisModel.id.in_(analysis_ids))
                    )
                    print(f"Deleted {count.rowcount or 0} analyses")

            # Step 4: Delete pipeline-related data

            # Delete pipeline_stage_transitions
            count = await session.execute(
                sa.delete(PipelineStageTransitionModel)
                .where(PipelineStageTransitionModel.candidate_id == CANDIDATE_UUID)
            )
            print(f"Deleted {count.rowcount or 0} pipeline stage transitions")

            # Delete candidate_pipeline
            count = await session.execute(
                sa.delete(CandidatePipelineModel)
                .where(CandidatePipelineModel.candidate_id == CANDIDATE_UUID)
            )
            print(f"Deleted {count.rowcount or 0} candidate pipeline records")

            # Delete candidate_job_links
            count = await session.execute(
                sa.delete(CandidateJobLinkModel)
                .where(CandidateJobLinkModel.candidate_id == CANDIDATE_UUID)
            )
            print(f"Deleted {count.rowcount or 0} candidate job links")

            # Commit
            await session.commit()
            print("\n✓ Cleanup completed successfully")

        except Exception as e:
            await session.rollback()
            print(f"\n✗ Cleanup failed: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(cleanup())
