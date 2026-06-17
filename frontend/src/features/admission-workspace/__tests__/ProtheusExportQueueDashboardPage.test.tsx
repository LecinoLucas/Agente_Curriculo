import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { admissionWorkspaceService } from "../../../services/admissionWorkspaceService";
import type {
  AdmissionCaseOverview,
  ProtheusExportDashboardItem,
  ProtheusExportDashboardSummary,
} from "../../../types/domain";
import { ProtheusExportQueueDashboardPage } from "../ProtheusExportQueueDashboardPage";

vi.mock("../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getOverview: vi.fn(),
    getProtheusExportDashboard: vi.fn(),
    getProtheusExportDashboardItems: vi.fn(),
  },
}));

const summary: ProtheusExportDashboardSummary = {
  total: 5,
  active: 2,
  terminal: 3,
  action_required: 2,
  totals_by_status: {
    queued: 1,
    processing: 0,
    retry_scheduled: 1,
    success: 1,
    failed_permanent: 1,
    blocked: 1,
    cancelled: 0,
    unknown: 0,
  },
  top_errors: [],
  operational_flags: {
    is_stub_mode: true,
    bridge_enabled: true,
    real_send_enabled: false,
  },
};

function item(overrides: Partial<ProtheusExportDashboardItem>): ProtheusExportDashboardItem {
  return {
    id: "exp-base",
    case_id: "case-base",
    status: "queued",
    status_label: "Solicitação enfileirada",
    payload_status: "ready",
    payload_status_label: "Payload pronto",
    attempt_count: 0,
    max_attempts: 3,
    next_attempt_at: null,
    last_error_code: null,
    last_error_message_redacted: null,
    blocked_reason: null,
    last_trace_id: "trace-base",
    created_at: "2026-06-16T10:00:00Z",
    updated_at: "2026-06-16T10:00:00Z",
    finished_at: null,
    recommended_action: "Aguarde o processamento automático.",
    can_cancel: true,
    can_retry_manually: false,
    can_request_new: false,
    is_stub_mode: true,
    ...overrides,
  };
}

const failedItem = item({
  id: "exp-failed",
  case_id: "case-failed",
  status: "failed_permanent",
  status_label: "Falha permanente",
  attempt_count: 3,
  last_error_code: "ERR_VALIDATION",
  last_error_message_redacted: "Documento [redacted] inválido",
  last_trace_id: "trace-failed",
  recommended_action: "Revise manualmente antes de nova solicitação.",
});

const blockedItem = item({
  id: "exp-blocked",
  case_id: "case-blocked",
  status: "blocked",
  status_label: "Bloqueado por guardrail",
  blocked_reason: "Bloqueio técnico por contrato inválido",
  last_trace_id: "trace-blocked",
});

const retryItem = item({
  id: "exp-retry",
  case_id: "case-retry",
  status: "retry_scheduled",
  status_label: "Retry agendado",
  attempt_count: 1,
  next_attempt_at: "2026-06-16T11:00:00Z",
  last_trace_id: "trace-retry",
});

const unknownItem = item({
  id: "exp-unknown",
  case_id: "case-unknown",
  status: "mystery_status",
  status_label: "Status misterioso",
  last_trace_id: "trace-unknown",
});

function overview(caseId: string, candidateName: string, jobTitle: string): AdmissionCaseOverview {
  return {
    case: {
      id: caseId,
      status: "ready_for_admission",
      current_stage: "protheus",
      created_at: "2026-06-16T09:00:00Z",
      updated_at: "2026-06-16T10:00:00Z",
    },
    candidate: {
      id: `cand-${caseId}`,
      name: candidateName,
      initials: candidateName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      avatar_url: null,
    },
    job: {
      id: `job-${caseId}`,
      title: jobTitle,
    },
    status_label: "Pronto para exportacao",
    progress: {
      total: 4,
      approved: 4,
      pending: 0,
      rejected: 0,
      in_review: 0,
      waived: 0,
    },
    main_blocker: null,
    main_blockers: [],
    next_action: null,
    next_actions: [],
    summary: {
      responsible_name: "RH",
      created_at: "2026-06-16T09:00:00Z",
      last_update_at: "2026-06-16T10:00:00Z",
      readiness_status: "ready",
      ready_for_export: true,
    },
    integration_status: {
      state: "ready",
      label: "Pronto",
      ready_for_export: true,
    },
    updated_at: "2026-06-16T10:00:00Z",
  };
}

function mockDashboard(items: ProtheusExportDashboardItem[] = [failedItem, blockedItem, retryItem]) {
  vi.mocked(admissionWorkspaceService.getProtheusExportDashboard).mockResolvedValue(summary);
  vi.mocked(admissionWorkspaceService.getProtheusExportDashboardItems).mockResolvedValue({
    items,
    total: items.length,
    limit: 20,
    offset: 0,
    has_next: false,
  });
  vi.mocked(admissionWorkspaceService.getOverview).mockImplementation(async (caseId: string) => {
    if (caseId === "case-failed") return overview(caseId, "Marina Souza", "Analista de RH");
    if (caseId === "case-blocked") return overview(caseId, "Pedro Lima", "Assistente Financeiro");
    if (caseId === "case-retry") return overview(caseId, "Ana Costa", "Enfermeira");
    return overview(caseId, "Caso Sem Nome", "Vaga nao informada");
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProtheusExportQueueDashboardPage />
    </MemoryRouter>,
  );
}

describe("ProtheusExportQueueDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboard();
  });

  it("renderiza cards de totais e lista operacional", async () => {
    renderPage();

    expect(await screen.findByText("Fila operacional Protheus")).toBeInTheDocument();
    expect(screen.getByText("Total de solicitações")).toBeInTheDocument();
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.getAllByText("Em processamento").length).toBeGreaterThan(0);
    expect(screen.getByText("Concluídas")).toBeInTheDocument();
    expect(await screen.findByTestId("protheus-export-dashboard-list")).toBeInTheDocument();
    expect(await screen.findByText("Marina Souza")).toBeInTheDocument();
    expect(screen.getByText("Analista de RH")).toBeInTheDocument();
    expect(screen.getAllByText(/STUB \/ dry-run seguro/i).length).toBeGreaterThan(0);
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("filtra por status usando o backend do Admissão RH", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("protheus-export-dashboard-list");
    await user.selectOptions(screen.getByLabelText("Filtrar por status"), "blocked");

    await waitFor(() => {
      expect(admissionWorkspaceService.getProtheusExportDashboardItems).toHaveBeenLastCalledWith({
        status: "blocked",
        limit: 20,
        offset: 0,
      });
    });
  });

  it("filtra localmente por busca de candidato", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Marina Souza")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Buscar candidato ou caso/i), "ana costa");

    expect(screen.getByText("Ana Costa")).toBeInTheDocument();
    expect(screen.queryByText("Marina Souza")).not.toBeInTheDocument();
    expect(admissionWorkspaceService.getProtheusExportDashboardItems).toHaveBeenCalledTimes(1);
  });

  it("aplica filtro rapido somente erros sem novo backend", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Marina Souza");
    await user.click(screen.getByRole("button", { name: /Somente erros/i }));

    expect(screen.getByText("Marina Souza")).toBeInTheDocument();
    expect(screen.getByText("Pedro Lima")).toBeInTheDocument();
    expect(screen.queryByText("Ana Costa")).not.toBeInTheDocument();
    expect(admissionWorkspaceService.getProtheusExportDashboardItems).toHaveBeenCalledTimes(1);
  });

  it("destaca failed_permanent, blocked e retry_scheduled", async () => {
    renderPage();

    expect(await screen.findByText("Revisão manual necessária")).toBeInTheDocument();
    expect(screen.getByText("Revisão técnica obrigatória")).toBeInTheDocument();
    expect(screen.getByText(/Próxima tentativa:/)).toBeInTheDocument();
  });

  it("botão Atualizar recarrega os dados", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Fila operacional Protheus");
    await user.click(screen.getByRole("button", { name: /Atualizar/i }));

    await waitFor(() => {
      expect(admissionWorkspaceService.getProtheusExportDashboard).toHaveBeenCalledTimes(2);
      expect(admissionWorkspaceService.getProtheusExportDashboardItems).toHaveBeenCalledTimes(2);
    });
  });

  it("abre detalhes sem expor segredo, documento cru ou payload operacional", async () => {
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByTestId("protheus-export-dashboard-list");
    await user.click(within(list).getAllByRole("button", { name: /Ver detalhes/i })[0]);

    expect(screen.getByText("Não disponível")).toBeInTheDocument();
    expect(screen.getAllByText("ERR_VALIDATION").length).toBeGreaterThan(0);
    expect(screen.getByText("Documento [redacted] inválido")).toBeInTheDocument();
    expect(screen.queryByText(/dev-bridge-key-local/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL_API_KEY/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/X-Internal-Api-Key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/111\.222\.333-44/)).not.toBeInTheDocument();
    expect(screen.queryByText(/123\.45678\.90-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/payload_operacional/i)).not.toBeInTheDocument();
  });

  it("não mostra botões proibidos", async () => {
    renderPage();

    await screen.findByText("Fila operacional Protheus");
    expect(screen.queryByRole("button", { name: /Cadastrar no Protheus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Executar ExecAuto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Forçar envio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ignorar bloqueio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar produção/i })).not.toBeInTheDocument();
  });

  it("renderiza link seguro para abrir caso", async () => {
    renderPage();

    const links = await screen.findAllByRole("link", { name: /Abrir caso/i });
    expect(links[0]).toHaveAttribute("href", "/admissao/case-failed");
  });

  it("status desconhecido não quebra a tela", async () => {
    mockDashboard([unknownItem]);
    renderPage();

    expect(await screen.findByText("Status misterioso")).toBeInTheDocument();
    expect(screen.getByText("Caso Sem Nome")).toBeInTheDocument();
  });

  it("mostra estado vazio contextual para filtro de concluidos", async () => {
    const user = userEvent.setup();
    mockDashboard([failedItem]);
    renderPage();

    await screen.findByText("Marina Souza");
    await user.click(screen.getByRole("button", { name: /Somente concluídos/i }));

    expect(screen.getByText("Nenhuma solicitação concluída")).toBeInTheDocument();
  });
});
