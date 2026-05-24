import { expect, type Page } from "@playwright/test";

export async function openManualCandidateDialog(page: Page) {
  await page
    .getByRole("button", { name: "Vincular candidato", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Criar candidato manualmente/i })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cadastrar Candidato" });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function createManualCandidateFromPipeline(
  page: Page,
  candidate: { name: string; email: string },
): Promise<string> {
  const dialog = await openManualCandidateDialog(page);
  await dialog.getByLabel("Nome completo *").fill(candidate.name);
  await dialog.getByLabel("E-mail *").fill(candidate.email);
  await dialog
    .getByRole("button", { name: "Salvar e adicionar à vaga" })
    .click();
  await expect(dialog).toBeHidden();

  await expect(page).toHaveURL(/\/candidatos\/[^/?]+/);
  const match = page.url().match(/\/candidatos\/([^/?#]+)/);
  expect(
    match,
    "id do candidato não pôde ser extraído da URL",
  ).not.toBeNull();
  return (match as RegExpMatchArray)[1];
}
