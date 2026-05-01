#!/usr/bin/env python3
"""
Script simples para popular banco com dados mínimos de teste.

Cria:
- 5 vagas (diversos status)
- 20 candidatos
- 10 vínculos pipeline
"""

import asyncio
from datetime import datetime, timedelta, UTC
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.user_model import UserModel
from src.domain.entities.user import UserRole


async def seed_database():
    """Popula banco com dados mínimos."""

    database_url = "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai"
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("🌱 Iniciando seed simples...")

        # 1. Buscar usuários existentes
        users_result = await session.execute(select(UserModel).limit(5))
        users = users_result.scalars().all()

        if not users:
            print("❌ Nenhum usuário encontrado.")
            await engine.dispose()
            return

        recruiter = next((u for u in users if u.role == UserRole.RECRUITER), users[0])
        print(f"✓ Usando recruiter: {recruiter.email}")

        # 2. Criar 5 vagas
        jobs = []
        job_data = [
            ("Senior Backend Engineer (Python)", "published", "senior", 5),
            ("Frontend React Developer", "published", "mid", 3),
            ("Full Stack Architect", "paused", "senior", 7),
            ("DevOps Engineer", "closed", "mid", 4),
            ("Data Scientist", "published", "senior", 6),
        ]

        for title, status, seniority, yoe in job_data:
            job = JobModel(
                id=uuid4(),
                title=title,
                description=f"Lorem ipsum dolor sit amet. {title} opportunity.",
                status=status,
                seniority_level=seniority,
                minimum_years_experience=yoe,
                created_by=recruiter.id,
            )
            session.add(job)
            jobs.append(job)

        print(f"✓ Criadas {len(jobs)} vagas")
        await session.flush()

        # 3. Criar 20 candidatos
        candidates = []
        names = [
            "João Silva", "Maria Santos", "Pedro Oliveira", "Ana Costa", "Carlos Ferreira",
            "Julia Mendes", "Roberto Lima", "Beatriz Rocha", "Fernanda Gomes", "Leonardo Alves",
            "Sophia Souza", "Gustavo Santos", "Isabella Costa", "Matheus Silva", "Valentina Dias",
            "Rafael Martins", "Camila Barbosa", "Victor Hugo", "Helena Mendes", "Thiago Oliveira",
        ]

        for i, name in enumerate(names):
            quality_status = "valid"
            if i == 12:
                quality_status = "unknown"
            elif i == 13:
                quality_status = "no_resume"
            elif i == 16:
                quality_status = "parsing_failed"

            # Use UUID in email to guarantee uniqueness
            unique_id = str(uuid4())[:8]
            candidate = CandidateModel(
                id=uuid4(),
                full_name=name,
                email=f"candidate-{unique_id}@test.com",
                phone=f"+55 11 9{4000 + i}",
                location_city="São Paulo",
                location_state="SP",
                location_country="Brazil",
                data_quality_status=quality_status,
                created_by=recruiter.id,
            )
            session.add(candidate)
            candidates.append(candidate)

        print(f"✓ Criados {len(candidates)} candidatos")
        await session.flush()

        # 4. Criar 10 vínculos de pipeline
        pipeline_links = []
        for i, candidate in enumerate(candidates[:10]):
            pipeline = CandidatePipelineModel(
                candidate_id=candidate.id,
                job_id=jobs[i % len(jobs)].id,
                stage="screening" if i % 3 == 0 else "hr_interview",
                status="active",
                entered_at=datetime.now(UTC) - timedelta(days=i*2),
                updated_at=datetime.now(UTC),
            )
            session.add(pipeline)
            pipeline_links.append(pipeline)

        print(f"✓ Criados {len(pipeline_links)} vínculos de pipeline")

        # Commit
        await session.commit()

        # 5. Estatísticas finais
        candidates_count = await session.scalar(select(func.count(CandidateModel.id)))
        jobs_count = await session.scalar(select(func.count(JobModel.id)))
        pipeline_count = await session.scalar(select(func.count(CandidatePipelineModel.candidate_id)))

        print("\n" + "="*60)
        print("✅ SEED SIMPLES CONCLUÍDO!")
        print("="*60)
        print(f"📊 Dados criados:")
        print(f"   Vagas: {jobs_count}")
        print(f"   Candidatos: {candidates_count}")
        print(f"   Pipeline links: {pipeline_count}")
        print("="*60)
        print("\n💡 Dados prontos para testar ranking e pipeline!")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())
