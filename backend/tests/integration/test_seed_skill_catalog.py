import pytest
import json
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.infrastructure.database.models.skill_catalog_model import SkillCatalogModel, SkillAliasModel
from scripts.seed_skill_catalog_from_json import seed_skills

pytestmark = pytest.mark.asyncio

async def test_seed_skills_success(db_session: AsyncSession, tmp_path: Path):
    # Create a temp JSON
    json_data = {
        "groups": [
            {
                "canonical": "Python",
                "aliases": ["Python 3", "Py"]
            },
            {
                "canonical": "Java",
                "aliases": ["Java 11"]
            }
        ]
    }
    json_file = tmp_path / "test_skills.json"
    json_file.write_text(json.dumps(json_data))
    
    summary = await seed_skills(db_session, json_file)
    
    assert summary["skills_created"] == 2
    assert summary["aliases_created"] == 3
    
    # Verify in DB
    result = await db_session.execute(select(SkillCatalogModel))
    skills = result.scalars().all()
    assert len(skills) == 2
    
    result = await db_session.execute(select(SkillAliasModel))
    aliases = result.scalars().all()
    assert len(aliases) == 3

async def test_seed_skills_idempotency(db_session: AsyncSession, tmp_path: Path):
    json_data = {
        "groups": [
            {
                "canonical": "Python",
                "aliases": ["Python 3"]
            }
        ]
    }
    json_file = tmp_path / "test_skills.json"
    json_file.write_text(json.dumps(json_data))
    
    # First run
    summary1 = await seed_skills(db_session, json_file)
    assert summary1["skills_created"] == 1
    assert summary1["aliases_created"] == 1
    
    # Second run
    summary2 = await seed_skills(db_session, json_file)
    assert summary2["skills_created"] == 0
    assert summary2["skills_existed"] == 1
    assert summary2["aliases_created"] == 0
    assert summary2["aliases_existed"] == 1

async def test_seed_skills_alias_equals_canonical(db_session: AsyncSession, tmp_path: Path):
    json_data = {
        "groups": [
            {
                "canonical": "Python",
                "aliases": ["Python", "Py"] # "Python" is equal to canonical
            }
        ]
    }
    json_file = tmp_path / "test_skills.json"
    json_file.write_text(json.dumps(json_data))
    
    summary = await seed_skills(db_session, json_file)
    assert summary["skills_created"] == 1
    assert summary["aliases_created"] == 1 # Only "Py" should be created
    
async def test_seed_skills_conflicts(db_session: AsyncSession, tmp_path: Path):
    json_data = {
        "groups": [
            {
                "canonical": "JS",
                "aliases": ["JavaScript"]
            },
            {
                "canonical": "JavaScript", # Conflict: already an alias
                "aliases": ["React"]
            },
            {
                "canonical": "TypeScript",
                "aliases": ["JavaScript"] # Conflict: alias already exists for JS
            }
        ]
    }
    json_file = tmp_path / "test_skills.json"
    json_file.write_text(json.dumps(json_data))
    
    summary = await seed_skills(db_session, json_file)
    assert summary["skills_created"] == 2 # JS and TypeScript should be created
    assert summary["aliases_created"] == 1 # Only JavaScript for JS
    assert summary["conflicts_ignored"] == 2 # JavaScript as skill and JavaScript as alias for TypeScript
