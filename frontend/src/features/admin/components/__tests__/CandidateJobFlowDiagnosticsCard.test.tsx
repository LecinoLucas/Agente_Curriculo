import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateJobFlowDiagnosticsCard } from "../CandidateJobFlowDiagnosticsCard";
import { HttpError } from "@/services/http";
import type { CandidateJobFlowDiagnostic } from "@/types/adminDiagnostics";

const getDiagnosticMock = vi.fn();
const repairMock = vi.fn();
const listSummariesMock = vi.fn();

vi.mock("@/services/adminDiagnosticsService", () => ({
  adminDiagnosticsService: {
    getCandidateJobFlowDiagnostic: (...args: unknown[]) => getDiagnosticMock(...args),
    repairCandidateJobFlow: (...args: unknown[]) => repairMock(...args),
  },
}));

vi.mock("@/services/candidatesService", () => ({
  candidatesService: {
    listSummaries: (...args: unknown[]) => listSummariesMock(...args),
  },
}));

function buildDiagnostic(
  overrides: Partial<CandidateJobFlowDiagnostic> = {},
): CandidateJobFlowDiagnostic {
  return {
    candidate_id: "5fdcc13a-af19-40e6-88b8-828920c46e0e",
    job_id: "bb6aa5f2-a040-461a-adef-c79a5ef88872",
    active_pipeline_exists: true,
    current_analysis_id_exists: true,
    current_analysis_exists: true,
    current_analysis_status: "completed",
    active_job_profile_exists: true,
    match_exists: true,
    match_points_to_active_job_profile: true,
    score_exists: true,
    score_source_analysis_matches_current: true,
    candidate_in_ranking: true,
    reason_code: "flow_consistent",
    ...overrides,
  };
}

const candidateSummary = {
  id: "5fdcc13a-af19-40e6-88b8-828920c46e0e",
  full_name: "Alice Silva",
  email: "alice@example.com",
  phone: null,
  cpf: null,
  application_source: null,
  tags: [],
  created_at: "2026-01-01T00:00:00Z",
  archived_at: null,
  archive_reason: null,
  resume_count: 1,
  linked_job_count: 1,
  latest_job_id: "bb6aa5f2-a040-461a-adef-c79a5ef88872",
  latest_job_title: "Pessoa Engenheira Backend",
  latest_job_stage: "interview",
  latest_relationship_status: "active",
  active_job_id: "bb6aa5f2-a040-461a-adef-c79a5ef88872",
  active_job_title: "Pessoa Engenheira Backend",
  active_job_stage: "interview",
  active_job_job_fit_score: null,
  ai_status: "completed",
};

describe("CandidateJobFlowDiagnosticsCard", () => {
  beforeEach(() => {
    getDiagnosticMock.mockReset();
    repairMock.mockReset();
    listSummariesMock.mockReset();

    getDiagnosticMock.mockResolvedValue(buildDiagnostic());
    listSummariesMock.mockResolvedValue({
      data: [candidateSummary],
      total: 1,
      page: 1,
      page_size: 8,
      total_pages: 1,
    });
    repairMock.mockResolvedValue({
      candidate_id: "5fdcc13a-af19-40e6-88b8-828920c46e0e",
      job_id: "bb6aa5f2-a040-461a-adef-c79a5ef88872",
      repaired: true,
      actions: [
        "stale_mismatched_scores",
        "stale_inactive_profile_matches",
        "recomputed_from_completed_analysis",
      ],
      before: buildDiagnostic({ reason_code: "completed_analysis_missing_score", score_exists: false }),
      after: buildDiagnostic({ reason_code: "flow_consistent" }),
    });
  });

  async function selectCandidateAndAutoJob() {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Filtro por candidato"), "Alice");
    await user.click(await screen.findByRole("button", { name: /Alice Silva/i }));
    expect(screen.getByLabelText("Job ID")).toHaveValue("bb6aa5f2-a040-461a-adef-c79a5ef88872");
    return user;
  }

  it("filtra por nome do candidato e chama diagnóstico", async () => {
    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();

    await user.click(screen.getByRole("button", { name: "Diagnosticar" }));

    await waitFor(() => {
      expect(getDiagnosticMock).toHaveBeenCalledWith(
        "5fdcc13a-af19-40e6-88b8-828920c46e0e",
        "bb6aa5f2-a040-461a-adef-c79a5ef88872",
      );
    });
  });

  it("exibe reason_code traduzido", async () => {
    getDiagnosticMock.mockResolvedValue(
      buildDiagnostic({ reason_code: "completed_analysis_missing_score", score_exists: false }),
    );

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();
    await user.click(screen.getByRole("button", { name: "Diagnosticar" }));

    expect(await screen.findByText("Análise concluída sem score")).toBeInTheDocument();
    expect(screen.getByText("Fluxo com inconsistência")).toBeInTheDocument();
  });

  it("exibe checklist com true/false e alerta para status não concluído", async () => {
    getDiagnosticMock.mockResolvedValue(
      buildDiagnostic({
        active_pipeline_exists: false,
        current_analysis_status: "processing",
        score_exists: false,
        candidate_in_ranking: false,
        reason_code: "analysis_not_completed",
      }),
    );

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();
    await user.click(screen.getByRole("button", { name: "Diagnosticar" }));

    expect(await screen.findByText("Pipeline ativo: ❌ não")).toBeInTheDocument();
    expect(screen.getByText("Status da análise: ⚠️ processing")).toBeInTheDocument();
    expect(screen.getByText("Score existe: ❌ não")).toBeInTheDocument();
    expect(screen.getByText("Candidato aparece no ranking: ❌ não")).toBeInTheDocument();
  });

  it("botão reparar chama endpoint", async () => {
    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();

    await user.click(screen.getByRole("button", { name: "Reparar" }));

    await waitFor(() => {
      expect(repairMock).toHaveBeenCalledWith(
        "5fdcc13a-af19-40e6-88b8-828920c46e0e",
        "bb6aa5f2-a040-461a-adef-c79a5ef88872",
      );
    });
  });

  it("exibe actions traduzidas", async () => {
    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();

    await user.click(screen.getByRole("button", { name: "Reparar" }));

    expect(await screen.findByText("Reparo executado.")).toBeInTheDocument();
    expect(
      screen.getByText("• Scores desalinhados marcados como stale"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("• Matches com perfil inativo marcados como stale"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("• Score recomposto a partir da análise concluída"),
    ).toBeInTheDocument();
  });

  it("atualiza diagnóstico após repair", async () => {
    getDiagnosticMock
      .mockResolvedValueOnce(
        buildDiagnostic({ reason_code: "completed_analysis_missing_score", score_exists: false }),
      )
      .mockResolvedValueOnce(buildDiagnostic({ reason_code: "flow_consistent" }));

    repairMock.mockResolvedValue({
      candidate_id: "5fdcc13a-af19-40e6-88b8-828920c46e0e",
      job_id: "bb6aa5f2-a040-461a-adef-c79a5ef88872",
      repaired: true,
      actions: ["recomputed_from_completed_analysis"],
      before: buildDiagnostic({ reason_code: "completed_analysis_missing_score", score_exists: false }),
      after: buildDiagnostic({ reason_code: "flow_consistent" }),
    });

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();

    await user.click(screen.getByRole("button", { name: "Diagnosticar" }));
    expect(await screen.findByText("Análise concluída sem score")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reparar" }));

    expect(await screen.findByText("Depois: Fluxo consistente")).toBeInTheDocument();
    await waitFor(() => {
      expect(getDiagnosticMock).toHaveBeenCalledTimes(2);
    });
  });

  it.each([401, 403])("erro %s mostra mensagem amigável", async (status) => {
    getDiagnosticMock.mockRejectedValue(
      new HttpError(status, "Sem permissão para esta operação"),
    );

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();
    await user.click(screen.getByRole("button", { name: "Diagnosticar" }));

    expect(
      await screen.findByText(
        "Acesso negado. Esta funcionalidade é restrita a administradores.",
      ),
    ).toBeInTheDocument();
  });

  it("quando repaired=false exibe mensagem de reparo não aplicado", async () => {
    repairMock.mockResolvedValue({
      candidate_id: "5fdcc13a-af19-40e6-88b8-828920c46e0e",
      job_id: "bb6aa5f2-a040-461a-adef-c79a5ef88872",
      repaired: false,
      actions: [],
      before: buildDiagnostic({ reason_code: "analysis_not_completed", current_analysis_status: "processing" }),
      after: buildDiagnostic({ reason_code: "analysis_not_completed", current_analysis_status: "processing" }),
    });

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();
    await user.click(screen.getByRole("button", { name: "Reparar" }));

    expect(
      await screen.findByText("Nenhuma correção automática segura foi aplicada."),
    ).toBeInTheDocument();
  });

  it("sugere candidatos com problema e permite selecionar", async () => {
    listSummariesMock.mockResolvedValueOnce({
      data: [candidateSummary],
      total: 1,
      page: 1,
      page_size: 25,
      total_pages: 1,
    });

    getDiagnosticMock.mockResolvedValueOnce(
      buildDiagnostic({ reason_code: "completed_analysis_missing_score", score_exists: false }),
    );

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Sugerir candidatos com problema" }));

    expect(
      await screen.findByText("Candidatos com problema detectado"),
    ).toBeInTheDocument();
    const suggestionButton = screen.getByRole("button", {
      name: /Alice Silva .* Análise concluída sem score/i,
    });
    await user.click(suggestionButton);

    expect(screen.getByLabelText("Job ID")).toHaveValue("bb6aa5f2-a040-461a-adef-c79a5ef88872");
    expect(screen.getByLabelText("Filtro por candidato")).toHaveValue("Alice Silva");
  });

  it("não exibe dados sensíveis", async () => {
    getDiagnosticMock.mockResolvedValue({
      ...buildDiagnostic(),
      raw_llm_response: "SENSITIVE_RAW_LLM",
      prompt: "SENSITIVE_PROMPT",
      token: "SENSITIVE_TOKEN",
      resume_text: "SENSITIVE_RESUME",
    } as CandidateJobFlowDiagnostic);

    render(<CandidateJobFlowDiagnosticsCard />);
    const user = await selectCandidateAndAutoJob();
    await user.click(screen.getByRole("button", { name: "Diagnosticar" }));

    await screen.findAllByText("Fluxo consistente");
    expect(screen.queryByText("SENSITIVE_RAW_LLM")).not.toBeInTheDocument();
    expect(screen.queryByText("SENSITIVE_PROMPT")).not.toBeInTheDocument();
    expect(screen.queryByText("SENSITIVE_TOKEN")).not.toBeInTheDocument();
    expect(screen.queryByText("SENSITIVE_RESUME")).not.toBeInTheDocument();
  });
});
