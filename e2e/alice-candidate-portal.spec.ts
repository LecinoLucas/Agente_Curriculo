import { expect, test } from "@playwright/test";

const ALICE_EMAIL = "c@teste.com";
const ALICE_PASSWORD = "Alice@1234";

test("E2E Alice: portal do candidato exibe avaliação pendente", async ({ page }) => {
  await page.goto("/candidato/login");

  await page.getByLabel("E-mail").fill(ALICE_EMAIL);
  await page.getByLabel("Senha").fill(ALICE_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(/\/candidato\/portal/);
  await expect(page.getByRole("heading", { name: /Alice/i })).toBeVisible();

  await expect(page.getByText("Teste comportamental").first()).toBeVisible();
  await expect(page.getByText(/Avaliação concluída|Iniciar teste|Responder pesquisa/i)).toBeVisible();

  await page.screenshot({ path: `/tmp/e2e-alice-candidate-portal-${Date.now()}.png`, fullPage: true });
});
