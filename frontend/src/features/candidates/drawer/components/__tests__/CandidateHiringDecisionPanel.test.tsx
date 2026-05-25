import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateHiringDecisionPanel } from "../CandidateHiringDecisionPanel";
import * as hiringDecisionService from "../../../../../services/hiringDecisionService";
import type { HiringDecision } from "../../../../../types/domain";

vi.mock("../../../../../services/hiringDecisionService");

const submittedDecision: HiringDecision = {
  id: "decision-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  pipeline_id: null,
  decided_by: "user-1",
  decision_status: "submitted",
  decision_outcome: "advance",
  reason_code: "strong_fit",
  notes: "Evidências revisadas pela pessoa recrutadora.",
  based_on_decision_summary_snapshot: { decision_readiness: { status: "ready_for_human_decision" } },
  based_on_scorecard_id: "scorecard-1",
  based_on_behavioral_assignment_id: "assignment-1",
  based_on_behavioral_ai_evaluation_id: "ai-1",
  created_at: "2026-05-14T10:00:00Z",
  updated_at: "2026-05-14T10:00:00Z",
  submitted_at: "2026-05-14T10:00:00Z",
};

describe("CandidateHiringDecisionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hiringDecisionService.getHiringDecision).mockResolvedValue({ decision: null });
    vi.mocked(hiringDecisionService.getHiringDecisionHistory).mockResolvedValue({ decisions: [] });
    vi.mocked(hiringDecisionService.createHiringDecision).mockResolvedValue(submittedDecision);
  });

  it("renderiza empty state sem decisão", async () => {
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText(/Nenhuma decisão final registrada/i)).toBeInTheDocument();
  });

  it("abre form de decisão", async () => {
    const user = userEvent.setup();
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhuma decisão final registrada/i);
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));

    expect(screen.getByLabelText(/^Decisão$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Motivo$/i)).toBeInTheDocument();
  });

  it("seleciona outcome", async () => {
    const user = userEvent.setup();
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhuma decisão final registrada/i);
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));
    await user.selectOptions(screen.getByLabelText(/^Decisão$/i), "hire");

    expect((screen.getByLabelText(/^Decisão$/i) as HTMLSelectElement).value).toBe("hire");
  });

  it("seleciona reason_code", async () => {
    const user = userEvent.setup();
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhuma decisão final registrada/i);
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));
    await user.selectOptions(screen.getByLabelText(/^Motivo$/i), "interview_concern");

    expect((screen.getByLabelText(/^Motivo$/i) as HTMLSelectElement).value).toBe("interview_concern");
  });

  it("exige notes quando necessário", async () => {
    const user = userEvent.setup();
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhuma decisão final registrada/i);
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));
    await user.selectOptions(screen.getByLabelText(/^Decisão$/i), "reject");
    await user.selectOptions(screen.getByLabelText(/^Motivo$/i), "interview_concern");
    await user.click(screen.getByLabelText(/Confirmo que esta decisão/i));
    await user.click(screen.getAllByRole("button", { name: /^Registrar decisão$/i })[1]);

    expect(await screen.findByText(/Informe uma observação/i)).toBeInTheDocument();
    expect(hiringDecisionService.createHiringDecision).not.toHaveBeenCalled();
  });

  it("registra decisão sem mover pipeline", async () => {
    const user = userEvent.setup();
    const onDecisionSubmitted = vi.fn();
    render(
      <CandidateHiringDecisionPanel
        jobId="job-1"
        candidateId="candidate-1"
        onDecisionSubmitted={onDecisionSubmitted}
      />,
    );

    await screen.findByText(/Nenhuma decisão final registrada/i);
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));
    await user.selectOptions(screen.getByLabelText(/^Decisão$/i), "advance");
    await user.selectOptions(screen.getByLabelText(/^Motivo$/i), "strong_fit");
    await user.type(screen.getByLabelText(/^Observação$/i), "Decisão revisada por humano.");
    await user.click(screen.getByLabelText(/Confirmo que esta decisão/i));
    await user.click(screen.getAllByRole("button", { name: /^Registrar decisão$/i })[1]);

    await waitFor(() => {
      expect(hiringDecisionService.createHiringDecision).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({
          decision_outcome: "advance",
          reason_code: "strong_fit",
          pipeline_action: expect.objectContaining({ enabled: false }),
        }),
      );
    });
    await waitFor(() => {
      expect(onDecisionSubmitted).toHaveBeenCalledWith(submittedDecision);
    });
  });

  it("não oferece movimentação de pipeline no formulário de decisão", async () => {
    const user = userEvent.setup();
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhuma decisão final registrada/i);
    await user.click(screen.getByRole("button", { name: /^Registrar decisão$/i }));

    expect(screen.queryByLabelText(/Mover candidato na pipeline agora/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Etapa de destino/i)).not.toBeInTheDocument();
  });

  it("mostra decisão submitted", async () => {
    vi.mocked(hiringDecisionService.getHiringDecision).mockResolvedValue({ decision: submittedDecision });
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText("Avançar")).toBeInTheDocument();
    expect(screen.getByText("Registrada")).toBeInTheDocument();
    expect(screen.getByText(/Evidências revisadas/i)).toBeInTheDocument();
  });

  it("mostra histórico", async () => {
    const oldDecision: HiringDecision = {
      ...submittedDecision,
      id: "decision-old",
      decision_status: "superseded",
      decision_outcome: "hold",
      reason_code: "partial_fit",
      notes: "Decisão anterior preservada.",
    };
    vi.mocked(hiringDecisionService.getHiringDecision).mockResolvedValue({ decision: submittedDecision });
    vi.mocked(hiringDecisionService.getHiringDecisionHistory).mockResolvedValue({
      decisions: [submittedDecision, oldDecision],
    });
    const user = userEvent.setup();

    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText("Avançar");
    await user.click(screen.getByRole("button", { name: /Histórico de decisões/i }));

    expect(await screen.findByText(/Decisão anterior preservada/i)).toBeInTheDocument();
  });

  it("não mostra linguagem de decisão automática", async () => {
    render(<CandidateHiringDecisionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhuma decisão final registrada/i);

    expect(screen.queryByText(/aprovado automaticamente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reprovado automaticamente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/decisão automática/i)).not.toBeInTheDocument();
  });
});
