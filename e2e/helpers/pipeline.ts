import { expect, type Page } from "@playwright/test";

export async function selectJobInCombobox(
  page: Page,
  jobTitle: string,
): Promise<void> {
  await page.getByRole("button", { name: "Buscar vaga" }).click();
  await page.getByRole("option", { name: new RegExp(jobTitle) }).click();
}

export async function waitForActiveJob(
  page: Page,
  jobTitle: string,
): Promise<void> {
  await expect(
    page.locator("h2").filter({ hasText: jobTitle }).first(),
  ).toBeVisible();
}

export async function waitForCandidateCard(page: Page, candidateName: string) {
  const card = page
    .locator('[data-testid^="kanban-card-"]')
    .filter({ hasText: candidateName })
    .first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}
