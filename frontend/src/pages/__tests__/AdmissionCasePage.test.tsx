import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionCasePage } from "../../pages/AdmissionCasePage";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import type { AdmissionCaseWorkspace } from "../../types/domain";

vi.mock("../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getWorkspace: vi.fn(),
    approveChecklistItem: vi.fn(),
    rejectChecklistItem: vi.fn(),
    requestChecklistItemCorrection: vi.fn(),
    markChecklistItemNotRequired: vi.fn(),
    markCaseReadyForExport: vi.fn(),
  },
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
      filename: "RG_Larissa.pdf",
      document_type: "rg",
      status: "approved",
      uploaded_at: "2025-05-23T14:02:00Z",
      approved_at: "2025-05-23T14:10:00Z",
    },
    {
      id: "doc-2",
      filename: "CPF_Larissa.pdf",
      document_type: "cpf",
      status: "approved",
      uploaded_at: "2025-05-23T14:03:00Z",
      approved_at: "2025-05-23T14:11:00Z",
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
    },
    {
      id: "evt-2",
      type: "checklist_updated",
      title: "Checklist atualizado",
      description: "Status do CPF alterado para Aprovado.",
      created_at: "2025-05-23T14:03:00Z",
    },
  ],
};

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
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdmissionCasePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza 'Checklist admissional' com dados reais", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Checklist admissional")).toBeInTheDocument();
  });

  it("renderiza 'Pendências principais'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Pendências principais")).toBeInTheDocument();
  });

  it("renderiza 'Resumo do caso'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Resumo do caso")).toBeInTheDocument();
  });

  it("renderiza 'Documentos enviados'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Documentos enviados")).toBeInTheDocument();
  });

  it("renderiza 'Próximas ações'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Próximas ações")).toBeInTheDocument();
  });

  it("renderiza 'Histórico recente'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Histórico recente")).toBeInTheDocument();
  });

  it("mostra progresso correto: '{aprovados} de {total} documentos aprovados'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    // mockWorkspace items array has 2 approved out of 3 total items
    expect(await screen.findByText("2 de 3 documentos aprovados")).toBeInTheDocument();
  });

  it("renderiza breadcrumb com nome do candidato", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    const elements = await screen.findAllByText("Larissa Oliveira");
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renderiza título 'Admissão de {nome}'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Admissão de Larissa Oliveira")).toBeInTheDocument();
  });

  it("renderiza subtítulo correto", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(
      await screen.findByText("Checklist documental e preparação para integração"),
    ).toBeInTheDocument();
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
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(readyWorkspace);
    renderPage();

    const link = await screen.findByRole("link", { name: /Abrir integração Protheus/i });
    expect(link).toHaveAttribute("href", "/admission/cases/case-42/integration");

    await user.click(link);
    await waitFor(() => {
      expect(screen.getByText("Página de integração Protheus")).toBeInTheDocument();
    });
  });

  it("botão desabilitado de Protheus NÃO navega para 'Visão geral'", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();

    // The disabled Protheus action should be a div with aria-disabled, NOT a link
    await screen.findByText("Abrir integração Protheus");
    const disabledDiv = screen.queryByRole("link", { name: /Abrir integração Protheus/i });
    expect(disabledDiv).toBeNull();
    // Confirm no navigation to "overview" or "visão geral"
    expect(screen.queryByText("Visão geral")).not.toBeInTheDocument();
  });

  it("empty state de documentos quando não há documentos", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(emptyWorkspace);
    renderPage();
    expect(await screen.findByText("Nenhum documento enviado ainda.")).toBeInTheDocument();
  });

  it("empty state de histórico quando não há eventos", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(emptyWorkspace);
    renderPage();
    expect(await screen.findByText("Nenhum evento recente.")).toBeInTheDocument();
  });

  it("blockers/pendências aparecem quando existem", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(mockWorkspace);
    renderPage();
    expect(await screen.findByText("Foto 3x4 ausente")).toBeInTheDocument();
    expect(
      screen.getByText("Solicite o envio para prosseguir com o checklist."),
    ).toBeInTheDocument();
  });

  it("mostra 'Sem pendências críticas' quando não há blockers", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(emptyWorkspace);
    renderPage();
    expect(await screen.findByText("Sem pendências críticas")).toBeInTheDocument();
  });

  it("mostra erro quando o workspace não carrega", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockRejectedValue(
      new Error("Network error"),
    );
    renderPage();
    expect(await screen.findByText("Workspace indisponível")).toBeInTheDocument();
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
});
