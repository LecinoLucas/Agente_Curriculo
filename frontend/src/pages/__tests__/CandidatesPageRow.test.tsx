import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CandidateRow } from "../CandidatesPage";
import type { CandidateListSummary } from "../../types/domain";

function buildCandidate(overrides?: Partial<CandidateListSummary>): CandidateListSummary {
  return {
    id: "candidate-1",
    full_name: "Pessoa Teste",
    email: "pessoa@teste.com",
    phone: null,
    cpf: null,
    tags: [],
    created_at: new Date().toISOString(),
    resume_count: 0,
    linked_job_count: 0,
    latest_job_id: null,
    latest_job_title: null,
    latest_job_stage: null,
    latest_relationship_status: null,
    active_job_id: null,
    active_job_title: null,
    active_job_stage: null,
    active_job_job_fit_score: null,
    ai_status: null,
    ...overrides,
  };
}

describe("CandidateRow", () => {
  it("exibe badge e ação rápida para candidato sem vaga sem depender de hover", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onLinkJob = vi.fn();

    render(
      <table>
        <tbody>
          <CandidateRow
            candidate={buildCandidate()}
            onOpen={onOpen}
            onLinkJob={onLinkJob}
          />
        </tbody>
      </table>,
    );

    expect(screen.getAllByText("Sem vaga").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Vincular vaga" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vincular vaga" }));

    expect(onLinkJob).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
