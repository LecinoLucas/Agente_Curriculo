import asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from src.infrastructure.database.models import JobModel, JobRequiredSkillModel, SkillModel
from src.application.services.job_service import JobService
from src.interface.api.schemas.skill_schemas import AddJobSkillRequest

async def test():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(JobModel.metadata.create_all)
    
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        job = JobModel(title="Test Job", status="draft")
        session.add(job)
        await session.commit()
        
        service = JobService(session)
        req1 = AddJobSkillRequest(skill_name="Node.js", is_mandatory=True, weight=1)
        req2 = AddJobSkillRequest(skill_name="Backend", is_mandatory=True, weight=1)
        
        print("Adding Node.js")
        await service.add_required_skill(job.id, req1)
        print("Added Node.js")
        
        try:
            print("Adding Backend")
            await service.add_required_skill(job.id, req2)
            print("Added Backend")
        except Exception as e:
            print("Error adding Backend:", type(e).__name__)

if __name__ == "__main__":
    asyncio.run(test())
