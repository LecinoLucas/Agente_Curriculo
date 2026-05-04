from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.user_model import UserModel
from src.domain.entities.user import UserRole


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL não configurado")

    if "prod" in url.lower():
        raise RuntimeError("🚨 Não rode seed em produção")

    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return url


async def seed_database():
    database_url = get_database_url()

    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("🌱 Seed profissional iniciado...")

        # 🔍 pegar recruiter
        users = (await session.execute(select(UserModel))).scalars().all()

        if not users:
            raise RuntimeError("Nenhum usuário encontrado")

        recruiter = next((u for u in users if u.role == UserRole.RECRUITER), users[0])

        # 🔒 evita duplicação
        existing = await session.scalar(select(func.count(JobModel.id)))
        if existing and existing > 0:
            print("⚠️ Seed já aplicado. Abortando.")
            return

        # 🧠 vagas realistas (já normalizadas)
        jobs_data = [
            {
                "title": "Analista de Dados",
                "job_area": "data",
                "seniority": "mid",
                "desc": "Construção de dashboards, SQL, ETL e análise de dados.",
                "exp": 3,
            },
            {
                "title": "Backend Python Engineer",
                "job_area": "technology",
                "seniority": "senior",
                "desc": "APIs com FastAPI, PostgreSQL, arquitetura backend.",
                "exp": 5,
            },
            {
                "title": "Assistente Administrativo",
                "job_area": "administrative",
                "seniority": "junior",
                "desc": "Rotinas administrativas, controle de documentos e apoio interno.",
                "exp": 1,
            },
        ]

        jobs = []
        for data in jobs_data:
            job = JobModel(
                id=uuid4(),
                title=data["title"],
                description=data["desc"],
                job_area=data["job_area"],
                status="published",
                seniority_level=data["seniority"],
                minimum_years_experience=data["exp"],
                created_by=recruiter.id,
            )
            session.add(job)
            jobs.append(job)

        await session.flush()

        # 👥 candidatos variados
        candidates = []
        for i in range(20):
            quality = "valid"
            if i % 7 == 0:
                quality = "no_resume"
            elif i % 9 == 0:
                quality = "parsing_failed"

            candidate = CandidateModel(
                id=uuid4(),
                full_name=f"Candidate {i}",
                email=f"candidate_{uuid4().hex[:6]}@test.com",
                data_quality_status=quality,
                created_by=recruiter.id,
            )
            session.add(candidate)
            candidates.append(candidate)

        await session.flush()

        # 🔗 pipeline realista
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

        # 📊 stats
        print("\n✅ Seed concluído")
        print(f"Jobs: {await session.scalar(select(func.count(JobModel.id)))}")
        print(f"Candidates: {await session.scalar(select(func.count(CandidateModel.id)))}")
        print(f"Pipeline: {await session.scalar(select(func.count(CandidatePipelineModel.candidate_id)))}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())