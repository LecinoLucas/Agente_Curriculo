import { expect, test } from "@playwright/test";
import { getStoredAccessToken } from "./helpers/auth";
import { createManualCandidateFromPipeline } from "./helpers/candidates";
import { createPublishedJobViaApi } from "./helpers/jobs";
import { buildPdfBuffer } from "./helpers/pdf";
import {
  requestAnalysisViaApi,
  uploadResumeFromCandidatePage,
  waitForExtractedResumeVersion,
} from "./helpers/resumes";
import { API_BASE_URL } from "./helpers/api";

test("Reprocessamento de análise IA através do perfil do candidato", async ({ page, request }) => {
  const suffix = Date.now();
  const jobTitle = `QA Reprocess Job ${suffix}`;
  const candidateName = `QA Reprocess Candidate ${suffix}`;
  const candidateEmail = `qa.reprocess.${suffix}@example.com`;
  const resumeBuffer = buildPdfBuffer(
    [
      "Curriculo Reprocessamento E2E",
      `Nome: ${candidateName}`,
      "Resumo: Engenheiro backend com Python e PostgreSQL.",
    ].join("\n"),
  );

  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/pipeline/);
  const apiToken = await getStoredAccessToken(page);
  const job = await createPublishedJobViaApi(request, apiToken, {
    title: jobTitle,
    description: "Vaga para testar o reprocessamento.",
    requirements: "Python e PostgreSQL",
  });

  await page.goto(`/pipeline/${job.id}`);
  await expect(page.getByText(job.title).first()).toBeVisible();

  const candidateId = await createManualCandidateFromPipeline(page, {
    name: candidateName,
    email: candidateEmail,
  });

  await uploadResumeFromCandidatePage(page, {
    candidateId,
    candidateName,
    pdf: resumeBuffer,
    fileName: "reprocess-spec.pdf",
  });

  const resumeVersionId = await waitForExtractedResumeVersion(request, apiToken, candidateId);
  await requestAnalysisViaApi(request, apiToken, resumeVersionId, job.id);

  await test.step("Aguarda a primeira análise ser concluída e exibe o score", async () => {
    // Como a tela não faz polling automático do status da análise (exceto na tela global de análises),
    // precisamos recarregar até que a análise passe de 'pending/processing' para 'completed'.
    await expect.poll(async () => {
      await page.goto(`/candidatos/${candidateId}?tab=score`);
      // Aguarda o elemento /100 aparecer para garantir que o score foi carregado
      const hasScore = await page.getByText("Atualizado").isVisible();
      return hasScore;
    }, {
      message: "Aguardando conclusão da análise primária",
      timeout: 45_000,
      intervals: [2000, 3000],
    }).toBe(true);

    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
  });

  await test.step("Aciona o reprocessamento e valida a UI", async () => {
    // Como a UI esconde o botão "Reprocessar" quando a análise está perfeitamente 'fresh',
    // disparamos o reprocessamento via API e validamos que a UI reage corretamente ao novo status.
    await requestAnalysisViaApi(request, apiToken, resumeVersionId, job.id);

    // Recarregar a página logo após o disparo
    await page.reload();

    // O status da tela deve mudar para processando
    await expect(page.getByText(/Análise em andamento/i)).toBeVisible({ timeout: 5000 });

    // Aguarda o novo processamento recarregando a página
    await expect.poll(async () => {
      await page.reload();
      const hasScore = await page.getByText("Atualizado").isVisible();
      return hasScore;
    }, {
      message: "Aguardando conclusão do reprocessamento",
      timeout: 45_000,
      intervals: [2000, 3000],
    }).toBe(true);

    // Valida que voltou para concluído
    await expect(page.getByText("/100").first()).toBeVisible({ timeout: 15_000 });
  });
});
