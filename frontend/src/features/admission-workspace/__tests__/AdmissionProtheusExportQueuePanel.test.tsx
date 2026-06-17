import fs from "node:fs";
import path from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionProtheusExportQueuePanel } from "../AdmissionProtheusExportQueuePanel";
import {
  PAYLOAD_STATUS_LABELS,
  PROTHEUS_PAYLOAD_STATUS_OPTIONS,
  PROTHEUS_QUEUE_STATUS_OPTIONS,
  QUEUE_STATUS_META,
} from "../protheusExportStatus";
import { admissionWorkspaceService } from "../../../services/admissionWorkspaceService";
import type { ProtheusExportQueueItem } from "../../../types/domain";

vi.mock("../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getLatestProtheusExportRequest: vi.fn(),
    preflightProtheusExportRequest: vi.fn(),
    createProtheusExportRequest: vi.fn(),
    requestNewProtheusExportRequest: vi.fn(),
    cancelProtheusExportRequest: vi.fn(),
  },
}));

const queuedItem: ProtheusExportQueueItem = {
  id: "exp-001",
  case_id: "case-abc",
  status: "queued",
  status_label: "Solicitação enfileirada",
  recommended_action: "Aguarde o processamento automático.",
  attempt_count: 0,
  max_attempts: 3,
  next_attempt_at: null,
  last_error_code: null,
  last_error_message_redacted: null,
  last_trace_id: null,
  can_cancel: true,
  can_retry_manually: false,
  created_at: "2026-06-15T10:00:00Z",
  updated_at: "2026-06-15T10:00:00Z",
  finished_at: null,
  payload_status: "ready",
  payload_status_label: "Payload pronto",
  pending_requirements: [],
  can_request_new: false,
  can_enqueue: false,
  is_stub_mode: true,
  disclaimer: "Fase STUB: nenhuma gravação no ERP é realizada. Apenas simulação segura.",
};

const successItem: ProtheusExportQueueItem = {
  ...queuedItem,
  status: "success",
  status_label: "Exportação concluída",
  recommended_action: "Concluído em modo seguro/STUB. Nenhum cadastro real foi executado.",
  attempt_count: 1,
  can_cancel: false,
  finished_at: "2026-06-15T10:05:00Z",
  last_trace_id: "trace-xyz",
};

const retryItem: ProtheusExportQueueItem = {
  ...queuedItem,
  status: "retry_scheduled",
  status_label: "Retry agendado",
  recommended_action: "Retry automático agendado. Aguarde.",
  attempt_count: 1,
  next_attempt_at: "2026-06-15T10:06:00Z",
  last_error_code: "BRIDGE_TIMEOUT",
  last_error_message_redacted: "[redacted: 503]",
  can_cancel: true,
};

const failedItem: ProtheusExportQueueItem = {
  ...queuedItem,
  status: "failed_permanent",
  status_label: "Falha permanente",
  recommended_action: "Revise o erro e cancele ou solicite reprocessamento.",
  attempt_count: 3,
  can_cancel: false,
  last_error_code: "BRIDGE_FATAL",
  last_error_message_redacted: "[redacted: internal]",
};

const blockedItem: ProtheusExportQueueItem = {
  ...queuedItem,
  status: "blocked",
  status_label: "Bloqueado por guardrail",
  recommended_action: "Bloqueio técnico ativo. Revisão técnica obrigatória antes de nova tentativa.",
  can_cancel: false,
  can_request_new: true,
  unit_name: "Unidade Centro",
};

const unknownStatusItem: ProtheusExportQueueItem = {
  ...queuedItem,
  status: "unexpected_status",
  status_label: "",
  recommended_action: "",
  can_cancel: false,
};

const not404Error = Object.assign(new Error("Server error"), { status: 500 });
const readyPreflight = {
  payload_status: "ready",
  payload_status_label: "Payload pronto",
  pending_requirements: [],
  shape_debug: { fields: { RA_CIC: "present" } },
  safe_error_code: null,
  safe_error_message: null,
  can_enqueue: true,
  is_stub_mode: true,
  disclaimer: "Fase STUB: nenhuma gravação no ERP é realizada. Apenas simulação segura.",
};
const incompletePreflight = {
  ...readyPreflight,
  payload_status: "incomplete",
  payload_status_label: "Payload incompleto",
  pending_requirements: ["CPF ausente", "PIS ausente", "CTPS ausente"],
  can_enqueue: false,
};

describe("AdmissionProtheusExportQueuePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra loading e depois empty state quando não há solicitação", async () => {
    const error = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockRejectedValue(error);
    vi.mocked(admissionWorkspaceService.preflightProtheusExportRequest).mockResolvedValue(readyPreflight);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(screen.getByText(/Carregando status/i)).toBeInTheDocument();

    expect(await screen.findByText(/Nenhuma solicitação de exportação/i)).toBeInTheDocument();
    expect(screen.getByText("Payload pronto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Solicitar exportação Protheus/i })).toBeInTheDocument();
  });

  it("mostra pendências seguras quando o backend bloqueia a criação com 422", async () => {
    const user = userEvent.setup();
    const notFound = Object.assign(new Error("Not found"), { status: 404 });
    const validationError = Object.assign(new Error("Payload inválido"), {
      status: 422,
      data: {
        pending_requirements: ["CPF ausente", "PIS ausente", "CTPS ausente"],
      },
    });
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockRejectedValue(notFound);
    vi.mocked(admissionWorkspaceService.preflightProtheusExportRequest).mockResolvedValue(readyPreflight);
    vi.mocked(admissionWorkspaceService.createProtheusExportRequest).mockRejectedValue(validationError);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByRole("button", { name: /Solicitar exportação Protheus/i });
    await user.click(screen.getByRole("button", { name: /Solicitar exportação Protheus/i }));

    expect(await screen.findByText("CPF ausente")).toBeInTheDocument();
    expect(screen.getByText("PIS ausente")).toBeInTheDocument();
    expect(screen.getByText("CTPS ausente")).toBeInTheDocument();
    expect(screen.queryByText(/123\.456\.789-00/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Solicitar exportação Protheus/i })).toBeDisabled();
  });

  it("mostra status queued com label PT-BR e disclaimer STUB", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(queuedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Solicitação enfileirada")).toBeInTheDocument();
    expect(screen.getByText("Aguarde o processamento automático pela fila de exportação.")).toBeInTheDocument();
    expect(screen.getByText(/Fase STUB: nenhuma gravação/i)).toBeInTheDocument();
  });

  it("mostra botão cancelar quando can_cancel=true e oculta quando can_cancel=false", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(queuedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByRole("button", { name: /Cancelar solicitação/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Solicitar exportação Protheus/i })).not.toBeInTheDocument();
  });

  it("não mostra botão cancelar quando can_cancel=false (status success)", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(successItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Exportação concluída")).toBeInTheDocument();
    expect(screen.getByText(/Concluído em modo seguro\/STUB/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancelar solicitação/i })).not.toBeInTheDocument();
  });

  it("mostra retry_scheduled com next_attempt_at e erro redacted", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(retryItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Retry agendado")).toBeInTheDocument();
    expect(screen.getByText("Timeout da conexão com a bridge")).toBeInTheDocument();
    expect(screen.getByText("BRIDGE_TIMEOUT")).toBeInTheDocument();
    expect(screen.getByText("[redacted: 503]")).toBeInTheDocument();
    expect(screen.getByText(/Próximo retry/i)).toBeInTheDocument();
  });

  it("mostra failed_permanent com mensagem de erro redacted", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(failedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Exportação falhou")).toBeInTheDocument();
    expect(screen.getByText("Erro fatal na bridge — verifique os logs técnicos")).toBeInTheDocument();
    expect(screen.getByText("BRIDGE_FATAL")).toBeInTheDocument();
    expect(screen.getByText("[redacted: internal]")).toBeInTheDocument();
    expect(screen.getByText(/Revise o caso e solicite uma nova exportação/i)).toBeInTheDocument();
  });

  it("mostra revisão técnica quando status é blocked", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(blockedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Bloqueado por segurança")).toBeInTheDocument();
    expect(screen.getByText(/Revisão técnica obrigatória/i)).toBeInTheDocument();
    expect(screen.getByText(/Unidade:\s*Unidade Centro/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Solicitar nova exportação segura/i })).toBeInTheDocument();
  });

  it("permite solicitar nova exportação segura quando can_request_new=true", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(blockedItem);
    vi.mocked(admissionWorkspaceService.requestNewProtheusExportRequest).mockResolvedValue({
      was_existing: false,
      export_request: queuedItem,
    });

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByText("Bloqueado por segurança");
    await user.click(screen.getByRole("button", { name: /Solicitar nova exportação segura/i }));

    expect(await screen.findByText("Solicitação enfileirada")).toBeInTheDocument();
    expect(admissionWorkspaceService.requestNewProtheusExportRequest).toHaveBeenCalledWith("case-abc");
  });

  it("solicita exportação ao clicar no botão e atualiza estado", async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockRejectedValue(error);
    vi.mocked(admissionWorkspaceService.preflightProtheusExportRequest).mockResolvedValue(readyPreflight);
    vi.mocked(admissionWorkspaceService.createProtheusExportRequest).mockResolvedValue({
      was_existing: false,
      export_request: queuedItem,
    });

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByRole("button", { name: /Solicitar exportação Protheus/i });
    await user.click(screen.getByRole("button", { name: /Solicitar exportação Protheus/i }));

    expect(await screen.findByText("Solicitação enfileirada")).toBeInTheDocument();
    expect(admissionWorkspaceService.createProtheusExportRequest).toHaveBeenCalledWith("case-abc");
  });

  it("desabilita o botão quando o preflight está incomplete", async () => {
    const error = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockRejectedValue(error);
    vi.mocked(admissionWorkspaceService.preflightProtheusExportRequest).mockResolvedValue(incompletePreflight);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Payload incompleto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Solicitar exportação Protheus/i })).toBeDisabled();
  });

  it("não quebra a UI com status desconhecido", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(unknownStatusItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("Status desconhecido")).toBeInTheDocument();
    expect(screen.getByText(/Revise o status da bridge antes de prosseguir/i)).toBeInTheDocument();
  });

  it("cancela solicitação ao clicar no botão e atualiza estado", async () => {
    const user = userEvent.setup();
    const cancelled: ProtheusExportQueueItem = {
      ...queuedItem,
      status: "cancelled",
      status_label: "Cancelado",
      can_cancel: false,
    };
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(queuedItem);
    vi.mocked(admissionWorkspaceService.cancelProtheusExportRequest).mockResolvedValue(cancelled);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByRole("button", { name: /Cancelar solicitação/i });
    await user.click(screen.getByRole("button", { name: /Cancelar solicitação/i }));

    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(admissionWorkspaceService.cancelProtheusExportRequest).toHaveBeenCalledWith(
      "case-abc",
      "exp-001",
    );
  });

  it("mostra erro quando bridge está indisponível (500)", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockRejectedValue(not404Error);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText(/Indisponível/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
  });

  it("permite recarregar status", async () => {
    const user = userEvent.setup();
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(queuedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByText("Solicitação enfileirada");
    await user.click(screen.getByRole("button", { name: /Atualizar status/i }));

    await waitFor(() => {
      expect(admissionWorkspaceService.getLatestProtheusExportRequest).toHaveBeenCalledTimes(2);
    });
  });

  it("nunca expõe API key, CPF, ExecAuto ou botões proibidos", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(queuedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByText("Solicitação enfileirada");

    expect(screen.queryByText(/X-Internal-Api-Key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PROTHEUS_BRIDGE_INTERNAL_API_KEY/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/123\.456\.789-00/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cadastrar no Protheus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Forçar envio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ignorar bloqueio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Executar ExecAuto/i })).not.toBeInTheDocument();
  });

  it("status labels são em português", async () => {
    const statuses: Array<{ item: ProtheusExportQueueItem; expected: string }> = [
      { item: queuedItem, expected: "Solicitação enfileirada" },
      { item: successItem, expected: "Exportação concluída" },
      { item: retryItem, expected: "Retry agendado" },
      { item: failedItem, expected: "Exportação falhou" },
    ];

    for (const { item, expected } of statuses) {
      vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(item);
      const { unmount } = render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);
      expect(await screen.findByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("mostra trace_id quando disponível", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(successItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    expect(await screen.findByText("trace-xyz")).toBeInTheDocument();
  });

  it("mostra banner STUB quando is_stub_mode está ativo", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(queuedItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByText("Solicitação enfileirada");

    const banner = screen.getByTestId("stub-mode-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Envio real ao Protheus está bloqueado neste ambiente/i);
    expect(banner).toHaveTextContent(/modo seguro \(STUB\)/i);
  });

  it("mostra banner STUB quando preflight tem is_stub_mode ativo", async () => {
    const error = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockRejectedValue(error);
    vi.mocked(admissionWorkspaceService.preflightProtheusExportRequest).mockResolvedValue(readyPreflight);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByText(/Nenhuma solicitação de exportação/i);
    expect(screen.getByTestId("stub-mode-banner")).toBeInTheDocument();
  });

  it("mostra código de erro traduzido para o RH sem jargão técnico cru", async () => {
    vi.mocked(admissionWorkspaceService.getLatestProtheusExportRequest).mockResolvedValue(retryItem);

    render(<AdmissionProtheusExportQueuePanel caseId="case-abc" />);

    await screen.findByText("Retry agendado");

    expect(screen.getByText("Timeout da conexão com a bridge")).toBeInTheDocument();
    const technicalCode = screen.getByText("BRIDGE_TIMEOUT");
    expect(technicalCode).toBeInTheDocument();
    expect(technicalCode).toHaveClass("font-mono");
  });

  it("mantém frontend alinhado com o snapshot de contrato", () => {
    const snapshotPath = path.resolve(process.cwd(), "../docs/protheus/export_status_contract.snapshot.json");
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as {
      payload_statuses: string[];
      queue_statuses: string[];
      active_statuses: string[];
      terminal_statuses: string[];
      max_attempts: number;
    };

    expect(snapshot.payload_statuses).toEqual([...PROTHEUS_PAYLOAD_STATUS_OPTIONS]);
    expect(snapshot.queue_statuses).toEqual([...PROTHEUS_QUEUE_STATUS_OPTIONS]);
    expect(snapshot.max_attempts).toBe(3);

    for (const status of PROTHEUS_QUEUE_STATUS_OPTIONS) {
      expect(QUEUE_STATUS_META[status].label).toBeTruthy();
      expect(QUEUE_STATUS_META[status].description).toBeTruthy();
      if (snapshot.active_statuses.includes(status)) {
        expect(QUEUE_STATUS_META[status].active).toBe(true);
      }
      if (snapshot.terminal_statuses.includes(status)) {
        expect(QUEUE_STATUS_META[status].terminal).toBe(true);
      }
    }

    for (const status of PROTHEUS_PAYLOAD_STATUS_OPTIONS) {
      expect(PAYLOAD_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
