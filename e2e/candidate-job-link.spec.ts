import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";
const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Admin123!";

async function login(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
  await page.getByLabel("Senha").fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/pipeline(\/|$)/);
}

async function getToken(page: Parameters<typeof test>[0]["page"]) {
  const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function createJobViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  title: string,
  status: "draft" | "published" | "paused",
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      title,
      description: `Descricao da vaga ${title}`,
      requirements: "Python, FastAPI, PostgreSQL",
      status,
      salary_currency: "BRL",
      deal_breakers: [],
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
}

async function createCandidateViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  name: string,
  email: string,
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/candidates`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      full_name: name,
      email,
      location_city: "São Paulo",
      location_state: "SP",
      location_country: "Brasil",
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
}

async function createCandidateViaModal(page: Parameters<typeof test>[0]["page"], name: string, email: string) {
  await page.getByRole("button", { name: "Novo candidato" }).click();
  const modal = page.getByRole("dialog", { name: "Novo candidato" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Nome completo *").fill(name);
  await modal.getByLabel("E-mail *").fill(email);
  return modal;
}

async function searchCandidate(page: Parameters<typeof test>[0]["page"], name: string) {
  await page.getByPlaceholder("Buscar por nome ou e-mail…").fill(name);
  const row = page.getByRole("row").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  return row;
}

test("create_candidate_without_job", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Sem Vaga ${suffix}`;
  const candidateEmail = `qa.sem.vaga.${suffix}@example.com`;
  const publishedJobTitle = `QA Pipeline Check ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const job = await createJobViaApi(page, token, publishedJobTitle, "published");

  await page.goto("/candidatos");
  const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  await expect(modal.getByText("Sem vaga selecionada")).toBeVisible();
  await modal.getByRole("button", { name: "Criar candidato sem vaga" }).click();

  const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText(candidateName);
  await expect(drawer.getByText("Não vinculado à vaga ativa", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Fechar painel" }).click();

  await page.goto("/candidatos");
  const row = await searchCandidate(page, candidateName);
  await expect(row).toContainText("Sem vínculo");
  await expect(row).toContainText("—");

  await page.goto(`/pipeline/${job.id}`);
  await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
});

test("create_candidate_with_job", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Com Vaga ${suffix}`;
  const candidateEmail = `qa.com.vaga.${suffix}@example.com`;
  const jobTitle = `QA Job Publicada ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const job = await createJobViaApi(page, token, jobTitle, "published");

  await page.goto(`/pipeline/${job.id}`);
  await expect(page.locator("#pipeline-job-select")).toHaveValue(job.id);

  const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  await expect(modal).toContainText(jobTitle);
  await modal.getByRole("button", { name: "Criar e adicionar à vaga" }).click();

  const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(jobTitle, { exact: true })).toBeVisible();
  await expect(drawer.getByText("Vinculado à vaga ativa", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Ações" }).click();
  await expect(drawer.getByRole("button", { name: "Adicionar a outra vaga" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Transferir/corrigir vaga" })).toBeVisible();
  await drawer.getByRole("button", { name: "Fechar painel" }).click();

  await expect(page.getByText(candidateName, { exact: true })).toBeVisible();

  await page.goto("/candidatos");
  const row = await searchCandidate(page, candidateName);
  await expect(row).toContainText("Vinculado");
  await expect(row).toContainText("1 vaga");
});

test("create_candidate_with_invalid_job", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Vaga Invalida ${suffix}`;
  const candidateEmail = `qa.vaga.invalida.${suffix}@example.com`;
  const draftJobTitle = `QA Job Rascunho ${suffix}`;

  await login(page);
  const token = await getToken(page);
  await createJobViaApi(page, token, draftJobTitle, "draft");

  await page.goto("/candidatos");
  const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  await modal.getByLabel("Vaga (opcional)").selectOption({ label: `${draftJobTitle} - Rascunho` });
  await expect(modal.getByText("Para vincular, a vaga precisa estar publicada ou pausada.")).toBeVisible();
  await modal.getByRole("button", { name: "Criar e adicionar à vaga" }).click();

  await expect(modal.getByText("A vaga selecionada não pode receber novos candidatos.")).toBeVisible();
  await expect(modal.getByText("Escolha uma vaga publicada ou pausada, ou limpe o campo para criar sem vínculo.")).toBeVisible();

  await page.goto("/candidatos");
  await expect(page.getByRole("row").filter({ hasText: candidateName })).toHaveCount(0);
});

test("verify_linked_job_count", async ({ page }) => {
  const suffix = Date.now();
  const noLinkName = `QA Count Zero ${suffix}`;
  const oneLinkName = `QA Count One ${suffix}`;
  const multiLinkName = `QA Count Multi ${suffix}`;
  const noLinkEmail = `qa.count.zero.${suffix}@example.com`;
  const oneLinkEmail = `qa.count.one.${suffix}@example.com`;
  const multiLinkEmail = `qa.count.multi.${suffix}@example.com`;
  const jobAName = `QA Count Job A ${suffix}`;
  const jobBName = `QA Count Job B ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const jobA = await createJobViaApi(page, token, jobAName, "published");
  const jobB = await createJobViaApi(page, token, jobBName, "published");
  await createCandidateViaApi(page, token, noLinkName, noLinkEmail);
  const oneLinkCandidate = await createCandidateViaApi(page, token, oneLinkName, oneLinkEmail);
  const multiLinkCandidate = await createCandidateViaApi(page, token, multiLinkName, multiLinkEmail);

  const oneLinkResponse = await page.request.post(
    `${API_BASE_URL}/api/v1/pipeline/${oneLinkCandidate.id}/add-to-job`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        job_id: jobA.id,
        initial_stage: "entry",
      },
    },
  );
  expect(oneLinkResponse.ok()).toBeTruthy();

  const multiLinkFirstResponse = await page.request.post(
    `${API_BASE_URL}/api/v1/pipeline/${multiLinkCandidate.id}/add-to-job`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        job_id: jobA.id,
        initial_stage: "entry",
      },
    },
  );
  expect(multiLinkFirstResponse.ok()).toBeTruthy();

  const multiLinkResponse = await page.request.post(
    `${API_BASE_URL}/api/v1/pipeline/${multiLinkCandidate.id}/add-to-job`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        job_id: jobB.id,
        initial_stage: "entry",
      },
    },
  );
  expect(multiLinkResponse.ok()).toBeTruthy();

  await page.goto("/candidatos");

  let row = await searchCandidate(page, noLinkName);
  await expect(row).toContainText("Sem vínculo");
  await expect(row).toContainText("—");

  row = await searchCandidate(page, oneLinkName);
  await expect(row).toContainText("Vinculado");
  await expect(row).toContainText("1 vaga");

  row = await searchCandidate(page, multiLinkName);
  await expect(row).toContainText("Vinculado");
  await expect(row).toContainText("2 vagas");
});

test("verify_no_pipeline_entry_when_no_job", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Sem Pipeline ${suffix}`;
  const candidateEmail = `qa.sem.pipeline.${suffix}@example.com`;
  const jobTitle = `QA Board Check ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const job = await createJobViaApi(page, token, jobTitle, "published");

  await page.goto("/candidatos");
  const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  await modal.getByRole("button", { name: "Criar candidato sem vaga" }).click();
  await page.getByRole("button", { name: "Fechar painel" }).click();

  await page.goto(`/pipeline/${job.id}`);
  await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
});
