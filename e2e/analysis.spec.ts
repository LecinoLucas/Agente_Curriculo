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

test("Análises IA lista a análise gerada após upload de currículo", async ({ page, request }) => {
  const suffix = Date.now();
  const jobTitle = `QA Analise Job ${suffix}`;
  const candidateName = `QA Analise Candidate ${suffix}`;
  const candidateEmail = `qa.analise.${suffix}@example.com`;
  const resumeBuffer = buildPdfBuffer(
    [
      "Curriculo Análise E2E",
      `Nome: ${candidateName}`,
      "Resumo: Engenheiro backend com Python, FastAPI e PostgreSQL.",
      "Skills: Python, FastAPI, SQL, API, Backend, testes automatizados.",
      "Experiencia: 6 anos em servicos backend.",
    ].join("\n"),
  );

  // ── setup: garantir uma vaga publicada via API (sem depender do banco) ──
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/pipeline/);
  const apiToken = await getStoredAccessToken(page);
  const job = await createPublishedJobViaApi(request, apiToken, {
    title: jobTitle,
    description:
      "Vaga criada via E2E para validar a UI de Análises IA. Buscamos desenvolvedor backend em Python com FastAPI, PostgreSQL e testes automatizados.",
    requirements:
      "Experiência sólida com Python, FastAPI e bancos relacionais. Familiaridade com design de APIs REST, testes e versionamento.",
  });

  // ── cria candidato manual pela Pipeline da vaga ──
  await page.goto(`/pipeline/${job.id}`);
  await expect(page.getByText(job.title).first()).toBeVisible();

  const candidateId = await createManualCandidateFromPipeline(page, {
    name: candidateName,
    email: candidateEmail,
  });

  // ── envia currículo (UI) ──
  await uploadResumeFromCandidatePage(page, {
    candidateId,
    candidateName,
    pdf: resumeBuffer,
    fileName: "analysis-spec.pdf",
  });

  // ── dispara análise via API (a UI exige clique manual em "Gerar análise agora";
  //     usamos o endpoint para tornar o teste determinístico, sem depender de
  //     extração e botão habilitar a tempo) ──
  const resumeVersionId = await waitForExtractedResumeVersion(request, apiToken, candidateId);
  await requestAnalysisViaApi(request, apiToken, resumeVersionId, job.id);

  // ── valida que /analises-ia exibe a análise gerada para esse candidato ──
  await test.step("Análises IA mostra a análise do candidato recém-criado", async () => {
    await page.goto("/analises-ia");
    await expect(page.getByRole("heading", { name: "Análises IA" })).toBeVisible();

    await page.getByPlaceholder(/Buscar por candidato/i).fill(candidateName);

    const row = page.getByRole("row").filter({ hasText: candidateName });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(candidateName);
    await expect(row).toContainText(candidateEmail);
    await expect(row).toContainText(
      /Aguardando|Processando|Concluída|Falhou|Retry|Cancelado|Descartada/,
    );
  });

  // ── valida que a página do candidato expõe a aba Score e análise ──
  await test.step("aba Score e análise do candidato é navegável após upload", async () => {
    await page.goto(`/candidatos/${candidateId}?tab=score`);
    await expect(page.getByRole("heading", { name: candidateName })).toBeVisible();
    await expect(
      page.getByText(/Análise|Score|Compatibilidade|Pontuação/i).first(),
    ).toBeVisible();
  });
});
