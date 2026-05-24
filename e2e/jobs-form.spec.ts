import { expect, test, type Page } from "@playwright/test";

async function fillBasicStep(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: "Dados básicos" })).toBeVisible();

  await page.getByLabel("Título da vaga *").fill(title);
  await page.getByLabel("Área *").selectOption({ label: "Tecnologia" });
  await page.getByLabel("Senioridade *").selectOption("senior");
  await page
    .getByLabel("Descrição curta *")
    .fill(
      "Vaga criada pelo E2E do formulário multi-step. Buscamos pessoa para construir e manter APIs em Python, integrar bancos PostgreSQL, e cuidar de pipelines de CI/CD em ambiente colaborativo.",
    );
}

async function fillRequirementsStep(page: Page) {
  await expect(page.getByRole("heading", { name: "Requisitos mínimos" })).toBeVisible();

  await page.getByLabel("Anos mínimos de experiência *").fill("3");
  await page.getByLabel("Modelo de trabalho").selectOption("remote");
  await page
    .getByLabel("Requisitos", { exact: true })
    .fill(
      "Experiência sólida com Python, FastAPI e bancos relacionais. Familiaridade com testes automatizados, design de APIs REST e versionamento Git.",
    );
  await page
    .getByLabel("Responsabilidades")
    .fill(
      "Construir e manter APIs, escrever testes automatizados, revisar PRs do time e colaborar no roadmap técnico.",
    );
}

async function addPrioritySkill(page: Page, skillName: string) {
  const searchInput = page.getByLabel("Buscar skill");
  await searchInput.fill(skillName);

  const matchingCard = page
    .locator("div")
    .filter({ has: page.getByText(skillName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Essencial" }) })
    .first();
  await expect(matchingCard).toBeVisible({ timeout: 10_000 });
  await matchingCard.getByRole("button", { name: "Essencial" }).click();

  await expect(searchInput).toBeVisible();
  await searchInput.fill("");
}

async function gotoStep(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("button", { name: new RegExp(escaped) }).first().click();
}

// Clica "Salvar rascunho" e aguarda a resposta do backend, em vez de depender
// do toast "Rascunho salvo com sucesso". O toast é UI transitória (auto-dismiss
// em ~3–5s) e sob carga o polling do Playwright pode perder a janela —
// causando flake sem que o salvamento tenha realmente falhado.
//
// O botão dispara POST /api/v1/jobs (1ª vez, vaga nova) ou PATCH /api/v1/jobs/{id}
// (subsequentes). O regex casa as duas formas mas exclui sub-rotas como
// /skills, /publish, /pause etc. (que têm um segmento extra após o ID).
async function clickSaveDraftAndExpectOk(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => {
        const url = new URL(res.url()).pathname;
        const isJobRoute = /^\/api\/v1\/jobs(\/[^/]+)?$/.test(url);
        const method = res.request().method();
        return isJobRoute && (method === "POST" || method === "PATCH");
      },
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Salvar rascunho" }).click(),
  ]);
  expect(
    response.ok(),
    `Salvar rascunho ${response.request().method()} ${response.url()} -> HTTP ${response.status()}`,
  ).toBeTruthy();
  return response;
}

async function clickPublishAndExpectOk(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        /\/api\/v1\/jobs\/[^/]+\/publish(\?|$)/.test(res.url()) &&
        res.request().method() === "PATCH",
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Publicar" }).click(),
  ]);
  expect(
    response.ok(),
    `Publicar PATCH ${response.url()} -> HTTP ${response.status()}`,
  ).toBeTruthy();
  return response;
}

test("formulário multi-step de vaga cria, valida e publica uma vaga", async ({ page }) => {
  const jobTitle = `E2E Vaga Multi-step ${Date.now()}`;

  await page.goto("/vagas/nova");
  await expect(page.getByRole("heading", { name: "Nova vaga" })).toBeVisible();

  await test.step("step Dados básicos: preenche campos obrigatórios", async () => {
    await fillBasicStep(page, jobTitle);
  });

  await test.step("step Requisitos mínimos: preenche anos, requisitos e responsabilidades", async () => {
    await gotoStep(page, "Requisitos mínimos");
    await fillRequirementsStep(page);
  });

  await test.step("salvar rascunho persiste a vaga e expõe status Rascunho", async () => {
    // Prova persistente: HTTP 2xx do backend + navegação para /editar +
    // badge "Rascunho" visível. Toast removido como assert (era a única
    // fonte de flake: auto-dismiss antes do polling capturar).
    await clickSaveDraftAndExpectOk(page);
    await expect(page).toHaveURL(/\/vagas\/[^/]+\/editar/);
    await expect(page.getByText("Rascunho", { exact: true }).first()).toBeVisible();
  });

  await test.step("step Essenciais: adiciona 2 skills priority para o gate de publicação", async () => {
    await gotoStep(page, "Essenciais");
    await addPrioritySkill(page, "Python");
    await addPrioritySkill(page, "SQL");
  });

  await test.step("step Fluxo de avaliação: marca fluxo Simples e zera gates obrigatórios", async () => {
    await gotoStep(page, "Fluxo de avaliação");
    await expect(page.getByText("Tipo de fluxo de seleção")).toBeVisible();
    await page.getByRole("button", { name: /^Simples/ }).click();

    for (const gate of [
      "Avaliação comportamental obrigatória",
      "IA comportamental obrigatória",
      "Entrevista obrigatória",
      "Scorecard obrigatório",
      "Revisão do gestor obrigatória",
    ]) {
      const checkbox = page.getByLabel(gate);
      await expect(checkbox).not.toBeChecked();
    }
  });

  await test.step("publica a vaga e valida o status Publicada", async () => {
    // Mesma estratégia: aguardar a resposta do PATCH /publish e checar o
    // badge "Publicada" — efeito persistente, não o toast transitório.
    await clickPublishAndExpectOk(page);
    await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();
  });

  await test.step("vaga publicada aparece em /vagas", async () => {
    await page.goto("/vagas");
    await expect(page.getByRole("row").filter({ hasText: jobTitle }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
