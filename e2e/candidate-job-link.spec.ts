import { expect, test } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";
const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Admin123!";

async function login(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
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
  const initialStatus = status === "published" ? "draft" : status;
  const response = await page.request.post(`${API_BASE_URL}/api/v1/jobs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      title,
      description: `Descricao completa da vaga ${title} com responsabilidades, contexto e requisitos detalhados.`,
      requirements: "Python, FastAPI, PostgreSQL",
      status: initialStatus,
      seniority_level: "mid",
      minimum_education_level: "bachelor",
      minimum_years_experience: 2,
      job_area: "technology",
      responsibilities: "Atuar no desenvolvimento e manutencao de APIs, com foco em qualidade e escalabilidade.",
      experience_context: "Experiencia com backend web, integracoes e boas praticas de engenharia.",
      work_model: "remote",
      location: "Brasil",
      skill_requirements: {
        core_required: ["Python", "FastAPI"],
        important: ["PostgreSQL"],
      },
      salary_currency: "BRL",
      deal_breakers: [],
    },
  });
  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(`createJobViaApi failed (${response.status()}): ${errorBody}`);
  }
  const createdJob = (await response.json()) as { id: string };
  if (status !== "published") {
    return createdJob;
  }

  const skillsResponse = await page.request.get(`${API_BASE_URL}/api/v1/skills?limit=2`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!skillsResponse.ok()) {
    const errorBody = await skillsResponse.text();
    throw new Error(`listSkills failed (${skillsResponse.status()}): ${errorBody}`);
  }
  let skills = (await skillsResponse.json()) as Array<{ id: string; name: string }>;
  if (skills.length < 2) {
    const missingCount = 2 - skills.length;
    for (let index = 0; index < missingCount; index += 1) {
      const skillName = `QA Skill ${Date.now()} ${index}`;
      const createSkillResponse = await page.request.post(`${API_BASE_URL}/api/v1/skills`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          name: skillName,
          category: "technology",
          aliases: [],
        },
      });
      if (!createSkillResponse.ok()) {
        const errorBody = await createSkillResponse.text();
        throw new Error(`createSkill failed (${createSkillResponse.status()}): ${errorBody}`);
      }
    }
    const refreshedSkillsResponse = await page.request.get(`${API_BASE_URL}/api/v1/skills?limit=2`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!refreshedSkillsResponse.ok()) {
      const errorBody = await refreshedSkillsResponse.text();
      throw new Error(`refreshSkills failed (${refreshedSkillsResponse.status()}): ${errorBody}`);
    }
    skills = (await refreshedSkillsResponse.json()) as Array<{ id: string; name: string }>;
  }

  for (const skill of skills.slice(0, 2)) {
    const addSkillResponse = await page.request.post(`${API_BASE_URL}/api/v1/jobs/${createdJob.id}/skills`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        skill_id: skill.id,
        is_mandatory: true,
        weight: 1,
      },
    });
    if (!addSkillResponse.ok() && addSkillResponse.status() !== 409) {
      const errorBody = await addSkillResponse.text();
      throw new Error(`addJobSkill failed (${addSkillResponse.status()}): ${errorBody}`);
    }
  }

  const publishResponse = await page.request.patch(`${API_BASE_URL}/api/v1/jobs/${createdJob.id}/publish`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!publishResponse.ok()) {
    const errorBody = await publishResponse.text();
    throw new Error(`publishJob failed (${publishResponse.status()}): ${errorBody}`);
  }
  return createdJob;
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
  await page.getByPlaceholder(/Buscar por nome ou e-mail/).fill(name);
  const row = page.getByRole("row").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  return row;
}

async function openCandidateDrawerById(
  page: Parameters<typeof test>[0]["page"],
  candidateId: string,
  _candidateName: string,
) {
  await page.goto(`/candidatos?candidateId=${candidateId}`);
  if (/\/login(\/|$)/.test(page.url())) {
    await login(page);
    await page.goto(`/candidatos?candidateId=${candidateId}`);
  }
  const drawer = page.getByRole("complementary", { name: "Painel do candidato" });
  await expect(drawer).toBeVisible({ timeout: 20000 });
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
  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(`addCandidateToJobViaApi failed (${response.status()}): ${errorBody}`);
  }
}

async function getPipelineBoardViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  jobId: string,
) {
  const response = await page.request.get(`${API_BASE_URL}/api/v1/pipeline/${jobId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    columns: Array<{ candidates: Array<{ candidate_id: string }> }>;
  };
}

function boardHasCandidate(
  board: { columns: Array<{ candidates: Array<{ candidate_id: string }> }> },
  candidateId: string,
) {
  return board.columns.some((column) =>
    column.candidates.some((candidate) => candidate.candidate_id === candidateId),
  );
}

async function getPipelineHistoryViaApi(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  jobId: string,
  candidateId: string,
) {
  const response = await page.request.get(`${API_BASE_URL}/api/v1/pipeline/${jobId}/${candidateId}/history`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    current_stage: string;
    status: string;
  };
}

test("create_candidate_without_job", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Sem Vaga ${suffix}`;
  const candidateEmail = `qa.sem.vaga.${suffix}@example.com`;
  const publishedJobTitle = `QA Pipeline Check ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const job = await createJobViaApi(page, token, publishedJobTitle, "paused");

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
  await expect(page).toHaveURL(new RegExp(`/pipeline/${job.id}$`));
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
  await expect(drawer.getByRole("button", { name: /Adicionar a outra vaga/ })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /Transferir/ })).toBeVisible();
  await drawer.getByRole("button", { name: "Fechar painel" }).click();

  await expect(page.getByText(candidateName, { exact: true })).toBeVisible();

  await page.goto("/candidatos");
  const row = await searchCandidate(page, candidateName);
  await expect(row).toContainText("Vinculado");
  await expect(row).toContainText("1 vaga");
});

test("rejected candidate does not render active job semantics in drawer", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Rejected ${suffix}`;
  const candidateEmail = `qa.rejected.${suffix}@example.com`;
  const jobTitle = `QA Reject Job ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const job = await createJobViaApi(page, token, jobTitle, "published");
  const candidate = await createCandidateViaApi(page, token, candidateName, candidateEmail);

  await addCandidateToJobViaApi(page, token, candidate.id, job.id);

  const rejectResponse = await page.request.patch(`${API_BASE_URL}/api/v1/pipeline/${job.id}/${candidate.id}/stage`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      stage: "rejected",
      reason: "qa_rejected",
    },
  });
  expect(rejectResponse.ok()).toBeTruthy();

  await page.goto("/candidatos");
  const row = await searchCandidate(page, candidateName);
  await row.click();

  await expect(page.getByRole("heading", { name: "Última vaga vinculada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vaga ativa" })).toHaveCount(0);
  await expect(page.getByText("Status final", { exact: true })).toBeVisible();
  await expect(page.getByText("Reprovado", { exact: true }).first()).toBeVisible();
});

test("active-terminal-reactivation flow keeps domain semantics and cache coherence", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `QA Active Terminal ${suffix}`;
  const candidateEmail = `qa.active.terminal.${suffix}@example.com`;
  const jobTitle = `QA Active Terminal Job ${suffix}`;

  await login(page);
  const token = await getToken(page);
  const job = await createJobViaApi(page, token, jobTitle, "paused");
  const candidate = await createCandidateViaApi(page, token, candidateName, candidateEmail);
  await addCandidateToJobViaApi(page, token, candidate.id, job.id);

  await openCandidateDrawerById(page, candidate.id, candidateName);

  await expect(page.getByRole("heading", { name: "Vaga ativa" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Última vaga vinculada" })).toHaveCount(0);
  await expect(page.getByText("Etapa atual", { exact: true }).first()).toBeVisible();

  // Reprovar sem fechar drawer
  await page.getByRole("button", { name: "Reprovar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Última vaga vinculada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vaga ativa" })).toHaveCount(0);
  await expect(page.getByText("Status final", { exact: true })).toBeVisible();
  await expect(page.getByText("Reprovado", { exact: true }).first()).toBeVisible();

  // Reprovar e trocar de aba
  await page.getByRole("button", { name: "Score & Análise", exact: true }).click();
  await expect(page.getByText("Compatibilidade Contextual", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resumo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Última vaga vinculada" })).toBeVisible();

  // Reprovar e refresh mantém estado
  await page.reload();
  const rejectedAfterRefresh = await getPipelineHistoryViaApi(page, token, job.id, candidate.id);
  expect(rejectedAfterRefresh.status).toBe("rejected");
  expect(rejectedAfterRefresh.current_stage).toBe("rejected");

  // Candidato não aparece mais como ativo para vaga e não entra no board ativo
  let board = await getPipelineBoardViaApi(page, token, job.id);
  expect(boardHasCandidate(board, candidate.id)).toBeFalsy();

  await page.goto(`/pipeline/${job.id}`);
  await expect(page).toHaveURL(new RegExp(`/pipeline/${job.id}$`));
  await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);

  // Reativar candidato
  await addCandidateToJobViaApi(page, token, candidate.id, job.id);

  // Reativar e voltar para pipeline
  await page.goto(`/pipeline/${job.id}`);

  // Refresh final mantém estado ativo no pipeline
  await page.reload();
  await page.goto(`/pipeline/${job.id}`);

  board = await getPipelineBoardViaApi(page, token, job.id);
  expect(boardHasCandidate(board, candidate.id)).toBeTruthy();

  const history = await getPipelineHistoryViaApi(page, token, job.id, candidate.id);
  expect(history.status).toBe("active");
  expect(history.current_stage).toBe("entry");
});

test("linked candidate in add flow shows open action", async ({ page }) => {
  const suffix = Date.now();
  const sourceJobTitle = `QA Origem ${suffix}`;
  const targetJobTitle = `QA Destino ${suffix}`;
  const candidateName = `QA Candidato Vinculado ${suffix}`;
  const candidateEmail = `qa.candidato.vinculado.${suffix}@example.com`;

  await login(page);
  const token = await getToken(page);
  const sourceJob = await createJobViaApi(page, token, sourceJobTitle, "paused");
  const targetJob = await createJobViaApi(page, token, targetJobTitle, "paused");
  const candidate = await createCandidateViaApi(page, token, candidateName, candidateEmail);

  const linkResponse = await page.request.post(`${API_BASE_URL}/api/v1/pipeline/${candidate.id}/add-to-job`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      job_id: sourceJob.id,
      initial_stage: "entry",
    },
  });
  expect(linkResponse.ok()).toBeTruthy();

  await page.goto(`/pipeline/${targetJob.id}`);
  await page.getByRole("button", { name: "Adicionar candidatos" }).click();
  await page.getByPlaceholder("Buscar candidato por nome ou e-mail...").fill(candidateName);

  const candidateCard = page.locator("div.rounded-lg.border.p-3").filter({ hasText: candidateName }).first();
  await expect(candidateCard.getByText(candidateName, { exact: true })).toBeVisible();
  await expect(candidateCard.getByRole("button", { name: "Adicionar" })).toBeVisible();
  await candidateCard.getByRole("button", { name: "Adicionar" }).click();
  await expect(candidateCard.getByText("Use transferência para mover o candidato.")).toBeVisible();
  await expect(candidateCard.getByRole("button", { name: "Abrir" })).toBeVisible();
  await candidateCard.getByRole("button", { name: "Abrir" }).click();

  await expect(page).toHaveURL(new RegExp(`/candidatos\\?candidateId=${candidate.id}$`));
  await expect(page.getByRole("dialog", { name: "Painel do candidato" })).toBeVisible();
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
  const jobA = await createJobViaApi(page, token, jobAName, "paused");
  const jobB = await createJobViaApi(page, token, jobBName, "paused");
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
  const job = await createJobViaApi(page, token, jobTitle, "paused");

  await page.goto("/candidatos");
  const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  await modal.getByRole("button", { name: "Criar candidato sem vaga" }).click();
  await page.getByRole("button", { name: "Fechar painel" }).click();

  await page.goto(`/pipeline/${job.id}`);
  await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
});
