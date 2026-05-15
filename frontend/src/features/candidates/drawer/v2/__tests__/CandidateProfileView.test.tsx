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
    const onEditCandidate = vi.fn();

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
        hasPersistedCompatibilityScore={false}
        hasActiveJob={false}
        hasResume={false}
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
        onEditCandidate={onEditCandidate}
        onLinkJob={onLinkJob}
        onStartAnalysis={onStartAnalysis}
        onOpenDocuments={onOpenDocuments}
      />
    );

    // Primary button should be visible for no active job
    expect(screen.getByRole("button", { name: "Vincular vaga" })).toBeInTheDocument();
    expect(screen.getByText("Sem currículo")).toBeInTheDocument();

    // Click primary action
    await user.click(screen.getByRole("button", { name: "Vincular vaga" }));
    expect(onLinkJob).toHaveBeenCalledTimes(1);
  });
});
