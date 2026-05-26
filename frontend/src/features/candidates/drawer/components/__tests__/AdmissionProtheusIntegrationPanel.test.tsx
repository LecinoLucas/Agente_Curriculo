import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionProtheusIntegrationPanel } from "../AdmissionProtheusIntegrationPanel";
import * as admissionService from "../../../../../services/admissionPackageService";
import type {
  AdmissionPackage,
  ErpIntegrationAttempt,
  ProtheusCapabilities,
} from "../../../../../types/domain";

vi.mock("../../../../../services/admissionPackageService");

const admissionPackage: AdmissionPackage = {
  id: "pkg-1",
  case_id: "case-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  status: "approved_for_export",
  payload: {
    candidate: {
      id: "candidate-1",
      full_name: "Candidate ERP",
      email: "candidate@example.com",
      phone: null,
      cpf: "123",
    },
    job: {
      id: "job-1",
      title: "Analista Protheus",
      company: null,
      department: null,
      location: null,
    },
    pre_admission: {
      case_id: "case-1",
      status: "ready_for_admission",
      start_date: "2026-06-01",
      salary_offer: 12000,
      work_model: "Híbrido",
    },
    documents: [],
    decision: {
      hiring_decision_id: "decision-1",
      decision_outcome: "hire",
      reason_code: "strong",
      submitted_at: "2026-05-14T09:00:00Z",
    },
  },
  validation_errors: null,
  created_by: "user-1",
  approved_by: "user-1",
  exported_by: null,
  created_at: "2026-05-14T10:00:00Z",
  updated_at: "2026-05-14T10:00:00Z",
  approved_at: "2026-05-14T10:30:00Z",
  exported_at: null,
  cancelled_at: null,
};

const erpAttempt: ErpIntegrationAttempt = {
  id: "attempt-1",
  package_id: "pkg-1",
  case_id: "case-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  provider: "protheus",
  mode: "dry_run",
  status: "ready",
  request_payload_json: {
    provider: "protheus",
    mode: "dry_run",
    candidate: { name: "Candidate ERP", email: "candidate@example.com", cpf: "123" },
    job: { title: "Analista Protheus", department: null },
    admission: { start_date: "2026-06-01", salary_offer: 12000, work_model: "Híbrido" },
    decision: { hiring_decision_id: "decision-1" },
    documents: [],
  },
  response_payload_json: null,
  validation_errors_json: [],
  error_message: null,
  attempted_by: "user-1",
  created_at: "2026-05-14T11:00:00Z",
  updated_at: "2026-05-14T11:00:00Z",
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

describe("AdmissionProtheusIntegrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionService.getProtheusCapabilities).mockResolvedValue(blockedCapabilities);
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({ attempts: [] });
    vi.mocked(admissionService.createProtheusDryRunAttempt).mockResolvedValue(erpAttempt);
    vi.mocked(admissionService.simulateErpAttempt).mockResolvedValue({
      ...erpAttempt,
      status: "simulated",
      response_payload_json: {
        success: true,
        external_reference: "EXT-1",
      },
    });
    vi.mocked(admissionService.createProtheusHomologAttempt).mockResolvedValue({
      ...erpAttempt,
      id: "attempt-2",
      mode: "real",
      status: "sent",
    });
  });

  it("renders pending export state when admission is not ready", () => {
    render(<AdmissionProtheusIntegrationPanel caseStatus="documents_pending" pkg={null} />);

    expect(screen.getByTestId("pre-admission-protheus-section")).toHaveTextContent("Integração Protheus");
    expect(screen.getAllByText("Exportação pendente").length).toBeGreaterThan(0);
    expect(screen.getByText(/Conclua as etapas admissionais/i)).toBeInTheDocument();
  });

  it("renders dry-run controls and attempt list when package exists", async () => {
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({ attempts: [erpAttempt] });

    render(
      <AdmissionProtheusIntegrationPanel
        caseStatus="ready_for_admission"
        pkg={admissionPackage}
      />,
    );

    expect(await screen.findByText("Simulação Protheus")).toBeInTheDocument();
    expect(screen.getByText("Última tentativa")).toBeInTheDocument();
    expect(screen.getByText("Tentativas de Integração")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preparar simulação Protheus/i })).toBeEnabled();
    expect(screen.getByText(/Informação técnica. Não compartilhe externamente./i)).toBeInTheDocument();
    expect(screen.getByTestId("erp-payload-raw-json")).not.toBeVisible();
  });

  it("keeps dry-run actions wired to existing service callbacks", async () => {
    const user = userEvent.setup();

    render(
      <AdmissionProtheusIntegrationPanel
        caseStatus="ready_for_admission"
        pkg={admissionPackage}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Preparar simulação Protheus/i }));

    await waitFor(() => {
      expect(admissionService.createProtheusDryRunAttempt).toHaveBeenCalledWith("pkg-1");
    });
  });
});
