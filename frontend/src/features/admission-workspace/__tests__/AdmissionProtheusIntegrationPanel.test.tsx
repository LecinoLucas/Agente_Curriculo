import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionProtheusIntegrationPanel } from "../AdmissionProtheusIntegrationPanel";
import { admissionWorkspaceService } from "../../../services/admissionWorkspaceService";
import * as admissionPackageService from "../../../services/admissionPackageService";
import type {
  AdmissionCaseWorkspace,
  AdmissionPackage,
  ErpIntegrationAttempt,
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
  recent_events: [],
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

const approvedPackage: AdmissionPackage = {
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

const exportSuccessAttempt: ErpIntegrationAttempt = {
  id: "att-1",
  package_id: "pkg-1",
  case_id: "case-1",
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
  response_payload_json: { success: true, external_reference: "PROTHEUS-MOCK-001" },
  validation_errors_json: [],
  error_message: null,
  error_summary: null,
  attempted_by: "user-1",
  created_at: "2026-05-25T15:20:00Z",
  updated_at: "2026-05-25T15:20:00Z",
  completed_at: "2026-05-25T15:20:03Z",
};

const failedRetryableAttempt: ErpIntegrationAttempt = {
  ...exportSuccessAttempt,
  id: "att-2",
  status: "failed",
  lifecycle_status: "retry_pending",
  retryable: true,
  attempt_number: 1,
  external_reference: null,
  response_payload_json: null,
  error_message: "Validation failed for ERP export",
  error_summary: {
    code: "PROTHEUS_MOCK_VALIDATION_ERROR",
    message: "Falha sanitizada do ERP para nova tentativa.",
    stage: "provider",
    retryable: true,
  },
  completed_at: "2026-05-25T15:20:03Z",
};

function renderPanel(props?: Partial<ComponentProps<typeof AdmissionProtheusIntegrationPanel>>) {
  return render(
    <MemoryRouter>
      <AdmissionProtheusIntegrationPanel caseId="case-1" {...props} />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("AdmissionProtheusIntegrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(readyWorkspace);
    vi.mocked(admissionPackageService.getPackageByCaseId).mockResolvedValue(approvedPackage);
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [] });
    vi.mocked(admissionPackageService.downloadJson).mockResolvedValue(new Blob(["json"]));
    vi.mocked(admissionPackageService.downloadCsv).mockResolvedValue(new Blob(["csv"]));
    vi.mocked(admissionPackageService.exportErp).mockResolvedValue(exportSuccessAttempt);
    vi.mocked(admissionPackageService.retryExportErp).mockResolvedValue(exportSuccessAttempt);
  });

  it("bloqueia envio ERP quando o caso ainda não está pronto", async () => {
    vi.mocked(admissionWorkspaceService.getWorkspace).mockResolvedValue(blockedWorkspace);

    renderPanel();

    expect(await screen.findByText("Envio ERP bloqueado")).toBeInTheDocument();
    expect(screen.getByText(/Finalize o checklist obrigatório/i)).toBeInTheDocument();
    expect(admissionPackageService.getPackageByCaseId).not.toHaveBeenCalled();
  });

  it("separa downloads de conferência do envio ERP e não mostra payload sensível", async () => {
    renderPanel({ workspace: readyWorkspace, variant: "embedded" });

    const sendSection = await screen.findByTestId("erp-send-section");
    const downloadsSection = screen.getByTestId("erp-downloads-section");

    expect(within(sendSection).getByRole("button", { name: /Enviar para ERP/i })).toBeInTheDocument();
    expect(within(downloadsSection).getByRole("button", { name: /Baixar JSON \(conferência\)/i })).toBeInTheDocument();
    expect(within(downloadsSection).getByRole("button", { name: /Baixar CSV \(conferência\)/i })).toBeInTheDocument();
    expect(screen.getByText(/não envia dados ao ERP/i)).toBeInTheDocument();
    expect(screen.queryByText("123.456.789-00")).not.toBeInTheDocument();
  });

  it("envia para o ERP e mostra estado de loading", async () => {
    const user = userEvent.setup();
    const exportRequest = deferred<ErpIntegrationAttempt>();
    vi.mocked(admissionPackageService.exportErp).mockReturnValue(exportRequest.promise);

    renderPanel({ workspace: readyWorkspace, variant: "embedded" });

    const button = await screen.findByRole("button", { name: /Enviar para ERP/i });
    await user.click(button);

    expect(await screen.findByRole("button", { name: /Enviando\.\.\./i })).toBeDisabled();

    exportRequest.resolve(exportSuccessAttempt);

    await waitFor(() => {
      expect(admissionPackageService.exportErp).toHaveBeenCalledWith("pkg-1");
    });
  });

  it("mostra erro sanitizado e botão de retry quando a tentativa é retryable", async () => {
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [failedRetryableAttempt] });

    renderPanel({ workspace: readyWorkspace, variant: "embedded" });

    expect(await screen.findByTestId("erp-error-summary")).toHaveTextContent(
      "Falha sanitizada do ERP para nova tentativa.",
    );
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
  });

  it("executa retry pelo endpoint dedicado", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionPackageService.listErpAttempts).mockResolvedValue({ attempts: [failedRetryableAttempt] });

    renderPanel({ workspace: readyWorkspace, variant: "embedded" });

    await user.click(await screen.findByRole("button", { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(admissionPackageService.retryExportErp).toHaveBeenCalledWith("pkg-1");
    });
  });
});
