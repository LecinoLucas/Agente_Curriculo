import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { LinkCandidateJobModal } from "../LinkCandidateJobModal";
import { OverviewTab } from "../../drawer/tabs/OverviewTab";
import type { CandidateOverview, Job } from "../../../../types/domain";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const listJobsMock = vi.fn();
const addCandidateToJobMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("../../../../services/jobsService", () => ({
  listJobs: (...args: unknown[]) => listJobsMock(...args),
}));

vi.mock("../../../../services/pipelineService", () => ({
  pipelineService: {
    addCandidateToJob: (...args: unknown[]) => addCandidateToJobMock(...args),
  },
}));

vi.mock("../../../../shared/utils/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function buildJob(overrides?: Partial<Job>): Job {
  return {
    id: "job-1",
    title: "Analista de Dados",
    description: "Descrição",
    requirements: null,
    status: "published",
    seniority_level: "pleno",
    minimum_education_level: null,
    minimum_years_experience: null,
    deal_breakers: [],
    work_model: "remote",
    location: "São Paulo",
    salary_min: null,
    salary_max: null,
    salary_currency: "BRL",
    job_area: "data",
    responsibilities: null,
    experience_context: null,
    behavioral_requirements: [],
    priority: "normal",
    quality_score: null,
    quality_status: null,
    created_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildOverview(overrides?: Partial<CandidateOverview>): CandidateOverview {
  return {
    candidate: {
      id: "candidate-1",
      full_name: "Pessoa Teste",
      email: "pessoa@teste.com",
      phone: null,
      cpf: null,
      location_city: null,
      location_state: null,
      location_country: "Brasil",
      linkedin_url: null,
      github_url: null,
      portfolio_url: null,
      internal_notes: null,
      tags: [],
      user_id: null,
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    resumes: [],
    latest_analysis: null,
    latest_analysis_pipeline: null,
    top_matches: [],
    active_job_id: null,
    active_job: null,
    pipeline_entries: [],
    ...overrides,
  };
}

function OverviewLinkHarness() {
  const [modalOpen, setModalOpen] = useState(false);
  const [overview, setOverview] = useState<CandidateOverview>(buildOverview());
  const activePipelineEntry = overview.pipeline_entries.find(
    (entry) => entry.relationship_status === "active"
  ) ?? null;
  const activeJob = activePipelineEntry
    ? { id: activePipelineEntry.job_id, title: activePipelineEntry.job_title, status: "published" as const }
    : null;

  return (
    <MemoryRouter future={routerFuture}>
      <OverviewTab
        overview={overview}
        activeJobId={overview.active_job_id}
        activeJob={activeJob}
        activePipelineEntry={activePipelineEntry}
        onEdit={vi.fn()}
        onLinkJob={() => setModalOpen(true)}
      />
      <LinkCandidateJobModal
        isOpen={modalOpen}
        candidateId={overview.candidate.id}
        candidateName={overview.candidate.full_name}
        onClose={() => setModalOpen(false)}
        onLinked={async (jobId) => {
          setOverview(
            buildOverview({
              active_job_id: jobId,
              active_job: { id: jobId, title: "Analista de Dados", status: "published" },
              pipeline_entries: [
                {
                  candidate_id: "candidate-1",
                  job_id: jobId,
                  job_title: "Analista de Dados",
                  stage: "entry",
                  relationship_status: "active",
                  is_terminal: false,
                  terminated_at: null,
                  termination_reason: null,
                  candidate_status: "Recebido",
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
          );
        }}
      />
    </MemoryRouter>
  );
}

describe("LinkCandidateJobModal", () => {
  beforeEach(() => {
    listJobsMock.mockReset();
    addCandidateToJobMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("carrega vagas ativas e chama o endpoint correto ao vincular", async () => {
    const user = userEvent.setup();
    const onLinked = vi.fn();

    listJobsMock.mockResolvedValue({
      data: [
        buildJob(),
        buildJob({ id: "job-2", title: "Vaga rascunho", status: "draft" }),
      ],
      total: 2,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
    addCandidateToJobMock.mockResolvedValue({});

    render(
      <MemoryRouter future={routerFuture}>
        <LinkCandidateJobModal
          isOpen
          candidateId="candidate-1"
          candidateName="Pessoa Teste"
          onClose={vi.fn()}
          onLinked={onLinked}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Analista de Dados")).toBeInTheDocument();
    expect(screen.queryByText("Vaga rascunho")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vincular" }));

    await waitFor(() => {
      expect(addCandidateToJobMock).toHaveBeenCalledWith("candidate-1", {
        job_id: "job-1",
        initial_stage: "entry",
      });
    });

    expect(onLinked).toHaveBeenCalledWith("job-1");
    expect(toastSuccessMock).toHaveBeenCalledWith("Candidato vinculado à vaga com sucesso");
  });

  it("remove o estado vazio após o vínculo do candidato", async () => {
    const user = userEvent.setup();

    listJobsMock.mockResolvedValue({
      data: [buildJob()],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
    addCandidateToJobMock.mockResolvedValue({});

    render(<OverviewLinkHarness />);

    expect(screen.getByText("Candidato aguardando vaga")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vincular a uma vaga" }));
    await screen.findByText("Analista de Dados");
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    await waitFor(() => {
      expect(screen.queryByText("Candidato aguardando vaga")).not.toBeInTheDocument();
    });
    // Verify the job title appears in the Overview (may be in Status atual na vaga or as a label)
    const jobTitles = screen.getAllByText("Analista de Dados");
    expect(jobTitles.length).toBeGreaterThan(0);
  });

  it("mostra estado vazio quando não há vagas ativas disponíveis", async () => {
    listJobsMock.mockResolvedValue({
      data: [buildJob({ id: "job-3", status: "draft" })],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <LinkCandidateJobModal
          isOpen
          candidateId="candidate-1"
          candidateName="Pessoa Teste"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Nenhuma vaga ativa encontrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar nova vaga" })).toBeInTheDocument();
  });
});
