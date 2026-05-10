import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OverviewTab } from "../OverviewTab";
import type { CandidateOverview } from "../../../../../types/domain";

function buildOverview(overrides?: Partial<CandidateOverview>): CandidateOverview {
  return {
    candidate: {
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
    },
    resumes: [],
    latest_analysis: null,
    latest_analysis_pipeline: null,
    top_matches: [],
    active_job_id: null,
    active_job: null,
    pipeline_entries: [],
    ...overrides,
  };
}

describe("OverviewTab", () => {
  it("exibe CTA e estado vazio quando o candidato não tem vaga vinculada", async () => {
    const user = userEvent.setup();
    const onLinkJob = vi.fn();

    render(
      <OverviewTab
        overview={buildOverview()}
        activeJobId={null}
        activeJob={null}
        activePipelineEntry={null}
        onEdit={vi.fn()}
        onLinkJob={onLinkJob}
      />,
    );

    expect(
      screen.getByText("Este candidato ainda não está vinculado a nenhuma vaga"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma vaga vinculada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vincular a uma vaga" }));

    expect(onLinkJob).toHaveBeenCalledTimes(1);
  });
});
