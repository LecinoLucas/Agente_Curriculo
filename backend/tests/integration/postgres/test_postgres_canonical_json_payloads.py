from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_ranking_service import CandidateRankingService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from tests.integration.helpers import _create_active_user, _seed_scoring_case


pytestmark = [pytest.mark.asyncio, pytest.mark.postgres]


@pytest.mark.postgres
async def test_postgres_job_skill_requirements_payload_is_canonical(
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"postgres-job-json-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    job = JobModel(
        title="Canonical JSON Job",
        description="Canonical job skill requirements payload.",
        status="published",
        created_by=recruiter.id,
        skill_requirements={
            "priority": ["Python", "FastAPI"],
            "complementary": ["Docker"],
            "eliminatory": ["Inglês fluente"],
        },
    )
    db_session.add(job)
    await db_session.commit()

    legacy_count = await db_session.scalar(
        sa.text(
            """
            SELECT COUNT(*)
            FROM jobs
            WHERE skill_requirements IS NOT NULL
              AND (
                skill_requirements ? 'critical_required'
                OR skill_requirements ? 'core_required'
                OR skill_requirements ? 'nice_to_have'
                OR skill_requirements ? 'important'
              )
            """
        )
    )
    assert legacy_count == 0

    payload = await db_session.scalar(
        sa.select(JobModel.skill_requirements).where(JobModel.id == job.id)
    )
    assert payload == {
        "priority": ["Python", "FastAPI"],
        "complementary": ["Docker"],
        "eliminatory": ["Inglês fluente"],
    }


@pytest.mark.postgres
async def test_postgres_scoring_uses_canonical_json_and_real_upsert(
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"postgres-scoring-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    job_id, candidate_id, match_id = await _seed_scoring_case(
        db_session,
        recruiter.id,
        job_title="Canonical Scoring Job",
        include_ranking_row=False,
    )

    docker_skill = SkillModel(name="Docker", normalized_name="docker")
    db_session.add(docker_skill)
    await db_session.flush()
    db_session.add(
        JobRequiredSkillModel(
            job_id=job_id,
            skill_id=docker_skill.id,
            priority_level="complementary",
            minimum_level="mid",
            weight=Decimal("0.50"),
        )
    )
    await db_session.flush()

    await db_session.execute(
        sa.update(CandidateJobMatchModel)
        .where(CandidateJobMatchModel.id == match_id)
        .values(
            skill_evidence_breakdown={
                "priority_score_weighted": 72.5,
                "priority_skills_matched": 2,
                "priority_skills_total": 2,
                "priority_component_impact": 72.5,
                "priority_strong_coverage": 100.0,
                "complementary_score_weighted": 6.5,
                "complementary_score_raw_weighted": 6.5,
                "complementary_skills_matched": 1,
                "complementary_skills_total": 1,
                "complementary_component_impact": 6.5,
                "complementary_bonus_cap_slots": 1,
                "validation_reasons": [],
                "matched_required_skills": ["Python", "FastAPI"],
                "missing_required_skills": [],
            }
        )
    )
    await db_session.commit()

    ranking = CandidateRankingService(db_session)
    first = await ranking.compute_single_candidate(job_id, candidate_id)
    await db_session.commit()
    second = await ranking.compute_single_candidate(job_id, candidate_id)
    await db_session.commit()

    assert first["candidate_id"] == candidate_id
    assert second["candidate_id"] == candidate_id

    active_version = await db_session.scalar(
        sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
    )
    assert active_version is not None

    persisted_scores = (
        await db_session.execute(
            sa.select(CandidateJobScoreModel).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == active_version.id,
            )
        )
    ).scalars().all()
    assert len(persisted_scores) == 1

    persisted_breakdown = dict(persisted_scores[0].breakdown or {})
    assert all(not key.startswith("mandatory_") for key in persisted_breakdown)
    assert all(not key.startswith("optional_") for key in persisted_breakdown)
    assert "priority_score_weighted" in persisted_breakdown
    assert "complementary_score_weighted" in persisted_breakdown

    match_breakdown = await db_session.scalar(
        sa.select(CandidateJobMatchModel.skill_evidence_breakdown).where(
            CandidateJobMatchModel.id == match_id
        )
    )
    assert isinstance(match_breakdown, dict)
    assert all(not key.startswith("mandatory_") for key in match_breakdown)
    assert all(not key.startswith("optional_") for key in match_breakdown)

    snapshot_count = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(CandidateJobScoreSnapshotModel)
        .where(
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
            CandidateJobScoreSnapshotModel.job_id == job_id,
        )
    )
    assert snapshot_count >= 2


@pytest.mark.postgres
async def test_postgres_factor_type_accepts_only_canonical_name(
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"postgres-factors-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate = CandidateModel(
        email=f"factor-candidate-{uuid4().hex[:6]}@test.local",
        full_name="Factor Candidate",
        created_by=recruiter.id,
    )
    job = JobModel(
        title="Factor Job",
        description="Factor constraint job",
        status="published",
        created_by=recruiter.id,
    )
    version = ScoreModelVersionModel(
        version=f"pgfac-{uuid4().hex[:6]}",
        is_active=True,
        weights={"skill_match": 0.4},
        thresholds={"high": 70, "low": 45},
    )
    db_session.add_all([candidate, job, version])
    await db_session.flush()

    snapshot = CandidateJobScoreSnapshotModel(
        candidate_id=candidate.id,
        job_id=job.id,
        version_id=version.id,
        ranking_version=version.version,
        source_analysis_id=None,
        source_analysis_created_at=None,
        job_signature_hash=f"hash-{uuid4().hex}",
        score_model_version=version.version,
        explainability_version="v1",
        input_hash=f"input-{uuid4().hex}",
        final_score=Decimal("50.00"),
        freshness_status="fresh",
        computed_at=datetime.now(UTC),
    )
    db_session.add(snapshot)
    await db_session.flush()

    db_session.add(
        CandidateJobScoreFactorModel(
            snapshot_id=snapshot.id,
            factor_type="complementary_skill_bonus",
            factor_key="desirable_skills",
            factor_label="Complementary bonus",
            impact_score=Decimal("6.50"),
            normalized_weight=Decimal("0.2500"),
            direction="positive",
            evidence_json={"matched": 1, "total": 1},
            display_order=1,
        )
    )
    await db_session.commit()

    db_session.add(
        CandidateJobScoreFactorModel(
            snapshot_id=snapshot.id,
            factor_type="optional_skill_bonus",
            factor_key="legacy_optional_bonus",
            factor_label="Legacy optional bonus",
            impact_score=Decimal("6.50"),
            normalized_weight=Decimal("0.2500"),
            direction="positive",
            evidence_json={"matched": 1, "total": 1},
            display_order=2,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
