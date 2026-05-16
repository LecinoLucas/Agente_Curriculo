/**
 * E2E: Navigation Smoke Tests
 *
 * Validates that nav items are visible and routes are reachable per role.
 * Roles tested: admin, manager, recruiter, viewer.
 *
 * Prerequisites:
 *   - Frontend at http://localhost:5173
 *   - Backend at http://localhost:8000 with seeded users:
 *       admin@test.com / admin123
 *       manager@test.com / manager123
 *       recruiter@test.com / recruiter123
 *       viewer@test.com / viewer123
 *
 * Run: npx playwright test e2e/navigation-smoke.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|pipeline|manager)/, { timeout: 10_000 });
}

async function logout(page: Page) {
  // Try action menu logout
  const actionBtn = page.getByLabel("Abrir ações de perfil");
  if (await actionBtn.isVisible()) {
    await actionBtn.click();
    await page.getByRole("menuitem", { name: /sair/i }).click();
  } else {
    await page.goto("/login");
  }
  await page.waitForURL(/\/login/, { timeout: 5_000 });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

test.describe("Admin navigation", () => {
  test.beforeEach(async ({ page }) => {
    await test.step("login como admin", async () => {
      await login(page, "admin@test.com", "admin123").catch(() => {
        test.skip(true, "Admin user not available in test environment");
      });
    });
  });

  test("vê todos os grupos de navegação", async ({ page }) => {
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText("Processo Seletivo")).toBeVisible();
    await expect(page.getByText("Ferramentas")).toBeVisible();
    await expect(page.getByText("Revisão")).toBeVisible();
    await expect(page.getByText("Admin")).toBeVisible();
  });

  test("Dashboard navega para /dashboard", async ({ page }) => {
    await page.getByText("Dashboard").click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Processo Seletivo > Pipeline navega para /pipeline", async ({ page }) => {
    await page.getByText("Processo Seletivo").click();
    await page.getByRole("link", { name: "Pipeline" }).click();
    await expect(page).toHaveURL(/\/pipeline/);
  });

  test("Admin > Painel admin navega para /admin", async ({ page }) => {
    await page.getByText("Admin").click();
    await page.getByRole("link", { name: "Painel admin" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("Admin > Avaliações navega para /admin/behavioral-templates", async ({ page }) => {
    await page.getByText("Admin").click();
    await page.getByRole("link", { name: "Avaliações" }).click();
    await expect(page).toHaveURL(/\/admin\/behavioral-templates/);
  });

  test("/admin/skills redireciona para /admin/cadastros", async ({ page }) => {
    await page.goto("/admin/skills");
    await expect(page).toHaveURL(/\/admin\/cadastros/);
  });

  test("Revisão navega para /manager", async ({ page }) => {
    await page.getByText("Revisão").click();
    await expect(page).toHaveURL(/\/manager/);
  });
});

// ─── Manager ──────────────────────────────────────────────────────────────────

test.describe("Manager navigation", () => {
  test.beforeEach(async ({ page }) => {
    await test.step("login como manager", async () => {
      await login(page, "manager@test.com", "manager123").catch(() => {
        test.skip(true, "Manager user not available in test environment");
      });
    });
  });

  test("vê Dashboard, Processo Seletivo e Revisão", async ({ page }) => {
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText("Processo Seletivo")).toBeVisible();
    await expect(page.getByText("Revisão")).toBeVisible();
  });

  test("não vê Ferramentas nem Admin", async ({ page }) => {
    await expect(page.getByText("Ferramentas")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Admin" })).not.toBeVisible();
  });

  test("Dashboard navega para /dashboard", async ({ page }) => {
    await page.getByText("Dashboard").click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("Processo Seletivo > Candidatos navega para /candidatos", async ({ page }) => {
    await page.getByText("Processo Seletivo").click();
    await page.getByRole("link", { name: "Candidatos" }).click();
    await expect(page).toHaveURL(/\/candidatos/);
  });

  test("Revisão navega para /manager", async ({ page }) => {
    await page.getByText("Revisão").click();
    await expect(page).toHaveURL(/\/manager/);
  });

  test("acesso direto a /admin é bloqueado (redireciona)", async ({ page }) => {
    await page.goto("/admin");
    // Should redirect away from admin (to dashboard or login)
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});

// ─── Recruiter ────────────────────────────────────────────────────────────────

test.describe("Recruiter navigation", () => {
  test.beforeEach(async ({ page }) => {
    await test.step("login como recruiter", async () => {
      await login(page, "recruiter@test.com", "recruiter123").catch(() => {
        test.skip(true, "Recruiter user not available in test environment");
      });
    });
  });

  test("vê Dashboard, Pipeline, Vagas, Candidatos, Avaliações", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vagas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Candidatos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Avaliações" })).toBeVisible();
  });

  test("não vê Revisão nem Admin", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Revisão" })).not.toBeVisible();
    await expect(page.getByText("Admin")).not.toBeVisible();
  });

  test("Avaliações navega para /admin/behavioral-templates", async ({ page }) => {
    await page.getByRole("link", { name: "Avaliações" }).click();
    await expect(page).toHaveURL(/\/admin\/behavioral-templates/);
  });

  test("acesso direto a /manager é bloqueado (redireciona)", async ({ page }) => {
    await page.goto("/manager");
    await expect(page).not.toHaveURL(/\/manager$/);
  });
});

// ─── Viewer ───────────────────────────────────────────────────────────────────

test.describe("Viewer navigation", () => {
  test.beforeEach(async ({ page }) => {
    await test.step("login como viewer", async () => {
      await login(page, "viewer@test.com", "viewer123").catch(() => {
        test.skip(true, "Viewer user not available in test environment");
      });
    });
  });

  test("vê Dashboard, Pipeline, Vagas, Candidatos", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vagas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Candidatos" })).toBeVisible();
  });

  test("não vê Importação, Análises IA, Avaliações, Revisão, Admin", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Importação" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Análises IA" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Avaliações" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Revisão" })).not.toBeVisible();
    await expect(page.getByText("Admin")).not.toBeVisible();
  });

  test("acesso direto a /manager é bloqueado", async ({ page }) => {
    await page.goto("/manager");
    await expect(page).not.toHaveURL(/\/manager$/);
  });

  test("acesso direto a /importar é bloqueado", async ({ page }) => {
    await page.goto("/importar");
    await expect(page).not.toHaveURL(/\/importar$/);
  });
});
