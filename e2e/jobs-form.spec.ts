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
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Rascunho salvo com sucesso/i }).last(),
    ).toBeVisible({ timeout: 20_000 });
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

    // Persiste antes de publicar para que o cache de qualidade no front
    // reflita os gates zerados (evita stale `jobQuality` no handlePublish).
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Rascunho salvo com sucesso/i }).last(),
    ).toBeVisible({ timeout: 20_000 });
  });

  await test.step("publica a vaga e valida o status Publicada", async () => {
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /Vaga publicada com sucesso/i }).last(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();
  });

  await test.step("vaga publicada aparece em /vagas", async () => {
    await page.goto("/vagas");
    await expect(page.getByRole("row").filter({ hasText: jobTitle }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
