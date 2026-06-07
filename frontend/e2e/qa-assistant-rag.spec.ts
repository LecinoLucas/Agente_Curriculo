import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@resume.ai";
const ADMIN_PASS = "Smoke123!";
const QUESTION = "Quando posso exportar uma admissão para o Protheus?";

async function loginAndLand(page: Page): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto("/login");
      await page.locator("input[type='email']").waitFor({ state: "visible", timeout: 20_000 });
      await page.locator("input[type='email']").fill(ADMIN_EMAIL);
      await page.locator("input[type='password']").first().fill(ADMIN_PASS);
      await page.getByRole("button", { name: /entrar/i }).click();
      await page.waitForURL(/\/(dashboard|pipeline|rh|vagas|admin)/, { timeout: 20_000 });
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
  await page.getByTestId("topnav-open-assistant").click();
  await expect(page.getByTestId("ai-assistant-drawer")).toBeVisible({ timeout: 5_000 });
}

test("AI Assistant RAG: knowledge base search and disabled synthesis are controlled", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await openDrawer(page);
  await expect(page.getByTestId("ai-knowledge-section")).toBeVisible();

  await page.getByTestId("ai-knowledge-input").fill(QUESTION);
  await page.getByTestId("ai-knowledge-search").click();

  const result = page.getByTestId("ai-assistant-result");
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result).toContainText("Regras de Exportação Protheus");
  await expect(result).toContainText("Relevância");
  await expect(result).toContainText("Trecho");

  const searchText = (await result.textContent()) ?? "";
  expect(searchText).not.toContain("content_hash");
  expect(searchText).not.toContain("vector_json");
  expect(searchText).not.toContain("embedding");
  expect(searchText).not.toContain("payload_json");
  expect(searchText).not.toContain("review_notes");
  expect(searchText).not.toContain("internal_notes");
  expect(searchText).not.toContain("Traceback");

  await page.getByTestId("ai-assistant-new-query").click();
  await expect(page.getByTestId("ai-knowledge-section")).toBeVisible();

  await page.getByTestId("ai-knowledge-input").fill(QUESTION);
  await page.getByTestId("ai-knowledge-answer").click();

  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result).toContainText("Síntese de conhecimento desativada globalmente.");

  const answerText = (await result.textContent()) ?? "";
  expect(answerText).not.toContain("content_hash");
  expect(answerText).not.toContain("vector_json");
  expect(answerText).not.toContain("embedding");
  expect(answerText).not.toContain("payload_json");
  expect(answerText).not.toContain("Traceback");
});
