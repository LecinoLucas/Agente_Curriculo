import { expect, test } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_USER_EMAIL ?? "admin@resume.ai";
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD ?? "Smoke123!";

test("Vite: PipelinePage.tsx deve ser servido como text/javascript sem erro de MIME", async ({
  page,
}) => {
  const mimeErrors: string[] = [];
  let pipelinePageContentType: string | null = null;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        text.includes("Failed to fetch dynamically imported module") ||
        text.includes("MIME type") ||
        text.includes("text/html")
      ) {
        mimeErrors.push(text);
      }
    }
  });

  await page.route(/\/src\/pages\/PipelinePage\.tsx/, async (route) => {
    const response = await route.fetch();
    pipelinePageContentType = response.headers()["content-type"] ?? null;
    await route.fulfill({ response });
  });

  await page.goto("/login");
  await page.getByLabel(/e-mail/i).fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/(pipeline|rh|dashboard)/, { timeout: 15_000 });

  await page.goto("/pipeline");
  await page.waitForURL(/\/pipeline/, { timeout: 10_000 });

  await expect(page.getByRole("heading", { name: /pipeline/i })).toBeVisible({
    timeout: 15_000,
  });

  expect(
    mimeErrors,
    "Erros de MIME detectados no console:\n" + mimeErrors.join("\n")
  ).toHaveLength(0);

  if (pipelinePageContentType !== null) {
    expect(
      pipelinePageContentType,
      "PipelinePage.tsx retornou MIME incorreto: " + pipelinePageContentType
    ).toContain("javascript");
  }
});
