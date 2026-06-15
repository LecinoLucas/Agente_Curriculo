import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionCasePage } from "../../pages/AdmissionCasePage";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import * as admissionPackageService from "../../services/admissionPackageService";
import {
  approvePreAdmissionDocument,
  downloadPreAdmissionDocument,
  rejectPreAdmissionDocument,
} from "../../services/preAdmissionService";
import type {
  AdmissionCaseDocumentsPayload,
  AdmissionCaseEventsPage,
  AdmissionCaseOverview,
  AdmissionProtheusBridgeSummary,
  AdmissionCaseWorkspace,
  PreAdmissionDocument,
} from "../../types/domain";

vi.mock("../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getOverview: vi.fn(),
    getDocuments: vi.fn(),
    getEvents: vi.fn(),
    getWorkspace: vi.fn(),
    getProtheusBridgeSummary: vi.fn(),
    approveChecklistItem: vi.fn(),
    rejectChecklistItem: vi.fn(),
    requestChecklistItemCorrection: vi.fn(),
    markChecklistItemNotRequired: vi.fn(),
    markCaseReadyForExport: vi.fn(),
  },
}));

vi.mock("../../services/admissionPackageService");

vi.mock("../../services/preAdmissionService", () => ({
  approvePreAdmissionDocument: vi.fn(),
  rejectPreAdmissionDocument: vi.fn(),
  downloadPreAdmissionDocument: vi.fn(),
}));

const mockWorkspace: AdmissionCaseWorkspace = {
  case: {
    id: "case-42",
    status: "in_progress",
    current_stage: "pre_admission",
    created_at: "2025-05-23T13:48:00Z",
    updated_at: "2025-05-23T14:08:00Z",
  },
  candidate: {
    id: "cand-1",
    name: "Larissa Oliveira",
    initials: "LO",
    avatar_url: null,
  },
  job: {
    id: "job-1",
    title: "Assistente Administrativo",
  },
  checklist: {
    total: 8,
    approved: 3,
    pending: 4,
    blocked: 1,
    items: [
      {
        id: "item-1",
        title: "Documento de identidade",
        status: "approved",
        required: true,
        position: 1,
        updated_at: "2025-05-23T14:02:00Z",
        updated_by_name: "Ana Paula",
        document_id: "doc-1",
      },
      {
        id: "item-2",
        title: "CPF",
        status: "approved",
        required: true,
        position: 2,
        updated_at: "2025-05-23T14:03:00Z",
        updated_by_name: null,
        document_id: "doc-2",
      },
      {
        id: "item-3",
        title: "Foto 3x4",
        status: "pending",
        required: true,
        position: 3,
        updated_at: "2025-05-23T10:00:00Z",
        updated_by_name: null,
        document_id: null,
      },
    ],
  },
  documents: [
    {
      id: "doc-1",
      checklist_item_id: "item-1",
      checklist_title: "Documento de identidade",
      required: true,
      filename: "RG_Larissa.pdf",
      document_type: "rg",
      mime_type: "application/pdf",
      size_bytes: 204800,
      status: "approved",
      uploaded_at: "2025-05-23T14:02:00Z",
      reviewed_at: "2025-05-23T14:10:00Z",
      reviewed_by_name: "Ana Paula",
      review_notes: null,
      rejection_reason_public: null,
      approved_at: "2025-05-23T14:10:00Z",
      is_current_for_item: true,
    },
    {
      id: "doc-2",
      checklist_item_id: "item-2",
      checklist_title: "CPF",
      required: true,
      filename: "CPF_Larissa.pdf",
      document_type: "cpf",
      mime_type: "application/pdf",
      size_bytes: 102400,
      status: "approved",
      uploaded_at: "2025-05-23T14:03:00Z",
      reviewed_at: "2025-05-23T14:11:00Z",
      reviewed_by_name: "Ana Paula",
      review_notes: null,
      rejection_reason_public: null,
      approved_at: "2025-05-23T14:11:00Z",
      is_current_for_item: true,
    },
  ],
  main_blockers: [
    {
      type: "missing_document",
      severity: "high",
      title: "Foto 3x4 ausente",
      description: "Solicite o envio para prosseguir com o checklist.",
      action: "request_document",
    },
  ],
  next_actions: [
    {
      type: "open_protheus_integration",
      label: "Abrir integração Protheus",
      enabled: false,
      disabled_reason: "Finalize o checklist antes de exportar.",
    },
    {
      type: "review_checklist",
      label: "Revisar checklist",
      enabled: true,
      disabled_reason: null,
    },
  ],
  summary: {
    responsible_name: "Ana Paula",
    created_at: "2025-05-23T13:48:00Z",
    last_update_at: "2025-05-23T14:08:00Z",
    readiness_status: "not_ready",
    ready_for_export: false,
  },
  recent_events: [
    {
      id: "evt-1",
      type: "document_uploaded",
      title: "Documento enviado",
      description: "RG_Larissa.pdf foi enviado pelo candidato.",
      created_at: "2025-05-23T14:05:00Z",
      actor_name: "Larissa Oliveira",
    },
    {
      id: "evt-2",
      type: "checklist_updated",
      title: "Checklist atualizado",
      description: "Status do CPF alterado para Aprovado.",
      created_at: "2025-05-23T14:03:00Z",
      actor_name: "Ana Paula",
    },
  ],
};

const mockBridgeSummary: AdmissionProtheusBridgeSummary = {
  enabled: true,
  available: true,
  status: "ready",
  message: "Bridge operacional para simulações seguras.",
  environment: "homolog",
  storage_mode: "memory",
  readiness: "ready",
  latest_trace: {
    trace_id: "trace-123",
    action_type: "precheck",
    status: "success",
    blocked_reason: null,
    error_code: null,
    created_at: "2026-06-15T11:22:33Z",
  },
  safety: {
    would_execute: false,
    protheus_registration: null,
    erp_send_attempted: false,
    registration_routine_called: false,
  },
  next_action: "Simulação segura disponível no cockpit técnico.",
  dashboard_url: "http://localhost:5180",
};

const mockOverview: AdmissionCaseOverview = {
  case: mockWorkspace.case,
  candidate: mockWorkspace.candidate,
  job: mockWorkspace.job,
  status_label: "Em andamento",
  progress: {
    total: mockWorkspace.checklist.total,
    approved: mockWorkspace.checklist.approved,
    pending: mockWorkspace.checklist.pending,
    rejected: mockWorkspace.checklist.blocked,
    in_review: 0,
    waived: 0,
  },
  main_blocker: mockWorkspace.main_blockers[0] ?? null,
  main_blockers: mockWorkspace.main_blockers,
  next_action: mockWorkspace.next_actions[0] ?? null,
  next_actions: mockWorkspace.next_actions,
  summary: mockWorkspace.summary,
  integration_status: {
    state: "pending",
    label: "Pendente",
    ready_for_export: false,
  },
  updated_at: mockWorkspace.case.updated_at,
};

const mockDocumentsPayload: AdmissionCaseDocumentsPayload = {
  checklist: mockWorkspace.checklist,
  documents: mockWorkspace.documents,
};

const mockEventsPage: AdmissionCaseEventsPage = {
  items: mockWorkspace.recent_events,
  total: mockWorkspace.recent_events.length,
  page: 1,
  page_size: 20,
  has_next: false,
};

function buildMutationDocument(
  overrides: Partial<PreAdmissionDocument> = {},
): PreAdmissionDocument {
  return {
    id: "doc-1",
    case_id: "case-42",
    checklist_item_id: "item-1",
    candidate_id: "cand-1",
    original_filename: "RG_Larissa.pdf",
    mime_type: "application/pdf",
    size_bytes: 204800,
    status: "approved",
    uploaded_at: "2025-05-23T14:02:00Z",
    reviewed_at: "2025-05-23T14:10:00Z",
    reviewed_by: "user-1",
    review_notes: null,
    rejection_reason_public: null,
    created_at: "2025-05-23T14:02:00Z",
    updated_at: "2025-05-23T14:10:00Z",
    ...overrides,
  };
}

function mockWorkspaceSlices(workspace: AdmissionCaseWorkspace) {
  vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue({
    case: workspace.case,
    candidate: workspace.candidate,
    job: workspace.job,
    status_label: "Em andamento",
    progress: {
      total: workspace.checklist.total,
      approved: workspace.checklist.approved,
      pending: workspace.checklist.pending,
      rejected: workspace.checklist.blocked,
      in_review: 0,
      waived: 0,
    },
    main_blocker: workspace.main_blockers[0] ?? null,
    main_blockers: workspace.main_blockers,
    next_action: workspace.next_actions[0] ?? null,
    next_actions: workspace.next_actions,
    summary: workspace.summary,
    integration_status: {
      state: workspace.summary.ready_for_export ? "ready" : "pending",
      label: workspace.summary.ready_for_export ? "Pronto para exportação" : "Pendente",
      ready_for_export: workspace.summary.ready_for_export,
    },
    updated_at: workspace.case.updated_at,
  });
  vi.mocked(admissionWorkspaceService.getDocuments).mockResolvedValue({
    checklist: workspace.checklist,
    documents: workspace.documents,
  });
  vi.mocked(admissionWorkspaceService.getEvents).mockResolvedValue({
    items: workspace.recent_events,
    total: workspace.recent_events.length,
    page: 1,
    page_size: 20,
    has_next: false,
  });
}

const emptyWorkspace: AdmissionCaseWorkspace = {
  ...mockWorkspace,
  documents: [],
  main_blockers: [],
  next_actions: [],
  recent_events: [],
  checklist: {
    ...mockWorkspace.checklist,
    items: [],
    approved: 0,
    pending: 0,
    blocked: 0,
    total: 0,
  },
};

function renderPage(caseId = "case-42") {
  return render(
    <MemoryRouter initialEntries={[`/admission/cases/${caseId}`]}>
      <Routes>
        <Route path="/admission/cases/:caseId" element={<AdmissionCasePage />} />
        <Route
          path="/admission/cases/:caseId/integration"
          element={<div>Página de integração Protheus</div>}
        />
        <Route path="/admitidos" element={<div>Lista de admitidos</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdmissionCasePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue(mockOverview);
    vi.mocked(admissionWorkspaceService.getDocuments).mockResolvedValue(mockDocumentsPayload);
    vi.mocked(admissionWorkspaceService.getEvents).mockResolvedValue(mockEventsPage);
    vi.mocked(admissionWorkspaceService.getProtheusBridgeSummary).mockResolvedValue(mockBridgeSummary);
    vi.mocked(admissionPackageService.getPackageByCaseId).mockResolvedValue({
      id: "pkg-1",
      case_id: "case-42",
      candidate_id: "cand-1",
      job_id: "job-1",
      status: "approved_for_export",
      payload: {
        candidate: {
          id: "cand-1",
          full_name: "Larissa Oliveira",
          email: "larissa@example.com",
          phone: null,
          cpf: "123.456.789-00",
        },
        job: {
          id: "job-1",
          title: "Assistente Administrativo",
          company: null,
          department: null,
          location: null,
        },
        pre_admission: {
          case_id: "case-42",
          status: "ready_for_admission",
          start_date: "2026-06-01",
          salary_offer: 4500,
          work_model: "Presencial",
        },
        documents: [],
        decision: {
          hiring_decision_id: "decision-1",
          decision_outcome: "hire",
          reason_code: "strong_fit",
          submitted_at: "2026-05-25T10:00:00Z",
        },
      },
      validation_errors: null,
      created_by: "user-1",
      approved_by: "user-1",
      exported_by: null,
      created_at: "2026-05-25T15:00:00Z",
      updated_at: "2026-05-25T15:00:00Z",
      approved_at: "2026-05-25T15:10:00Z",
      exported_at: null,
      cancelled_at: null,
    });
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [] });
    vi.mocked(admissionPackageService.downloadJson).mockResolvedValue(new Blob(["json"]));
    vi.mocked(admissionPackageService.downloadCsv).mockResolvedValue(new Blob(["csv"]));
    vi.mocked(admissionPackageService.exportErp).mockResolvedValue({
      id: "att-1",
      package_id: "pkg-1",
      case_id: "case-42",
      candidate_id: "cand-1",
      job_id: "job-1",
      provider: "protheus",
      mode: "mock",
      status: "sent",
      lifecycle_status: "exported",
      retryable: false,
      attempt_number: 1,
      external_reference: "PROTHEUS-MOCK-001",
      request_payload_json: {
        provider: "protheus",
        mode: "mock",
        candidate: { name: "Larissa Oliveira", email: "larissa@example.com", cpf: "123.456.789-00" },
        job: { title: "Assistente Administrativo", department: null },
        admission: { start_date: "2026-06-01", salary_offer: 4500, work_model: "Presencial" },
        decision: { hiring_decision_id: "decision-1" },
        documents: [],
      },
      response_payload_json: { success: true },
      validation_errors_json: [],
      error_message: null,
      error_summary: null,
      attempted_by: "user-1",
      created_at: "2026-05-25T15:20:00Z",
      updated_at: "2026-05-25T15:20:00Z",
      completed_at: "2026-05-25T15:20:03Z",
    });
    vi.mocked(admissionPackageService.retryExportErp).mockResolvedValue({
      id: "att-2",
      package_id: "pkg-1",
      case_id: "case-42",
      candidate_id: "cand-1",
      job_id: "job-1",
      provider: "protheus",
      mode: "mock",
      status: "sent",
      lifecycle_status: "exported",
      retryable: false,
      attempt_number: 2,
      external_reference: "PROTHEUS-MOCK-002",
      request_payload_json: {
        provider: "protheus",
        mode: "mock",
        candidate: { name: "Larissa Oliveira", email: "larissa@example.com", cpf: "123.456.789-00" },
        job: { title: "Assistente Administrativo", department: null },
        admission: { start_date: "2026-06-01", salary_offer: 4500, work_model: "Presencial" },
        decision: { hiring_decision_id: "decision-1" },
        documents: [],
      },
      response_payload_json: { success: true },
      validation_errors_json: [],
      error_message: null,
      error_summary: null,
      attempted_by: "user-1",
      created_at: "2026-05-25T15:22:00Z",
      updated_at: "2026-05-25T15:22:00Z",
      completed_at: "2026-05-25T15:22:03Z",
    });
    vi.mocked(approvePreAdmissionDocument).mockResolvedValue(buildMutationDocument());
    vi.mocked(rejectPreAdmissionDocument).mockResolvedValue(
      buildMutationDocument({
        status: "rejected",
        rejection_reason_public: "Documento ilegível.",
      }),
    );
    vi.mocked(downloadPreAdmissionDocument).mockResolvedValue(new Blob(["pdf"]));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renderiza 'Checklist admissional' com dados reais", async () => {
    renderPage();
    expect(await screen.findByText("Checklist admissional")).toBeInTheDocument();
  });

  it("renderiza 'Pendências principais'", async () => {
    renderPage();
    expect(await screen.findByText("Pendências principais")).toBeInTheDocument();
  });

  it("renderiza 'Informações do caso'", async () => {
    renderPage();
    expect(await screen.findByText("Informações do caso")).toBeInTheDocument();
  });

  it("renderiza 'Documentos enviados'", async () => {
    renderPage();
    expect(await screen.findByText("Documentos enviados")).toBeInTheDocument();
  });

  it("lista os documentos enviados com item e arquivo", async () => {
    renderPage();
    expect(await screen.findByText("RG_Larissa.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Documento de identidade · Documento de identidade/i)).toBeInTheDocument();
  });

  it("renderiza 'Próximas ações'", async () => {
    renderPage();
    expect(await screen.findByText("Próximas ações")).toBeInTheDocument();
  });

  it("renderiza 'Histórico recente'", async () => {
    renderPage();
    expect(await screen.findByText("Histórico recente")).toBeInTheDocument();
  });

  it("renderiza o painel embutido de exportação ERP no cockpit", async () => {
    mockWorkspaceSlices({
      ...mockWorkspace,
      summary: { ...mockWorkspace.summary, ready_for_export: true },
    });

    renderPage();

    expect(await screen.findByText("Exportação ERP")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Enviar para ERP/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Baixar JSON \(conferência\)/i })).toBeInTheDocument();
  });

  it("mostra progresso correto: '{aprovados} de {total} documentos aprovados'", async () => {
    renderPage();
    // mockWorkspace items array has 2 approved out of 3 total items
    expect(await screen.findByText("2 de 3 documentos aprovados")).toBeInTheDocument();
  });

  it("renderiza breadcrumb com nome do candidato", async () => {
    renderPage();
    const elements = await screen.findAllByText("Larissa Oliveira");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renderiza nome do candidato como título principal", async () => {
    renderPage();
    // h1 now shows candidate.name directly (redesign)
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Larissa Oliveira");
  });

  it("renderiza seção de próxima ação no header", async () => {
    renderPage();
    // The command strip shows "Próxima ação:" when next_actions exist
    expect(await screen.findByText("Próxima ação:")).toBeInTheDocument();
  });

  it("clique em 'Abrir integração Protheus' (habilitado) navega para /integration", async () => {
    const user = userEvent.setup();
    const readyWorkspace: AdmissionCaseWorkspace = {
      ...mockWorkspace,
      summary: { ...mockWorkspace.summary, ready_for_export: true },
      next_actions: [
        {
          type: "open_protheus_integration",
          label: "Abrir integração Protheus",
          enabled: true,
          disabled_reason: null,
        },
      ],
    };
    mockWorkspaceSlices(readyWorkspace);
    renderPage();

    const link = await screen.findByRole("link", { name: /Abrir integração Protheus/i });
    expect(link).toHaveAttribute("href", "/admission/cases/case-42/integration");

    await user.click(link);
    await waitFor(() => {
      expect(screen.getByText("Página de integração Protheus")).toBeInTheDocument();
    });
  });

  it("botão desabilitado de Protheus NÃO navega para 'Visão geral'", async () => {
    renderPage();

    // The disabled Protheus action should be a div with aria-disabled, NOT a link
    await screen.findByText("Abrir integração Protheus");
    const disabledDiv = screen.queryByRole("link", { name: /Abrir integração Protheus/i });
    expect(disabledDiv).toBeNull();
    // Confirm no navigation to "overview" or "visão geral"
    expect(screen.queryByText("Visão geral")).not.toBeInTheDocument();
  });

  it("empty state de documentos quando não há documentos", async () => {
    mockWorkspaceSlices(emptyWorkspace);
    renderPage();
    expect(await screen.findByText("Nenhum documento enviado ainda.")).toBeInTheDocument();
  });

  it("empty state de histórico quando não há eventos", async () => {
    mockWorkspaceSlices(emptyWorkspace);
    renderPage();
    expect(await screen.findByText("Nenhum evento recente.")).toBeInTheDocument();
  });

  it("blockers/pendências aparecem quando existem", async () => {
    renderPage();
    expect(await screen.findByText("Foto 3x4 ausente")).toBeInTheDocument();
    expect(
      screen.getByText("Solicite o envio para prosseguir com o checklist."),
    ).toBeInTheDocument();
  });

  it("mostra 'Sem pendências críticas' quando não há blockers", async () => {
    mockWorkspaceSlices(emptyWorkspace);
    renderPage();
    expect(await screen.findByText("Sem pendências críticas")).toBeInTheDocument();
  });

  it("mostra erro quando o overview não carrega", async () => {
    vi.mocked(admissionWorkspaceService.getOverview).mockRejectedValue(
      new Error("Network error"),
    );
    renderPage();
    expect(await screen.findByText("Workspace indisponível")).toBeInTheDocument();
  });

  it("abre modal de rejeição e exige mensagem para o candidato", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("admission-document-request-correction-doc-1"));
    const dialog = await screen.findByRole("dialog", { name: /Solicitar correção do documento/i });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Solicitar correção" }));
    expect(await screen.findByTestId("admission-document-rejection-error")).toHaveTextContent(
      "Informe a mensagem para o candidato.",
    );
    expect(rejectPreAdmissionDocument).not.toHaveBeenCalled();
  });

  it("nota interna é opcional ao solicitar correção", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("admission-document-request-correction-doc-1"));
    const dialog = await screen.findByRole("dialog", { name: /Solicitar correção do documento/i });
    await user.type(
      within(dialog).getByTestId("admission-public-reason"),
      "Envie uma versão legível do documento.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Solicitar correção" }));

    await waitFor(() => {
      expect(rejectPreAdmissionDocument).toHaveBeenCalledWith("doc-1", {
        rejection_reason_public: "Envie uma versão legível do documento.",
        review_notes: null,
      });
    });
  });

  it("envia mensagem pública e nota interna em campos separados ao rejeitar", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("admission-document-reject-doc-1"));
    const dialog = await screen.findByRole("dialog", { name: /Rejeitar documento/i });
    await user.type(
      within(dialog).getByTestId("admission-public-reason"),
      "Documento cortado. Reenvie a imagem completa.",
    );
    await user.type(
      within(dialog).getByTestId("admission-review-notes"),
      "Checar novamente a assinatura quando o novo arquivo chegar.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Rejeitar documento" }));

    await waitFor(() => {
      expect(rejectPreAdmissionDocument).toHaveBeenCalledWith("doc-1", {
        rejection_reason_public: "Documento cortado. Reenvie a imagem completa.",
        review_notes: "Checar novamente a assinatura quando o novo arquivo chegar.",
      });
    });
    const payload = vi.mocked(rejectPreAdmissionDocument).mock.calls[0]?.[1];
    expect(payload).not.toEqual({
      rejection_reason_public: "Documento cortado. Reenvie a imagem completa.",
      review_notes: "Documento cortado. Reenvie a imagem completa.",
    });
  });

  it("aprova documento pelo endpoint correto", async () => {
    const user = userEvent.setup();
    mockWorkspaceSlices({
      ...mockWorkspace,
      documents: [
        {
          ...mockWorkspace.documents[0],
          status: "uploaded",
          reviewed_at: null,
          reviewed_by_name: null,
          approved_at: null,
        },
      ],
    });
    renderPage();

    await user.click(await screen.findByTestId("admission-document-approve-doc-1"));

    await waitFor(() => {
      expect(approvePreAdmissionDocument).toHaveBeenCalledWith("doc-1");
    });
  });

  it("mostra motivo público e nota interna em áreas separadas para documento rejeitado", async () => {
    mockWorkspaceSlices({
      ...mockWorkspace,
      documents: [
        {
          ...mockWorkspace.documents[0],
          status: "rejected",
          reviewed_at: "2025-05-23T14:15:00Z",
          reviewed_by_name: "Ana Paula",
          rejection_reason_public: "Envie um arquivo sem cortes.",
          review_notes: "Conferir bordas e legibilidade no reenvio.",
          approved_at: null,
        },
      ],
    });
    renderPage();

    expect(await screen.findByTestId("admission-document-public-reason")).toHaveTextContent(
      "Envie um arquivo sem cortes.",
    );
    expect(await screen.findByTestId("admission-document-internal-notes")).toHaveTextContent(
      "Conferir bordas e legibilidade no reenvio.",
    );
  });

  it("mantém overview visível quando documentos falham", async () => {
    vi.mocked(admissionWorkspaceService.getDocuments).mockRejectedValue(
      new Error("documents failed"),
    );
    renderPage();

    // Header still shows candidate name even when documents fail to load
    expect(await screen.findByText("Larissa Oliveira")).toBeInTheDocument();
    expect(await screen.findByText("Documentos enviados")).toBeInTheDocument();
    expect(
      await screen.findAllByText(/Não foi possível carregar documentos e checklist\./i),
    ).toHaveLength(2);
  });

  it("mostra empty state quando caseId não está na URL", () => {
    render(
      <MemoryRouter initialEntries={["/admission/cases/"]}>
        <Routes>
          <Route path="/admission/cases/" element={<AdmissionCasePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Caso admissional não informado")).toBeInTheDocument();
  });

  // ── C-01: botão de voltar ────────────────────────────────────────────────────

  it("C-01: exibe link de voltar apontando para /admitidos", async () => {
    renderPage();
    const backLink = await screen.findByRole("link", { name: "Voltar" });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/admitidos");
  });

  it("C-01: clicar no botão de voltar navega para /admitidos", async () => {
    const user = userEvent.setup();
    renderPage();
    const backLink = await screen.findByRole("link", { name: "Voltar" });
    await user.click(backLink);
    await screen.findByText("Lista de admitidos");
  });

  // ── C-02: dot de status do checklist ────────────────────────────────────────

  it("C-02: item 'received' não usa a mesma classe CSS de 'approved'", async () => {
    mockWorkspaceSlices({
      ...mockWorkspace,
      checklist: {
        ...mockWorkspace.checklist,
        items: [
          {
            id: "item-approved",
            title: "Documento aprovado",
            status: "approved",
            required: true,
            position: 1,
            updated_at: "2025-05-23T14:02:00Z",
            updated_by_name: "Ana Paula",
            document_id: "doc-1",
          },
          {
            id: "item-received",
            title: "Documento recebido",
            status: "received",
            required: true,
            position: 2,
            updated_at: "2025-05-23T14:03:00Z",
            updated_by_name: null,
            document_id: "doc-2",
          },
        ],
        total: 2,
        approved: 1,
        pending: 1,
        blocked: 0,
      },
    });

    renderPage();

    // Wait for the checklist to load
    await screen.findByText("Documento aprovado");

    // Find dots by their rounded-full class inside the checklist section
    const dots = document.querySelectorAll(
      "#admission-checklist-section .rounded-full.h-2.w-2",
    );

    const approvedDot = Array.from(dots).find(
      (el) => el.closest("[data-checklist-item-id='item-approved']") !== null ||
               el.parentElement?.textContent?.includes("") // any dot in row with "Documento aprovado"
    );

    // The simplest assertion: the two dots have DIFFERENT classes.
    // approved → --success; received → --warning (not --success)
    expect(dots.length).toBeGreaterThanOrEqual(2);
    const dotClasses = Array.from(dots).map((d) => d.className);
    const hasSuccess = dotClasses.some((c) => c.includes("success"));
    const hasWarning = dotClasses.some((c) => c.includes("warning"));
    expect(hasSuccess).toBe(true);   // approved item has success dot
    expect(hasWarning).toBe(true);   // received item has warning dot (not success)

    // No dot should combine both — each dot is exactly one color
    for (const cls of dotClasses) {
      expect(cls).not.toMatch(/success.*warning|warning.*success/);
    }
  });

  // ── PA-FIX-1A: layout reorganization ────────────────────────────────────────

  it("PA-FIX-1A: 'Pendências principais' aparece antes do 'Checklist admissional' no DOM", async () => {
    renderPage();

    const blockers = await screen.findByText("Pendências principais");
    const checklist = await screen.findByText("Checklist admissional");

    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING (4) means 'blockers' comes before 'checklist'
    expect(
      blockers.compareDocumentPosition(checklist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("PA-FIX-1A: 'Próximas ações' aparece antes de 'Documentos enviados' no DOM", async () => {
    renderPage();

    const nextActions = await screen.findByText("Próximas ações");
    const documents = await screen.findByText("Documentos enviados");

    expect(
      nextActions.compareDocumentPosition(documents) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("PA-FIX-1A: header não mostra bloco 'Vaga ativa' duplicado", async () => {
    renderPage();

    // Wait for candidate name to appear in the new operational header
    await screen.findByText("Larissa Oliveira");

    // "Vaga ativa" label must not be present
    expect(screen.queryByText("Vaga ativa")).not.toBeInTheDocument();

    // Job title appears only once (in the candidate block of the header)
    const jobTitleElements = screen.getAllByText("Assistente Administrativo");
    expect(jobTitleElements.length).toBe(1);
  });

  // ── PA-FIX-1B: confirmação "Marcar pronto" ───────────────────────────────────

  it("PA-FIX-1B: clicar 'Marcar pronto' exibe confirmação inline em vez de disparar ação imediatamente", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("mark-ready-btn"));

    // Confirmation dialog should appear
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Confirmar liberação para exportação?")).toBeInTheDocument();
    expect(screen.getByTestId("mark-ready-confirm-btn")).toBeInTheDocument();
    expect(screen.getByTestId("mark-ready-cancel-btn")).toBeInTheDocument();

    // onMarkReady (backend call) must NOT have been called yet
    expect(admissionWorkspaceService.markCaseReadyForExport).not.toHaveBeenCalled();
  });

  it("PA-FIX-1B: cancelar confirmação não chama backend e volta ao botão original", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("mark-ready-btn"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByTestId("mark-ready-cancel-btn"));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("mark-ready-btn")).toBeInTheDocument();
    expect(admissionWorkspaceService.markCaseReadyForExport).not.toHaveBeenCalled();
  });

  it("PA-FIX-1B: confirmar chama markCaseReadyForExport", async () => {
    vi.mocked(admissionWorkspaceService.markCaseReadyForExport).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("mark-ready-btn"));
    await user.click(screen.getByTestId("mark-ready-confirm-btn"));

    await waitFor(() => {
      expect(admissionWorkspaceService.markCaseReadyForExport).toHaveBeenCalledWith("case-42");
    });
  });

  it("PA-FIX-1B: caso já pronto não exibe botão clicável nem confirmação", async () => {
    mockWorkspaceSlices({
      ...mockWorkspace,
      summary: { ...mockWorkspace.summary, ready_for_export: true },
    });
    renderPage();

    // The button renders as disabled — clicking it must not open the confirmation
    const btn = await screen.findByTestId("mark-ready-btn");
    expect(btn).toBeDisabled();

    // No alertdialog present
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  // ── PA-FIX-2: redução de reloads redundantes ─────────────────────────────────

  it("PA-FIX-2: abrir workspace chama overview, documents e events uma vez", async () => {
    renderPage();

    await screen.findByText("Checklist admissional");

    expect(admissionWorkspaceService.getOverview).toHaveBeenCalledTimes(1);
    expect(admissionWorkspaceService.getDocuments).toHaveBeenCalledTimes(1);
    expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(1);
  });

  it("PA-FIX-2: aprovar documento atualiza localmente sem recarregar documents nem events", async () => {
    const user = userEvent.setup();
    mockWorkspaceSlices({
      ...mockWorkspace,
      documents: [{ ...mockWorkspace.documents[0], status: "uploaded", reviewed_at: null, reviewed_by_name: null, approved_at: null }],
      checklist: {
        ...mockWorkspace.checklist,
        items: [{ ...mockWorkspace.checklist.items[0], status: "received" }, ...mockWorkspace.checklist.items.slice(1)],
      },
    });
    renderPage();

    await screen.findByText("Checklist admissional");
    await user.click(await screen.findByTestId("admission-document-approve-doc-1"));

    await waitFor(() => {
      expect(approvePreAdmissionDocument).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("admission-document-approve-doc-1")).toBeDisabled();
    });

    expect(admissionWorkspaceService.getOverview).toHaveBeenCalledTimes(2);
    expect(admissionWorkspaceService.getDocuments).toHaveBeenCalledTimes(1);
    expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(1);
  });

  it("PA-FIX-2: aprovar documento faz fallback para documents quando resposta da ação é incompleta", async () => {
    const user = userEvent.setup();
    vi.mocked(approvePreAdmissionDocument).mockResolvedValue({} as PreAdmissionDocument);

    mockWorkspaceSlices({
      ...mockWorkspace,
      documents: [{ ...mockWorkspace.documents[0], status: "uploaded", reviewed_at: null, reviewed_by_name: null, approved_at: null }],
    });
    renderPage();

    await screen.findByText("Checklist admissional");
    await user.click(await screen.findByTestId("admission-document-approve-doc-1"));

    await waitFor(() => {
      expect(approvePreAdmissionDocument).toHaveBeenCalled();
    });

    expect(admissionWorkspaceService.getOverview).toHaveBeenCalledTimes(2);
    expect(admissionWorkspaceService.getDocuments).toHaveBeenCalledTimes(2);
    expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(1);
  });

  it("PA-FIX-2: rejeitar documento segue atualização local e não chama getEvents", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Checklist admissional");
    await user.click(await screen.findByTestId("admission-document-request-correction-doc-1"));
    const dialog = await screen.findByRole("dialog", { name: /Solicitar correção/i });
    await user.type(within(dialog).getByTestId("admission-public-reason"), "Documento ilegível.");
    await user.click(within(dialog).getByRole("button", { name: "Solicitar correção" }));

    await waitFor(() => {
      expect(rejectPreAdmissionDocument).toHaveBeenCalled();
    });

    expect(admissionWorkspaceService.getOverview).toHaveBeenCalledTimes(2);
    expect(admissionWorkspaceService.getDocuments).toHaveBeenCalledTimes(1);
    expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(1);
  });

  it("PA-FIX-2: erro ao aprovar mantém call-count estável e não altera estado incorretamente", async () => {
    const user = userEvent.setup();
    vi.mocked(approvePreAdmissionDocument).mockRejectedValue(new Error("approve failed"));
    mockWorkspaceSlices({
      ...mockWorkspace,
      documents: [{ ...mockWorkspace.documents[0], status: "uploaded", reviewed_at: null, reviewed_by_name: null, approved_at: null }],
    });

    renderPage();

    await screen.findByText("Checklist admissional");
    await user.click(await screen.findByTestId("admission-document-approve-doc-1"));

    await waitFor(() => {
      expect(approvePreAdmissionDocument).toHaveBeenCalled();
    });

    expect(admissionWorkspaceService.getOverview).toHaveBeenCalledTimes(1);
    expect(admissionWorkspaceService.getDocuments).toHaveBeenCalledTimes(1);
    expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /aprovar/i })).toBeInTheDocument();
  });

  it("PA-FIX-2: aprovar documento não recarrega pacote Protheus", async () => {
    const user = userEvent.setup();
    mockWorkspaceSlices({
      ...mockWorkspace,
      summary: { ...mockWorkspace.summary, ready_for_export: true },
      documents: [{ ...mockWorkspace.documents[0], status: "uploaded", reviewed_at: null, reviewed_by_name: null, approved_at: null }],
    });

    renderPage();

    await screen.findByText("Exportação ERP");

    expect(admissionPackageService.getPackageByCaseId).toHaveBeenCalledTimes(1);
    expect(admissionPackageService.listErpAttempts).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByTestId("admission-document-approve-doc-1"));

    await waitFor(() => {
      expect(approvePreAdmissionDocument).toHaveBeenCalled();
    });

    expect(admissionPackageService.getPackageByCaseId).toHaveBeenCalledTimes(1);
    expect(admissionPackageService.listErpAttempts).toHaveBeenCalledTimes(1);
  });

  it("PA-FIX-2: marcar pronto chama getEvents (mudança de estado do caso)", async () => {
    vi.mocked(admissionWorkspaceService.markCaseReadyForExport).mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("mark-ready-btn"));
    await user.click(screen.getByTestId("mark-ready-confirm-btn"));

    await waitFor(() => {
      expect(admissionWorkspaceService.markCaseReadyForExport).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(2);
    });
  });

  it("PA-FIX-2: botão 'Recarregar workspace' chama os três endpoints", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Checklist admissional");

    const initialOverviewCalls = vi.mocked(admissionWorkspaceService.getOverview).mock.calls.length;
    const initialDocsCalls = vi.mocked(admissionWorkspaceService.getDocuments).mock.calls.length;
    const initialEventsCalls = vi.mocked(admissionWorkspaceService.getEvents).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /recarregar workspace/i }));

    await waitFor(() => {
      expect(admissionWorkspaceService.getOverview).toHaveBeenCalledTimes(initialOverviewCalls + 1);
      expect(admissionWorkspaceService.getDocuments).toHaveBeenCalledTimes(initialDocsCalls + 1);
      expect(admissionWorkspaceService.getEvents).toHaveBeenCalledTimes(initialEventsCalls + 1);
    });
  });
});
