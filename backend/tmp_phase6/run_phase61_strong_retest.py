import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

BASE_URL = "http://127.0.0.1:8000/api/v1"
ADMIN_EMAIL = "admin@resume.ai"
ADMIN_PASSWORD = "Admin123!"
DB = "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai"

JOB_PAYLOAD = {
    "title": "Analista de Sistemas Pleno - Reteste Forte Fase 6.1",
    "description": "Vaga teste FASE 6.1 para validar extração IA com evidências mínimas.",
    "requirements": "Obrigatórios: SQL; APIs REST; levantamento de requisitos; suporte a sistemas; documentação técnica; ERP/sistemas corporativos; 3+ anos. Desejáveis: Protheus; Python/JavaScript; integrações; PostgreSQL/SQL Server.",
    "status": "published",
    "seniority_level": "mid",
    "minimum_education_level": "bachelor",
    "minimum_years_experience": 3,
    "job_area": "technology",
    "responsibilities": "Levantar requisitos, documentar processos, suportar sistemas e integrações.",
    "experience_context": "Sistemas corporativos, ERP, integrações e APIs",
}

SKILLS = [
    ("SQL", True),
    ("APIs REST", True),
    ("Levantamento de requisitos", True),
    ("Suporte a sistemas", True),
    ("Documentação técnica", True),
    ("ERP", True),
    ("Protheus", False),
    ("Integração entre sistemas", False),
    ("PostgreSQL", False),
    ("SQL Server", False),
]

RESUME_TEXT = (
    "Analista de Sistemas Pleno com 5 anos em sistemas corporativos e ERP Protheus. "
    "Experiência avançada com SQL (PostgreSQL e SQL Server), criação e consumo de API REST, "
    "levantamento de requisitos com áreas de negócio, documentação técnica e funcional, "
    "integrações entre sistemas legados e novos, suporte N2/N3, melhoria contínua de processos. "
    "Formação em Sistemas de Informação (Bacharelado)."
)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def req(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    r = await client.request(method, url, **kwargs)
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code} {method} {url}: {r.text}")
    return r.json() if r.text else None


async def ensure_skill(client: httpx.AsyncClient, name: str) -> str:
    items = await req(client, "GET", f"{BASE_URL}/skills", params={"search": name, "limit": 50})
    for s in items:
        if s["name"].strip().lower() == name.strip().lower():
            return s["id"]
    created = await req(client, "POST", f"{BASE_URL}/skills", json={"name": name})
    return created["id"]


async def poll_analysis(client: httpx.AsyncClient, analysis_id: str, timeout: int = 360):
    start = asyncio.get_event_loop().time()
    while True:
        s = await req(client, "GET", f"{BASE_URL}/analyses/{analysis_id}/status")
        if s["status"] in {"completed", "failed", "cancelled"}:
            return s
        if asyncio.get_event_loop().time() - start > timeout:
            raise TimeoutError(f"analysis timeout: {analysis_id}")
        await asyncio.sleep(2)


async def main():
    out = {"started_at": now_iso()}

    async with httpx.AsyncClient(timeout=120.0) as client:
        login = await req(client, "POST", f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        client.headers.update({"Authorization": f"Bearer {login['access_token']}"})

        job = await req(client, "POST", f"{BASE_URL}/jobs", json=JOB_PAYLOAD)
        job_id = job["id"]
        out["job_id"] = job_id

        for name, mandatory in SKILLS:
            sid = await ensure_skill(client, name)
            await req(client, "POST", f"{BASE_URL}/jobs/{job_id}/skills", json={
                "skill_id": sid,
                "is_mandatory": mandatory,
                "minimum_level": "intermediate" if mandatory else None,
                "minimum_years": 3 if mandatory else None,
                "weight": 1.5 if mandatory else 1.0,
            })

        suffix = str(uuid4())[:8]
        candidate = await req(client, "POST", f"{BASE_URL}/candidates", json={
            "full_name": f"Candidato Forte Fase61 {suffix}",
            "email": f"fase61.forte.{suffix}@example.com",
            "location_city": "Sao Paulo",
            "location_state": "SP",
            "location_country": "BR",
            "tags": ["fase61", "forte"],
        })
        cid = candidate["id"]

        upload = await req(client, "POST", f"{BASE_URL}/resumes", json={"candidate_id": cid})
        rvid = upload["version_id"]

        engine = create_async_engine(DB)
        async with engine.begin() as conn:
            await conn.execute(sa.text("""
                UPDATE resume_versions
                SET extracted_text=:txt, extraction_status='completed'
                WHERE id=CAST(:rvid AS uuid)
            """), {"txt": RESUME_TEXT, "rvid": rvid})

        await req(client, "POST", f"{BASE_URL}/jobs/{job_id}/candidates", json={"candidate_id": cid, "source": "manual"})

        async with engine.connect() as conn:
            row = (await conn.execute(sa.text("""
                SELECT a.id
                FROM analyses a
                JOIN resume_versions rv ON rv.id=a.resume_version_id
                JOIN resumes r ON r.id=rv.resume_id
                WHERE r.candidate_id=CAST(:cid AS uuid)
                  AND a.job_id=CAST(:jid AS uuid)
                ORDER BY a.created_at DESC
                LIMIT 1
            """), {"cid": cid, "jid": job_id})).first()
            analysis_id = str(row[0])

        status = await poll_analysis(client, analysis_id)
        out["analysis_id"] = analysis_id
        out["analysis_status"] = status

        result = None
        if status["status"] == "completed":
            result = await req(client, "GET", f"{BASE_URL}/analyses/{analysis_id}/result")
            await req(client, "POST", f"{BASE_URL}/jobs/{job_id}/scoring")
            ranking = await req(client, "GET", f"{BASE_URL}/jobs/{job_id}/ranking")
            out["ranking"] = ranking

        async with engine.connect() as conn:
            db_row = (await conn.execute(sa.text("""
                SELECT a.status,a.failure_reason,a.queue_name,
                       ar.overall_score,ar.prompt_version_used,ar.extracted_data,
                       rjm.match_score,rjm.recommendation
                FROM analyses a
                LEFT JOIN analysis_results ar ON ar.analysis_id=a.id
                LEFT JOIN resume_job_matches rjm ON rjm.analysis_id=a.id
                WHERE a.id=CAST(:aid AS uuid)
            """), {"aid": analysis_id})).mappings().first()
            out["db"] = dict(db_row) if db_row else None

        await engine.dispose()
        out["analysis_result_api"] = result

    out["finished_at"] = now_iso()
    print(json.dumps(out, ensure_ascii=False, default=str))


if __name__ == "__main__":
    asyncio.run(main())
