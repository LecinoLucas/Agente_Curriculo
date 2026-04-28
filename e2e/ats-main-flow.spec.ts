import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";

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
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/pipeline(\/|$)/);
  await expect(page.getByRole("button", { name: "Novo candidato" })).toBeVisible();
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
    await expect(drawer.getByRole("button", { name: "Enviar currículo" })).toBeVisible();

    await drawer.locator('input[type="file"]').setInputFiles({
      name: "backend-profile.pdf",
      mimeType: "application/pdf",
      buffer: resumeBuffer,
    });
    await drawer.getByRole("button", { name: "Enviar" }).click();

    const guidance = await waitForUploadGuidance(page);

    await expect(drawer.getByRole("button", { name: "Análise IA" })).toBeVisible();
    await expect(drawer.getByText(/Análise (em processamento|concluída|ainda não solicitada|na fila)/)).toBeVisible();

    if (guidance === "manual") {
      const analysisSelect = drawer.getByRole("combobox").last();
      await analysisSelect.selectOption({ index: 1 });
      await drawer.getByRole("button", { name: "Iniciar análise da IA" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Análise iniciada" })).toBeVisible();
    }

    await expect(drawer.getByText("Análise concluída")).toBeVisible({ timeout: 45_000 });
    await expect(drawer.getByText("Rastreabilidade da execução")).toBeVisible();
    await expect(drawer.getByText(/Usou IA real/)).toBeVisible();
    await expect(drawer.getByText("Score da IA (análise do currículo)", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Fechar painel" }).click();
  });

  await test.step("o card do kanban mostra o status real da IA", async () => {
    const card = await waitForCandidateCard(page, candidateName);
    await expect(card).toContainText("Concluída");
    await expect(card).toContainText("Compatibilidade");
  });

  await test.step("o ranking persistido da vaga aparece ao recalcular scoring", async () => {
    const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
    expect(token).toBeTruthy();

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

    await drawer.locator("select").first().selectOption("screening");
    await page.waitForTimeout(1500);

    await drawer.getByRole("button", { name: "Histórico do pipeline" }).click();
    await expect(drawer.getByText("Histórico real do pipeline")).toBeVisible();
    await expect(drawer.getByText("Recebido → Triagem")).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText("Movido manualmente")).toBeVisible();
  });
});
