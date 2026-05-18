import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { CandidatesPage } from "../CandidatesPage";
import { candidatesService } from "../../services/candidatesService";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", role: "admin" } }),
}));

vi.mock("../../features/pipeline/PipelineContext", () => ({
  usePipeline: () => ({
    notifyCandidatesChanged: vi.fn(),
    candidatesSyncTick: 0,
  }),
}));

vi.mock("../../features/pipeline/NewCandidateModal", () => ({
  NewCandidateModal: () => null,
}));

vi.mock("../../features/candidates/components/ArchiveCandidateModal", () => ({
  ArchiveCandidateModal: () => null,
}));

vi.mock("../../features/candidates/components/DeleteCandidateModal", () => ({
  DeleteCandidateModal: () => null,
}));

vi.mock("../../features/candidates/components/LinkCandidateJobModal", () => ({
  LinkCandidateJobModal: () => null,
}));

vi.mock("../../features/candidates/components/CandidatePreviewDrawer", () => ({
  CandidatePreviewDrawer: ({ candidateId }: { candidateId: string | null }) =>
    candidateId ? <div data-testid="candidate-preview-drawer">preview:{candidateId}</div> : null,
}));

vi.mock("../../services/candidatesService", async () => {
  const actual = await vi.importActual<typeof import("../../services/candidatesService")>(
    "../../services/candidatesService",
  );
  return {
    ...actual,
    candidatesService: {
      ...actual.candidatesService,
      listSummaries: vi.fn(),
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={["/candidatos"]}>
      <Routes>
        <Route path="/candidatos" element={<CandidatesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const listSummariesMock = vi.mocked(candidatesService.listSummaries);

beforeEach(() => {
  vi.clearAllMocks();
  listSummariesMock.mockResolvedValue({
    data: [
      {
        id: "candidate-1",
        full_name: "Pessoa Teste",
        email: "pessoa@teste.com",
        phone: "(11) 99999-0000",
        cpf: "123.456.789-00",
        tags: ["sql"],
        created_at: new Date().toISOString(),
        archived_at: null,
        archive_reason: null,
        application_source: "manual",
        resume_count: 1,
        linked_job_count: 0,
        latest_job_id: null,
        latest_job_title: null,
        latest_job_stage: null,
        latest_relationship_status: null,
        active_job_id: null,
        active_job_title: null,
        active_job_stage: null,
        active_job_job_fit_score: null,
        ai_status: null,
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
  });
});

describe("CandidatesPage filters", () => {
  it("renderiza Base de Talentos com filtros robustos", async () => {
    renderPage();

    await waitFor(() => {
      expect(listSummariesMock).toHaveBeenCalled();
    });

    expect(screen.getByRole("button", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Banco de Talentos" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/buscar nome, e-mail, cpf/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cidade")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("UF")).toBeInTheDocument();
  });

  it("aplica cidade/UF/faixa salarial/regime e envia para o backend", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(listSummariesMock).toHaveBeenCalled();
    });

    await user.type(screen.getByPlaceholderText("Cidade"), "Belém");
    await user.type(screen.getByPlaceholderText("UF"), "PA");
    await user.click(screen.getByRole("button", { name: /Filtros avançados/i }));
    await user.type(screen.getByPlaceholderText("Pretensão mín."), "3000");
    await user.type(screen.getByPlaceholderText("Pretensão máx."), "7000");
    await user.selectOptions(screen.getByDisplayValue("Regime desejado"), "CLT");

    await waitFor(() => {
      const latestCall = listSummariesMock.mock.calls.at(-1);
      expect(latestCall?.[2]).toMatchObject({
        city: "Belém",
        state: "PA",
        salary_min: 3000,
        salary_max: 7000,
        desired_contract_type: "CLT",
      });
    });
  });

  it("aplica aba Banco de Talentos e chips ativos", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(listSummariesMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("button", { name: "Banco de Talentos" }));

    await waitFor(() => {
      const latestCall = listSummariesMock.mock.calls.at(-1);
      expect(latestCall?.[2]).toMatchObject({ link_status_filter: "without_active_job" });
    });

    expect(screen.getAllByText("Banco de Talentos").length).toBeGreaterThan(0);
  });

  it("limpa filtros e remove parâmetros de query", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(listSummariesMock).toHaveBeenCalled();
    });

    await user.type(screen.getByPlaceholderText("Cidade"), "São Paulo");
    await waitFor(() => {
      const latestCall = listSummariesMock.mock.calls.at(-1);
      expect(latestCall?.[2]).toMatchObject({ city: "São Paulo" });
    });

    await user.click(screen.getByRole("button", { name: /Limpar filtros/i }));
    await waitFor(() => {
      const latestCall = listSummariesMock.mock.calls.at(-1);
      expect(latestCall?.[2]).toMatchObject({
        city: undefined,
        state: undefined,
        skill: undefined,
        salary_min: undefined,
        salary_max: undefined,
      });
    });
  });

  it("continua abrindo CandidatePreviewDrawer ao clicar no candidato", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Pessoa Teste")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Pessoa Teste"));
    expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("candidate-1");
  });
});
