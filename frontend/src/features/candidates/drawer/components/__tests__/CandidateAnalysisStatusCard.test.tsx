import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CandidateAnalysisStatusCard } from "../CandidateAnalysisStatusCard";

describe("CandidateAnalysisStatusCard", () => {
  it("mostra estado sem currículo", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={false}
        activeJobId="job-1"
        analysisStatus={null}
        jobFitScore={null}
        aiStatus={null}
      />,
    );

    expect(screen.getByText("Sem currículo")).toBeInTheDocument();
    expect(screen.getByText("Adicione um currículo para iniciar a análise.")).toBeInTheDocument();
  });

  it("mostra estado aguardando vaga quando há currículo mas não há vaga ativa", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId={null}
        analysisStatus={null}
        jobFitScore={null}
        aiStatus={null}
      />,
    );

    expect(screen.getByText("Aguardando vaga")).toBeInTheDocument();
    expect(screen.getByText("Vincule o candidato a uma vaga para calcular aderência.")).toBeInTheDocument();
  });

  it("mostra loading discreto durante processamento", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus="processing"
        jobFitScore={null}
        aiStatus="processing"
      />,
    );

    expect(screen.getByText("Analisando com IA")).toBeInTheDocument();
    expect(screen.getByText("Analisando currículo com IA...")).toBeInTheDocument();
  });

  it("mostra score principal quando a aderência está pronta", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus="completed"
        jobFitScore={72}
        aiStatus="completed"
        highlights={["Boa aderência em experiência", "Skills essenciais presentes"]}
      />,
    );

    expect(screen.getByText("Aderência pronta")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("Boa aderência em experiência")).toBeInTheDocument();
  });

  it("ajusta a copy quando o score exibido é a última aderência calculada", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus="completed"
        jobFitScore={64}
        scoreLabel="Última aderência calculada"
        aiStatus="completed"
      />,
    );

    expect(screen.getByText("Última aderência calculada")).toBeInTheDocument();
  });

  it("mostra ação de tentar novamente quando a análise falha", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();

    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus="failed"
        jobFitScore={null}
        aiStatus="failed"
        errorMessage="Não foi possível concluir a análise."
        onPrimaryAction={onPrimaryAction}
      />,
    );

    expect(screen.getByText("Falha na análise")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  // Extraction status tests
  it("mostra estado de extração quando extraction_status está pending", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus={null}
        jobFitScore={null}
        aiStatus={null}
        extractionStatus="pending"
      />,
    );

    expect(screen.getByText("Extraindo currículo")).toBeInTheDocument();
    expect(screen.getByText("Extraindo dados do currículo...")).toBeInTheDocument();
  });

  it("mostra erro de extração quando extraction_status é failed", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus={null}
        jobFitScore={null}
        aiStatus={null}
        extractionStatus="failed"
      />,
    );

    expect(screen.getByText("Falha na extração do currículo")).toBeInTheDocument();
    expect(screen.getByText(/Não foi possível extrair o texto/)).toBeInTheDocument();
  });

  it("não mostra mensagem de extração quando extraction_status é completed", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus="pending"
        jobFitScore={null}
        aiStatus="pending"
        extractionStatus="completed"
      />,
    );

    expect(screen.getByText("Analisando com IA")).toBeInTheDocument();
    expect(screen.queryByText("Extraindo currículo")).not.toBeInTheDocument();
  });

  it("prioriza extraction_status failed sobre analysis completed", () => {
    render(
      <CandidateAnalysisStatusCard
        hasResume={true}
        activeJobId="job-1"
        analysisStatus="completed"
        jobFitScore={72}
        aiStatus="completed"
        extractionStatus="failed"
      />,
    );

    expect(screen.getByText("Falha na extração do currículo")).toBeInTheDocument();
    expect(screen.queryByText("Aderência pronta")).not.toBeInTheDocument();
  });
});
