import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BehavioralAIEvaluationPanel } from "../BehavioralAIEvaluationPanel";
import * as aiEvaluationService from "../../../../../services/behavioralAIEvaluationService";
import type { BehavioralAIEvaluationResponse } from "../../../../../types/domain";

vi.mock("../../../../../services/behavioralAIEvaluationService");

const completedEvaluation: BehavioralAIEvaluationResponse = {
  id: "evaluation-1",
  assignment_id: "assignment-1",
  status: "completed",
  confidence: "high",
  summary: "Perfil demonstra boa aderencia aos comportamentos esperados.",
  strengths: ["Comunica contexto com clareza."],
  concerns: ["Explorar exemplos recentes em entrevista."],
  competency_signals: [
    {
      competency: "Colaboracao",
      signal: "strong",
      evidence: "Trouxe exemplos consistentes de trabalho com pares.",
      concerns: [],
    },
  ],
  suggested_interview_questions: ["Conte uma situacao em que alinhou expectativas com stakeholders."],
  risk_flags: [{ code: "limited_sample", message: "Baseado apenas nas respostas comportamentais." }],
  error_message: null,
  created_at: "2026-05-14T10:00:00Z",
  updated_at: "2026-05-14T10:05:00Z",
  completed_at: "2026-05-14T10:05:00Z",
};

function renderPanel() {
  return render(
    <BehavioralAIEvaluationPanel
      jobId="job-1"
      candidateId="candidate-1"
      assignmentStatus="submitted"
    />,
  );
}

function expectNoDecisionLanguage() {
  expect(screen.queryByText(/aprovad[oa]/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/reprovad[oa]/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/score decis[oó]rio/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/nota decis[oó]ria/i)).not.toBeInTheDocument();
}

describe("BehavioralAIEvaluationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiEvaluationService.getBehavioralEvaluation).mockResolvedValue(null);
    vi.mocked(aiEvaluationService.triggerBehavioralAnalysis).mockResolvedValue({
      evaluation_id: "evaluation-queued",
      assignment_id: "assignment-1",
      status: "processing",
      message: "Analise iniciada.",
    });
  });

  it("nao renderiza quando a avaliacao comportamental ainda nao foi submetida", async () => {
    render(
      <BehavioralAIEvaluationPanel
        jobId="job-1"
        candidateId="candidate-1"
        assignmentStatus="pending"
      />,
    );

    await waitFor(() => {
      expect(aiEvaluationService.getBehavioralEvaluation).toHaveBeenCalledWith("job-1", "candidate-1");
    });
    expect(screen.queryByText(/Análise assistida por IA/i)).not.toBeInTheDocument();
  });

  it("exibe loading enquanto carrega a avaliacao assistiva", () => {
    vi.mocked(aiEvaluationService.getBehavioralEvaluation).mockImplementation(
      () => new Promise(() => {}),
    );

    const { container } = renderPanel();

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("exibe empty state com acao para gerar analise quando nao ha avaliacao", async () => {
    renderPanel();

    expect(await screen.findByRole("button", { name: /Gerar análise assistida por IA/i })).toBeInTheDocument();
    expect(aiEvaluationService.getBehavioralEvaluation).toHaveBeenCalledWith("job-1", "candidate-1");
    expectNoDecisionLanguage();
  });

  it("exibe estado processing sem linguagem decisoria", async () => {
    vi.mocked(aiEvaluationService.getBehavioralEvaluation).mockResolvedValue({
      ...completedEvaluation,
      status: "processing",
      confidence: null,
      summary: null,
      completed_at: null,
    });

    renderPanel();

    expect(await screen.findByText(/Análise em processamento/i)).toBeInTheDocument();
    expect(screen.getByText(/Isso pode levar alguns minutos/i)).toBeInTheDocument();
    expectNoDecisionLanguage();
  });

  it("exibe avaliacao completed com sinais assistivos sem score decisorio", async () => {
    vi.mocked(aiEvaluationService.getBehavioralEvaluation).mockResolvedValue(completedEvaluation);

    renderPanel();

    expect(await screen.findByText(/Análise disponível - Confiança:/i)).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText("Resumo")).toBeInTheDocument();
    expect(screen.getByText(/Perfil demonstra boa aderencia/i)).toBeInTheDocument();
    expect(screen.getByText("Sinais por Competência")).toBeInTheDocument();
    expect(screen.getByText("Colaboracao")).toBeInTheDocument();
    expect(screen.getByText("Forças Identificadas")).toBeInTheDocument();
    expect(screen.getByText("Pontos de Atenção")).toBeInTheDocument();
    expect(screen.getByText("Perguntas Sugeridas para Entrevista")).toBeInTheDocument();
    expect(screen.getByText("Limitações da Análise")).toBeInTheDocument();
    expectNoDecisionLanguage();
  });

  it("exibe estado failed e permite tentar novamente", async () => {
    const user = userEvent.setup();
    vi.mocked(aiEvaluationService.getBehavioralEvaluation).mockResolvedValue({
      ...completedEvaluation,
      status: "failed",
      confidence: null,
      summary: null,
      strengths: null,
      concerns: null,
      competency_signals: null,
      suggested_interview_questions: null,
      risk_flags: null,
      error_message: "Respostas insuficientes para analise.",
      completed_at: null,
    });

    renderPanel();

    expect(await screen.findByText(/Análise não disponível/i)).toBeInTheDocument();
    expect(screen.getByText(/Respostas insuficientes/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(aiEvaluationService.triggerBehavioralAnalysis).toHaveBeenCalledWith("job-1", "candidate-1");
    });
    expect(await screen.findByText(/Análise em processamento/i)).toBeInTheDocument();
    expectNoDecisionLanguage();
  });
});
