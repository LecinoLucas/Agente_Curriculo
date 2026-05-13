import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SuccessScreen } from "../SuccessScreen";

describe("SuccessScreen", () => {
  it('mostra CTA de acompanhamento e mensagem de análise para candidatura com vaga', () => {
    render(
      <MemoryRouter>
        <SuccessScreen
          response={{
            candidate_id: "candidate-1",
            resume_id: "resume-1",
            resume_version_id: "resume-version-1",
            job_id: "job-1",
            pipeline_id: "pipeline-1",
            analysis_auto_requested: true,
            analysis_id: "analysis-1",
            analysis_status: "pending",
            talent_pool: false,
            talent_pool_profile_status: null,
            portal_access_hint: "Use o portal do candidato para acompanhar sua candidatura.",
            status: "entered_pipeline",
            message: "ok",
          }}
          onNewApplication={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Sua candidatura foi recebida e seu currículo entrou em análise.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acompanhar candidatura" })).toHaveAttribute(
      "href",
      "/candidato"
    );
    expect(screen.queryByText(/candidate-1/i)).not.toBeInTheDocument();
  });

  it("mostra mensagem específica para Banco de Talentos", () => {
    render(
      <MemoryRouter>
        <SuccessScreen
          response={{
            candidate_id: "candidate-2",
            resume_id: "resume-2",
            resume_version_id: "resume-version-2",
            job_id: null,
            pipeline_id: null,
            analysis_auto_requested: false,
            analysis_id: null,
            analysis_status: null,
            talent_pool: true,
            talent_pool_profile_status: "pending",
            portal_access_hint: "Use o portal do candidato para acompanhar sua candidatura.",
            status: "awaiting_job",
            message: "ok",
          }}
          onNewApplication={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Sua inscrição no Banco de Talentos foi recebida.")
    ).toBeInTheDocument();
  });
});
