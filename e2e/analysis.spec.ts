import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";

// ─── helpers (PDF, auth token, API job/candidate setup, UI building blocks) ─────

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

async function getStoredAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
  expect(token, "token não encontrado em localStorage após login").toBeTruthy();
  return token as string;
}

async function createPublishedJobViaApi(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<{ id: string; title: string }> {
  const auth = { Authorization: `Bearer ${token}` };

  const createRes = await request.post(`${API_BASE_URL}/api/v1/jobs`, {
    headers: auth,
    data: {
      title,
      description:
        "Vaga criada via E2E para validar a UI de Análises IA. Buscamos desenvolvedor backend em Python com FastAPI, PostgreSQL e testes automatizados.",
      requirements:
        "Experiência sólida com Python, FastAPI e bancos relacionais. Familiaridade com design de APIs REST, testes e versionamento.",
      responsibilities:
        "Construir e manter APIs, escrever testes automatizados, colaborar com o time de produto.",
      seniority_level: "senior",
      work_model: "remote",
      job_area: "Tecnologia",
      minimum_years_experience: 3,
      priority: "normal",
      selection_flow_type: "simple",
      requires_behavioral_assessment: false,
      requires_behavioral_ai_evaluation: false,
      requires_interview: false,
      requires_scorecard: false,
      requires_manager_review: false,
    },
  });
  expect(createRes.ok(), `POST /jobs HTTP ${createRes.status()}`).toBeTruthy();
  const created = (await createRes.json()) as { id: string; title: string };

  for (const skillName of ["Python", "FastAPI"]) {
    const skillRes = await request.post(`${API_BASE_URL}/api/v1/jobs/${created.id}/skills`, {
      headers: auth,
      data: { skill_name: skillName, priority_level: "priority" },
    });
    expect(skillRes.ok(), `POST /jobs/${created.id}/skills HTTP ${skillRes.status()}`).toBeTruthy();
  }

  const publishRes = await request.patch(`${API_BASE_URL}/api/v1/jobs/${created.id}/publish`, {
    headers: auth,
  });
  expect(publishRes.ok(), `PATCH /jobs/${created.id}/publish HTTP ${publishRes.status()}`).toBeTruthy();
  const published = (await publishRes.json()) as { id: string; title: string; status: string };
  expect(published.status).toBe("published");
  return { id: published.id, title: published.title };
}

async function openManualCandidateDialog(page: Page) {
  await page.getByRole("button", { name: "Vincular candidato", exact: true }).first().click();
  await page.getByRole("button", { name: /Criar candidato manualmente/i }).click();
  const dialog = page.getByRole("dialog", { name: "Cadastrar Candidato" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createCandidateInPipeline(
  page: Page,
  candidate: { name: string; email: string },
): Promise<string> {
  const dialog = await openManualCandidateDialog(page);
  await dialog.getByLabel("Nome completo *").fill(candidate.name);
  await dialog.getByLabel("E-mail *").fill(candidate.email);
  await dialog.getByRole("button", { name: "Salvar e adicionar à vaga" }).click();
  await expect(dialog).toBeHidden();

  await expect(page).toHaveURL(/\/candidatos\/[^/?]+/);
  const match = page.url().match(/\/candidatos\/([^/?#]+)/);
  expect(match, "id do candidato não pôde ser extraído da URL").not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

async function uploadResume(page: Page, candidateId: string, candidateName: string, pdf: Buffer) {
  await page.goto(`/candidatos/${candidateId}?tab=documents`);
  await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "analysis-spec.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByRole("button", { name: /Enviar currículo/i }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: /Currículo enviado/i }).last(),
  ).toBeVisible({ timeout: 20_000 });
}

async function waitForExtractedResumeVersion(
  request: APIRequestContext,
  token: string,
  candidateId: string,
): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const deadline = Date.now() + 45_000;
  let lastStatus = "(none)";
  while (Date.now() < deadline) {
    const res = await request.get(`${API_BASE_URL}/api/v1/candidates/${candidateId}/overview`, {
      headers: auth,
    });
    expect(res.ok(), `GET /candidates/${candidateId}/overview HTTP ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as {
      resumes?: Array<{ current_version_id?: string | null; extraction_status?: string | null }>;
    };
    const resume = body.resumes?.[0];
    const versionId = resume?.current_version_id;
    const status = (resume?.extraction_status ?? "").toLowerCase();
    lastStatus = status || "(empty)";
    if (versionId && (status === "completed" || status === "ready" || status === "success")) {
      return versionId;
    }
    if (status === "failed") {
      throw new Error(`extração do currículo falhou (extraction_status=${status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(
    `timeout esperando extraction_status=completed do currículo (último=${lastStatus})`,
  );
}

async function requestAnalysis(
  request: APIRequestContext,
  token: string,
  resumeVersionId: string,
  jobId: string,
): Promise<void> {
  const res = await request.post(`${API_BASE_URL}/api/v1/analyses`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { resume_version_id: resumeVersionId, job_id: jobId, force: "true" },
  });
  expect(res.ok(), `POST /analyses HTTP ${res.status()} body=${await res.text()}`).toBeTruthy();
}

// ─── test ───────────────────────────────────────────────────────────────────────

test("Análises IA lista a análise gerada após upload de currículo", async ({ page, request }) => {
  const suffix = Date.now();
  const jobTitle = `QA Analise Job ${suffix}`;
  const candidateName = `QA Analise Candidate ${suffix}`;
  const candidateEmail = `qa.analise.${suffix}@example.com`;
  const resumeBuffer = buildPdfBuffer(
    [
      "Curriculo Análise E2E",
      `Nome: ${candidateName}`,
      "Resumo: Engenheiro backend com Python, FastAPI e PostgreSQL.",
      "Skills: Python, FastAPI, SQL, API, Backend, testes automatizados.",
      "Experiencia: 6 anos em servicos backend.",
    ].join("\n"),
  );

  // ── setup: garantir uma vaga publicada via API (sem depender do banco) ──
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/pipeline/);
  const apiToken = await getStoredAccessToken(page);
  const job = await createPublishedJobViaApi(request, apiToken, jobTitle);

  // ── cria candidato manual pela Pipeline da vaga ──
  await page.goto(`/pipeline/${job.id}`);
  await expect(page.locator("h2").filter({ hasText: job.title }).first()).toBeVisible();

  const candidateId = await createCandidateInPipeline(page, {
    name: candidateName,
    email: candidateEmail,
  });

  // ── envia currículo (UI) ──
  await uploadResume(page, candidateId, candidateName, resumeBuffer);

  // ── dispara análise via API (a UI exige clique manual em "Gerar análise agora";
  //     usamos o endpoint para tornar o teste determinístico, sem depender de
  //     extração e botão habilitar a tempo) ──
  const resumeVersionId = await waitForExtractedResumeVersion(request, apiToken, candidateId);
  await requestAnalysis(request, apiToken, resumeVersionId, job.id);

  // ── valida que /analises-ia exibe a análise gerada para esse candidato ──
  await test.step("Análises IA mostra a análise do candidato recém-criado", async () => {
    await page.goto("/analises-ia");
    await expect(page.getByRole("heading", { name: "Análises IA" })).toBeVisible();

    await page.getByPlaceholder(/Buscar por candidato/i).fill(candidateName);

    const row = page.getByRole("row").filter({ hasText: candidateName });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(candidateName);
    await expect(row).toContainText(candidateEmail);
    await expect(row).toContainText(
      /Aguardando|Processando|Concluída|Falhou|Retry|Cancelado|Descartada/,
    );
  });

  // ── valida que a página do candidato expõe a aba Score e análise ──
  await test.step("aba Score e análise do candidato é navegável após upload", async () => {
    await page.goto(`/candidatos/${candidateId}?tab=score`);
    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
    await expect(
      page.getByText(/Análise|Score|Compatibilidade|Pontuação/i).first(),
    ).toBeVisible();
  });
});
