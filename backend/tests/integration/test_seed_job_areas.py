import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.infrastructure.database.models.job_area_model import JobAreaModel
from scripts.seed_job_areas import seed_areas

pytestmark = pytest.mark.asyncio

async def test_seed_areas_success(db_session: AsyncSession):
    # Clear existing areas if any (though tests usually run in a clean transaction)
    
    summary = await seed_areas(db_session)
    
    assert summary["areas_created"] == 19
    assert summary["areas_existed"] == 0
    
    # Verify in DB
    result = await db_session.execute(select(JobAreaModel))
    areas = result.scalars().all()
    assert len(areas) == 19

async def test_seed_areas_idempotency(db_session: AsyncSession):
    # First run
    summary1 = await seed_areas(db_session)
    assert summary1["areas_created"] == 19
    
    # Second run
    summary2 = await seed_areas(db_session)
    assert summary2["areas_created"] == 0
    assert summary2["areas_existed"] == 19
