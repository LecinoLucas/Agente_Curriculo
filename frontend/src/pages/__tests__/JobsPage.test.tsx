import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../types/domain";

const { navigateMock, useAuthMock, useJobsListMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useJobsListMock: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: useAuthMock,
}));

vi.mock("../../features/jobs/hooks/useJobsList", () => ({
  useJobsList: useJobsListMock,
}));

import { VagasPage } from "../VagasPage";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Desenvolvedor React",
    description: "Vaga para React",
    requirements: null,
    status: "published",
    seniority_level: "senior",
    minimum_education_level: null,
    minimum_years_experience: null,
    deal_breakers: [],
    work_model: "remote",
    location: "São Paulo",
    salary_min: null,
    salary_max: null,
    salary_currency: "BRL",
    job_area: "Tecnologia",
    responsibilities: null,
    experience_context: null,
    behavioral_requirements: [],
    mandatory_skills: ["React"],
    nice_to_have_skills: [],
    screening_questions: [],
    benefits: [],
    working_hours: null,
    priority: "normal",
    quality_score: 92,
    quality_status: "good",
    behavioral_template_id: null,
    selection_flow_type: "standard",
    requires_behavioral_assessment: false,
    requires_behavioral_ai_evaluation: false,
    requires_interview: true,
    requires_scorecard: false,
    requires_manager_review: false,
    created_by: "user-1",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
    ...overrides,
  };
}

function mockJobsPageState(overrides: Record<string, unknown> = {}) {
  const job = makeJob();
  useJobsListMock.mockReturnValue({
    loading: false,
    error: null,
    page: 1,
    setPage: vi.fn(),
    pageSize: 20,
    setPageSize: vi.fn(),
    total: 1,
    totalPages: 1,
    searchInput: "",
    setSearchInput: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    areaFilter: "all",
    setAreaFilter: vi.fn(),
    workModelFilter: "all",
    setWorkModelFilter: vi.fn(),
    selectedJobId: null,
    setSelectedJobId: vi.fn(),
    runningAction: null,
    archiveTarget: null,
    setArchiveTarget: vi.fn(),
    jobOperationalData: {
      "job-1": {
        totalCandidates: 4,
        stageCounts: { entry: 2, screening: 1, offer: 1 },
        latestActivity: "2026-06-05T10:00:00Z",
        strongCandidates: 0,
        topScore: null,
      },
    },
    filteredJobs: [job],
    selectedJob: null,
    loadJobs: vi.fn(),
    summary: {
      all: 1,
      published: 1,
      draft: 0,
      paused: 0,
      closed: 0,
      cancelled: 0,
      archived: 0,
      attention: 0,
    },
    areaOptions: ["Tecnologia"],
    workModelOptions: ["remote"],
    statusCounts: {
      all: 1,
      published: 1,
      draft: 0,
      paused: 0,
      closed: 0,
      cancelled: 0,
      archived: 0,
    },
    hasActiveFilters: false,
    clearFilters: vi.fn(),
    handlePause: vi.fn(),
    handleClose: vi.fn(),
    handleDelete: vi.fn(),
    handleArchive: vi.fn(),
    handleRestore: vi.fn(),
    handleRecalculateRanking: vi.fn(),
    ...overrides,
  });
}

describe("JobsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { role: "admin" } });
    mockJobsPageState();
  });

  it("renderiza dados essenciais de Vagas sem depender de ranking automatico", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <VagasPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Vagas" })).toBeInTheDocument();
    expect(screen.getByText("Desenvolvedor React")).toBeInTheDocument();
    expect(screen.getByText(/4 candidatos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abrir pipeline/i })).toBeInTheDocument();
  });

  it("carrega candidatos/ranking sob demanda ao abrir o pipeline da vaga", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <VagasPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /abrir pipeline/i }));

    expect(navigateMock).toHaveBeenCalledWith("/pipeline/job-1");
  });

  it("exibe a opção Recalcular ranking no menu da vaga e chama a função correta", () => {
    const handleRecalculateRankingMock = vi.fn();
    mockJobsPageState({
      handleRecalculateRanking: handleRecalculateRankingMock,
    });
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <VagasPage />
      </MemoryRouter>,
    );

    const actionMenuButton = screen.getByRole("button", { name: /Ações da vaga/i });
    fireEvent.click(actionMenuButton);

    const recalculateButton = screen.getByRole("button", { name: /Recalcular ranking/i });
    expect(recalculateButton).toBeInTheDocument();
    
    fireEvent.click(recalculateButton);
    expect(handleRecalculateRankingMock).toHaveBeenCalledWith("job-1");
  });
});
