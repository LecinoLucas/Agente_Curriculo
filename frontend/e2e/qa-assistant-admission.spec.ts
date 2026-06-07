import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@resume.ai";
const ADMIN_PASS = "Smoke123!";
const CASE_ID = "e3fa2a43-7659-4aa6-baeb-3791e8e3cedd";
const PACKAGE_ID = "7a118208-2ee7-42fc-8042-573dcd44cce6";
const ADMISSION_URL = `/admission/cases/${CASE_ID}?packageId=${PACKAGE_ID}`;
const COMPOSITE_PROMPT = "O que falta para exportar essa admissão?";
const BLOCKED_PROMPT = "Exportar agora para Protheus";
const SENSITIVE_TERMS = [
  "00000000000",
  "qa.admissional@example.test",
  "payload_json",
  "review_notes",
  "internal_notes",
  "raw_ocr_text",
  "raw_resume_text",
  "content_hash",
  "vector_json",
  "embedding",
  "embeddings",
  "api_key",
  "token",
  "secret",
  "traceback",
  "stack trace",
];

async function loginAndLand(page: Page): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto("/login");
      await page.locator("input[type='email']").waitFor({ state: "visible", timeout: 20_000 });
      await page.locator("input[type='email']").fill(ADMIN_EMAIL);
      await page.locator("input[type='password']").first().fill(ADMIN_PASS);
      await page.getByRole("button", { name: /entrar/i }).click();
      await page.waitForURL(/\/(dashboard|pipeline|rh|vagas|admin|admission)/, { timeout: 20_000 });
      return true;
    } catch {
      if (attempt < 2) {
        await page.waitForTimeout(2_000);
      }
    }
  }

  return false;
}

async function openDrawer(page: Page) {
  await expect(page.getByTestId("topnav-open-assistant")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("topnav-open-assistant").click();
  await expect(page.getByTestId("ai-assistant-drawer")).toBeVisible({ timeout: 10_000 });
}

test("AI Assistant admission flow works with QA seed and stays read-only", async ({ page }) => {
  let assistantCallCount = 0;

  page.on("request", (request) => {
    if (request.url().includes("/api/v1/ai/assistant/read-only")) {
      assistantCallCount += 1;
    }
  });

  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend/auth not available");

  await page.goto(ADMISSION_URL);
  await expect(page.locator("[data-page='admission-case-workspace']")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("admission-case-header")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Candidato QA Admissional")).toBeVisible({ timeout: 20_000 });

  await openDrawer(page);

  await expect(page.getByTestId("ai-assistant-context-label")).toHaveText(/Admissão/i);
  await expect(page.getByTestId("ai-suggestion-suggestion.admission.export_readiness")).toBeVisible();
  await expect(page.getByTestId("ai-suggestion-suggestion.admission.documents")).toBeVisible();
  await expect(page.getByTestId("ai-action-admission.case_summary")).toBeVisible();
  await expect(page.getByTestId("ai-action-protheus.export_status")).toBeVisible();
  await expect(page.getByTestId("ai-knowledge-section")).toBeVisible();

  await page.getByTestId("ai-text-intent-input").fill(COMPOSITE_PROMPT);
  await page.getByTestId("ai-text-intent-submit").click();

  await expect(page.getByTestId("ai-assistant-composite-result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Consultas realizadas")).toBeVisible();
  await expect(page.getByTestId("ai-assistant-composite-steps")).toContainText("Resumo do caso");
  await expect(page.getByTestId("ai-assistant-composite-steps")).toContainText("Status dos documentos");
  await expect(page.getByTestId("ai-assistant-composite-steps")).toContainText("Eventos recentes");
  await expect(page.getByTestId("ai-assistant-composite-steps")).toContainText("Status Protheus");
  await expect.poll(() => assistantCallCount, {
    message: "Composite admission flow should perform the read-only steps",
  }).toBe(5);

  const compositeText = ((await page.getByTestId("ai-assistant-composite-result").textContent()) ?? "").toLowerCase();
  expect(compositeText).toContain("comprovante de residência");
  expect(compositeText).toContain("dados bancários");
  expect(compositeText).toContain("aso");
  for (const term of SENSITIVE_TERMS) {
    expect(compositeText).not.toContain(term);
  }
  expect(compositeText).not.toContain("exportar agora");

  await page.getByTestId("ai-assistant-new-query").click();
  await expect(page.getByTestId("ai-session-history-list")).toBeVisible();

  const historyItem = page.locator('[data-testid^="ai-session-history-item-"]').first();
  await expect(historyItem).toContainText(/Diagnóstico|exportar/i);
  await historyItem.click();
  await expect(page.getByTestId("ai-assistant-composite-result")).toBeVisible();
  expect(assistantCallCount).toBe(5);

  await page.getByTestId("ai-assistant-new-query").click();
  await page.getByTestId("ai-text-intent-input").fill(BLOCKED_PROMPT);
  await page.getByTestId("ai-text-intent-submit").click();
  await expect(page.getByTestId("ai-text-intent-feedback")).toContainText(/não executa ações de escrita/i);
  expect(assistantCallCount).toBe(5);

  const feedbackText = ((await page.getByTestId("ai-text-intent-feedback").textContent()) ?? "").toLowerCase();
  expect(feedbackText).not.toContain("protheus real");
});
