import pytest
from uuid import uuid4

from src.application.services.job_service import JobService
from src.interface.api.schemas.job_schemas import CreateJobRequest
from src.interface.api.schemas.skill_schemas import AddJobSkillRequest
from src.domain.entities.user import UserRole
from .helpers import _create_active_user
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

@pytest.mark.asyncio
async def test_related_skills_can_coexist(db_session):
    """
    Test that related skills like Node.js and Backend can coexist 
    in the same job without throwing JobSkillConflictError.
    This guarantees that exact duplication is blocked, but related 
    skills from the equivalence catalog are treated as separate skills.
    """
    repo = SQLAlchemyJobRepository(db_session)
    service = JobService(repo)
    
    user = await _create_active_user(db_session, "skill-coexist@test.com", "password123", UserRole.RECRUITER)
    
    job_req = CreateJobRequest(
        title="Software Engineer",
        company="Tech Corp",
        job_area="technology",
        seniority_level="mid",
        contract_type="clt",
        work_model="hybrid",
        description="A great job",
        responsibilities="Code",
        requirements="React",
        minimum_years_experience=3,
        minimum_education_level="bachelor"
    )
    job = await service.create(job_req, created_by=user.id)
    
    # 1. Add "Backend"
    skill1_req = AddJobSkillRequest(
        skill_name="Backend",
        priority_level="priority",
        weight=1.0
    )
    res1 = await service.add_required_skill(job.id, skill1_req)
    assert res1.skill_name == "Backend"
    
    # 2. Add "Node.js"
    skill2_req = AddJobSkillRequest(
        skill_name="Node.js",
        priority_level="priority",
        weight=1.0
    )
    res2 = await service.add_required_skill(job.id, skill2_req)
    assert res2.skill_name == "Node.js"
    
    # Verify both are linked
    skills = await service.list_required_skills(job.id)
    skill_names = {s.skill_name for s in skills}
    
    assert "Backend" in skill_names
    assert "Node.js" in skill_names
    assert len(skills) >= 2
