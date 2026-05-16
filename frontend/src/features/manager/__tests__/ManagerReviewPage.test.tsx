import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ManagerReviewPage } from "../ManagerReviewPage";

const {
  mockListReviewRequests,
  mockSubmitManagerFeedback,
  mockListJobs,
  mockListCandidates,
  mockGetCandidateSummary,
  mockGetScorecard,
  mockCreateScorecard,
  mockPatchScorecard,
  mockSubmitScorecard,
} = vi.hoisted(() => ({
  mockListReviewRequests: vi.fn(),
  mockSubmitManagerFeedback: vi.fn(),
  mockListJobs: vi.fn(),
  mockListCandidates: vi.fn(),
  mockGetCandidateSummary: vi.fn(),
  mockGetScorecard: vi.fn(),
  mockCreateScorecard: vi.fn(),
  mockPatchScorecard: vi.fn(),
  mockSubmitScorecard: vi.fn(),
}));

vi.mock("../../../services/collaborationService", () => ({
  collaborationService: {
    listReviewRequests: mockListReviewRequests,
    submitManagerFeedback: mockSubmitManagerFeedback,
  },
}));

vi.mock("../../../services/managerService", () => ({
  managerService: {
    listJobs: mockListJobs,
    listCandidates: mockListCandidates,
    getCandidateSummary: mockGetCandidateSummary,
    getScorecard: mockGetScorecard,
    createScorecard: mockCreateScorecard,
    patchScorecard: mockPatchScorecard,
    submitScorecard: mockSubmitScorecard,
  },
}));

const mockRequest = {
  request_id: "req-1",
  candidate_id: "cand-1",
  candidate_name: "João Silva",
  job_id: "job-1",
  job_title: "Senior Developer",
  requested_by: "recruiter-1",
  requested_at: "2026-05-15T12:00:00Z",
  latest_message: "Preciso da sua revisão final.",
  status: "pending" as const,
  priority: "high" as const,
  target_manager_id: "manager-1",
  target_manager_name: "Marina Gestora",
  is_directed_to_me: true,
  pipeline_stage: "interview",
  interview_status: "awaiting_feedback",
  scorecard_status: "draft",
};

const mockSummary = {
  id: "cand-1",
  name: "João Silva",
  email: "joao@example.com",
  pipeline_stage: "interview",
  scorecard: {
    status: "draft",
    recommendation: "strong_yes",
    submitted_at: null,
  },
};

describe("ManagerReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListReviewRequests.mockResolvedValue({ requests: [mockRequest] });
    mockSubmitManagerFeedback.mockResolvedValue({
      id: "feedback-1",
      author_id: "manager-1",
      author_role: "manager",
      comment_type: "manager_feedback",
      recommendation: "advance",
      message: "Pode avançar",
      created_at: "2026-05-15T13:00:00Z",
    });
    mockListJobs.mockResolvedValue({
      jobs: [{ id: "job-1", title: "Senior Developer", candidate_count: 1, assigned_count: 1 }],
    });
    mockListCandidates.mockResolvedValue({
      job_id: "job-1",
      candidates: [
        {
          id: "cand-1",
          name: "João Silva",
          email: "joao@example.com",
          pipeline_stage: "interview",
          scorecard_status: "draft",
        },
      ],
    });
    mockGetCandidateSummary.mockResolvedValue(mockSummary);
    mockGetScorecard.mockResolvedValue({ scorecard: null, suggested_behavioral_questions: [] });

    const draftScorecard = {
      id: "sc-1",
      candidate_id: "cand-1",
      job_id: "job-1",
      evaluator_id: "manager-1",
      status: "draft",
      final_recommendation: "yes",
      overall_notes: null,
      submitted_at: null,
      items: [],
    };
    mockCreateScorecard.mockResolvedValue(draftScorecard);
    mockPatchScorecard.mockImplementation((_, body) =>
      Promise.resolve({ ...draftScorecard, ...body })
    );
    mockSubmitScorecard.mockResolvedValue({
      ...draftScorecard,
      status: "submitted",
      submitted_at: "2026-05-16T10:00:00Z",
    });
  });

  it("renderiza solicitações de revisão ao abrir a página", async () => {
    render(<ManagerReviewPage />);

    expect(await screen.findByText("João Silva")).toBeInTheDocument();
    expect(screen.getByText("Preciso da sua revisão final.")).toBeInTheDocument();
  });

  it("indica quando a solicitação foi direcionada ao gestor logado", async () => {
    render(<ManagerReviewPage />);

    const badges = await screen.findAllByText("Direcionada a você");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("carrega o resumo seguro ao selecionar uma solicitação", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));

    await waitFor(() => {
      expect(mockGetCandidateSummary).toHaveBeenCalledWith("job-1", "cand-1");
    });
    expect(await screen.findByText("Resumo seguro")).toBeInTheDocument();
  });

  it("envia feedback do gestor sem mover o restante do fluxo", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));
    await screen.findByText("Resumo seguro");
    await user.type(screen.getByPlaceholderText("Descreva sua avaliação do candidato..."), "Pode avançar");
    await user.click(screen.getByRole("button", { name: /Enviar feedback/i }));

    await waitFor(() => {
      expect(mockSubmitManagerFeedback).toHaveBeenCalledWith("job-1", "cand-1", {
        message: "Pode avançar",
        recommendation: "advance",
      });
    });
  });

  it("carrega vagas apenas ao entrar na aba de candidatos", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    expect(mockListJobs).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^Candidatos$/i }));

    await waitFor(() => {
      expect(mockListJobs).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Senior Developer")).toBeInTheDocument();
  });

  it("mostra erro se não conseguir carregar solicitações", async () => {
    mockListReviewRequests.mockRejectedValueOnce(new Error("Falha ao carregar"));

    render(<ManagerReviewPage />);

    expect(
      await screen.findByText("Não foi possível carregar as solicitações de revisão."),
    ).toBeInTheDocument();
  });

  it("carrega scorecard ao selecionar solicitação", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));

    await waitFor(() => {
      expect(mockGetScorecard).toHaveBeenCalledWith("job-1", "cand-1");
    });
    expect(await screen.findByText("Avaliação do Gestor")).toBeInTheDocument();
  });

  it("exibe formulário de scorecard com recomendação e observações quando não há scorecard salvo", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));
    await screen.findByText("Avaliação do Gestor");

    expect(screen.getByRole("button", { name: /salvar rascunho/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar avaliação/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Descreva sua avaliação detalhada do candidato...")).toBeInTheDocument();
  });

  it("salva rascunho de scorecard criando novo quando não existe", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));
    await screen.findByText("Avaliação do Gestor");

    await user.type(
      screen.getByPlaceholderText("Descreva sua avaliação detalhada do candidato..."),
      "Candidato demonstra boas habilidades."
    );
    await user.click(screen.getByRole("button", { name: /salvar rascunho/i }));

    await waitFor(() => {
      expect(mockCreateScorecard).toHaveBeenCalledWith("job-1", "cand-1", { items: [] });
      expect(mockPatchScorecard).toHaveBeenCalledWith("sc-1", {
        final_recommendation: "yes",
        overall_notes: "Candidato demonstra boas habilidades.",
      });
    });
  });

  it("salva rascunho sem criar novo quando scorecard já existe", async () => {
    const existingDraft = {
      id: "sc-existing",
      candidate_id: "cand-1",
      job_id: "job-1",
      evaluator_id: "manager-1",
      status: "draft",
      final_recommendation: "strong_yes",
      overall_notes: "Nota anterior",
      submitted_at: null,
      items: [],
    };
    mockGetScorecard.mockResolvedValue({ scorecard: existingDraft, suggested_behavioral_questions: [] });
    mockPatchScorecard.mockResolvedValue({ ...existingDraft, overall_notes: "Nota atualizada" });

    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));
    await screen.findByText("Avaliação do Gestor");

    // Existing notes should be pre-filled
    await waitFor(() => {
      expect((screen.getByPlaceholderText("Descreva sua avaliação detalhada do candidato...") as HTMLTextAreaElement).value).toBe("Nota anterior");
    });

    await user.click(screen.getByRole("button", { name: /salvar rascunho/i }));

    await waitFor(() => {
      expect(mockCreateScorecard).not.toHaveBeenCalled();
      expect(mockPatchScorecard).toHaveBeenCalledWith("sc-existing", expect.objectContaining({
        final_recommendation: "strong_yes",
      }));
    });
  });

  it("submete scorecard e exibe estado 'Avaliação enviada' com campos bloqueados", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));
    await screen.findByText("Avaliação do Gestor");

    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => {
      expect(mockSubmitScorecard).toHaveBeenCalledWith("sc-1");
    });

    expect(await screen.findByText("Avaliação enviada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar rascunho/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar avaliação/i })).not.toBeInTheDocument();
  });

  it("exibe scorecard já submetido em modo leitura ao selecionar solicitação", async () => {
    mockGetScorecard.mockResolvedValue({
      scorecard: {
        id: "sc-submitted",
        candidate_id: "cand-1",
        job_id: "job-1",
        evaluator_id: "manager-1",
        status: "submitted",
        final_recommendation: "strong_yes",
        overall_notes: "Excelente candidato.",
        submitted_at: "2026-05-16T09:00:00Z",
        items: [],
      },
      suggested_behavioral_questions: [],
    });

    const user = userEvent.setup();
    render(<ManagerReviewPage />);

    await user.click(await screen.findByRole("button", { name: /João Silva/i }));

    expect(await screen.findByText("Avaliação enviada")).toBeInTheDocument();
    expect(await screen.findByText("Excelente candidato.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar rascunho/i })).not.toBeInTheDocument();
  });

  it("sem solicitações exibe estado vazio com mensagem correta", async () => {
    mockListReviewRequests.mockResolvedValue({ requests: [] });
    render(<ManagerReviewPage />);

    expect(await screen.findByText("Nenhuma solicitação pendente")).toBeInTheDocument();
    expect(screen.getByText(/quando um recrutador solicitar/i)).toBeInTheDocument();
  });

  it("exibe contador de pendentes na aba de solicitações", async () => {
    const pending2 = [
      mockRequest,
      { ...mockRequest, request_id: "req-2", candidate_name: "Maria Souza", status: "pending" as const },
    ];
    mockListReviewRequests.mockResolvedValue({ requests: pending2 });
    render(<ManagerReviewPage />);

    await screen.findByText("João Silva");
    // Badge should show count 2
    const badge = screen.getByText("2");
    expect(badge).toBeInTheDocument();
  });

  it("gestor não vê área admin nem recruiter no menu", async () => {
    render(<ManagerReviewPage />);
    await screen.findByText("João Silva");
    expect(screen.queryByText(/painel admin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/importação/i)).not.toBeInTheDocument();
  });
});
