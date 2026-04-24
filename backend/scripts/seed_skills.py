import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.connection import AsyncSessionFactory, engine

SKILLS = [
    # Backend
    {"name": "Python", "normalized_name": "python", "category": "backend", "aliases": ["py", "python3"]},
    {"name": "FastAPI", "normalized_name": "fastapi", "category": "backend", "aliases": ["fast-api"]},
    {"name": "Django", "normalized_name": "django", "category": "backend", "aliases": []},
    {"name": "Node.js", "normalized_name": "node.js", "category": "backend", "aliases": ["node", "nodejs"]},
    {"name": "Java", "normalized_name": "java", "category": "backend", "aliases": []},
    {"name": "Go", "normalized_name": "go", "category": "backend", "aliases": ["golang"]},
    {"name": "Rust", "normalized_name": "rust", "category": "backend", "aliases": []},
    {"name": "C#", "normalized_name": "c#", "category": "backend", "aliases": ["csharp", "dotnet", ".net"]},
    # Frontend
    {"name": "React", "normalized_name": "react", "category": "frontend", "aliases": ["reactjs", "react.js"]},
    {"name": "TypeScript", "normalized_name": "typescript", "category": "frontend", "aliases": ["ts"]},
    {"name": "JavaScript", "normalized_name": "javascript", "category": "frontend", "aliases": ["js", "es6"]},
    {"name": "Vue.js", "normalized_name": "vue.js", "category": "frontend", "aliases": ["vue", "vuejs"]},
    {"name": "Angular", "normalized_name": "angular", "category": "frontend", "aliases": []},
    # Database
    {"name": "PostgreSQL", "normalized_name": "postgresql", "category": "database", "aliases": ["postgres", "pgsql"]},
    {"name": "MySQL", "normalized_name": "mysql", "category": "database", "aliases": []},
    {"name": "MongoDB", "normalized_name": "mongodb", "category": "database", "aliases": ["mongo"]},
    {"name": "Redis", "normalized_name": "redis", "category": "database", "aliases": []},
    {"name": "SQLAlchemy", "normalized_name": "sqlalchemy", "category": "database", "aliases": []},
    # DevOps / Infra
    {"name": "Docker", "normalized_name": "docker", "category": "devops", "aliases": []},
    {"name": "Kubernetes", "normalized_name": "kubernetes", "category": "devops", "aliases": ["k8s"]},
    {"name": "AWS", "normalized_name": "aws", "category": "devops", "aliases": ["amazon web services"]},
    {"name": "GCP", "normalized_name": "gcp", "category": "devops", "aliases": ["google cloud"]},
    {"name": "CI/CD", "normalized_name": "ci/cd", "category": "devops", "aliases": ["cicd", "github actions", "jenkins"]},
    # Data / AI
    {"name": "Machine Learning", "normalized_name": "machine learning", "category": "data", "aliases": ["ml"]},
    {"name": "SQL", "normalized_name": "sql", "category": "data", "aliases": []},
    {"name": "Pandas", "normalized_name": "pandas", "category": "data", "aliases": []},
    {"name": "TensorFlow", "normalized_name": "tensorflow", "category": "data", "aliases": ["tf"]},
    {"name": "PyTorch", "normalized_name": "pytorch", "category": "data", "aliases": []},
    # Soft skills
    {"name": "Liderança", "normalized_name": "liderança", "category": "soft-skill", "aliases": ["leadership"]},
    {"name": "Comunicação", "normalized_name": "comunicação", "category": "soft-skill", "aliases": ["communication"]},
    {"name": "Trabalho em equipe", "normalized_name": "trabalho em equipe", "category": "soft-skill", "aliases": ["teamwork"]},
    {"name": "Resolução de problemas", "normalized_name": "resolução de problemas", "category": "soft-skill", "aliases": ["problem solving"]},
    {"name": "Metodologias Ágeis", "normalized_name": "metodologias ágeis", "category": "process", "aliases": ["agile", "scrum", "kanban"]},
]


async def main() -> None:
    async with AsyncSessionFactory() as session:
        existing = await session.scalar(text("SELECT count(*) FROM skills"))
        if int(existing or 0) > 0:
            print(f"Pulando seed de skills: já existem {existing} skill(s) no banco.")
            await engine.dispose()
            return

        print("Inserindo skills de exemplo...")

        insert_sql = text(
            """
            INSERT INTO skills (name, normalized_name, category, aliases, is_verified)
            VALUES (:name, :normalized_name, :category, :aliases::jsonb, true)
            ON CONFLICT (normalized_name) DO NOTHING
            """
        )

        import json
        count = 0
        for s in SKILLS:
            await session.execute(
                insert_sql,
                {
                    "name": s["name"],
                    "normalized_name": s["normalized_name"],
                    "category": s["category"],
                    "aliases": json.dumps(s["aliases"]),
                },
            )
            count += 1

        await session.commit()

    await engine.dispose()
    print(f"Seed de skills finalizado: {count} skills inseridas.")


if __name__ == "__main__":
    asyncio.run(main())
