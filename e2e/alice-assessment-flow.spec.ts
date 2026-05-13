import { expect, test } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_USER_EMAIL ?? "admin@resume.ai";
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin123!";
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";

const ALICE_CANDIDATE_ID = "5fdcc13a-af19-40e6-88b8-828920c46e0e";
const ALICE_JOB_ID = "bb6aa5f2-a040-461a-adef-c79a5ef88872";

async function loginUi(page: Parameters<typeof test>[0]["page"]) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await page.waitForURL(/\/(dashboard|pipeline)/);
}

test("E2E Alice: template -> vaga -> candidato (front + back)", async ({ page, request }) => {
  const templateTitle = `E2E Alice ${Date.now()}`;

  const loginApi = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(loginApi.ok()).toBeTruthy();
  const { access_token } = await loginApi.json();
  const authHeaders = {
    Authorization: `Bearer ${access_token}`,
  };

  const createTemplateRes = await request.post(`${API_BASE}/api/v1/admin/assessments/templates`, {
    headers: authHeaders,
    data: {
      title: templateTitle,
      type: "behavioral_test",
      status: "active",
      questions: [
        {
          question_text: "Você prefere trabalhar com autonomia?",
          question_type: "single_choice",
          required: true,
          order_index: 1,
          options: [
            { option_text: "Sim", order_index: 1 },
            { option_text: "Depende do contexto", order_index: 2 },
          ],
        },
      ],
    },
  });
  expect(createTemplateRes.ok()).toBeTruthy();
  const createdTemplate = await createTemplateRes.json();
  const createdTemplateId = createdTemplate.id as string;

  await loginUi(page);

  await page.goto(`/vagas/${ALICE_JOB_ID}/editar`);
  await page.getByRole("button", { name: /Avaliações do processo/i }).click();

  const templateSelect = page.getByLabel("Template de avaliação");
  await expect(templateSelect).toBeVisible();

  const optionValue = await templateSelect.evaluate((el, title) => {
    const select = el as HTMLSelectElement;
    const option = Array.from(select.options).find((opt) => opt.textContent?.includes(title));
    return option?.value ?? "";
  }, templateTitle);
  expect(optionValue).toBeTruthy();

  await templateSelect.selectOption(optionValue);
  await page.getByRole("button", { name: "Vincular avaliação" }).click();

  await expect(page.getByText("Avaliação vinculada à vaga.")).toBeVisible();
  await expect(page.getByText(templateTitle, { exact: true }).first()).toBeVisible();

  const selectedValueAfterSave = await templateSelect.inputValue();
  expect(selectedValueAfterSave).toBe(createdTemplateId);

  await page.reload();
  await page.getByRole("button", { name: /Avaliações do processo/i }).click();
  await expect(page.getByText(templateTitle, { exact: true }).first()).toBeVisible();

  const jobAssessmentsRes = await request.get(`${API_BASE}/api/v1/jobs/${ALICE_JOB_ID}/assessments`, {
    headers: authHeaders,
  });
  expect(jobAssessmentsRes.ok()).toBeTruthy();
  const jobAssessments = (await jobAssessmentsRes.json()) as Array<{ template_id: string; title: string }>;
  expect(jobAssessments.some((item) => item.template_id === createdTemplateId)).toBeTruthy();

  const candidateOverviewRes = await request.get(`${API_BASE}/api/v1/candidates/${ALICE_CANDIDATE_ID}/overview`, {
    headers: authHeaders,
  });
  expect(candidateOverviewRes.ok()).toBeTruthy();
  const candidateOverview = await candidateOverviewRes.json();
  const overviewAssessments = Array.isArray(candidateOverview.assessments) ? candidateOverview.assessments : [];
  expect(overviewAssessments.some((item: { title?: string }) => item.title === templateTitle)).toBeTruthy();

  await page.goto(`/pipeline/${ALICE_JOB_ID}`);
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();

  const aliceCardTitle = page.getByText(/Alice Helen/i).first();
  await expect(aliceCardTitle).toBeVisible();
  await aliceCardTitle.click();

  await expect(page.getByRole("button", { name: /Resumo/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avaliações" })).toBeVisible();
  await expect(page.getByText(templateTitle, { exact: true }).first()).toBeVisible();

  await page.screenshot({ path: `/tmp/e2e-alice-assessment-${Date.now()}.png`, fullPage: true });
});
