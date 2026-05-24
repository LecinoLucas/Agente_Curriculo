import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CandidateDecisionSummaryCard } from "../CandidateDecisionSummaryCard";
import type { CandidateActiveJobDecision } from "../../../../../types/domain";

describe("CandidateDecisionSummaryCard", () => {
  const baseDecision: CandidateActiveJobDecision = {
    score_status: "score_ready",
    analysis_status: "completed",
    current_analysis_id: "analysis-1",
    match_score: 0.85,
    warnings: [],
    next_action: "review_candidate",
  };

  it("não renderiza quando active_job_decision é null", () => {
    const { container } = render(
      <CandidateDecisionSummaryCard
        activeJobDecision={null}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renderiza 'Aguardando vaga' para no_active_job", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "no_active_job",
          next_action: "none",
        }}
        activeJobTitle={null}
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Candidato ainda não está vinculado a uma vaga ativa"),
    ).toBeInTheDocument();
  });

  it("renderiza 'Aguardando análise' para waiting_analysis", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "waiting_analysis",
          next_action: "request_analysis",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Análise ainda não gerada para a vaga ativa"),
    ).toBeInTheDocument();
  });

  it("renderiza 'Análise em andamento' para analysis_processing", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "analysis_processing",
          next_action: "wait_analysis",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.getByText("Análise em andamento")).toBeInTheDocument();
  });

  it("renderiza 'Aderência calculada' para score_ready", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={baseDecision}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Aderência calculada e pronta para revisão"),
    ).toBeInTheDocument();
  });

  it("renderiza 'Aderência desatualizada' para score_stale", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "score_stale",
          next_action: "wait_analysis",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.getByText("Aderência desatualizada")).toBeInTheDocument();
  });

  it("renderiza 'Falha na análise' para analysis_failed", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "analysis_failed",
          next_action: "request_analysis",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.getByText("Falha na análise")).toBeInTheDocument();
  });

  it("renderiza 'Inconsistência detectada' para needs_repair", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "needs_repair",
          next_action: "run_repair",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Inconsistência detectada no sistema"),
    ).toBeInTheDocument();
  });

  it("renderiza próxima ação correta para review_candidate", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={baseDecision}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Revisar candidato e decidir avanço"),
    ).toBeInTheDocument();
  });

  it("renderiza match_score como percentual quando disponível", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={baseDecision}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("não renderiza match_score quando é null", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          match_score: null,
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  it("renderiza warning analysis_from_different_job com mensagem amigável", () => {
    const { container } = render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          warnings: ["analysis_from_different_job"],
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      container.textContent?.includes(
        "Há análise de outra vaga. Não use como aderência atual.",
      ),
    ).toBe(true);
  });

  it("renderiza múltiplos warnings quando presentes", () => {
    const { container } = render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          warnings: [
            "analysis_from_different_job",
            "analysis_not_current_pipeline",
          ],
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      container.textContent?.includes(
        "Há análise de outra vaga. Não use como aderência atual.",
      ),
    ).toBe(true);
    expect(
      container.textContent?.includes(
        "A análise não corresponde à análise atual da pipeline.",
      ),
    ).toBe(true);
  });

  it("renderiza título 'Resumo decisório'", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={baseDecision}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.getByText("Resumo decisório")).toBeInTheDocument();
  });

  it("renderiza nome da vaga quando disponível e não é no_active_job", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "score_ready",
        }}
        activeJobTitle="Backend Engineer"
        candidateName="João Silva"
      />,
    );

    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
  });

  it("não renderiza nome da vaga quando score_status é no_active_job", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "no_active_job",
          next_action: "none",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(screen.queryByText("Vaga Teste")).not.toBeInTheDocument();
  });

  it("não renderiza próximo passo quando next_action é 'none'", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          score_status: "no_active_job",
          next_action: "none",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.queryByText("Nenhuma ação necessária agora"),
    ).not.toBeInTheDocument();
  });

  it("renderiza wait_analysis como próximo passo", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          next_action: "wait_analysis",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Aguardar conclusão da análise"),
    ).toBeInTheDocument();
  });

  it("renderiza request_analysis como próximo passo", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          next_action: "request_analysis",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Solicitar ou reprocessar análise"),
    ).toBeInTheDocument();
  });

  it("renderiza run_repair como próximo passo", () => {
    render(
      <CandidateDecisionSummaryCard
        activeJobDecision={{
          ...baseDecision,
          next_action: "run_repair",
        }}
        activeJobTitle="Vaga Teste"
        candidateName="João Silva"
      />,
    );

    expect(
      screen.getByText("Executar diagnóstico/reparo"),
    ).toBeInTheDocument();
  });
});
