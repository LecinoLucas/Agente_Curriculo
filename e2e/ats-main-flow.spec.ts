import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";
const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Admin123!";

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

async function login(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
  await page.getByLabel("Senha").fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/pipeline(\/|$)/);
  await expect(page.getByRole("button", { name: "Novo candidato" })).toBeVisible();
}

async function getAccessToken(page: Parameters<typeof test>[0]["page"]) {
  const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function createJobViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  title: string,
  dealBreakers: Record<string, unknown>[],
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      title,
      description: `Descricao da vaga ${title}`,
      requirements: "Python, FastAPI, PostgreSQL",
      status: "published",
      salary_currency: "BRL",
      deal_breakers: dealBreakers,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
}

async function createCandidateViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  payload: {
    full_name: string;
    email: string;
    location_city?: string;
    location_state?: string;
    location_country?: string;
  },
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/candidates`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      full_name: payload.full_name,
      email: payload.email,
      location_city: payload.location_city ?? "São Paulo",
      location_state: payload.location_state ?? "SP",
      location_country: payload.location_country ?? "Brasil",
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
}

async function addCandidateToJobViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  candidateId: string,
  jobId: string,
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/pipeline/${candidateId}/add-to-job`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      job_id: jobId,
      initial_stage: "entry",
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function createPublishedJobViaUi(
  page: Parameters<typeof test>[0]["page"],
  title: string,
) {
  await page.getByRole("button", { name: "Nova vaga" }).click();
  const dialog = page.getByRole("dialog", { name: "Criar vaga" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Título *").fill(title);
  await dialog.getByLabel("Descrição *").fill(`Descricao da vaga ${title}`);
  await dialog.getByLabel("Requisitos").fill("Python, FastAPI, PostgreSQL");
  await dialog.getByRole("button", { name: "Criar vaga" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: new RegExp(`Ações de ${title}`) }).click();
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(row.getByText("Publicada")).toBeVisible();

  return row;
}

async function waitForUploadGuidance(page: Parameters<typeof test>[0]["page"]) {
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Currículo enviado com sucesso" })
    .last();

  await expect(alert).toBeVisible();
  return (await page.getByRole("alert").filter({ hasText: "Análise iniciada" }).count()) > 0
    ? "automatic"
    : "manual";
}

async function waitForCandidateCard(page: Parameters<typeof test>[0]["page"], candidateName: string) {
  const refreshButton = page.getByRole("button", { name: "Atualizar" }).first();
  const card = page.locator("div").filter({ hasText: new RegExp(candidateName) }).filter({
    hasText: /Status da IA|Concluída|Processando|Na fila|Falhou|Cancelada|Sem status/,
  }).first();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await card.isVisible()) return card;
    await refreshButton.click();
    await page.waitForTimeout(1500);
  }

  throw new Error(`Card do candidato "${candidateName}" não apareceu no kanban.`);
}

async function waitForActiveJob(page: Parameters<typeof test>[0]["page"], jobTitle: string) {
  await expect(page.locator("#pipeline-job-select")).toHaveValue(/.+/);
  await expect(page.locator("h2").filter({ hasText: jobTitle }).first()).toBeVisible();
}

test("fluxo principal do ATS com IA fica validado no navegador", async ({ page }) => {
  const candidateName = `QA E2E ${Date.now()}`;
  const candidateEmail = `qa.e2e.${Date.now()}@example.com`;
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

  await test.step("cria candidato e abre o drawer", async () => {
    await page.getByRole("button", { name: "Novo candidato" }).click();
    await expect(page.getByRole("dialog", { name: "Novo candidato" })).toBeVisible();
    await page.getByLabel("Nome completo *").fill(candidateName);
    await page.getByLabel("E-mail").fill(candidateEmail);
    await page.getByRole("button", { name: "Criar e abrir perfil" }).click();

    const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(candidateName)).toBeVisible();
  });

  await test.step("envia currículo e recebe orientação clara sobre a análise", async () => {
    const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
    await drawer.getByRole("button", { name: "Documentos" }).click();
    await expect(drawer.getByRole("button", { name: "Enviar currículo" }).last()).toBeVisible();

    await drawer.locator('input[type="file"]').setInputFiles({
      name: "backend-profile.pdf",
      mimeType: "application/pdf",
      buffer: resumeBuffer,
    });
    await drawer.getByRole("button", { name: "Enviar currículo" }).last().click();

    const guidance = await waitForUploadGuidance(page);

    await expect(drawer.getByRole("button", { name: "Análise IA" })).toBeVisible();
    await expect(drawer.getByText(/Análise (em processamento|concluída|ainda não solicitada|na fila)/)).toBeVisible();

    if (guidance === "manual") {
      const analysisSelect = drawer.getByRole("combobox").last();
      await analysisSelect.selectOption({ index: 1 });
      await drawer.getByRole("button", { name: "Iniciar análise da IA" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Análise iniciada" })).toBeVisible();
    }

    await expect(drawer.locator("p", { hasText: /^Análise concluída$/ })).toBeVisible({ timeout: 45_000 });
    await expect(drawer.getByText("Rastreabilidade da execução")).toBeVisible();
    await expect(drawer.getByText(/Usou IA real/)).toBeVisible();
    await drawer.getByRole("button", { name: "Score" }).click();
    await expect(drawer.getByText("Score da IA", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Ranking da vaga", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Fechar painel" }).click();
  });

  await test.step("o card do kanban mostra o status real da IA", async () => {
    const card = await waitForCandidateCard(page, candidateName);
    await expect(card).toContainText("Concluída");
    await expect(card).toContainText("Compatibilidade");
  });

  await test.step("o ranking persistido da vaga aparece ao recalcular scoring", async () => {
    const token = await getAccessToken(page);

    const jobId = page.url().split("/").pop();
    expect(jobId).toBeTruthy();

    const scoringResponse = await page.request.post(`${API_BASE_URL}/api/v1/jobs/${jobId}/scoring`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(scoringResponse.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByText("Ranking da vaga", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(candidateName) })).toBeVisible();
  });

  await test.step("mover etapa pelo drawer grava histórico real", async () => {
    await page.getByText(candidateName, { exact: true }).first().click();
    const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: "Ações" }).click();
    await drawer.getByRole("combobox").first().selectOption("screening");
    await drawer.getByRole("button", { name: "Salvar etapa" }).click();
    await page.waitForTimeout(1500);

    await drawer.getByRole("button", { name: "Ver histórico", exact: true }).click();
    await expect(drawer.getByText("Histórico real do pipeline")).toBeVisible();
    await expect(drawer.getByText("Recebido → Triagem")).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText("Movido manualmente").first()).toBeVisible();
  });
});

test("ranking destaca candidatos rejeitados por deal-breaker", async ({ page }) => {
  const suffix = Date.now();
  const jobTitle = `QA Deal Breaker ${suffix}`;
  const candidateName = `QA Deal Breaker Candidate ${suffix}`;
  const candidateEmail = `qa.deal.breaker.${suffix}@example.com`;

  await login(page);
  const token = await getAccessToken(page);

  const job = await createJobViaApi(page, token, jobTitle, [
    {
      field: "location",
      operator: "equals",
      value: "São Paulo",
      reason: "A vaga exige atuação presencial em São Paulo.",
      is_active: true,
    },
  ]);
  const candidate = await createCandidateViaApi(page, token, {
    full_name: candidateName,
    email: candidateEmail,
    location_city: "Rio de Janeiro",
    location_state: "RJ",
    location_country: "Brasil",
  });
  await addCandidateToJobViaApi(page, token, candidate.id, job.id);

  const mockedRanking = {
    job_id: job.id,
    total_candidates: 1,
    threshold_high: 70,
    threshold_low: 45,
    score_version: "v1",
    candidates: [
      {
        rank: 1,
        candidate_id: candidate.id,
        candidate_name: candidateName,
        stage: "entry",
        pipeline_status: "active",
        score_breakdown: {
          skill_match_score: 0,
          experience_match_score: 0,
          seniority_match_score: 0,
          education_score: 0,
          ai_confidence_score: 0,
          penalty_score: 0,
          final_score: 0,
        },
        final_score: 0,
        decision_suggestion: "rejected_suggested",
        reason_codes: [
          {
            type: "deal_breaker",
            field: "location",
            impact: -100,
            description: "Localização incompatível com a vaga",
          },
        ],
        explanation_text: "Score zerado por regra eliminatória da vaga.",
        entered_at: null,
        computed_at: new Date().toISOString(),
        version: "v1",
      },
    ],
  };

  await page.route(`**/api/v1/jobs/${job.id}/ranking`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockedRanking),
    });
  });

  await page.goto(`/pipeline/${job.id}`);
  await waitForActiveJob(page, jobTitle);
  await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();

  const card = await waitForCandidateCard(page, candidateName);
  await card.click();

  const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Score" }).click();

  const rankingPanel = page.locator("#pipeline-ranking-panel");
  await expect(rankingPanel.getByText("Critério eliminatório", { exact: true })).toBeVisible();
  await expect(rankingPanel.getByText("Rejeitado por regra da vaga")).toBeVisible();
  await expect(rankingPanel.getByText(/Localização: esperado São Paulo/i)).toBeVisible();
  await expect(rankingPanel.getByText("A vaga exige atuação presencial em São Paulo.")).toBeVisible();

  await expect(drawer.getByRole("heading", { name: "Critérios eliminatórios violados" })).toBeVisible();
  await expect(drawer.getByText("Localização")).toBeVisible();
  await expect(drawer.getByText("Esperado")).toBeVisible();
  await expect(drawer.getByText("Encontrado")).toBeVisible();
  await expect(drawer.getByText("São Paulo")).toBeVisible();
  await expect(drawer.getByText(/Rio de Janeiro/i)).toBeVisible();
  await expect(drawer.getByText("A vaga exige atuação presencial em São Paulo.")).toBeVisible();
  await expect(drawer.getByText("O score foi zerado porque a regra da vaga não foi atendida.")).toBeVisible();
  await expect(drawer.getByText("Critério eliminatório", { exact: true })).toBeVisible();
});

test("editar vaga nao mistura candidatos entre vagas no pipeline", async ({ page }) => {
  const suffix = Date.now();
  const jobATitle = `QA Cache Job A ${suffix}`;
  const jobBTitle = `QA Cache Job B ${suffix}`;
  const updatedJobATitle = `${jobATitle} Updated`;
  const candidateName = `QA Cache Candidate ${suffix}`;
  const candidateEmail = `qa.cache.${suffix}@example.com`;

  await login(page);
  await page.getByRole("link", { name: /Vagas/i }).click();
  await expect(page).toHaveURL(/\/vagas$/);
  const jobARow = await createPublishedJobViaUi(page, jobATitle);
  await createPublishedJobViaUi(page, jobBTitle);

  await test.step("cria candidato na vaga A e valida exibicao apenas nela", async () => {
    await jobARow.getByRole("button", { name: "Abrir pipeline" }).click();
    await expect(page).toHaveURL(/\/pipeline\/.+$/);
    await waitForActiveJob(page, jobATitle);

    await page.getByRole("button", { name: "Novo candidato" }).click();
    await page.getByLabel("Nome completo *").fill(candidateName);
    await page.getByLabel("E-mail").fill(candidateEmail);
    await page.getByRole("button", { name: "Criar e abrir perfil" }).click();
    await page.getByRole("button", { name: "Fechar painel" }).click();

    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();

    await page.locator("#pipeline-job-select").selectOption({ label: jobBTitle });
    await waitForActiveJob(page, jobBTitle);
    await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
  });

  await test.step("edita a vaga A e mantem o pipeline consistente", async () => {
    await page.getByRole("link", { name: /Vagas/i }).click();
    await expect(page).toHaveURL(/\/vagas$/);
    await page.getByRole("button", { name: new RegExp(`Ações de ${jobATitle}`) }).click();
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Título *").fill(updatedJobATitle);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText(updatedJobATitle, { exact: true })).toBeVisible();

    const updatedJobARow = page.getByRole("row").filter({ hasText: updatedJobATitle });
    await updatedJobARow.getByRole("button", { name: "Abrir pipeline" }).click();
    await expect(page.getByText(updatedJobATitle, { exact: true })).toBeVisible();
    await waitForActiveJob(page, updatedJobATitle);
    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();

    await page.locator("#pipeline-job-select").selectOption({ label: jobBTitle });
    await waitForActiveJob(page, jobBTitle);
    await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);

    await page.locator("#pipeline-job-select").selectOption({ label: updatedJobATitle });
    await waitForActiveJob(page, updatedJobATitle);
    await expect(await waitForCandidateCard(page, candidateName)).toBeVisible();
  });
});
