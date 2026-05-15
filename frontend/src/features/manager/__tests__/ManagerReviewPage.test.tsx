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
} = vi.hoisted(() => ({
  mockListReviewRequests: vi.fn(),
  mockSubmitManagerFeedback: vi.fn(),
  mockListJobs: vi.fn(),
  mockListCandidates: vi.fn(),
  mockGetCandidateSummary: vi.fn(),
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
});
