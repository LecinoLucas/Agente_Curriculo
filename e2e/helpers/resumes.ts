import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API_BASE_URL } from "./api";

export interface UploadResumeOptions {
  candidateId: string;
  candidateName: string;
  pdf: Buffer;
  fileName?: string;
}

export async function uploadResumeFromCandidatePage(
  page: Page,
  options: UploadResumeOptions,
): Promise<void> {
  await page.goto(`/candidatos/${options.candidateId}?tab=documents`);
  await expect(
    page.getByRole("heading", { name: options.candidateName }),
  ).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: options.fileName ?? "resume-e2e.pdf",
    mimeType: "application/pdf",
    buffer: options.pdf,
  });
  await page.getByRole("button", { name: /Enviar currículo/i }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: /Currículo enviado/i }).last(),
  ).toBeVisible({ timeout: 20_000 });
}

// Extração do currículo é assíncrona (Celery worker). Sob carga em paralelo,
// 45s não basta: o worker fica contendido. Elevamos para 120s, mantemos
// fail-fast em status=failed para não esticar testes que realmente quebraram.
const RESUME_EXTRACTION_TIMEOUT_MS = 120_000;
const RESUME_EXTRACTION_POLL_INTERVAL_MS = 1500;

export async function waitForExtractedResumeVersion(
  request: APIRequestContext,
  token: string,
  candidateId: string,
): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const deadline = Date.now() + RESUME_EXTRACTION_TIMEOUT_MS;
  let lastStatus = "(none)";
  let lastLoggedStatus: string | null = null;
  while (Date.now() < deadline) {
    const res = await request.get(
      `${API_BASE_URL}/api/v1/candidates/${candidateId}/overview`,
      { headers: auth },
    );
    expect(
      res.ok(),
      `GET /candidates/${candidateId}/overview HTTP ${res.status()}`,
    ).toBeTruthy();
    const body = (await res.json()) as {
      resumes?: Array<{
        current_version_id?: string | null;
        extraction_status?: string | null;
      }>;
    };
    const resume = body.resumes?.[0];
    const versionId = resume?.current_version_id;
    const status = (resume?.extraction_status ?? "").toLowerCase();
    lastStatus = status || "(empty)";
    if (
      versionId &&
      (status === "completed" || status === "ready" || status === "success")
    ) {
      return versionId;
    }
    if (status === "failed") {
      throw new Error(
        `extração do currículo falhou (extraction_status=${status})`,
      );
    }
    // Log discreto a cada transição de status (sem PII) para diagnóstico.
    if (status !== lastLoggedStatus) {
      // eslint-disable-next-line no-console
      console.log(`[resumes] extraction_status=${lastStatus || "?"}`);
      lastLoggedStatus = status;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, RESUME_EXTRACTION_POLL_INTERVAL_MS),
    );
  }
  throw new Error(
    `timeout esperando extraction_status=completed (último=${lastStatus}, budget=${RESUME_EXTRACTION_TIMEOUT_MS}ms)`,
  );
}

export async function requestAnalysisViaApi(
  request: APIRequestContext,
  token: string,
  resumeVersionId: string,
  jobId: string,
): Promise<void> {
  const res = await request.post(`${API_BASE_URL}/api/v1/analyses`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { resume_version_id: resumeVersionId, job_id: jobId, force: "true" },
  });
  expect(
    res.ok(),
    `POST /analyses HTTP ${res.status()} body=${await res.text()}`,
  ).toBeTruthy();
}
