import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime, UTC
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BASE_URL = "http://127.0.0.1:8000/api/v1"
ADMIN_EMAIL = "admin@resume.ai"
ADMIN_PASSWORD = "Admin123!"
DATABASE_URL = "postgresql+asyncpg://LecinoLucas:020219@localhost:5432/resume_ai"
OUT_FILE = Path("tmp_phase6/phase6_results.json")

JOB_PAYLOAD = {
    "title": "Analista de Sistemas Pleno - Teste Fase 6",
    "description": (
        "Vaga de teste controlado para validação de matching e scoring. "
        "Atuação em sustentação e evolução de sistemas corporativos, com foco em APIs REST, SQL e levantamento de requisitos."
    ),
    "requirements": (
        "Obrigatórios: SQL; APIs REST; levantamento de requisitos; suporte a sistemas; documentação técnica; "
        "experiência com ERP ou sistemas corporativos; 3+ anos de experiência. "
        "Desejáveis: Protheus; Python ou JavaScript; integração entre sistemas; PostgreSQL ou SQL Server."
    ),
    "status": "published",
    "seniority_level": "mid",
    "minimum_education_level": "bachelor",
    "minimum_years_experience": 3,
    "job_area": "technology",
    "responsibilities": (
        "Levantar requisitos com áreas de negócio, documentar processos técnicos, apoiar suporte e incidentes, "
        "especificar integrações e apoiar melhorias contínuas em sistemas corporativos."
    ),
    "experience_context": "Sistemas corporativos, ERP, integração de dados e APIs.",
    "behavioral_requirements": ["Comunicação", "Organização", "Análise crítica"],
    "priority": "normal",
}

SKILL_PLAN = [
    ("SQL", True),
    ("APIs REST", True),
    ("Levantamento de requisitos", True),
    ("Suporte a sistemas", True),
    ("Documentação técnica", True),
    ("ERP", True),
    ("Protheus", False),
    ("Python", False),
    ("JavaScript", False),
    ("Integração entre sistemas", False),
    ("PostgreSQL", False),
    ("SQL Server", False),
]

@dataclass
class CandidateProfile:
    label: str
    expected: str
    full_name: str
    resume_text: str


CANDIDATES = [
    CandidateProfile(
        label="forte",
        expected=">=80",
        full_name="Candidato Forte Fase 6",
        resume_text=(
            "Analista de Sistemas Pleno com 5 anos em sistemas corporativos e ERP Protheus. "
            "Experiência avançada em SQL (PostgreSQL e SQL Server), criação e consumo de APIs REST, "
            "levantamento de requisitos com áreas de negócio, documentação técnica funcional e técnica, "
            "suporte N2/N3 e integração entre sistemas legados e novos. "
            "Atuação em projetos de integração com Python e JavaScript."
        ),
    ),
    CandidateProfile(
        label="medio",
        expected="50-79",
        full_name="Candidato Medio Fase 6",
        resume_text=(
            "Profissional com 2 anos em suporte de sistemas N1/N2. "
            "Conhecimento básico a intermediário de SQL, atendimento de chamados e rotinas operacionais. "
            "Participou de pequenas melhorias em sistemas internos e alguma consulta a APIs REST. "
            "Experiência limitada em documentação e sem vivência com Protheus."
        ),
    ),
    CandidateProfile(
        label="fraco",
        expected="<50",
        full_name="Candidato Fraco Fase 6",
        resume_text=(
            "Profissional com experiência principal em atendimento comercial e vendas presenciais. "
            "Sem experiência técnica em SQL, APIs, ERP ou análise de sistemas. "
            "Atuação focada em metas de loja, relacionamento com cliente e rotinas administrativas gerais."
        ),
    ),
]


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def fetch_json(client: httpx.AsyncClient, method: str, url: str, **kwargs: Any) -> Any:
    response = await client.request(method, url, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"HTTP {response.status_code} {method} {url}: {response.text}")
    if not response.text:
        return None
    return response.json()


async def ensure_skill(client: httpx.AsyncClient, name: str) -> str:
    skills = await fetch_json(client, "GET", f"{BASE_URL}/skills", params={"search": name, "limit": 50})
    for skill in skills:
        if skill.get("name", "").strip().lower() == name.strip().lower():
            return skill["id"]
    created = await fetch_json(client, "POST", f"{BASE_URL}/skills", json={"name": name})
    return created["id"]


async def wait_analysis_completion(
    client: httpx.AsyncClient,
    analysis_id: str,
    timeout_seconds: int = 600,
) -> dict[str, Any]:
    started = asyncio.get_event_loop().time()
    while True:
        status_data = await fetch_json(client, "GET", f"{BASE_URL}/analyses/{analysis_id}/status")
        status = status_data["status"]
        if status in {"completed", "failed", "cancelled"}:
            return status_data
        if asyncio.get_event_loop().time() - started > timeout_seconds:
            raise TimeoutError(f"Analysis {analysis_id} did not finish in {timeout_seconds}s")
        await asyncio.sleep(2)


async def wait_matching_persisted(
    session_factory: async_sessionmaker[AsyncSession],
    analysis_id: str,
    job_id: str,
    timeout_seconds: int = 300,
) -> dict[str, Any] | None:
    started = asyncio.get_event_loop().time()
    q = sa.text(
        """
        SELECT id, analysis_id, job_id, match_score::text AS match_score, recommendation, created_at
        FROM resume_job_matches
        WHERE analysis_id = CAST(:analysis_id AS uuid)
          AND job_id = CAST(:job_id AS uuid)
        ORDER BY created_at DESC
        LIMIT 1
        """
    )
    while True:
        async with session_factory() as session:
            row = (await session.execute(q, {"analysis_id": analysis_id, "job_id": job_id})).mappings().first()
            if row:
                return {k: (str(v) if isinstance(v, UUID) else v) for k, v in dict(row).items()}
        if asyncio.get_event_loop().time() - started > timeout_seconds:
            return None
        await asyncio.sleep(2)


async def get_latest_analysis_for_candidate_job(
    session_factory: async_sessionmaker[AsyncSession],
    candidate_id: str,
    job_id: str,
) -> str:
    q = sa.text(
        """
        SELECT a.id
        FROM analyses a
        JOIN resume_versions rv ON rv.id = a.resume_version_id
        JOIN resumes r ON r.id = rv.resume_id
        WHERE r.candidate_id = CAST(:candidate_id AS uuid)
          AND a.job_id = CAST(:job_id AS uuid)
        ORDER BY a.created_at DESC
        LIMIT 1
        """
    )
    deadline = asyncio.get_event_loop().time() + 60
    while True:
        async with session_factory() as session:
            row = (await session.execute(q, {"candidate_id": candidate_id, "job_id": job_id})).first()
            if row:
                return str(row[0])
        if asyncio.get_event_loop().time() > deadline:
            raise RuntimeError("Analysis was not created after linking candidate to job")
        await asyncio.sleep(1)


async def update_resume_extraction(
    session_factory: async_sessionmaker[AsyncSession],
    version_id: str,
    resume_text: str,
) -> None:
    q = sa.text(
        """
        UPDATE resume_versions
        SET extracted_text = :text,
            extraction_status = 'completed'
        WHERE id = CAST(:version_id AS uuid)
        """
    )
    async with session_factory() as session:
        await session.execute(q, {"version_id": version_id, "text": resume_text})
        await session.commit()


async def collect_db_evidence(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: str,
    candidate_ids: list[str],
) -> dict[str, Any]:
    candidate_ids_sql = ", ".join(f"'{cid}'::uuid" for cid in candidate_ids)
    evidence: dict[str, Any] = {}

    async with session_factory() as session:
        analyses_q = sa.text(
            f"""
            SELECT a.id, a.resume_version_id, a.job_id, a.status, a.task_id, a.worker_id,
                   a.started_at, a.completed_at, a.failed_at, a.failure_reason,
                   ar.input_tokens, ar.output_tokens
            FROM analyses a
            LEFT JOIN analysis_results ar ON ar.analysis_id = a.id
            JOIN resume_versions rv ON rv.id = a.resume_version_id
            JOIN resumes r ON r.id = rv.resume_id
            WHERE a.job_id = CAST(:job_id AS uuid)
              AND r.candidate_id IN ({candidate_ids_sql})
            ORDER BY a.created_at
            """
        )
        analyses = (await session.execute(analyses_q, {"job_id": job_id})).mappings().all()
        evidence["analyses"] = [
            {
                k: (str(v) if isinstance(v, UUID) else (v.isoformat() if hasattr(v, "isoformat") and v is not None else v))
                for k, v in dict(row).items()
            }
            for row in analyses
        ]

        matches_q = sa.text(
            f"""
            SELECT rjm.id, rjm.analysis_id, rjm.candidate_id, rjm.job_id,
                   rjm.match_score::text AS match_score, rjm.recommendation,
                   rjm.created_at
            FROM resume_job_matches rjm
            WHERE rjm.job_id = CAST(:job_id AS uuid)
              AND rjm.candidate_id IN ({candidate_ids_sql})
            ORDER BY rjm.created_at DESC
            """
        )
        matches = (await session.execute(matches_q, {"job_id": job_id})).mappings().all()
        evidence["resume_job_matches"] = [
            {
                k: (str(v) if isinstance(v, UUID) else (v.isoformat() if hasattr(v, "isoformat") and v is not None else v))
                for k, v in dict(row).items()
            }
            for row in matches
        ]

        obs_q = sa.text(
            f"""
            SELECT mo.id, mo.analysis_id, mo.candidate_id, mo.job_id, mo.source,
                   mo.observed_at, mo.payload
            FROM matching_observations mo
            WHERE mo.job_id = CAST(:job_id AS uuid)
              AND mo.candidate_id IN ({candidate_ids_sql})
            ORDER BY mo.observed_at DESC
            LIMIT 50
            """
        )
        observations = (await session.execute(obs_q, {"job_id": job_id})).mappings().all()
        evidence["matching_observations"] = [
            {
                k: (str(v) if isinstance(v, UUID) else (v.isoformat() if hasattr(v, "isoformat") and v is not None else v))
                for k, v in dict(row).items()
            }
            for row in observations
        ]

        pipeline_q = sa.text(
            f"""
            SELECT cp.candidate_id, cp.job_id, cp.stage, cp.status, cp.match_score::text AS match_score,
                   cp.entered_at, cp.updated_at
            FROM candidate_pipeline cp
            WHERE cp.job_id = CAST(:job_id AS uuid)
              AND cp.candidate_id IN ({candidate_ids_sql})
            ORDER BY cp.updated_at DESC
            """
        )
        pipelines = (await session.execute(pipeline_q, {"job_id": job_id})).mappings().all()
        evidence["candidate_pipeline"] = [
            {
                k: (str(v) if isinstance(v, UUID) else (v.isoformat() if hasattr(v, "isoformat") and v is not None else v))
                for k, v in dict(row).items()
            }
            for row in pipelines
        ]

        scores_q = sa.text(
            f"""
            SELECT cjs.candidate_id, cjs.job_id, cjs.final_score::text AS final_score,
                   cjs.breakdown, cjs.computed_at
            FROM candidate_job_scores cjs
            WHERE cjs.job_id = CAST(:job_id AS uuid)
              AND cjs.candidate_id IN ({candidate_ids_sql})
            ORDER BY cjs.computed_at DESC
            """
        )
        scores = (await session.execute(scores_q, {"job_id": job_id})).mappings().all()
        evidence["candidate_job_scores"] = [
            {
                k: (str(v) if isinstance(v, UUID) else (v.isoformat() if hasattr(v, "isoformat") and v is not None else v))
                for k, v in dict(row).items()
            }
            for row in scores
        ]

    return evidence


async def main() -> None:
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    out: dict[str, Any] = {
        "phase": "fase_6",
        "started_at": now_iso(),
        "job": {},
        "candidates": [],
        "ranking": None,
        "score_explanations": {},
        "db_evidence": {},
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        login = await fetch_json(
            client,
            "POST",
            f"{BASE_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        token = login["access_token"]
        client.headers.update({"Authorization": f"Bearer {token}"})

        # 1) Create test job
        job = await fetch_json(client, "POST", f"{BASE_URL}/jobs", json=JOB_PAYLOAD)
        job_id = job["id"]
        out["job"] = job

        # 1b) Add structured skills
        skill_bindings: list[dict[str, Any]] = []
        for skill_name, is_mandatory in SKILL_PLAN:
            skill_id = await ensure_skill(client, skill_name)
            payload = {
                "skill_id": skill_id,
                "is_mandatory": is_mandatory,
                "minimum_level": "intermediate" if is_mandatory else None,
                "minimum_years": 3 if is_mandatory and skill_name in {"SQL", "APIs REST", "ERP"} else None,
                "weight": 1.5 if is_mandatory else 1.0,
            }
            added = await fetch_json(client, "POST", f"{BASE_URL}/jobs/{job_id}/skills", json=payload)
            skill_bindings.append(added)
        out["job"]["skills_bound"] = skill_bindings

        # 2) Create and process candidates one by one
        for profile in CANDIDATES:
            suffix = str(uuid4())[:8]
            email = f"fase6.{profile.label}.{suffix}@example.com"

            candidate = await fetch_json(
                client,
                "POST",
                f"{BASE_URL}/candidates",
                json={
                    "full_name": f"{profile.full_name} {suffix}",
                    "email": email,
                    "location_city": "Sao Paulo",
                    "location_state": "SP",
                    "location_country": "BR",
                    "tags": ["fase6", profile.label],
                },
            )
            candidate_id = candidate["id"]

            upload = await fetch_json(
                client,
                "POST",
                f"{BASE_URL}/resumes",
                json={"candidate_id": candidate_id},
            )
            resume_id = upload["resume_id"]
            resume_version_id = upload["version_id"]

            await update_resume_extraction(session_factory, resume_version_id, profile.resume_text)

            link = await fetch_json(
                client,
                "POST",
                f"{BASE_URL}/jobs/{job_id}/candidates",
                json={"candidate_id": candidate_id, "source": "manual"},
            )

            analysis_id = await get_latest_analysis_for_candidate_job(session_factory, candidate_id, job_id)
            analysis_status = await wait_analysis_completion(client, analysis_id)

            matching_row = None
            if analysis_status["status"] == "completed":
                matching_row = await wait_matching_persisted(session_factory, analysis_id, job_id)

            result_data = None
            if analysis_status["status"] == "completed":
                result_data = await fetch_json(client, "GET", f"{BASE_URL}/analyses/{analysis_id}/result")

            pipeline_data = await fetch_json(client, "GET", f"{BASE_URL}/analyses/{analysis_id}/pipeline")
            overview_data = await fetch_json(client, "GET", f"{BASE_URL}/candidates/{candidate_id}/overview")

            out["candidates"].append(
                {
                    "label": profile.label,
                    "expected_score_band": profile.expected,
                    "candidate": candidate,
                    "resume_id": resume_id,
                    "resume_version_id": resume_version_id,
                    "link": link,
                    "analysis_id": analysis_id,
                    "analysis_status": analysis_status,
                    "analysis_result": result_data,
                    "analysis_pipeline": pipeline_data,
                    "matching_row": matching_row,
                    "overview": overview_data,
                }
            )

        # 3) Compute scoring and fetch ranking
        scoring = await fetch_json(client, "POST", f"{BASE_URL}/jobs/{job_id}/scoring")
        ranking = await fetch_json(client, "GET", f"{BASE_URL}/jobs/{job_id}/ranking")
        out["scoring_compute"] = scoring
        out["ranking"] = ranking

        for item in out["candidates"]:
            cid = item["candidate"]["id"]
            explanation = await fetch_json(
                client,
                "GET",
                f"{BASE_URL}/jobs/{job_id}/candidates/{cid}/score-explanation",
            )
            out["score_explanations"][cid] = explanation

    candidate_ids = [c["candidate"]["id"] for c in out["candidates"]]
    out["db_evidence"] = await collect_db_evidence(session_factory, job_id, candidate_ids)
    out["finished_at"] = now_iso()

    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(str(OUT_FILE))

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
