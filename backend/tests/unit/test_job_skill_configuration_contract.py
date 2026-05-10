from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.application.services.job_service import JobService
from src.interface.api.schemas.job_schemas import UpdateJobRequest


def _row(name: str, *, priority_level: str) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=name,
        JobRequiredSkillModel=SimpleNamespace(priority_level=priority_level),
    )


def test_skill_requirements_snapshot_preserves_priority_levels() -> None:
    snapshot = JobService._skill_requirements_from_required_skill_rows(
        [
            _row("Node.js", priority_level="priority"),
            _row("TypeScript", priority_level="priority"),
            _row("Docker", priority_level="complementary"),
            _row("Inglês fluente", priority_level="eliminatory"),
        ]
    )

    assert snapshot == {
        "priority": ["Node.js", "TypeScript"],
        "complementary": ["Docker"],
        "eliminatory": ["Inglês fluente"],
    }


@pytest.mark.asyncio
async def test_job_update_preserves_canonical_skill_requirements_without_flattening() -> None:
    repo = AsyncMock()
    job = SimpleNamespace(
        id=uuid4(),
        title="Full Stack",
        description="Backend + frontend",
        requirements=None,
        status="draft",
        seniority_level="mid",
        minimum_education_level="bachelor",
        minimum_years_experience=3,
        deal_breakers=[],
        work_model="remote",
        location=None,
        salary_min=None,
        salary_max=None,
        salary_currency="BRL",
        job_area="technology",
        responsibilities="Build systems",
        experience_context="Production apps",
        behavioral_requirements=[],
        priority="normal",
        skill_requirements=None,
        updated_at=None,
    )
    repo.find_active_by_id = AsyncMock(return_value=job)
    repo.save = AsyncMock(side_effect=lambda current_job: current_job)

    service = JobService(repo)
    service._invalidate_job_scores_and_matches = AsyncMock()
    service._maybe_generate_job_profile = AsyncMock()
    service._maybe_refresh_quality = AsyncMock()
    service._recompute_active_pipeline_matches = AsyncMock()

    payload = {
        "priority": ["Node.js", "TypeScript", "Backend"],
        "complementary": ["React", "SQL"],
        "eliminatory": ["Inglês fluente"],
    }
    body = UpdateJobRequest(skill_requirements=payload)

    saved = await service.update(job.id, body)

    assert saved.skill_requirements == payload
    assert "critical_required" not in saved.skill_requirements
    assert "important" not in saved.skill_requirements
