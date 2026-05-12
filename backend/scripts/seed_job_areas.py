import asyncio
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.connection import AsyncSessionFactory, engine
from src.infrastructure.repositories.sqlalchemy_job_area_repository import SQLAlchemyJobAreaRepository
from src.infrastructure.database.models.job_area_model import JobAreaModel
from src.application.services.job_area_normalizer import normalize_job_area_name

DEFAULT_AREAS = [
    "Tecnologia",
    "Administrativo",
    "Financeiro",
    "Comercial",
    "RH",
    "Operações",
    "Jurídico",
    "Marketing",
    "Atendimento",
    "Manutenção",
    "Logística",
    "Compras",
    "Fiscal",
    "Contabilidade",
    "Departamento Pessoal",
    "Postos",
    "Loja/Conveniência",
    "Backoffice",
    "Suprimentos"
]

async def seed_areas(session: AsyncSession):
    repo = SQLAlchemyJobAreaRepository(session)
    
    summary = {
        "areas_created": 0,
        "areas_existed": 0,
        "conflicts_ignored": 0
    }
    
    for area_name in DEFAULT_AREAS:
        try:
            normalized_name = normalize_job_area_name(area_name)
        except ValueError:
            print(f"[SKIP] Invalid area name: '{area_name}'")
            continue
            
        # Check if area exists
        existing_area = await repo.find_by_normalized_name(normalized_name)
        
        if not existing_area:
            # Create area
            area = JobAreaModel(
                name=area_name.strip(),
                normalized_name=normalized_name,
            )
            await repo.create_area(area)
            summary["areas_created"] += 1
        else:
            summary["areas_existed"] += 1
            
    await session.commit()
    return summary

async def main():
    print("Iniciando seed de áreas...")
    async with AsyncSessionFactory() as session:
        summary = await seed_areas(session)
        
    await engine.dispose()
    
    print("\n=== RESUMO ===")
    print(f"Áreas criadas: {summary['areas_created']}")
    print(f"Áreas já existentes: {summary['areas_existed']}")
    print(f"Conflitos ignorados: {summary['conflicts_ignored']}")

if __name__ == "__main__":
    asyncio.run(main())
