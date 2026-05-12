import { expect, test } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_USER_EMAIL ?? "admin@resume.ai";
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin123!";

test("E2E: login local e abertura da Pipeline", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/login");

  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();

  await page.waitForURL(/\/pipeline/);
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByText("Acompanhe e mova candidatos entre etapas")).toBeVisible();
  await expect(page.locator("select").first()).toBeVisible();
});
