import { expect, type Page } from "@playwright/test";

export async function getStoredAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() =>
    localStorage.getItem("resume_ai_access_token"),
  );
  expect(token, "token não encontrado em localStorage após login").toBeTruthy();
  return token as string;
}
