#!/usr/bin/env python3
"""
Script para popular banco com dados realistas de teste.

Cria:
- 5 vagas (diversos status)
- 20 candidatos
- 15 resumes com análises
- 10 vínculos pipeline
"""

import asyncio
from datetime import datetime, timedelta, UTC
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel, ScoreModelVersionModel
from src.infrastructure.database.models.user_model import UserModel
from src.domain.entities.user import UserRole


async def seed_database():
    """Popula banco com dados realistas."""

    database_url = "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai"
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print("🌱 Iniciando seed de dados...")

        # 1. Buscar usuários existentes
        users_result = await session.execute(select(UserModel).limit(5))
        users = users_result.scalars().all()

        if not users:
            print("❌ Nenhum usuário encontrado. Execute scripts/reset_db.py primeiro.")
            await engine.dispose()
            return

        recruiter = next((u for u in users if u.role == UserRole.RECRUITER), users[0])
        candidate_user = next((u for u in users if u.role == UserRole.CANDIDATE), users[1] if len(users) > 1 else users[0])

        print(f"✓ Usando recruiter: {recruiter.email}")
        print(f"✓ Usando candidate: {candidate_user.email}")

        # 2. Criar 5 vagas
        jobs = []
        job_titles = [
            "Senior Backend Engineer (Python)",
            "Frontend React Developer",
            "Full Stack Architect",
            "DevOps Engineer",
            "Data Scientist",
        ]
        job_statuses = ["published", "published", "paused", "closed", "published"]

        for i, (title, status) in enumerate(zip(job_titles, job_statuses)):
            job = JobModel(
                id=uuid4(),
                title=title,
                description=f"Lorem ipsum dolor sit amet. {title} opportunity.",
                requirements=f"Requirements for {title}",
                status=status,
                seniority_level="senior" if i % 2 == 0 else "mid",
                minimum_education_level="bachelor",
                minimum_years_experience=3 + i,
                work_model="remote" if i % 2 == 0 else "hybrid",
                location="São Paulo, Brazil" if i % 3 == 0 else "Remote",
                salary_min=5000 + (i * 2000),
                salary_max=10000 + (i * 3000),
                salary_currency="BRL",
                created_by=recruiter.id,
            )
            session.add(job)
            jobs.append(job)

        print(f"✓ Criadas {len(jobs)} vagas")

        # 3. Criar score model version
        score_version = ScoreModelVersionModel(
            id=uuid4(),
            version="1.0.0",
            is_active=True,
            weights={
                "skill_match": 0.4,
                "experience_match": 0.25,
                "seniority_match": 0.2,
                "education": 0.1,
                "ai_confidence": 0.05,
            },
            thresholds={"high": 70, "low": 45},
        )
        session.add(score_version)
        await session.flush()

        # 4. Criar 20 candidatos
        candidates = []
        candidate_data = [
            ("João Silva", "joao@test.com", "valid"),
            ("Maria Santos", "maria@test.com", "valid"),
            ("Pedro Oliveira", "pedro@test.com", "valid"),
            ("Ana Costa", "ana@test.com", "valid"),
            ("Carlos Ferreira", "carlos@test.com", "valid"),
            ("Julia Mendes", "julia@test.com", "valid"),
            ("Roberto Lima", "roberto@test.com", "valid"),
            ("Beatriz Rocha", "beatriz@test.com", "valid"),
            ("Fernanda Gomes", "fernanda@test.com", "valid"),
            ("Leonardo Alves", "leonardo@test.com", "valid"),
            ("Sophia Souza", "sophia@test.com", "valid"),
            ("Gustavo Santos", "gustavo@test.com", "valid"),
            ("Isabella Costa", "isabella@test.com", "unknown"),
            ("Matheus Silva", "matheus@test.com", "no_resume"),
            ("Valentina Dias", "valentina@test.com", "valid"),
            ("Rafael Martins", "rafael@test.com", "valid"),
            ("Camila Barbosa", "camila@test.com", "parsing_failed"),
            ("Victor Hugo", "victor@test.com", "valid"),
            ("Helena Mendes", "helena@test.com", "valid"),
            ("Thiago Oliveira", "thiago@test.com", "empty_resume"),
        ]

        for name, email, quality_status in candidate_data:
            candidate = CandidateModel(
                id=uuid4(),
                full_name=name,
                email=email,
                phone=f"+55 11 9{4000 + len(candidates)}",
                cpf=None,
                location_city="São Paulo",
                location_state="SP",
                location_country="Brazil",
                data_quality_status=quality_status,
                data_quality_reason=f"Marked as {quality_status}" if quality_status != "valid" else None,
                created_by=recruiter.id,
            )
            session.add(candidate)
            candidates.append(candidate)

        print(f"✓ Criados {len(candidates)} candidatos")
        await session.flush()

        # 5. Criar 15 resumes (nem todos têm)
        resumes = []
        for i, candidate in enumerate(candidates[:15]):
            if candidate.data_quality_status in ["no_resume", "empty_resume"]:
                continue

            resume = ResumeModel(
                id=uuid4(),
                candidate_id=candidate.id,
                title=f"{candidate.full_name} - Resume",
                status="active",
                created_by=candidate.created_by,
                created_at=datetime.now(UTC) - timedelta(days=i),
                updated_at=datetime.now(UTC),
            )
            session.add(resume)
            resumes.append((resume, candidate))

        print(f"✓ Criados {len(resumes)} resumes")
        await session.flush()

        # 6. Criar resume versions
        for resume, candidate in resumes:
            version = ResumeVersionModel(
                id=uuid4(),
                resume_id=resume.id,
                version_number=1,
                original_file_name=f"{candidate.full_name.replace(' ', '_')}.pdf",
                mime_type="application/pdf",
                extraction_status="completed",
                page_count=2,
                word_count=500 + (len(candidates) % 200),
                uploaded_at=resume.created_at,
                file_hash_sha256="abc123def456" + str(i),
            )
            session.add(version)

        # 7. Pular análises complexas (requer ai_models e prompt_templates)
        analyses = []
        print(f"✓ Puladas análises complexas (setup AI models necessário)")
        await session.flush()

        # 8. Criar scores de job matching
        scores = []
        for job in jobs:
            for candidate in candidates[:10]:
                if candidate.data_quality_status != "valid":
                    continue

                score = CandidateJobScoreModel(
                    id=uuid4(),
                    candidate_id=candidate.id,
                    job_id=job.id,
                    version_id=score_version.id,
                    final_score=Decimal("65.0") + Decimal(len(candidates) % 30),
                    decision_suggestion="review",
                    breakdown={
                        "skill_match_score": 70.0,
                        "experience_match_score": 60.0,
                        "seniority_match_score": 65.0,
                        "education_score": 75.0,
                        "ai_confidence_score": 68.0,
                        "penalty_score": 0.0,
                        "validation_penalty_score": 0.0,
                        "final_score": 65.0,
                    },
                    reason_codes=[],
                    explanation_text="Candidate has relevant experience and skills.",
                    computed_at=datetime.now(UTC),
                )
                session.add(score)
                scores.append(score)

        print(f"✓ Criados {len(scores)} scores de matching")
        await session.flush()

        # 9. Criar 10 vínculos de pipeline
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

        # Commit all
        await session.commit()

        # 10. Estatísticas finais
        candidates_count = await session.scalar(select(select(CandidateModel).count()))
        jobs_count = await session.scalar(select(select(JobModel).count()))
        resumes_count = await session.scalar(select(select(ResumeModel).count()))
        analyses_count = await session.scalar(select(select(AnalysisModel).count()))

        print("\n" + "="*60)
        print("✅ SEED CONCLUÍDO COM SUCESSO!")
        print("="*60)
        print(f"📊 Estatísticas finais:")
        print(f"   Vagas: {jobs_count}")
        print(f"   Candidatos: {candidates_count}")
        print(f"   Resumes: {resumes_count}")
        print(f"   Análises: {analyses_count}")
        print(f"   Scores: {len(scores)}")
        print(f"   Pipeline links: {len(pipeline_links)}")
        print("="*60)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_database())
