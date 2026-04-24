import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password

DEFAULT_ADMIN_EMAIL = os.getenv("DEV_ADMIN_EMAIL", "admin@resume.ai")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEV_ADMIN_PASSWORD", "Admin123!")
DEFAULT_ADMIN_FULL_NAME = os.getenv("DEV_ADMIN_FULL_NAME", "Administrador Dev")


SAMPLE_JOBS = [
    {
        "title": "Engenheiro de Software - Backend",
        "description": "Desenvolver e manter serviços backend em Python (FastAPI). Fazer design de APIs, integrações com bancos e filas.",
        "requirements": "Experiência com Python, SQLAlchemy, PostgreSQL, testes automatizados.",
        "seniority": "senior",
        "work_model": "hybrid",
        "location": "São Paulo - SP",
        "salary_min": 12000.0,
        "salary_max": 18000.0,
    },
    {
        "title": "Analista de Dados",
        "description": "Construir pipelines de dados e dashboards, transformar requisitos de negócio em insights acionáveis.",
        "requirements": "Experiência com ETL, SQL, visualização (Metabase/Looker) e Python.",
        "seniority": "mid",
        "work_model": "remote",
        "location": "Remoto",
        "salary_min": 7000.0,
        "salary_max": 11000.0,
    },
    {
        "title": "Product Manager",
        "description": "Liderar roadmap de produto, priorizar entregas e articular stakeholders técnicos e de negócio.",
        "requirements": "Experiência em times ágeis, definição de métricas e validação de hipóteses.",
        "seniority": "lead",
        "work_model": "onsite",
        "location": "Rio de Janeiro - RJ",
        "salary_min": 14000.0,
        "salary_max": 20000.0,
    },
]


async def ensure_admin(session):
    repository = SQLAlchemyUserRepository(session)
    existing_user = await repository.find_by_email(DEFAULT_ADMIN_EMAIL)
    user_id = None

    if existing_user is not None:
        print(f"Admin de desenvolvimento ja existe: {DEFAULT_ADMIN_EMAIL}")
        user_id = existing_user.id
    else:
        user = User.create(
            email=DEFAULT_ADMIN_EMAIL,
            password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
            full_name=DEFAULT_ADMIN_FULL_NAME,
            role=UserRole.ADMIN,
        )
        user.verify_email()

        await repository.save(user)
        await session.flush()
        user_id = user.id
        print(f"Admin de desenvolvimento criado: {DEFAULT_ADMIN_EMAIL}")

    return user_id


async def main() -> None:
    async with AsyncSessionFactory() as session:
        # garante admin dev
        created_by = await ensure_admin(session)

        # verifica se já existem vagas
        total = await session.scalar(text("SELECT count(*) FROM jobs"))
        total_items = int(total or 0)
        if total_items > 0:
            print(f"Pulando seed de vagas: ja existem {total_items} vaga(s) no banco.")
            await engine.dispose()
            return

        print("Inserindo vagas de exemplo...")

        insert_sql = text(
            """
            INSERT INTO jobs (
                title, description, requirements, status, seniority_level, work_model, location,
                salary_min, salary_max, salary_currency, created_by, published_at
            ) VALUES (
                :title, :description, :requirements, 'published', :seniority_level, :work_model, :location,
                :salary_min, :salary_max, :salary_currency, :created_by, NOW()
            )
            """
        )

        for j in SAMPLE_JOBS:
            await session.execute(
                insert_sql,
                {
                    "title": j["title"],
                    "description": j["description"],
                    "requirements": j.get("requirements"),
                    "seniority_level": j.get("seniority"),
                    "work_model": j.get("work_model"),
                    "location": j.get("location"),
                    "salary_min": j.get("salary_min"),
                    "salary_max": j.get("salary_max"),
                    "salary_currency": "BRL",
                    "created_by": created_by,
                },
            )

        await session.commit()

    await engine.dispose()
    print("Seed de vagas finalizado: 3 vagas inseridas.")


if __name__ == "__main__":
    asyncio.run(main())
