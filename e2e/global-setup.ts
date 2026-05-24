import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_STORAGE_STATE } from "./auth";

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ?? config.projects[0]?.use?.baseURL ?? "http://localhost:5173";

  fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar no painel" }).click();
    await page.waitForURL(/\/pipeline(\/|$)/, { timeout: 30_000 });
    await context.storageState({ path: ADMIN_STORAGE_STATE });
    // eslint-disable-next-line no-console
    console.log(`[e2e:global-setup] storageState gravado em ${ADMIN_STORAGE_STATE}`);
  } finally {
    await context.close();
    await browser.close();
  }
}
