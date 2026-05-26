import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionProtheusIntegrationPanel } from "../AdmissionProtheusIntegrationPanel";
import { admissionWorkspaceService } from "../../../services/admissionWorkspaceService";
import * as admissionPackageService from "../../../services/admissionPackageService";
import type {
  AdmissionCaseWorkspace,
  AdmissionPackage,
  ErpIntegrationAttempt,
  ProtheusCapabilities,
} from "../../../types/domain";

vi.mock("../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getWorkspace: vi.fn(),
  },
}));

vi.mock("../../../services/admissionPackageService");

const blockedWorkspace: AdmissionCaseWorkspace = {
  case: {
    id: "case-1",
    status: "in_progress",
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
    items: [],
  },
  documents: [],
  main_blockers: [
    {
      type: "missing_document",
      severity: "high",
      title: "Foto 3x4 ausente",
      description: "Solicite o envio para prosseguir com o checklist.",
      action: "request_document",
    },
  ],
  next_actions: [],
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
  ...blockedWorkspace,
  case: {
    ...blockedWorkspace.case,
    status: "ready_for_admission",
    updated_at: "2026-05-25T15:00:00Z",
  },
  checklist: {
    ...blockedWorkspace.checklist,
    approved: 8,
    pending: 0,
    blocked: 0,
  },
  main_blockers: [],
  summary: {
    ...blockedWorkspace.summary,
    readiness_status: "ready",
    ready_for_export: true,
    last_update_at: "2026-05-25T15:00:00Z",
  },
};

const admissionPackage: AdmissionPackage = {
  id: "pkg-1",
  case_id: "case-1",
  candidate_id: "cand-1",
  job_id: "job-1",
  status: "approved_for_export",
  payload: {
    candidate: {
      id: "cand-1",
      full_name: "Larissa Oliveira",
      email: "larissa@example.com",
      phone: null,
      cpf: "123",
    },
    job: {
      id: "job-1",
      title: "Assistente Administrativo",
      company: null,
      department: null,
      location: null,
    },
    pre_admission: {
      case_id: "case-1",
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
};

const readyAttempt: ErpIntegrationAttempt = {
  id: "att-1",
  package_id: "pkg-1",
  case_id: "case-1",
  candidate_id: "cand-1",
  job_id: "job-1",
  provider: "protheus",
  mode: "dry_run",
  status: "ready",
  request_payload_json: {
    provider: "protheus",
    mode: "dry_run",
    candidate: { name: "Larissa Oliveira", email: "larissa@example.com", cpf: "123" },
    job: { title: "Assistente Administrativo", department: null },
    admission: { start_date: "2026-06-01", salary_offer: 4500, work_model: "Presencial" },
    decision: { hiring_decision_id: "decision-1" },
    documents: [],
  },
  response_payload_json: null,
  validation_errors_json: [],
  error_message: null,
  attempted_by: "user-1",
  created_at: "2026-05-25T15:20:00Z",
  updated_at: "2026-05-25T15:20:00Z",
  completed_at: null,
};

const blockedCapabilities: ProtheusCapabilities = {
  provider: "protheus",
  environment: "development",
  integration_mode: "dry_run",
  dry_run: { available: true, disabled_reason: null },
  simulation: { available: true, disabled_reason: null },
  mock: {
    available: false,
    disabled_reason: "Mock send permitido apenas quando ERP_INTEGRATION_MODE=mock.",
  },
  real_send: {
    available: false,
    disabled_reason:
      "Feature flags de envio real desligadas: PROTHEUS_REAL_SEND_ENABLED, ERP_ALLOW_REAL_SEND.",
    missing_configuration: ["PROTHEUS_BASE_URL"],
    blocking_flags: ["PROTHEUS_REAL_SEND_ENABLED", "ERP_ALLOW_REAL_SEND"],
  },
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <AdmissionProtheusIntegrationPanel caseId="case-1" />
    </MemoryRouter>,
  );
}

describe("AdmissionProtheusIntegrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionPackageService.getPackageByCaseId).mockResolvedValue(null);
    vi.mocked(admissionPackageService.getProtheusCapabilities).mockResolvedValue(blockedCapabilities);
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [] });
  });

  it("bloqueia integração quando ready_for_export=false e mostra blockers", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(blockedWorkspace);

    renderPanel();

    expect(await screen.findByText("Integração bloqueada")).toBeInTheDocument();
    expect(screen.getByText("Foto 3x4 ausente")).toBeInTheDocument();
    expect(screen.getByText("Operação bloqueada pelo gate de pré-admissão.")).toBeInTheDocument();
    expect(admissionPackageService.getPackageByCaseId).not.toHaveBeenCalled();
  });

  it("carrega pacote e tentativas quando ready_for_export=true", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(readyWorkspace);
    vi.mocked(admissionPackageService.getPackageByCaseId).mockResolvedValue(admissionPackage);
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [readyAttempt] });

    renderPanel();

    expect(await screen.findByText("Caso liberado para integração")).toBeInTheDocument();
    expect(await screen.findByText("Pacote de Admissão")).toBeInTheDocument();
    expect(await screen.findByText("Simulação Protheus")).toBeInTheDocument();
    expect(await screen.findByText("Tentativas de Integração")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preparar simulação Protheus/i })).toBeEnabled();
  });

  it("mantém envio real/homologação bloqueado nesta fase", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(readyWorkspace);
    vi.mocked(admissionPackageService.getPackageByCaseId).mockResolvedValue(admissionPackage);
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [readyAttempt] });

    renderPanel();

    const homologButton = await screen.findByRole("button", { name: /Enviar para homologação/i });
    expect(homologButton).toBeDisabled();
    expect(screen.getByText(/Envio real\/homologação está bloqueado por capability backend/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/PROTHEUS_REAL_SEND_ENABLED/i)).toBeInTheDocument();
    });
  });

  it("prepara dry-run usando endpoint existente", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(readyWorkspace);
    vi.mocked(admissionPackageService.getPackageByCaseId).mockResolvedValue(admissionPackage);
    vi.mocked(admissionPackageService.createProtheusDryRunAttempt).mockResolvedValue(readyAttempt);

    renderPanel();

    await user.click(await screen.findByRole("button", { name: /Preparar simulação Protheus/i }));

    await waitFor(() => {
      expect(admissionPackageService.createProtheusDryRunAttempt).toHaveBeenCalledWith("pkg-1");
    });
  });
});
