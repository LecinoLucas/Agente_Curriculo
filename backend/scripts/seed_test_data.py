from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.domain.entities.user import UserRole


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL não configurado")

    if "prod" in url.lower():
        raise RuntimeError("🚨 Não rode seed em produção")

    return url.replace("postgresql://", "postgresql+asyncpg://")


async def seed_database():
    engine = create_async_engine(get_database_url(), echo=False)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        print("🌱 Seed real iniciado...")

        users = (await session.execute(sa.select(UserModel))).scalars().all()
        if not users:
            raise RuntimeError("Nenhum usuário encontrado")

        recruiter = next((u for u in users if u.role == UserRole.RECRUITER), users[0])

        # evita duplicação
        existing = await session.scalar(sa.select(sa.func.count(JobModel.id)))
        if existing and existing > 0:
            print("⚠️ Seed já aplicado. Abortando.")
            return

        # vagas coerentes
        jobs = []
        jobs_data = [
            ("Analista de Dados", "data", "mid"),
            ("Backend Python", "technology", "senior"),
            ("Assistente Administrativo", "administrative", "junior"),
        ]

        for title, area, seniority in jobs_data:
            job = JobModel(
                id=uuid4(),
                title=title,
                description=f"{title} com atuação prática.",
                job_area=area,
                status="published",
                seniority_level=seniority,
                minimum_years_experience=2,
                created_by=recruiter.id,
            )
            session.add(job)
            jobs.append(job)

        await session.flush()

        # score version consistente
        score_version = ScoreModelVersionModel(
            id=uuid4(),
            version="v2-evidence-dev",
            is_active=True,
            weights={
                "critical_requirements": 0.4,
                "skill_match": 0.25,
                "experience_match": 0.15,
                "seniority_match": 0.1,
                "education_match": 0.05,
                "differentials": 0.05,
            },
            thresholds={"strong_match": 82, "interview": 65, "maybe": 45},
        )
        session.add(score_version)

        # candidatos
        candidates = []
        for i in range(20):
            candidate = CandidateModel(
                id=uuid4(),
                full_name=f"Candidate {i}",
                email=f"c{i}_{uuid4().hex[:4]}@test.com",
                data_quality_status="valid" if i % 5 else "parsing_failed",
                created_by=recruiter.id,
            )
            session.add(candidate)
            candidates.append(candidate)

        await session.flush()

        # resumes
        resumes = []
        for i, candidate in enumerate(candidates[:15]):
            if candidate.data_quality_status != "valid":
                continue

            resume = ResumeModel(
                id=uuid4(),
                candidate_id=candidate.id,
                status="active",
                created_by=recruiter.id,
            )
            session.add(resume)

            version = ResumeVersionModel(
                id=uuid4(),
                resume_id=resume.id,
                version_number=1,
                mime_type="application/pdf",
                extraction_status="completed",
                file_hash_sha256=f"hash_{uuid4().hex}",
                uploaded_at=datetime.now(UTC),
            )
            session.add(version)

            resumes.append((candidate, resume))

        await session.flush()

        # scores coerentes
        for job in jobs:
            for candidate in candidates[:10]:
                if candidate.data_quality_status != "valid":
                    continue

                score_value = Decimal(50 + (hash(str(candidate.id)) % 40))

                session.add(
                    CandidateJobScoreModel(
                        id=uuid4(),
                        candidate_id=candidate.id,
                        job_id=job.id,
                        version_id=score_version.id,
                        final_score=score_value,
                        decision_suggestion="review",
                        computed_at=datetime.now(UTC),
                    )
                )

        # pipeline
        for i, candidate in enumerate(candidates[:10]):
            session.add(
                CandidatePipelineModel(
                    candidate_id=candidate.id,
                    job_id=jobs[i % len(jobs)].id,
                    stage=["screening", "interview", "offer"][i % 3],
                    status="active",
                    entered_at=datetime.now(UTC) - timedelta(days=i),
                    updated_at=datetime.now(UTC),
                )
            )

        await session.commit()

        print("✅ Seed finalizado corretamente")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())