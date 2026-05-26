import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ErpDryRunPanel } from "../ErpDryRunPanel";
import * as admissionService from "../../../../../services/admissionPackageService";
import type {
  AdmissionPackage,
  ErpIntegrationAttempt,
  ProtheusCapabilities,
} from "../../../../../types/domain";

vi.mock("../../../../../services/admissionPackageService");

const basePackage: AdmissionPackage = {
  id: "pkg-1",
  case_id: "case-1",
  candidate_id: "cand-1",
  job_id: "job-1",
  status: "approved_for_export",
  created_at: "2026-05-14T10:00:00Z",
  updated_at: "2026-05-14T10:00:00Z",
  approved_at: "2026-05-14T10:01:00Z",
  exported_at: null,
  cancelled_at: null,
  created_by: "user-1",
  approved_by: "user-1",
  exported_by: null,
  validation_errors: null,
  payload: {
    candidate: { id: "cand-1", full_name: "Candidate ERP", email: "c@example.com", phone: null, cpf: "390" },
    job: { id: "job-1", title: "Backend Engineer", company: null, department: null, location: null },
    pre_admission: { case_id: "case-1", status: "ready_for_admission", start_date: "2026-06-01", salary_offer: 8500, work_model: "hybrid" },
    documents: [],
    decision: { hiring_decision_id: "dec-1", decision_outcome: "hire", reason_code: "strong_fit", submitted_at: "2026-05-14T09:00:00Z" },
  },
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
    candidate: { name: "Candidate ERP", email: "c@example.com", cpf: "390" },
    job: { title: "Backend Engineer", department: null },
    admission: { start_date: "2026-06-01", salary_offer: 8500, work_model: "hybrid" },
    decision: { hiring_decision_id: "dec-1" },
    documents: [{ title: "CPF", status: "approved", document_id: "doc-1" }],
  },
  response_payload_json: null,
  validation_errors_json: null,
  error_message: null,
  attempted_by: "user-1",
  created_at: "2026-05-14T10:30:00Z",
  updated_at: "2026-05-14T10:30:00Z",
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

const realSendCapabilities: ProtheusCapabilities = {
  ...blockedCapabilities,
  environment: "staging",
  real_send: {
    available: true,
    disabled_reason: null,
    missing_configuration: [],
    blocking_flags: [],
  },
};

const mockCapabilities: ProtheusCapabilities = {
  ...blockedCapabilities,
  integration_mode: "mock",
  mock: { available: true, disabled_reason: null },
};

describe("ErpDryRunPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionService.getProtheusCapabilities).mockResolvedValue(blockedCapabilities);
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({ attempts: [] });
  });

  it("mostra bloqueio se pacote não aprovado", () => {
    render(<ErpDryRunPanel pkg={{ ...basePackage, status: "ready_for_review" }} />);
    expect(screen.getByText(/Pacote precisa estar aprovado/i)).toBeInTheDocument();
  });

  it("mostra botão quando pacote aprovado", async () => {
    render(<ErpDryRunPanel pkg={basePackage} />);
    await waitFor(() => {
      expect(screen.getByText(/Preparar simulação Protheus/i)).toBeInTheDocument();
    });
    expect(await screen.findByText("development")).toBeInTheDocument();
    expect(screen.getByText(/Envio real\/homologação está bloqueado por capability backend/i)).toBeInTheDocument();
  });

  it("cria tentativa dry-run", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionService.createProtheusDryRunAttempt).mockResolvedValue(readyAttempt);

    render(<ErpDryRunPanel pkg={basePackage} />);
    await user.click(await screen.findByText(/Preparar simulação Protheus/i));

    expect(admissionService.createProtheusDryRunAttempt).toHaveBeenCalledWith("pkg-1");
  });

  it("executa mock quando capability permite", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionService.getProtheusCapabilities).mockResolvedValue(mockCapabilities);
    vi.mocked(admissionService.createProtheusMockAttempt).mockResolvedValue({
      ...readyAttempt,
      id: "mock-1",
      mode: "mock",
      status: "sent",
      response_payload_json: { success: true, external_reference: "PROTHEUS-MOCK-1" },
    });

    render(<ErpDryRunPanel pkg={basePackage} />);
    await user.click(await screen.findByRole("button", { name: /Executar mock/i }));

    expect(admissionService.createProtheusMockAttempt).toHaveBeenCalledWith("pkg-1");
  });

  it("habilita envio homologacao somente quando capability real_send permite", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionService.getProtheusCapabilities).mockResolvedValue(realSendCapabilities);
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({
      attempts: [
        {
          ...readyAttempt,
          status: "simulated",
          response_payload_json: { success: true, external_reference: "DRY-RUN-1" },
        },
      ],
    });
    vi.mocked(admissionService.createProtheusHomologAttempt).mockResolvedValue({
      ...readyAttempt,
      id: "real-1",
      mode: "real",
      status: "sent",
      response_payload_json: { success: true, external_reference: "REAL-1" },
    });

    render(<ErpDryRunPanel pkg={basePackage} />);
    const homologButton = await screen.findByRole("button", { name: /Enviar para homologação/i });
    expect(homologButton).toBeEnabled();

    await user.click(homologButton);
    expect(admissionService.createProtheusHomologAttempt).toHaveBeenCalledWith("pkg-1");
  });

  it("mantem payload tecnico recolhido por padrao", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({ attempts: [readyAttempt] });
    render(<ErpDryRunPanel pkg={basePackage} />);

    expect(await screen.findByText(/Preview do Payload Protheus/i)).toBeInTheDocument();
    expect(screen.getByText(/Nome:/i)).toBeInTheDocument();
    expect(screen.getByText(/c\*\*\*@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Informação técnica. Não compartilhe externamente./i)).toBeInTheDocument();

    const rawPayload = await screen.findByTestId("erp-payload-raw-json");
    expect(rawPayload).toHaveTextContent('"name": "Candidate ERP"');
    expect(rawPayload).not.toBeVisible();

    await user.click(screen.getByText(/Ver payload técnico/i));
    expect(rawPayload).toBeVisible();
  });

  it("sanitiza erro tecnico longo antes de renderizar", async () => {
    vi.mocked(admissionService.listErpAttempts).mockRejectedValue(
      new Error('Falha ao carregar {"cpf":"390","stack":"trace","token":"secret"}'),
    );

    render(<ErpDryRunPanel pkg={basePackage} />);

    expect(await screen.findByText(/Falha ao carregar \[detalhes técnicos omitidos\]/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it("mostra erros de validação", async () => {
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({
      attempts: [
        {
          ...readyAttempt,
          status: "validation_failed",
          validation_errors_json: [{ field: "candidate.cpf", message: "Campo obrigatório ausente" }],
        },
      ],
    });
    render(<ErpDryRunPanel pkg={basePackage} />);

    await waitFor(() => {
      expect(screen.getByText(/Erros de validação/i)).toBeInTheDocument();
      expect(screen.getByText(/candidate.cpf/i)).toBeInTheDocument();
    });
  });

  it("simula envio", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({ attempts: [readyAttempt] });
    vi.mocked(admissionService.simulateErpAttempt).mockResolvedValue({
      ...readyAttempt,
      status: "simulated",
      response_payload_json: {
        success: true,
        external_reference: "DRY-RUN-ABC123",
        message: "Simulação concluída. Nenhum dado foi enviado ao ERP.",
      },
      completed_at: "2026-05-14T10:40:00Z",
    });

    render(<ErpDryRunPanel pkg={basePackage} />);
    await user.click(await screen.findByText(/Simular envio/i));

    expect(admissionService.simulateErpAttempt).toHaveBeenCalledWith("att-1");
  });

  it("mostra status simulated", async () => {
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({
      attempts: [
        {
          ...readyAttempt,
          status: "simulated",
          response_payload_json: {
            success: true,
            external_reference: "DRY-RUN-ABC123",
            message: "Simulação concluída. Nenhum dado foi enviado ao ERP.",
          },
          completed_at: "2026-05-14T10:40:00Z",
        },
      ],
    });

    render(<ErpDryRunPanel pkg={basePackage} />);
    await waitFor(() => {
      expect(screen.getByText(/Simulação concluída/i)).toBeInTheDocument();
      expect(screen.getAllByText(/DRY-RUN-ABC123/i).length).toBeGreaterThan(0);
    });
  });

  it("mostra aviso de que nada foi enviado ao ERP", async () => {
    vi.mocked(admissionService.listErpAttempts).mockResolvedValue({
      attempts: [
        {
          ...readyAttempt,
          status: "simulated",
          response_payload_json: {
            success: true,
            external_reference: "DRY-RUN-XYZ999",
            message: "Simulação concluída. Nenhum dado foi enviado ao ERP.",
          },
          completed_at: "2026-05-14T10:40:00Z",
        },
      ],
    });

    render(<ErpDryRunPanel pkg={basePackage} />);
    await waitFor(() => {
      expect(screen.getByText(/Nenhum dado foi enviado ao ERP/i)).toBeInTheDocument();
    });
  });
});
