import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.PREADMISSION_E2E_EMAIL ?? "admin@resume.ai";
const ADMIN_PASSWORD = process.env.PREADMISSION_E2E_PASSWORD ?? "Smoke123!";
const CASE_ID = process.env.PREADMISSION_E2E_CASE_ID ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/senha/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|pipeline|vagas|admin|admissao)/, { timeout: 15_000 });
}

test.describe("Pipeline -> Pré-admissão integrada", () => {
  test("abre o workspace de um case válido sem expor campos internos", async ({ page }) => {
    test.skip(
      !CASE_ID,
      "Defina PREADMISSION_E2E_CASE_ID com um case local válido para validar a UI integrada.",
    );

    await login(page);
    await page.goto(`/admissao/${CASE_ID}`);

    await expect(page).toHaveURL(new RegExp(`/admissao/${CASE_ID}$`));
    await expect(page.getByTestId("admission-case-header")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Checklist admissional")).toBeVisible();
    await expect(page.getByText("Documentos enviados")).toBeVisible();
    await expect(page.getByText("Histórico recente")).toBeVisible();

    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain("null");
    expect(bodyText).not.toContain("undefined");
    expect(bodyText).not.toContain("payload_json");
    expect(bodyText).not.toContain("vector_json");
    expect(bodyText).not.toContain("content_hash");
    expect(bodyText).not.toContain("traceback");
  });
});
