#!/usr/bin/env python3
"""
Debug script para investigar o problema de matching/scoring
"""

import asyncio
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisService
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.base import Base
from src.infrastructure.database.connection import get_db_session
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password
from src.interface.api.main import app
from tests.conftest import TestSessionFactory, test_engine


async def debug_matching():
    """Debug o problema de matching"""

    # Setup banco em memória
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Criar users
    async with TestSessionFactory() as session:
        repo = SQLAlchemyUserRepository(session)

        candidate_user = User.create(
            email="debug-candidate@test.com",
            password_hash=hash_password("password123"),
            full_name="Debug Candidate",
            role=UserRole.CANDIDATE,
        )
        candidate_user.verify_email()
        await repo.save(candidate_user)

        recruiter = User.create(
            email="debug-recruiter@test.com",
            password_hash=hash_password("password123"),
            full_name="Debug Recruiter",
            role=UserRole.RECRUITER,
        )
        recruiter.verify_email()
        await repo.save(recruiter)

        await session.commit()

    # Usar cliente HTTP para upload
    async def override_get_db():
        async with TestSessionFactory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    async with TestSessionFactory() as db_session:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Login
            login = await client.post(
                "/api/v1/auth/login",
                json={"email": "debug-candidate@test.com", "password": "password123"},
            )
            candidate_token = login.json()["access_token"]
            candidate_headers = {"Authorization": f"Bearer {candidate_token}"}

            login = await client.post(
                "/api/v1/auth/login",
                json={"email": "debug-recruiter@test.com", "password": "password123"},
            )
            recruiter_token = login.json()["access_token"]
            recruiter_headers = {"Authorization": f"Bearer {recruiter_token}"}

            # Criar Candidate vinculado
            candidate_model = CandidateModel(
                full_name=candidate_user.full_name,
                email=candidate_user.email,
                user_id=candidate_user.id,
                created_by=recruiter.id,
            )
            db_session.add(candidate_model)
            await db_session.flush()

            # Upload resume
            upload = await client.post("/api/v1/resumes", headers=candidate_headers)
            print(f"\n📝 Upload status: {upload.status_code}")
            resume_id = UUID(upload.json()["resume_id"])
            version_id = UUID(upload.json()["version_id"])

            # Upload PDF
            def _pdf_with_text(text: str) -> bytes:
                stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET"
                objects = [
                    b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
                    b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
                    b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
                    b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
                    (f"5 0 obj << /Length {len(stream.encode())} >> stream\n{stream}\nendstream endobj\n").encode(),
                ]
                body = b"%PDF-1.4\n"
                offsets = [0]
                for obj in objects:
                    offsets.append(len(body))
                    body += obj
                xref_offset = len(body)
                xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
                for offset in offsets[1:]:
                    xref += f"{offset:010d} 00000 n \n".encode()
                trailer = (f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{xref_offset}\n%%EOF\n").encode()
                return body + xref + trailer

            pdf_response = await client.post(
                f"/api/v1/resumes/{resume_id}/upload",
                headers=candidate_headers,
                files={
                    "file": (
                        "debug.pdf",
                        _pdf_with_text("Python FastAPI PostgreSQL"),
                        "application/pdf",
                    )
                },
            )
            print(f"📄 PDF upload status: {pdf_response.status_code}")

            # Criar job
            job = await client.post(
                "/api/v1/jobs",
                json={
                    "title": "Backend Engineer",
                    "description": "Build backend APIs",
                    "requirements": "Python, FastAPI and PostgreSQL",
                    "seniority_level": "senior",
                    "work_model": "remote",
                    "location": "Brasil",
                    "salary_min": "12000.00",
                    "salary_max": "18000.00",
                    "salary_currency": "brl",
                },
                headers=recruiter_headers,
            )
            print(f"📋 Job creation status: {job.status_code}")
            job_id = UUID(job.json()["id"])

            # Publish job
            publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=recruiter_headers)
            print(f"📢 Publish status: {publish.status_code}")

            # Add skill (Python)
            skill = SkillModel(
                name="Python Overview",
                normalized_name=f"python-overview-{uuid4().hex[:8]}",
                category="backend",
                aliases=[],
                is_verified=True,
            )
            db_session.add(skill)
            await db_session.flush()

            add_skill = await client.post(
                f"/api/v1/jobs/{job_id}/skills",
                json={"skill_id": str(skill.id), "is_mandatory": True},
                headers=recruiter_headers,
            )
            print(f"🔧 Add skill status: {add_skill.status_code}")

            # Create AI model e analysis
            ai_model = AIModelModel(
                provider="anthropic",
                model_id=f"claude-debug-{uuid4()}",
                model_name="Claude Debug",
                is_active=True,
            )
            prompt = PromptTemplateModel(
                name=f"debug_prompt_{uuid4()}",
                version=1,
                template_type="full_analysis",
                user_prompt_template="Analyze resume",
                is_active=True,
                created_by=candidate_user.id,
            )
            db_session.add_all([ai_model, prompt])
            await db_session.flush()

            analysis_id = uuid4()
            now = datetime.now(UTC)
            analysis = AnalysisModel(
                id=analysis_id,
                resume_version_id=version_id,
                ai_model_id=ai_model.id,
                prompt_template_id=prompt.id,
                status="completed",
                requested_by=candidate_user.id,
                created_at=now,
                updated_at=now,
                completed_at=now,
            )
            result = AnalysisResultModel(
                id=uuid4(),
                analysis_id=analysis_id,
                overall_score="91.00",
                technical_score="95.00",
                experience_score="84.00",
                education_score="75.00",
                communication_score="86.00",
                leadership_score="72.00",
                candidate_summary="Perfil forte para backend.",
                seniority_level="senior",
                total_experience_years="7.0",
                strengths=["Python"],
                weaknesses=[],
                recommendations=[],
                keywords=["python", "fastapi"],
                extracted_data={"skills": [{"name": "Python"}]},
                created_at=now,
            )
            db_session.add_all([analysis, result])
            await db_session.commit()

            print(f"\n✅ Analysis created: {analysis_id}")

            # Match jobs
            analysis_service = AnalysisService(SQLAlchemyAnalysisRepository(db_session))
            matched = await analysis_service.auto_match_published_jobs(analysis_id)
            await db_session.commit()
            print(f"✅ Matched: {matched} job(s)")

            # Get overview
            overview = await client.get(
                f"/api/v1/candidates/{candidate_model.id}/overview",
                headers=recruiter_headers,
            )
            body = overview.json()

            print("\n" + "=" * 60)
            print("📊 OVERVIEW DATA")
            print("=" * 60)
            print(f"Candidate: {body['candidate']['id']}")
            print(f"Latest analysis score: {body['latest_analysis']['overall_score']}")
            print(f"Matched jobs: {body['latest_analysis_pipeline']['matched_jobs_count']}")
            print(f"Published jobs: {body['latest_analysis_pipeline']['published_jobs_total']}")

            if len(body["top_matches"]) > 0:
                match = body["top_matches"][0]
                print(f"\n🎯 TOP MATCH (Job ID: {match['job_id']})")
                print(f"  Recommendation: {match['recommendation']}")
                print(f"  Score: {match.get('score', 'N/A')}")
                print(f"  Match score: {match.get('match_score', 'N/A')}")
                print(f"  Reason codes: {match.get('reason_codes', [])}")
                print(f"\nFull match data:")
                print(json.dumps(match, indent=2, default=str))
            else:
                print("\n❌ No matches found!")

            # Query database directly
            print("\n" + "=" * 60)
            print("📋 DIRECT DATABASE QUERY")
            print("=" * 60)

            scores = await db_session.scalars(
                sa.select(sa.orm.class_mapper(type(AnalysisResultModel)).mapped_table).select_from(
                    sa.orm.class_mapper(type(AnalysisResultModel)).mapped_table
                )
            )

            from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel
            candidate_scores = await db_session.scalars(
                sa.select(CandidateJobScoreModel).where(
                    CandidateJobScoreModel.candidate_id == candidate_model.id
                )
            )

            for score in candidate_scores:
                print(f"\nCandidate-Job Score:")
                print(f"  Job ID: {score.job_id}")
                print(f"  Final Score: {score.final_score}")
                print(f"  Decision: {score.decision_suggestion}")
                print(f"  Reason codes: {score.reason_codes}")
                print(f"  Breakdown: {score.breakdown}")

    app.dependency_overrides.clear()


if __name__ == "__main__":
    asyncio.run(debug_matching())
