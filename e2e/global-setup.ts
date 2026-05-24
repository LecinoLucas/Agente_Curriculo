import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_STORAGE_STATE } from "./auth";

const FRONTEND_PORT = process.env.PLAYWRIGHT_FRONTEND_PORT ?? "4173";
const BACKEND_PORT = process.env.PLAYWRIGHT_BACKEND_PORT ?? "8100";
const FRONTEND_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;
const API_URL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? `http://127.0.0.1:${BACKEND_PORT}`;

// Defesa em profundidade: mesmo que `webServer.url` do Playwright já aguarde
// um dos lados, o outro (frontend ou backend) ainda pode estar terminando o
// boot quando o globalSetup começa. Polling explícito aqui garante que a UI
// de login do admin e os specs encontrem ambos serviços vivos.
const READINESS_TIMEOUT_MS = 120_000;
const READINESS_POLL_INTERVAL_MS = 500;

async function waitForUrl(url: string, label: string): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      // Aceita qualquer resposta < 500 (200/204/3xx/4xx). 404 no /login do
      // frontend não acontece em dev, mas se acontecer ainda é sinal de
      // servidor vivo. O importante é não ser network error nem 5xx.
      if (res.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, READINESS_POLL_INTERVAL_MS),
    );
  }
  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[e2e:global-setup] ${label} não respondeu em ${url} dentro de ${READINESS_TIMEOUT_MS}ms (último erro: ${reason})`,
  );
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ??
    config.projects[0]?.use?.baseURL ??
    FRONTEND_URL;

  fs.mkdirSync(path.dirname(ADMIN_STORAGE_STATE), { recursive: true });

  // 1) Confirma readiness de backend e frontend antes de tocar a UI.
  //    `webServer.url` já aponta para /health do backend, então em runs
  //    normais este probe completa quase imediatamente. Mantemos os dois
  //    polls para sobreviver a reuseExistingServer e a cold start raros.
  await waitForUrl(`${API_URL}/health`, "backend");
  await waitForUrl(`${baseURL}/login`, "frontend");

  // 2) Faz o login UI e grava o storageState do admin.
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
    console.log(
      `[e2e:global-setup] storageState gravado em ${ADMIN_STORAGE_STATE}`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
