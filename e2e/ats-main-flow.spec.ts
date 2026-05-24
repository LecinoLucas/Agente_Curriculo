import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";
const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Smoke123!";

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

async function login(page: Page) {
  await page.goto("/pipeline");
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar no painel" }).click();
  }
  await expect(page).toHaveURL(/\/pipeline(\/|$)/);
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
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
        "Vaga criada via E2E para validar o fluxo ATS. Construir e manter APIs em Python e PostgreSQL, integrando pipelines de CI/CD e testes automatizados.",
      requirements:
        "Experiência sólida com Python, FastAPI e bancos relacionais. Familiaridade com testes automatizados, design de APIs REST e versionamento.",
      responsibilities:
        "Construir APIs, manter serviços, escrever testes automatizados, colaborar com o time de produto.",
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

async function updateJobTitleViaApi(
  request: APIRequestContext,
  token: string,
  jobId: string,
  newTitle: string,
): Promise<void> {
  const res = await request.patch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: newTitle },
  });
  expect(res.ok(), `PATCH /jobs/${jobId} HTTP ${res.status()}`).toBeTruthy();
}

async function selectJobInCombobox(page: Page, jobTitle: string) {
  await page.getByRole("button", { name: "Buscar vaga" }).click();
  await page.getByRole("option", { name: new RegExp(jobTitle) }).click();
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
  await expect(page.getByRole("heading", { name: candidate.name })).toBeVisible();

  const match = page.url().match(/\/candidatos\/([^/?#]+)/);
  expect(match, "id do candidato não pôde ser extraído da URL").not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

async function waitForActiveJob(page: Page, jobTitle: string) {
  await expect(page.locator("h2").filter({ hasText: jobTitle }).first()).toBeVisible();
}

async function waitForCandidateCard(page: Page, candidateName: string) {
  const card = page.locator('[data-testid^="kanban-card-"]').filter({ hasText: candidateName }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

test("fluxo principal do ATS com IA fica validado no navegador", async ({ page, request }) => {
  const suffix = Date.now();
  const jobTitle = `QA ATS Job ${suffix}`;
  const candidateName = `QA E2E ${suffix}`;
  const candidateEmail = `qa.e2e.${suffix}@example.com`;
  const resumeBuffer = buildPdfBuffer(
    [
      "Curriculo de teste ATS com IA",
      "Nome: QA E2E",
      "Resumo: Desenvolvedor backend com Python, SQL, APIs e FastAPI.",
      "Skills: Python, SQL, API, Backend, PostgreSQL, testes automatizados.",
      "Experiencia: 6 anos com servicos backend e integrações.",
    ].join("\n"),
  );

  await login(page);
  const apiToken = await getStoredAccessToken(page);
  const job = await createPublishedJobViaApi(request, apiToken, jobTitle);

  await page.goto(`/pipeline/${job.id}`);
  await waitForActiveJob(page, job.title);

  let candidateId = "";
  await test.step("cria candidato manualmente pelo botão Vincular candidato da Pipeline", async () => {
    candidateId = await createCandidateInPipeline(page, {
      name: candidateName,
      email: candidateEmail,
    });
  });

  await test.step("envia currículo na aba Currículo e documentos", async () => {
    await page.goto(`/candidatos/${candidateId}?tab=documents`);
    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "backend-profile.pdf",
      mimeType: "application/pdf",
      buffer: resumeBuffer,
    });
    await page.getByRole("button", { name: /Enviar currículo/i }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /Currículo enviado/i }).last(),
    ).toBeVisible({ timeout: 20_000 });
  });

  await test.step("aba Score e análise reflete que existe um currículo associado", async () => {
    await page.goto(`/candidatos/${candidateId}?tab=score`);
    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
    await expect(
      page.getByText(/Análise|Score|IA|Compatibilidade|Pontuação/i).first(),
    ).toBeVisible();
  });

  await test.step("o card do candidato aparece no kanban da vaga", async () => {
    await page.goto(`/pipeline/${job.id}`);
    await waitForActiveJob(page, job.title);
    const card = await waitForCandidateCard(page, candidateName);
    await expect(card).toContainText(candidateName);
  });

  await test.step("scoring recalculado pela API responde sucesso para a vaga", async () => {
    const scoringResponse = await request.post(`${API_BASE_URL}/api/v1/jobs/${job.id}/scoring`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(
      scoringResponse.ok(),
      `POST /jobs/${job.id}/scoring HTTP ${scoringResponse.status()}`,
    ).toBeTruthy();

    await page.reload();
    await waitForActiveJob(page, job.title);
    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();
  });

  await test.step("mover etapa pela aba Ações grava entrada no Histórico", async () => {
    await page.goto(`/candidatos/${candidateId}?tab=workflow`);
    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
    await page.getByLabel("Mover etapa").selectOption("screening");
    await page.getByRole("button", { name: "Mover etapa", exact: true }).last().click();

    await page.goto(`/candidatos/${candidateId}?tab=history`);
    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
    await expect(page.getByText(/Triagem/).first()).toBeVisible({ timeout: 15_000 });
  });
});

test("editar vaga nao mistura candidatos entre vagas no pipeline", async ({ page, request }) => {
  const suffix = Date.now();
  const jobATitle = `QA Cache Job A ${suffix}`;
  const jobBTitle = `QA Cache Job B ${suffix}`;
  const updatedJobATitle = `${jobATitle} Updated`;
  const candidateName = `QA Cache Candidate ${suffix}`;
  const candidateEmail = `qa.cache.${suffix}@example.com`;

  await login(page);
  const apiToken = await getStoredAccessToken(page);
  const jobA = await createPublishedJobViaApi(request, apiToken, jobATitle);
  const jobB = await createPublishedJobViaApi(request, apiToken, jobBTitle);

  await test.step("cria candidato na vaga A e valida que ele aparece apenas nela", async () => {
    await page.goto(`/pipeline/${jobA.id}`);
    await waitForActiveJob(page, jobA.title);

    await createCandidateInPipeline(page, { name: candidateName, email: candidateEmail });

    await page.goto(`/pipeline/${jobA.id}`);
    await waitForActiveJob(page, jobA.title);
    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();

    await selectJobInCombobox(page, jobB.title);
    await waitForActiveJob(page, jobB.title);
    await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
  });

  await test.step("renomear a vaga A não migra o candidato para outra vaga", async () => {
    await updateJobTitleViaApi(request, apiToken, jobA.id, updatedJobATitle);

    await page.goto(`/pipeline/${jobA.id}`);
    await waitForActiveJob(page, updatedJobATitle);
    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();

    await selectJobInCombobox(page, jobB.title);
    await waitForActiveJob(page, jobB.title);
    await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);

    await selectJobInCombobox(page, updatedJobATitle);
    await waitForActiveJob(page, updatedJobATitle);
    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();
  });
});
