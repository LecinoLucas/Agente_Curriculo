import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CandidateProfileView } from "../CandidateProfileView";

describe("CandidateProfileView", () => {
  it("mantém ações básicas visíveis para candidato novo", async () => {
    const user = userEvent.setup();
    const onLinkJob = vi.fn();
    const onOpenDocuments = vi.fn();
    const onStartAnalysis = vi.fn();

    render(
      <CandidateProfileView
        candidate={{
          id: "candidate-1",
          full_name: "Pessoa Teste",
          email: "pessoa@teste.com",
          phone: null,
          cpf: null,
          location_city: null,
          location_state: null,
          location_country: "Brasil",
          linkedin_url: null,
          github_url: null,
          portfolio_url: null,
          internal_notes: null,
          tags: [],
          user_id: null,
          created_by: "user-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }}
        currentStage={null}
        activeJobLabel="Sem vaga"
        activeJobCompatibilityScore={null}
        hasActiveJob={false}
        aiScore={null}
        aiStatus={null}
        analysisResult={null}
        rankingEntry={null}
        scoreExplanation={null}
        isLoading={false}
        hasLinkedJobs={false}
        onClose={vi.fn()}
        onAdvance={vi.fn()}
        onTerminate={vi.fn()}
        onViewAnalysis={vi.fn()}
        onTabChange={vi.fn()}
        onEditCandidate={vi.fn()}
        onLinkJob={onLinkJob}
        onStartAnalysis={onStartAnalysis}
        onOpenDocuments={onOpenDocuments}
        analysisStatusLabel="Não iniciada"
        analysisStatusDetail="Inicie a análise da vaga atual para liberar score e recomendação."
        analysisStatusTone="warning"
      />
    );

    expect(screen.getByRole("button", { name: "Editar candidato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Currículos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular vaga" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar análise" })).toBeInTheDocument();
    expect(screen.getByText("Análise IA")).toBeInTheDocument();
    expect(screen.getByText("Não iniciada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Currículos" }));
    await user.click(screen.getByRole("button", { name: "Vincular vaga" }));
    await user.click(screen.getByRole("button", { name: "Iniciar análise" }));

    expect(onOpenDocuments).toHaveBeenCalledTimes(1);
    expect(onLinkJob).toHaveBeenCalledTimes(1);
    expect(onStartAnalysis).toHaveBeenCalledTimes(1);
  });
});
