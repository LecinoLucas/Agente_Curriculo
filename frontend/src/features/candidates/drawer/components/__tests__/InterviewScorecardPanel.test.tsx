import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterviewScorecardPanel } from "../InterviewScorecardPanel";
import * as scorecardService from "../../../../../services/interviewScorecardService";
import { toast } from "../../../../../shared/utils/toast";
import type { InterviewScorecard } from "../../../../../types/domain";

vi.mock("../../../../../services/interviewScorecardService");
vi.mock("../../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const draftScorecard: InterviewScorecard = {
  id: "scorecard-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  interview_id: null,
  evaluator_id: "user-1",
  status: "draft",
  final_recommendation: null,
  overall_notes: null,
  submitted_at: null,
  created_at: "2026-05-13T10:00:00Z",
  updated_at: "2026-05-13T10:00:00Z",
  items: [
    {
      id: "item-1",
      scorecard_id: "scorecard-1",
      competency_name: "Comunicação",
      question_text: null,
      rating: null,
      evidence: null,
      weight: 1,
      display_order: 1,
      created_at: "2026-05-13T10:00:00Z",
      updated_at: "2026-05-13T10:00:00Z",
    },
  ],
};

describe("InterviewScorecardPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scorecardService.getInterviewScorecard).mockResolvedValue({
      scorecard: null,
      suggested_behavioral_questions: [],
    });
    vi.mocked(scorecardService.createInterviewScorecard).mockResolvedValue(draftScorecard);
    vi.mocked(scorecardService.updateInterviewScorecard).mockResolvedValue(draftScorecard);
    vi.mocked(scorecardService.submitInterviewScorecard).mockResolvedValue({
      ...draftScorecard,
      status: "submitted",
      final_recommendation: "yes",
      submitted_at: "2026-05-13T11:00:00Z",
    });
  });

  it("renderiza empty state sem scorecard", async () => {
    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText(/Nenhum scorecard criado/i)).toBeInTheDocument();
  });

  it("cria scorecard", async () => {
    const user = userEvent.setup();
    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhum scorecard criado/i);
    await user.click(screen.getByRole("button", { name: /Salvar rascunho/i }));

    await waitFor(() => {
      expect(scorecardService.createInterviewScorecard).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({ items: expect.any(Array) }),
      );
    });
  });

  it("preenche nota", async () => {
    const user = userEvent.setup();
    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhum scorecard criado/i);
    await user.selectOptions(screen.getByLabelText(/Nota de Competência técnica/i), "4");
    await user.click(screen.getByRole("button", { name: /Salvar rascunho/i }));

    await waitFor(() => {
      expect(scorecardService.createInterviewScorecard).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({
          items: expect.arrayContaining([expect.objectContaining({ rating: 4 })]),
        }),
      );
    });
  });

  it("preenche evidência", async () => {
    const user = userEvent.setup();
    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhum scorecard criado/i);
    await user.type(screen.getAllByLabelText(/Evidência/i)[0], "Trouxe exemplo concreto.");
    await user.click(screen.getByRole("button", { name: /Salvar rascunho/i }));

    await waitFor(() => {
      expect(scorecardService.createInterviewScorecard).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ evidence: "Trouxe exemplo concreto." }),
          ]),
        }),
      );
    });
  });

  it("salva rascunho existente", async () => {
    const user = userEvent.setup();
    vi.mocked(scorecardService.getInterviewScorecard).mockResolvedValue({
      scorecard: draftScorecard,
      suggested_behavioral_questions: [],
    });

    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByDisplayValue("Comunicação");
    await user.type(screen.getAllByLabelText(/Evidência/i)[0], "Boa escuta.");
    await user.click(screen.getByRole("button", { name: /Salvar rascunho/i }));

    await waitFor(() => {
      expect(scorecardService.updateInterviewScorecard).toHaveBeenCalledWith(
        "scorecard-1",
        expect.objectContaining({ items: expect.any(Array) }),
      );
    });
  });

  it("bloqueia submit sem recomendação", async () => {
    const user = userEvent.setup();
    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText(/Nenhum scorecard criado/i);
    await user.click(screen.getByRole("button", { name: /Enviar scorecard/i }));

    expect(await screen.findByText(/Selecione a recomendação final/i)).toBeInTheDocument();
    expect(scorecardService.submitInterviewScorecard).not.toHaveBeenCalled();
  });

  it("envia scorecard válido", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    vi.mocked(scorecardService.createInterviewScorecard).mockResolvedValue({
      ...draftScorecard,
      final_recommendation: "yes",
      items: [{ ...draftScorecard.items[0], rating: 5, evidence: "Evidência suficiente." }],
    });

    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" onSubmitted={onSubmitted} />);

    await screen.findByText(/Nenhum scorecard criado/i);
    await user.selectOptions(screen.getByLabelText(/Recomendação final/i), "yes");
    await user.selectOptions(screen.getByLabelText(/Nota de Competência técnica/i), "5");
    await user.type(screen.getAllByLabelText(/Evidência/i)[0], "Evidência suficiente.");
    await user.click(screen.getByRole("button", { name: /Enviar scorecard/i }));

    await waitFor(() => {
      expect(scorecardService.submitInterviewScorecard).toHaveBeenCalledWith("scorecard-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Avaliação concluída com sucesso.");
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it("submitted fica somente leitura", async () => {
    vi.mocked(scorecardService.getInterviewScorecard).mockResolvedValue({
      scorecard: {
        ...draftScorecard,
        status: "submitted",
        final_recommendation: "yes",
        submitted_at: "2026-05-13T11:00:00Z",
      },
      suggested_behavioral_questions: [],
    });

    render(<InterviewScorecardPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText(/Scorecard enviado/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Comunicação")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salvar rascunho/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar scorecard/i })).not.toBeInTheDocument();
  });
});
