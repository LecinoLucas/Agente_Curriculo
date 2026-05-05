import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

const BACKEND_PORT = process.env.PLAYWRIGHT_BACKEND_PORT ?? "8100";
const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? `http://127.0.0.1:${BACKEND_PORT}`;
const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Admin123!";
const BACKEND_DIR = "/Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/backend";
const BACKEND_PYTHON = `${BACKEND_DIR}/.venv/bin/python`;

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfBuffer(text: string): Buffer {
  const lines = text.split("\n").map(escapePdfText);
  const content = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    "14 TL",
    ...lines.flatMap((line, index) => (index === 0 ? [`(${line}) Tj`] : ["T*", `(${line}) Tj`])),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function runPython(code: string, args: string[] = []): string {
  return execFileSync(BACKEND_PYTHON, ["-c", code, ...args], {
    cwd: BACKEND_DIR,
    encoding: "utf8",
  }).trim();
}

async function login(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/pipeline(\/|$)/);
}

async function getAccessToken(page: Parameters<typeof test>[0]["page"]) {
  const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function createPublishedJob(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  title: string,
) {
  const createResponse = await page.request.post(`${API_BASE_URL}/api/v1/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      title,
      description: `Descricao da vaga ${title} para desenvolvedor backend com APIs, Python, FastAPI e PostgreSQL em ambiente de producao.`,
      requirements: "Python, FastAPI, PostgreSQL, desenvolvimento de APIs REST e manutencao de servicos backend.",
      status: "draft",
      job_area: "technology",
      seniority_level: "senior",
      minimum_years_experience: "5",
      responsibilities: "Desenvolver APIs backend, manter servicos de dados e evoluir integracoes entre sistemas.",
      salary_currency: "BRL",
      deal_breakers: [],
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const job = (await createResponse.json()) as { id: string };

  const skillIds = ensureSkillCatalog(["Python", "FastAPI", "PostgreSQL"]);
  for (const [skillName, skillId] of Object.entries(skillIds)) {
    const addSkillResponse = await page.request.post(`${API_BASE_URL}/api/v1/jobs/${job.id}/skills`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        skill_id: skillId,
        is_mandatory: skillName !== "PostgreSQL",
      },
    });
    expect(addSkillResponse.ok()).toBeTruthy();
  }

  const publishResponse = await page.request.patch(`${API_BASE_URL}/api/v1/jobs/${job.id}/publish`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(publishResponse.ok()).toBeTruthy();
  return job;
}

function ensureSkillCatalog(skillNames: string[]) {
  return JSON.parse(
    runPython(
      `
import asyncio
import json
import sqlalchemy as sa
from uuid import uuid4
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.job_model import SkillModel
from src.application.services.skill_text_normalizer import normalize_skill_text

async def main(skill_names_json: str):
    skill_names = json.loads(skill_names_json)
    async with AsyncSessionFactory() as session:
        ids = {}
        for name in skill_names:
            normalized = normalize_skill_text(name)
            skill = await session.scalar(
                sa.select(SkillModel).where(
                    SkillModel.normalized_name == normalized,
                    SkillModel.deleted_at.is_(None),
                ).limit(1)
            )
            if skill is None:
                skill = SkillModel(
                    id=uuid4(),
                    name=name,
                    normalized_name=normalized,
                    aliases=[],
                    is_verified=True,
                )
                session.add(skill)
                await session.flush()
            ids[name] = str(skill.id)
        await session.commit()
        print(json.dumps(ids))

asyncio.run(main(__import__("sys").argv[1]))
`,
      [JSON.stringify(skillNames)],
    ),
  ) as Record<string, string>;
}

async function ensureAnalysisPrerequisites() {
  runPython(`
import asyncio
from uuid import uuid4
import sqlalchemy as sa
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.analysis_model import AIModelModel, PromptTemplateModel
from src.infrastructure.database.models.user_model import UserModel

async def main():
    async with AsyncSessionFactory() as session:
        admin = await session.scalar(
            sa.select(UserModel).where(UserModel.email == "admin@resume.ai").limit(1)
        )
        assert admin is not None

        model = await session.scalar(
            sa.select(AIModelModel).where(AIModelModel.is_active.is_(True)).limit(1)
        )
        if model is None:
            session.add(
                AIModelModel(
                    provider="anthropic",
                    model_id=f"claude-e2e-{uuid4().hex[:8]}",
                    model_name="Claude E2E",
                    is_active=True,
                )
            )

        prompt = await session.scalar(
            sa.select(PromptTemplateModel)
            .where(
                PromptTemplateModel.template_type == "full_analysis",
                PromptTemplateModel.is_active.is_(True),
            )
            .limit(1)
        )
        if prompt is None:
            session.add(
                PromptTemplateModel(
                    name=f"e2e_full_analysis_{uuid4().hex[:8]}",
                    version=1,
                    template_type="full_analysis",
                    system_prompt="Analyze resume against job context and return structured JSON.",
                    user_prompt_template="Resume: {resume_text}\\nJob context: {job_context}",
                    is_active=True,
                    created_by=admin.id,
                )
            )

        await session.commit()

asyncio.run(main())
`);
}

function setAnalysisStatusToProcessing(analysisId: string) {
  runPython(
    `
import asyncio
from datetime import UTC, datetime
from uuid import UUID
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.analysis_model import AnalysisModel

async def main(analysis_id: str):
    async with AsyncSessionFactory() as session:
        analysis = await session.get(AnalysisModel, UUID(analysis_id))
        assert analysis is not None
        analysis.status = "processing"
        analysis.started_at = datetime.now(UTC)
        analysis.updated_at = datetime.now(UTC)
        await session.commit()

asyncio.run(main(__import__("sys").argv[1]))
`,
    [analysisId],
  );
}

function setAnalysisStatusToCompleted(analysisId: string) {
  runPython(
    `
import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4
import sqlalchemy as sa
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel

async def main(analysis_id: str):
    async with AsyncSessionFactory() as session:
        analysis = await session.get(AnalysisModel, UUID(analysis_id))
        assert analysis is not None

        existing = await session.scalar(
            sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis.id).limit(1)
        )
        if existing is None:
            session.add(
                AnalysisResultModel(
                    id=uuid4(),
                    analysis_id=analysis.id,
                    overall_score=Decimal("87.0"),
                    technical_score=Decimal("90.0"),
                    experience_score=Decimal("82.0"),
                    education_score=Decimal("75.0"),
                    communication_score=Decimal("80.0"),
                    leadership_score=Decimal("68.0"),
                    candidate_summary="Perfil backend forte com Python e FastAPI.",
                    seniority_level="senior",
                    highest_education_level="bachelor",
                    total_experience_years=Decimal("6.0"),
                    strengths=["python", "fastapi"],
                    weaknesses=["sem kubernetes explicito"],
                    recommendations=["entrevistar para APIs e arquitetura"],
                    keywords=["python", "fastapi", "sql"],
                    extracted_data={
                        "skills": [
                            {"name": "Python"},
                            {"name": "FastAPI"},
                            {"name": "SQL"},
                        ]
                    },
                    input_tokens=100,
                    output_tokens=200,
                    cache_read_tokens=0,
                    cache_write_tokens=0,
                    processing_time_ms=1234,
                    created_at=datetime.now(UTC),
                )
            )

        analysis.status = "completed"
        analysis.completed_at = datetime.now(UTC)
        analysis.updated_at = datetime.now(UTC)
        await session.commit()

asyncio.run(main(__import__("sys").argv[1]))
`,
    [analysisId],
  );
}

function readCanonicalCounts(candidateEmail: string, jobId: string) {
  return JSON.parse(
    runPython(
      `
import asyncio
import json
import sqlalchemy as sa
from uuid import UUID
from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)

async def main(candidate_email: str, job_id: str):
    async with AsyncSessionFactory() as session:
        candidate = await session.scalar(
            sa.select(CandidateModel).where(CandidateModel.email == candidate_email).limit(1)
        )
        assert candidate is not None

        candidate_profile_count = int((
            await session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateProfileAnalysisModel)
                .where(CandidateProfileAnalysisModel.candidate_id == candidate.id)
            )
        ) or 0)
        job_profile_count = int((
            await session.scalar(
                sa.select(sa.func.count())
                .select_from(JobProfileAnalysisModel)
                .where(JobProfileAnalysisModel.job_id == UUID(job_id))
            )
        ) or 0)
        match_count = int((
            await session.scalar(
                sa.select(sa.func.count())
                .select_from(CandidateJobMatchModel)
                .where(
                    CandidateJobMatchModel.candidate_id == candidate.id,
                    CandidateJobMatchModel.job_id == UUID(job_id),
                )
            )
        ) or 0)

        print(json.dumps({
            "candidate_profile_analysis": candidate_profile_count,
            "job_profile_analysis": job_profile_count,
            "candidate_job_match": match_count,
        }))

asyncio.run(main(__import__("sys").argv[1], __import__("sys").argv[2]))
`,
      [candidateEmail, jobId],
    ),
  ) as {
    candidate_profile_analysis: number;
    job_profile_analysis: number;
    candidate_job_match: number;
  };
}

test("explicit matching happy path does not duplicate candidate_job_match", async ({ page }) => {
  test.slow();

  await ensureAnalysisPrerequisites();
  await login(page);

  const token = await getAccessToken(page);
  const suffix = Date.now();
  const candidateName = `QA Match ${suffix}`;
  const candidateEmail = `qa.match.${suffix}@example.com`;
  const jobTitle = `QA Match Job ${suffix}`;
  const pdfBuffer = buildPdfBuffer(
    [
      "Curriculo QA Match",
      `Nome: ${candidateName}`,
      "Resumo: Desenvolvedor backend com Python, FastAPI e SQL.",
      "Skills: Python, FastAPI, SQL, APIs.",
      "Experiencia: 6 anos com backend.",
    ].join("\n"),
  );

  const job = await createPublishedJob(page, token, jobTitle);
  let matchRequests = 0;

  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/v1\/analyses\/[^/]+\/match\/[^/]+$/.test(request.url())
    ) {
      matchRequests += 1;
    }
  });

  await page.goto(`/pipeline/${job.id}`);
  await expect(page.locator("#pipeline-job-select")).toHaveValue(job.id);

  await page.getByRole("button", { name: "Novo candidato" }).click();
  const modal = page.getByRole("dialog", { name: "Novo candidato" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Nome completo *").fill(candidateName);
  await modal.getByLabel("E-mail *").fill(candidateEmail);
  await modal.getByRole("button", { name: "Criar e adicionar à vaga" }).click();

  const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(candidateName)).toBeVisible();

  await drawer.getByRole("button", { name: "Documentos" }).dispatchEvent("click");
  await drawer.locator('input[type="file"]').setInputFiles({
    name: "qa-match.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await drawer.getByRole("button", { name: "Enviar currículo" }).last().click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Currículo enviado com sucesso" }).last(),
  ).toBeVisible();

  await drawer.getByRole("button", { name: "Análise IA" }).dispatchEvent("click");
  const analysisSelect = drawer.getByRole("combobox").last();
  await analysisSelect.selectOption({ index: 1 });

  const analysisRequestPromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/v1/analyses?"),
  );
  await drawer.getByRole("button", { name: "Iniciar análise da IA" }).click();
  const analysisRequest = await analysisRequestPromise;
  const analysisPayload = (await analysisRequest.json()) as { analysis_id: string };
  const analysisId = analysisPayload.analysis_id;

  await expect(page.getByRole("alert").filter({ hasText: "Análise iniciada" })).toBeVisible();

  setAnalysisStatusToProcessing(analysisId);
  await expect(drawer.getByText("Processando")).toBeVisible({ timeout: 20_000 });

  await page.waitForTimeout(1500);
  setAnalysisStatusToCompleted(analysisId);

  await expect(drawer.locator("p", { hasText: /^Análise concluída$/ })).toBeVisible({
    timeout: 45_000,
  });
  await expect(drawer.getByText("Persistência")).toBeVisible();
  await expect
    .poll(() => matchRequests, {
      timeout: 20_000,
      message: "expected exactly one explicit match request after analysis completion",
    })
    .toBe(1);
  await expect
    .poll(() => readCanonicalCounts(candidateEmail, job.id).candidate_job_match, {
      timeout: 20_000,
      message: "expected canonical candidate_job_match to be persisted once",
    })
    .toBe(1);

  await drawer.getByRole("button", { name: "Score" }).dispatchEvent("click");
  await expect(drawer.getByText("Score da IA", { exact: true })).toBeVisible();

  const firstCounts = readCanonicalCounts(candidateEmail, job.id);
  expect(firstCounts.candidate_profile_analysis).toBe(1);
  expect(firstCounts.job_profile_analysis).toBe(1);
  expect(firstCounts.candidate_job_match).toBe(1);
  expect(matchRequests).toBe(1);

  await drawer.getByRole("button", { name: "Fechar painel" }).click();
  await page.getByText(candidateName, { exact: true }).first().click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Análise IA" }).dispatchEvent("click");
  await page.waitForTimeout(3000);

  const reopenCounts = readCanonicalCounts(candidateEmail, job.id);
  expect(reopenCounts.candidate_job_match).toBe(1);
  expect(matchRequests).toBe(1);

  await page.reload();
  await expect(page.locator("#pipeline-job-select")).toHaveValue(job.id);
  await page.getByText(candidateName, { exact: true }).first().click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Análise IA" }).dispatchEvent("click");
  await page.waitForTimeout(3000);

  const refreshCounts = readCanonicalCounts(candidateEmail, job.id);
  expect(refreshCounts.candidate_job_match).toBe(1);
  expect(matchRequests).toBe(1);
});
