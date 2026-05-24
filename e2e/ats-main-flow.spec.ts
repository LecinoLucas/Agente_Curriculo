import { expect, test, type Page } from "@playwright/test";
import { API_BASE_URL } from "./helpers/api";
import { getStoredAccessToken } from "./helpers/auth";
import { createManualCandidateFromPipeline } from "./helpers/candidates";
import {
  createPublishedJobViaApi,
  updateJobTitleViaApi,
} from "./helpers/jobs";
import { buildPdfBuffer } from "./helpers/pdf";
import {
  selectJobInCombobox,
  waitForActiveJob,
  waitForCandidateCard,
} from "./helpers/pipeline";

const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Smoke123!";

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
  const job = await createPublishedJobViaApi(request, apiToken, {
    title: jobTitle,
    description:
      "Vaga criada via E2E para validar o fluxo ATS. Construir e manter APIs em Python e PostgreSQL, integrando pipelines de CI/CD e testes automatizados.",
    requirements:
      "Experiência sólida com Python, FastAPI e bancos relacionais. Familiaridade com testes automatizados, design de APIs REST e versionamento.",
    responsibilities:
      "Construir APIs, manter serviços, escrever testes automatizados, colaborar com o time de produto.",
  });

  await page.goto(`/pipeline/${job.id}`);
  await waitForActiveJob(page, job.title);

  let candidateId = "";
  await test.step("cria candidato manualmente pelo botão Vincular candidato da Pipeline", async () => {
    candidateId = await createManualCandidateFromPipeline(page, {
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
  const jobA = await createPublishedJobViaApi(request, apiToken, { title: jobATitle });
  const jobB = await createPublishedJobViaApi(request, apiToken, { title: jobBTitle });

  await test.step("cria candidato na vaga A e valida que ele aparece apenas nela", async () => {
    await page.goto(`/pipeline/${jobA.id}`);
    await waitForActiveJob(page, jobA.title);

    await createManualCandidateFromPipeline(page, { name: candidateName, email: candidateEmail });

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
