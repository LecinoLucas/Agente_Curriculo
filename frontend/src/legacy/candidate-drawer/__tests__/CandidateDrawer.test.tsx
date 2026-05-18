import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const {
  listJobsMock,
  loadJobsMock,
} = vi.hoisted(() => ({
  listJobsMock: vi.fn(),
  loadJobsMock: vi.fn(),
}));

vi.mock("../../../services/jobsService", () => ({
  listJobs: listJobsMock,
}));

vi.mock("../../../features/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      role: "admin",
      real_ai_token_spend_enabled: true,
    },
  }),
}));

vi.mock("../../../features/candidates/drawer/v2", () => ({
  CandidateProfileView: ({ children, onTabChange }: any) => (
    <div>
      <div>mock-profile</div>
      <button type="button" onClick={() => onTabChange("communications")}>
        Comunicações
      </button>
      {children}
    </div>
  ),
  OverviewTabWithHistory: () => null,
  ScoreTabWithAnalysis: () => null,
}));

vi.mock("../../../features/candidates/drawer/hooks/useCandidateDecision", () => ({
  useCandidateDecision: () => ({
    primaryPipelineEntry: {
      candidate_id: "candidate-1",
      job_id: "job-1",
      job_title: "Vaga 1",
      stage: "entry",
      relationship_status: "active",
      is_terminal: false,
      terminated_at: null,
      termination_reason: null,
      candidate_status: "Recebido",
      updated_at: new Date().toISOString(),
    },
    currentStage: "entry",
    activeJob: null,
    activeJobCompatibilityScore: null,
    hasPersistedCompatibilityScore: false,
    transferAvailableJobs: [],
    canTransferCurrentJob: true,
    compatibilityGuidance: null,
    activeJobLabel: "Vaga 1",
  }),
}));

vi.mock("../../../features/candidates/drawer/hooks/useCandidateData", () => ({
  useCandidateData: () => ({
    analysisResult: null,
    rankingEntry: null,
    rankingEntryLoading: false,
    rankingEntryError: null,
  }),
}));

vi.mock("../useCandidateDrawerActions", () => ({
  useCandidateDrawerActions: () => ({
    editModalOpen: false,
    setEditModalOpen: vi.fn(),
    transferJobModalOpen: false,
    setTransferJobModalOpen: vi.fn(),
  }),
}));

vi.mock("../../../features/candidates/drawer/tabs/DocumentsTab", () => ({
  DocumentsTab: () => null,
}));

vi.mock("../../../features/candidates/drawer/tabs/InterviewTab", () => ({
  InterviewTab: () => null,
}));

vi.mock("../../../features/candidates/drawer/components/CandidateCommunicationsPanel", () => ({
  CandidateCommunicationsPanel: () => <div>mock-communications</div>,
}));

vi.mock("../../../features/pipeline/EditCandidateModal", () => ({
  EditCandidateModal: () => null,
}));

vi.mock("../../../features/candidates/components/LinkCandidateJobModal", () => ({
  LinkCandidateJobModal: () => null,
}));

vi.mock("../../../features/pipeline/PipelineContext", () => ({
  usePipeline: () => ({
    selectedCandidateId: "candidate-1",
    candidateOverview: {
      candidate: {
        id: "candidate-1",
        full_name: "Pessoa Teste",
        email: "pessoa@teste.com",
        phone: null,
        cpf: null,
        location_city: null,
        location_state: null,
        location_country: "BR",
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
      active_job_id: "job-1",
      active_job: {
        id: "job-1",
        title: "Vaga 1",
        status: "published",
      },
      pipeline_entries: [
        {
          candidate_id: "candidate-1",
          job_id: "job-1",
          job_title: "Vaga 1",
          stage: "entry",
          relationship_status: "active",
          is_terminal: false,
          terminated_at: null,
          termination_reason: null,
          candidate_status: "Recebido",
          updated_at: new Date().toISOString(),
        },
      ],
    },
    candidateLoading: false,
    candidateError: null,
    activePanelTab: "summary",
    activeJobId: "job-1",
    jobs: [],
    rankingSyncTick: 0,
    pollingAnalysisId: null,
    closeCandidate: vi.fn(),
    openCandidate: vi.fn(),
    switchPanelTab: vi.fn(),
    refreshBoard: vi.fn(),
    refreshCandidateOverview: vi.fn(),
    syncCandidateOverview: vi.fn(),
    syncAnalysisStart: vi.fn(),
    ensureAnalysisMatch: vi.fn(),
    startPolling: vi.fn(),
    notifyCandidatesChanged: vi.fn(),
    moveCandidateStage: vi.fn(),
    invalidateBoard: vi.fn(),
    patchCandidate: vi.fn(),
    loadJobs: loadJobsMock,
  }),
}));

import { CandidateDrawer } from "../CandidateDrawer";
import { TransferJobModal } from "../TransferJobModal";

describe("CandidateDrawer", () => {
  beforeEach(() => {
    listJobsMock.mockReset();
    loadJobsMock.mockReset();
  });

  it("não carrega a lista ampla de vagas ao abrir o drawer no overview", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <CandidateDrawer />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("mock-profile")).toBeInTheDocument();
    });

    expect(loadJobsMock).not.toHaveBeenCalled();
    expect(listJobsMock).not.toHaveBeenCalled();
  });

  it("exibe aba Comunicações no drawer", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <CandidateDrawer />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: "Comunicações" })).toBeInTheDocument();
  });

  it("carrega vagas sob demanda ao abrir o modal de transferência sem cache prévio", async () => {
    listJobsMock.mockResolvedValue({
      data: [
        { id: "job-1", title: "Vaga Atual", status: "published" },
        { id: "job-2", title: "Vaga Destino", status: "published" },
        { id: "job-3", title: "Vaga Pausada", status: "paused" },
      ],
      total: 3,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });

    render(
      <TransferJobModal
        isOpen={true}
        candidateId="candidate-1"
        fromJobId="job-1"
        availableJobs={[]}
        canTransfer={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listJobsMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("option", { name: "Vaga Destino" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Vaga Atual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Vaga Pausada" })).not.toBeInTheDocument();
  });
});
