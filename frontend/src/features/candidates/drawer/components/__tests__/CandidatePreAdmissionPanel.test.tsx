import { render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidatePreAdmissionPanel } from "../CandidatePreAdmissionPanel";
import { admissionWorkspaceService } from "../../../../../services/admissionWorkspaceService";
import {
  createPreAdmission,
  getPreAdmission,
} from "../../../../../services/preAdmissionService";
import { toast } from "../../../../../shared/utils/toast";
import type { AdmissionCaseOverview, AdmissionCaseWorkspace } from "../../../../../types/domain";

vi.mock("../../../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getOverview: vi.fn(),
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
  createPreAdmission: vi.fn(),
}));

vi.mock("../../../../../services/preAdmissionChecklistTemplatesService", () => ({
  preAdmissionChecklistTemplatesService: {
    listTemplates: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
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
      checklist_item_id: "item-1",
      checklist_title: "Documento de identidade",
      required: true,
      filename: "RG_Larissa.pdf",
      document_type: "rg",
      mime_type: "application/pdf",
      size_bytes: 204800,
      status: "uploaded",
      uploaded_at: "2026-05-25T11:30:00Z",
      reviewed_at: null,
      reviewed_by_name: null,
      review_notes: null,
      rejection_reason_public: null,
      approved_at: null,
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
      type: "approve_document",
      label: "Aprovar documento",
      enabled: true,
      disabled_reason: null,
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
  },
  main_blockers: [],
  summary: {
    ...baseWorkspace.summary,
    readiness_status: "ready",
    ready_for_export: true,
  },
};

const admittedWorkspace: AdmissionCaseWorkspace = {
  ...readyWorkspace,
  case: {
    ...readyWorkspace.case,
    status: "admitted",
  },
};

function overviewFromWorkspace(workspace: AdmissionCaseWorkspace): AdmissionCaseOverview {
  const state =
    workspace.case.status === "admitted"
      ? "completed"
      : workspace.summary.ready_for_export
        ? "ready"
        : "pending";
  const label =
    state === "completed" ? "Exportado" : state === "ready" ? "Pronto para exportação" : "Pendente";

  return {
    case: workspace.case,
    candidate: workspace.candidate,
    job: workspace.job,
    status_label: workspace.case.status,
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
      state,
      label,
      ready_for_export: workspace.summary.ready_for_export,
    },
    updated_at: workspace.case.updated_at,
  };
}

function renderPanel(props?: Partial<ComponentProps<typeof CandidatePreAdmissionPanel>>) {
  return render(
    <MemoryRouter>
      <CandidatePreAdmissionPanel
        caseId="case-1"
        jobId={null}
        candidateId={null}
        userRole="hr"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("CandidatePreAdmissionPanel.summaryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(baseWorkspace);
    vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue(overviewFromWorkspace(baseWorkspace));
    vi.mocked(createPreAdmission).mockResolvedValue({
      id: "case-created",
      candidate_id: "cand-1",
      job_id: "job-1",
      hiring_decision_id: "decision-1",
      status: "draft",
      salary_offer: null,
      start_date: null,
      work_model: null,
      notes: null,
      created_by: "user-1",
      ready_for_export: false,
      ready_for_export_at: null,
      ready_for_export_by: null,
      created_at: "2026-05-24T10:00:00Z",
      updated_at: "2026-05-24T10:00:00Z",
      closed_at: null,
      checklist_items: [],
    });
  });

  it("renderiza o card-resumo com vaga, progresso e pendência principal", async () => {
    renderPanel();

    const card = await screen.findByTestId("pre-admission-profile-summary");
    const view = within(card);
    expect(view.getByText("Pré-admissão pendente")).toBeInTheDocument();
    expect(view.getByText("Assistente Administrativo")).toBeInTheDocument();
    expect(view.getByTestId("pre-admission-summary-progress")).toHaveTextContent("3/8");
    expect(view.getByText(/documentos aprovados/i)).toBeInTheDocument();
    expect(view.getByText("Foto 3x4 ausente")).toBeInTheDocument();
  });

  it("NÃO renderiza checklist completo, documentos completos, painel Protheus ou histórico grande", async () => {
    renderPanel();
    await screen.findByTestId("pre-admission-profile-summary");

    expect(screen.queryByText("Documento de identidade")).not.toBeInTheDocument();
    expect(screen.queryByText("RG_Larissa.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Documento enviado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir integração Protheus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Abrir integração Protheus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marcar pronto para exportação/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^aprovar$/i })).not.toBeInTheDocument();
  });

  it("mostra status Protheus 'Pendente' quando ready_for_export=false", async () => {
    renderPanel();
    const card = await screen.findByTestId("pre-admission-profile-summary");
    expect(within(card).getByText(/Protheus: Pendente/i)).toBeInTheDocument();
  });

  it("mostra status Protheus 'Pronto para exportação' quando ready_for_export=true", async () => {
    vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue(overviewFromWorkspace(readyWorkspace));
    renderPanel();
    const card = await screen.findByTestId("pre-admission-profile-summary");
    expect(within(card).getByText(/Protheus: Pronto para exportação/i)).toBeInTheDocument();
  });

  it("mostra status Protheus 'Exportado' quando o caso está admitted", async () => {
    vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue(overviewFromWorkspace(admittedWorkspace));
    renderPanel();
    const card = await screen.findByTestId("pre-admission-profile-summary");
    expect(within(card).getByText(/Protheus: Exportado/i)).toBeInTheDocument();
    expect(within(card).getByText(/Pré-admissão concluída/i)).toBeInTheDocument();
  });

  it("CTA principal aponta para /admissao/:caseId", async () => {
    renderPanel();
    const link = await screen.findByTestId("pre-admission-summary-open-cta");
    expect(link).toHaveAttribute("href", "/admissao/case-1");
    expect(link).toHaveTextContent(/Abrir tela de pré-admissão/i);
  });

  it("mostra CTA de criar caso quando decisão hire permite iniciar pré-admissão", async () => {
    vi.mocked(getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });

    render(
      <MemoryRouter>
        <CandidatePreAdmissionPanel
          jobId="job-1"
          candidateId="cand-1"
          userRole="hr"
          onOpenHiringDecision={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Caso admissional ainda não aberto"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar caso admissional/i })).toBeInTheDocument();
  });

  it("abre o drawer leve de criação com candidato, vaga e decisão final", async () => {
    const user = userEvent.setup();
    vi.mocked(getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });

    render(
      <MemoryRouter>
        <CandidatePreAdmissionPanel
          jobId="job-1"
          candidateId="cand-1"
          userRole="hr"
          candidateName="Larissa Oliveira"
          jobTitle="Assistente Administrativo"
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /Criar caso admissional/i }));

    expect(await screen.findByTestId("pre-admission-start-drawer")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /Iniciar pré-admissão/i })).toBeInTheDocument();
    expect(screen.getByText("Larissa Oliveira")).toBeInTheDocument();
    expect(screen.getByText("Assistente Administrativo")).toBeInTheDocument();
    expect(screen.getByText("Contratar")).toBeInTheDocument();
  });

  it("confirma a criação no drawer e mostra o card-resumo do caso recém-criado", async () => {
    const user = userEvent.setup();
    const onCaseCreated = vi.fn();
    vi.mocked(getPreAdmission).mockResolvedValue({
      case: null,
      can_create: true,
      hiring_decision_outcome: "hire",
    });

    render(
      <MemoryRouter>
        <CandidatePreAdmissionPanel
          jobId="job-1"
          candidateId="cand-1"
          userRole="hr"
          onCaseCreated={onCaseCreated}
        />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /^Criar caso admissional$/i }));

    const confirmButtons = await screen.findAllByRole("button", { name: /^Criar caso admissional$/i });
    await user.click(confirmButtons.at(-1)!);

    await waitFor(() => {
      expect(createPreAdmission).toHaveBeenCalledTimes(1);
      expect(createPreAdmission).toHaveBeenCalledWith("job-1", "cand-1", {});
    });
    await waitFor(() => {
      expect(admissionWorkspaceService.getOverview).toHaveBeenCalledWith("case-created");
    });
    expect(onCaseCreated).toHaveBeenCalledWith("case-created");
    expect(toast.success).toHaveBeenCalledWith("Caso admissional criado.");

    const card = await screen.findByTestId("pre-admission-profile-summary");
    expect(within(card).getByText("Assistente Administrativo")).toBeInTheDocument();
  });

  it("não mostra botão de criar caso quando decisão não é contratar", async () => {
    vi.mocked(getPreAdmission).mockResolvedValue({
      case: null,
      can_create: false,
      hiring_decision_outcome: "hold",
    });

    render(
      <MemoryRouter>
        <CandidatePreAdmissionPanel
          jobId="job-1"
          candidateId="cand-1"
          userRole="hr"
          onOpenHiringDecision={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Caso admissional ainda não aberto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Criar caso admissional/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revisar decisão de contratação/i })).toBeInTheDocument();
  });

  it("renderiza o card-resumo quando já existe caso ativo", async () => {
    vi.mocked(getPreAdmission).mockResolvedValue({
      case: {
        id: "case-created",
        candidate_id: "cand-1",
        job_id: "job-1",
        hiring_decision_id: "decision-1",
        status: "draft",
        salary_offer: null,
        start_date: null,
        work_model: null,
        notes: null,
        created_by: "user-1",
        ready_for_export: false,
        ready_for_export_at: null,
        ready_for_export_by: null,
        created_at: "2026-05-24T10:00:00Z",
        updated_at: "2026-05-24T10:00:00Z",
        closed_at: null,
        checklist_items: [],
      },
      can_create: false,
      hiring_decision_outcome: "hire",
    });

    render(
      <MemoryRouter>
        <CandidatePreAdmissionPanel
          jobId="job-1"
          candidateId="cand-1"
          userRole="hr"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("pre-admission-profile-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-admission-start-drawer")).not.toBeInTheDocument();
  });

  it("recruiter acessa o painel sem mensagem de restrição", () => {
    renderPanel({ userRole: "recruiter" });

    expect(screen.queryByText("Pré-admissão sem permissão de acesso.")).not.toBeInTheDocument();
    // caseId fornecido → não chama getPreAdmission para descoberta
    expect(getPreAdmission).not.toHaveBeenCalled();
  });

  describe("stage hired — sem caso de pré-admissão", () => {
    beforeEach(() => {
      vi.mocked(getPreAdmission).mockResolvedValue({
        case: null,
        can_create: true,
        hiring_decision_outcome: "hire",
      });
    });

    it("mostra título 'Iniciar admissão' quando stage é hired e can_create=true", async () => {
      render(
        <MemoryRouter>
          <CandidatePreAdmissionPanel
            jobId="job-1"
            candidateId="cand-1"
            userRole="hr"
            currentStage="hired"
          />
        </MemoryRouter>,
      );

      expect(await screen.findByText("Iniciar admissão")).toBeInTheDocument();
    });

    it("mostra descrição correta do Case 1 quando stage é hired e can_create=true", async () => {
      render(
        <MemoryRouter>
          <CandidatePreAdmissionPanel
            jobId="job-1"
            candidateId="cand-1"
            userRole="hr"
            currentStage="hired"
          />
        </MemoryRouter>,
      );

      expect(
        await screen.findByText(
          "O candidato foi marcado como contratado, mas o caso de pré-admissão ainda não foi criado.",
        ),
      ).toBeInTheDocument();
    });

    it("botão diz 'Iniciar pré-admissão' quando stage é hired e can_create=true", async () => {
      render(
        <MemoryRouter>
          <CandidatePreAdmissionPanel
            jobId="job-1"
            candidateId="cand-1"
            userRole="hr"
            currentStage="hired"
          />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole("button", { name: /Iniciar pré-admissão/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Criar caso admissional/i })).not.toBeInTheDocument();
    });

    it("título e botão usam labels genéricos quando currentStage não é hired", async () => {
      render(
        <MemoryRouter>
          <CandidatePreAdmissionPanel
            jobId="job-1"
            candidateId="cand-1"
            userRole="hr"
            currentStage="pre_admission"
          />
        </MemoryRouter>,
      );

      expect(await screen.findByText("Caso admissional ainda não aberto")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Criar caso admissional/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Iniciar pré-admissão/i })).not.toBeInTheDocument();
    });
  });
});
