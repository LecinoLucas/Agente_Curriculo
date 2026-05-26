import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidatePreAdmissionPanel } from "../CandidatePreAdmissionPanel";
import { admissionWorkspaceService } from "../../../../../services/admissionWorkspaceService";
import { getPreAdmission } from "../../../../../services/preAdmissionService";
import { toast } from "../../../../../shared/utils/toast";
import type { AdmissionCaseWorkspace } from "../../../../../types/domain";

vi.mock("../../../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getWorkspace: vi.fn(),
    approveChecklistItem: vi.fn(),
    rejectChecklistItem: vi.fn(),
    requestChecklistItemCorrection: vi.fn(),
    markChecklistItemNotRequired: vi.fn(),
    markCaseReadyForExport: vi.fn(),
  },
}));

vi.mock("../../../../../services/preAdmissionService", () => ({
  getPreAdmission: vi.fn(),
}));

vi.mock("../../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseWorkspace: AdmissionCaseWorkspace = {
  case: {
    id: "case-1",
    status: "draft",
    current_stage: "pre_admission",
    created_at: "2026-05-24T10:00:00Z",
    updated_at: "2026-05-25T14:00:00Z",
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
        status: "pending",
        required: true,
        position: 1,
        updated_at: "2026-05-25T13:00:00Z",
        updated_by_name: "Ana Paula",
        document_id: "doc-1",
      },
      {
        id: "item-2",
        title: "Foto 3x4",
        status: "rejected",
        required: true,
        position: 2,
        updated_at: "2026-05-25T12:00:00Z",
        updated_by_name: "Ana Paula",
        document_id: null,
      },
    ],
  },
  documents: [
    {
      id: "doc-1",
      filename: "RG_Larissa.pdf",
      document_type: "rg",
      status: "uploaded",
      uploaded_at: "2026-05-25T11:30:00Z",
      approved_at: null,
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
      type: "approve_document",
      label: "Aprovar documento",
      enabled: true,
      disabled_reason: null,
    },
    {
      type: "request_correction",
      label: "Solicitar correção",
      enabled: true,
      disabled_reason: null,
    },
    {
      type: "open_protheus_integration",
      label: "Abrir integração Protheus",
      enabled: false,
      disabled_reason: "Checklist incompleto",
    },
  ],
  summary: {
    responsible_name: "Ana Paula",
    created_at: "2026-05-24T10:00:00Z",
    last_update_at: "2026-05-25T14:00:00Z",
    readiness_status: "not_ready",
    ready_for_export: false,
  },
  recent_events: [
    {
      id: "evt-1",
      type: "document_uploaded",
      title: "Documento enviado",
      description: "RG_Larissa.pdf foi enviado pelo candidato.",
      created_at: "2026-05-25T11:30:00Z",
    },
    {
      id: "evt-2",
      type: "checklist_item_rejected",
      title: "Item rejeitado",
      description: "Foi solicitada correção para um item do checklist.",
      created_at: "2026-05-25T12:00:00Z",
    },
  ],
};

const readyWorkspace: AdmissionCaseWorkspace = {
  ...baseWorkspace,
  case: {
    ...baseWorkspace.case,
    status: "ready_for_admission",
    updated_at: "2026-05-25T15:00:00Z",
  },
  checklist: {
    ...baseWorkspace.checklist,
    approved: 8,
    pending: 0,
    blocked: 0,
    items: [
      {
        ...baseWorkspace.checklist.items[0],
        status: "approved",
      },
      {
        ...baseWorkspace.checklist.items[1],
        status: "not_required",
      },
    ],
  },
  main_blockers: [],
  next_actions: [
    {
      type: "approve_document",
      label: "Aprovar documento",
      enabled: true,
      disabled_reason: null,
    },
    {
      type: "request_correction",
      label: "Solicitar correção",
      enabled: true,
      disabled_reason: null,
    },
    {
      type: "open_protheus_integration",
      label: "Abrir integração Protheus",
      enabled: true,
      disabled_reason: null,
    },
  ],
  summary: {
    ...baseWorkspace.summary,
    readiness_status: "ready",
    ready_for_export: true,
  },
};

function renderPanel(props?: Partial<ComponentProps<typeof CandidatePreAdmissionPanel>>) {
  return render(
    <MemoryRouter>
      <CandidatePreAdmissionPanel
        caseId="case-1"
        jobId={null}
        candidateId={null}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("CandidatePreAdmissionPanel.workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(baseWorkspace);
  });

  it("renderiza dados do workspace, blockers e histórico recente", async () => {
    renderPanel();

    expect(await screen.findByText("Larissa Oliveira")).toBeInTheDocument();
    expect(screen.getByText("Assistente Administrativo")).toBeInTheDocument();
    expect(screen.getByText("Foto 3x4 ausente")).toBeInTheDocument();
    expect(screen.getByText("Documento enviado")).toBeInTheDocument();
    expect(screen.getByText("RG_Larissa.pdf")).toBeInTheDocument();
  });

  it("mostra o progresso 3/8 corretamente", async () => {
    renderPanel();

    expect(await screen.findByText("3/8")).toBeInTheDocument();
    expect(screen.getByText("itens concluídos")).toBeInTheDocument();
  });

  it("mantém o botão Protheus bloqueado quando ready_for_export=false", async () => {
    renderPanel();

    const button = await screen.findByRole("button", {
      name: /abrir integração protheus/i,
    });
    expect(button).toBeDisabled();
  });

  it("habilita a navegação para Protheus quando ready_for_export=true", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(readyWorkspace);
    renderPanel();

    const link = await screen.findByRole("link", {
      name: /abrir integração protheus/i,
    });
    expect(link).toHaveAttribute("href", "/admission/cases/case-1/integration");
  });

  it("executa ação de aprovação, chama o endpoint correto e recarrega o workspace", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace)
      .mockResolvedValueOnce(baseWorkspace)
      .mockResolvedValueOnce(readyWorkspace);
    vi.mocked(admissionWorkspaceService.approveChecklistItem).mockResolvedValue(baseWorkspace);

    renderPanel();

    const approveButtons = await screen.findAllByRole("button", { name: /^aprovar$/i });
    const approveButton = approveButtons.find((button) => !(button as HTMLButtonElement).disabled);
    expect(approveButton).toBeDefined();
    fireEvent.click(approveButton as HTMLButtonElement);

    await waitFor(() => {
      expect(admissionWorkspaceService.approveChecklistItem).toHaveBeenCalledWith("item-1");
    });
    await waitFor(() => {
      expect(admissionWorkspaceService.getWorkspace).toHaveBeenCalledTimes(2);
    });
    expect(toast.success).toHaveBeenCalledWith("Item aprovado.");
  });

  it("mostra estado vazio quando não existe caso ativo", async () => {
    vi.mocked(getPreAdmission).mockResolvedValue({
      case: null,
      can_create: false,
      hiring_decision_outcome: "hire",
    });

    render(
      <MemoryRouter>
        <CandidatePreAdmissionPanel
          jobId="job-1"
          candidateId="cand-1"
          onOpenHiringDecision={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Caso admissional ainda não aberto"),
    ).toBeInTheDocument();
  });
});
