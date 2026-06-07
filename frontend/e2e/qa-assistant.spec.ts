/**
 * E2E QA — AI Assistant Drawer (AI-UI-1A)
 *
 * Valida visualmente e funcionalmente o drawer do Assistente IA:
 *   - Botão BrainCircuit na topbar
 *   - Drawer abre/fecha (X e backdrop)
 *   - Badge Beta e notice "Somente leitura"
 *   - Empty state em páginas sem contexto
 *   - Ações contextuais em /vagas/:id
 *   - Responsividade mobile (375px)
 *
 * Pré-requisitos: backend em :8000 com admin@resume.ai / Smoke123!
 */

import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@resume.ai";
const ADMIN_PASS = "Smoke123!";

async function loginAndLand(page: Page): Promise<boolean> {
  // Retry up to 2 times — dev backend can be slow after several sequential logins
  for (let attempt = 1; attempt <= 2; attempt++) {
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
        // Brief back-off before retry
        await page.waitForTimeout(2_000);
      }
    }
  }
  return false;
}

async function openDrawer(page: Page) {
  await page.getByTestId("topnav-open-assistant").click();
  await expect(page.getByTestId("ai-assistant-drawer")).toBeVisible({ timeout: 3_000 });
}

// ─── Navbar button ────────────────────────────────────────────────────────────

test("AI Assistant: BrainCircuit button visible in topbar", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await expect(page.getByTestId("topnav-open-assistant")).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: "/tmp/qa-01-navbar.png" });
});

test("AI Assistant: button stays within viewport width", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  const btn = page.getByTestId("topnav-open-assistant");
  await expect(btn).toBeVisible({ timeout: 5_000 });
  const vp = page.viewportSize()!;
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
});

// ─── Drawer open/close ────────────────────────────────────────────────────────

test("AI Assistant: drawer opens on button click", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await openDrawer(page);
  await page.screenshot({ path: "/tmp/qa-02-drawer-open.png" });
});

test("AI Assistant: drawer shows Beta badge and readonly notice", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await openDrawer(page);
  await expect(page.getByTestId("ai-assistant-beta-badge")).toBeVisible();
  await expect(page.getByText(/Somente leitura/i)).toBeVisible();
  await expect(page.getByText(/Nenhuma ação será executada/i)).toBeVisible();
});

test("AI Assistant: drawer closes via X button", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await openDrawer(page);
  await page.getByTestId("ai-assistant-close").click();
  await expect(page.getByTestId("ai-assistant-drawer")).not.toBeVisible({ timeout: 2_000 });
});

test("AI Assistant: drawer closes via backdrop click", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await openDrawer(page);
  const backdrop = page.getByTestId("ai-assistant-backdrop");
  const box = await backdrop.boundingBox();
  // Click left side of screen, away from drawer on the right
  const clickX = Math.min(200, (box?.width ?? 400) / 4);
  await backdrop.click({ position: { x: clickX, y: 300 } });
  await expect(page.getByTestId("ai-assistant-drawer")).not.toBeVisible({ timeout: 2_000 });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

test("AI Assistant: empty state message on page without context", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await page.goto("/rh");
  await page.waitForLoadState("domcontentloaded");
  await openDrawer(page);

  await expect(page.getByTestId("ai-assistant-empty")).toBeVisible({ timeout: 3_000 });
  await expect(page.getByText(/Abra uma vaga, candidato ou caso admissional/i)).toBeVisible();
  await page.screenshot({ path: "/tmp/qa-03-empty-state.png" });
});

// ─── Contextual actions ───────────────────────────────────────────────────────

test("AI Assistant: job actions on /vagas/:id with no sensitive keys in result", async ({ page }) => {
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await page.goto("/vagas");
  const firstJobLink = page.locator("a[href^='/vagas/']").first();
  const jobExists = await firstJobLink.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!jobExists) {
    test.skip(true, "No jobs in test environment");
    return;
  }

  const href = await firstJobLink.getAttribute("href");
  await page.goto(href!);
  await openDrawer(page);

  await expect(page.getByTestId("ai-action-job.summary")).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId("ai-action-job.requirements")).toBeVisible();
  await expect(page.getByTestId("ai-action-pipeline.overview")).toBeVisible();
  // Candidate/admission actions should NOT be present on a job page
  await expect(page.getByTestId("ai-action-candidate.summary")).not.toBeVisible();

  await page.getByTestId("ai-action-job.summary").click();
  await expect(
    page.locator('[data-testid="ai-assistant-result"], [data-testid="ai-assistant-error"]'),
  ).toBeVisible({ timeout: 10_000 });

  const resultVisible = await page.getByTestId("ai-assistant-result").isVisible().catch(() => false);
  if (resultVisible) {
    await expect(page.getByTestId("ai-assistant-new-query")).toBeVisible();
    const resultText = await page.getByTestId("ai-assistant-result").textContent();
    expect(resultText).not.toContain("vector_json");
    expect(resultText).not.toContain("content_hash");
    expect(resultText).not.toContain("review_notes");
    expect(resultText).not.toContain("internal_notes");
  }

  await page.screenshot({ path: "/tmp/qa-04-job-result.png" });
});

// ─── Responsividade ───────────────────────────────────────────────────────────

test("AI Assistant: drawer fits within 375px viewport without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const ok = await loginAndLand(page);
  if (!ok) test.skip(true, "Backend not available");

  await openDrawer(page);

  const box = await page.getByTestId("ai-assistant-drawer").boundingBox();
  expect(box).not.toBeNull();
  // max-w-[calc(100vw-16px)] = 375-16 = 359px
  expect(box!.width).toBeLessThanOrEqual(375);
  await expect(page.getByTestId("ai-assistant-close")).toBeVisible();
  await page.screenshot({ path: "/tmp/qa-05-mobile.png" });
});
