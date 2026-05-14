import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ManagerReviewPage } from "../ManagerReviewPage";
import * as managerService from "../../../services/managerService";

vi.mock("../../../services/managerService");

const mockJobs = [
  { id: "job-1", title: "Senior Developer", candidate_count: 5, assigned_count: 2 },
  { id: "job-2", title: "Product Manager", candidate_count: 3, assigned_count: 1 },
];

const mockCandidates = [
  {
    id: "cand-1",
    name: "João Silva",
    email: "joao@example.com",
    pipeline_stage: "screening",
    scorecard_status: "draft",
  },
  {
    id: "cand-2",
    name: "Maria Santos",
    email: "maria@example.com",
    pipeline_stage: "interview",
    scorecard_status: "submitted",
  },
];

const mockSummary = {
  id: "cand-1",
  name: "João Silva",
  email: "joao@example.com",
  pipeline_stage: "screening",
  scorecard: {
    status: "draft",
    recommendation: "strong_yes",
    submitted_at: null,
  },
};

describe("ManagerReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(managerService.managerService.listJobs).mockResolvedValue({
      jobs: mockJobs,
    });
    vi.mocked(managerService.managerService.listCandidates).mockResolvedValue({
      job_id: "job-1",
      candidates: mockCandidates,
    });
    vi.mocked(managerService.managerService.getCandidateSummary).mockResolvedValue(
      mockSummary,
    );
  });

  it("renderiza empty state sem vagas", async () => {
    vi.mocked(managerService.managerService.listJobs).mockResolvedValue({
      jobs: [],
    });

    render(<ManagerReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma vaga atribuída no momento")).toBeInTheDocument();
    });
  });

  it("renderiza lista de vagas", async () => {
    render(<ManagerReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Senior Developer")).toBeInTheDocument();
      expect(screen.getByText("Product Manager")).toBeInTheDocument();
    });
  });

  it("ao clicar em vaga, lista candidatos", async () => {
    const mockListCandidates = vi.mocked(managerService.managerService.listCandidates);
    mockListCandidates.mockResolvedValueOnce({
      job_id: "job-1",
      candidates: mockCandidates,
    });

    render(<ManagerReviewPage />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("Senior Developer")).toBeInTheDocument();
    });

    const jobButtons = screen.getAllByRole("button");
    const jobButton = jobButtons.find(btn => btn.textContent.includes("Senior Developer"));

    if (jobButton) {
      await user.click(jobButton);
    }

    await waitFor(() => {
      expect(mockListCandidates).toHaveBeenCalledWith("job-1");
      expect(screen.queryByText("João Silva")).toBeInTheDocument();
    });
  });

  it("ao clicar em candidato, mostra resumo seguro", async () => {
    const mockGetSummary = vi.mocked(managerService.managerService.getCandidateSummary);
    mockGetSummary.mockResolvedValueOnce(mockSummary);

    render(<ManagerReviewPage />);
    const user = userEvent.setup();

    // Wait for initial jobs to load
    await waitFor(() => {
      expect(screen.getByText("Senior Developer")).toBeInTheDocument();
    });

    // Click on first job
    const jobButtons = screen.getAllByRole("button");
    const jobButton = jobButtons.find(btn => btn.textContent.includes("Senior Developer"));
    if (jobButton) {
      await user.click(jobButton);
    }

    // Wait for candidates to load
    await waitFor(() => {
      expect(screen.queryByText("João Silva")).toBeInTheDocument();
    }, { timeout: 3000 });

    // Click on candidate
    const candidateButtons = screen.getAllByRole("button");
    const candidateButton = candidateButtons.find(btn => btn.textContent.includes("João Silva"));
    if (candidateButton) {
      await user.click(candidateButton);
    }

    // Wait for summary to load
    await waitFor(() => {
      expect(mockGetSummary).toHaveBeenCalledWith("job-1", "cand-1");
    });
  });

  it("não renderiza documentos", () => {
    render(<ManagerReviewPage />);
    expect(screen.queryByText(/download|pdf|arquivo/i)).not.toBeInTheDocument();
  });

  it("não renderiza payload ERP", () => {
    render(<ManagerReviewPage />);
    expect(screen.queryByText(/erp|payload|api/i)).not.toBeInTheDocument();
  });

  it("não renderiza detalhes técnicos de IA/scoring", () => {
    render(<ManagerReviewPage />);
    expect(screen.queryByText(/prompt|token|embedding|score breakdown/i)).not.toBeInTheDocument();
  });

  it("mostra loading/error states", async () => {
    vi.mocked(managerService.managerService.listJobs).mockRejectedValueOnce(
      new Error("Erro ao conectar"),
    );

    render(<ManagerReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Erro ao conectar")).toBeInTheDocument();
    });
  });
});
