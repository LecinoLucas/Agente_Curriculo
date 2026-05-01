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

async function getAccessToken(page: Parameters<typeof test>[0]["page"]) {
  const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function createUser(
  page: Parameters<typeof test>[0]["page"],
  token: string,
  payload: {
    email: string;
    temporary_password: string;
    full_name: string;
    role: "admin" | "recruiter" | "candidate" | "viewer";
    is_active?: boolean;
    must_change_password?: boolean;
  },
) {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      email: payload.email,
      temporary_password: payload.temporary_password,
      full_name: payload.full_name,
      role: payload.role,
      is_active: payload.is_active ?? true,
      must_change_password: payload.must_change_password ?? false,
    },
  });
  expect(response.ok()).toBeTruthy();
}

test("painel interno renderiza e consulta comparação de scores", async ({ page }) => {
  await login(page);

  const jobId = "d0833940-cacf-4e36-923f-0be763eba2ca";
  const candidateId = "cad8d9d1-1efb-4be1-b47d-7928799ada52";
  let capturedUrl = "";
  let capturedMethod = "";

  await page.route(`**/api/v1/admin/scoring-comparison/${jobId}/${candidateId}`, async (route) => {
    capturedUrl = route.request().url();
    capturedMethod = route.request().method();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: jobId,
        candidate_id: candidateId,
        analysis_id: "a28cabdb-9224-463d-9a40-3a7e234d0cd1",
        job_profile_hash: "job-hash-data",
        candidate_profile_hash: "candidate-hash-data",
        legacy_match_score: 40,
        adaptive_match_score: 85.28,
        delta: 45.28,
        legacy_recommendation: "reject",
        adaptive_recommendation: "interview",
        confidence_score: 52.89,
        should_review_manually: true,
        major_differences: ["Delta de 45.3 pontos", "Equivalências reconhecidas"],
        strengths: ["SQL Server", "Power BI"],
        gaps: ["Liderança formal"],
        risk_points: ["adaptive_scoring_fallback"],
        explanation: "Comparação com delta elevado.",
        evaluation_insight: {
          why_score_is_high: ["Cobertura crítica acima de 70%."],
          why_score_is_low: ["Liderança parcial por inferência."],
          top_evidence: [
            {
              requirement: "SQL",
              requirement_type: "critical",
              match_status: "meets",
              match_type: "equivalent",
              evidence_quotes: ["SQL Server em produção"],
              evidence_strength: "high",
              confidence: "high",
              score_hint: 90,
              explanation: "Equivalência SQL Server",
            },
          ],
          matched_requirements: ["SQL", "Power BI"],
          partially_matched_requirements: ["Liderança"],
          missing_critical_requirements: [],
          equivalent_matches: [
            {
              requirement: "SQL",
              requirement_type: "critical",
              match_status: "meets",
              match_type: "equivalent",
              evidence_quotes: ["SQL Server em produção"],
              evidence_strength: "high",
              confidence: "high",
              score_hint: 90,
              explanation: "Equivalência SQL Server",
            },
          ],
          inferred_matches: [
            {
              requirement: "Liderança",
              requirement_type: "critical",
              match_status: "partially_meets",
              match_type: "inferred",
              evidence_quotes: ["Mentoria informal"],
              evidence_strength: "medium",
              confidence: "medium",
              score_hint: 62,
              explanation: "Inferência controlada",
            },
          ],
          score_drivers: [
            {
              driver: "SQL",
              impact: "positive",
              weight: 90,
              reason: "equivalent / high",
            },
          ],
          possible_overestimation: ["Score depende de equivalências."],
          possible_underestimation: ["Legado pode subestimar equivalências."],
          risk_points: ["leadership_gap"],
          recommended_interview_questions: ["Descreva uma decisão orientada por dados."],
          human_review_notes: ["Insight determinístico."],
        },
      }),
    });
  });

  await page.goto("/admin/comparacao-scores");
  await expect(page.getByRole("heading", { name: "Comparação de scores" })).toBeVisible();
  await expect(page.getByLabel("Job ID")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar scores" })).toBeVisible();

  await page.getByLabel("Job ID").fill(jobId);
  await page.getByLabel("Candidate ID").fill(candidateId);
  await page.getByRole("button", { name: "Comparar scores" }).click();

  await expect(page.getByRole("heading", { name: "Legado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adaptativo" })).toBeVisible();
  await expect(page.getByText("45.28%")).toBeVisible();
  await expect(page.getByText("Revisão manual")).toBeVisible();
  await expect(page.getByText("Sim")).toBeVisible();
  await expect(page.getByText("Delta de 45.3 pontos")).toBeVisible();
  await expect(page.getByText("SQL Server")).toBeVisible();
  await expect(page.getByText("Liderança formal")).toBeVisible();
  await expect(page.getByText("adaptive_scoring_fallback")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por que este score?" })).toBeVisible();
  await expect(page.getByText("Riscos de superestimação")).toBeVisible();
  await expect(page.getByText("Perguntas recomendadas")).toBeVisible();
  await expect(page.getByText("SQL Server em produção")).toBeVisible();
  expect(capturedMethod).toBe("GET");
  expect(capturedUrl).toContain(`/api/v1/admin/scoring-comparison/${jobId}/${candidateId}`);
});

test("painel interno mostra erro 404 do endpoint", async ({ page }) => {
  await login(page);

  const jobId = "a7e3b4d4-18ec-4ab4-9e7b-7f6f6a0c4f52";
  const candidateId = "b1b3f240-5ce3-4c1a-8f43-8f0e7d63f3e7";

  await page.goto("/admin/comparacao-scores");
  await page.route(`**/api/v1/admin/scoring-comparison/${jobId}/${candidateId}`, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Vaga não encontrada" }),
    });
  });

  await page.getByLabel("Job ID").fill(jobId);
  await page.getByLabel("Candidate ID").fill(candidateId);
  await page.getByRole("button", { name: "Comparar scores" }).click();
  await expect(page.getByText("Falha ao comparar scores")).toBeVisible();
  await expect(page.getByText("Vaga não encontrada")).toBeVisible();
});

test("painel interno mostra erro 500 do endpoint", async ({ page }) => {
  await login(page);

  const jobId = "a7e3b4d4-18ec-4ab4-9e7b-7f6f6a0c4f52";
  const candidateId = "b1b3f240-5ce3-4c1a-8f43-8f0e7d63f3e7";

  await page.goto("/admin/comparacao-scores");
  await page.route(`**/api/v1/admin/scoring-comparison/${jobId}/${candidateId}`, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Erro interno do servidor" }),
    });
  });

  await page.getByLabel("Job ID").fill(jobId);
  await page.getByLabel("Candidate ID").fill(candidateId);
  await page.getByRole("button", { name: "Comparar scores" }).click();
  await expect(page.getByText("Falha ao comparar scores")).toBeVisible();
  await expect(page.getByText("Erro interno do servidor")).toBeVisible();
});

test("acesso não-admin é bloqueado", async ({ page }) => {
  await login(page);
  const token = await getAccessToken(page);
  const suffix = Date.now();

  await createUser(page, token, {
    email: `recruiter-${suffix}@test.com`,
    temporary_password: "Recruiter123!",
    full_name: "Recruiter Test",
    role: "recruiter",
    is_active: true,
    must_change_password: false,
  });

  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(`recruiter-${suffix}@test.com`);
  await page.locator('input[type="password"]').fill("Recruiter123!");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/pipeline(\/|$)/);

  await page.goto("/admin/comparacao-scores");
  await expect(page.getByText("Acesso negado para este perfil.")).toBeVisible();
});
