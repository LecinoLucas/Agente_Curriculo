import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionProtheusBridgeSummaryPanel } from "../AdmissionProtheusBridgeSummaryPanel";
import { admissionWorkspaceService } from "../../../services/admissionWorkspaceService";
import type { AdmissionProtheusBridgeSummary } from "../../../types/domain";

vi.mock("../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getProtheusBridgeSummary: vi.fn(),
  },
}));

const readySummary: AdmissionProtheusBridgeSummary = {
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

const blockedSummary: AdmissionProtheusBridgeSummary = {
  ...readySummary,
  status: "blocked",
  message: "Última simulação foi bloqueada por segurança.",
  latest_trace: {
    ...readySummary.latest_trace!,
    status: "blocked",
    blocked_reason: "malicious_would_execute",
    error_code: "PROTHEUS_BLOCKED",
  },
  next_action: "Revise o bloqueio no cockpit técnico antes de prosseguir com novas simulações.",
};

const unavailableSummary: AdmissionProtheusBridgeSummary = {
  ...readySummary,
  available: false,
  status: "unavailable",
  message: "Protheus Bridge indisponível no momento.",
  environment: null,
  storage_mode: null,
  readiness: null,
  latest_trace: null,
  next_action: "Verifique se o serviço da bridge está rodando em modo memory ou full.",
};

const disabledSummary: AdmissionProtheusBridgeSummary = {
  ...readySummary,
  enabled: false,
  available: false,
  status: "disabled",
  message: "Integração Protheus Bridge desativada neste ambiente.",
  environment: null,
  storage_mode: null,
  readiness: null,
  latest_trace: null,
  next_action: "Ative a bridge apenas em ambientes controlados de simulação técnica.",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("AdmissionProtheusBridgeSummaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionWorkspaceService.getProtheusBridgeSummary).mockResolvedValue(readySummary);
  });

  it("mostra loading e depois o status ready", async () => {
    const request = deferred<AdmissionProtheusBridgeSummary>();
    vi.mocked(admissionWorkspaceService.getProtheusBridgeSummary).mockReturnValue(request.promise);

    render(<AdmissionProtheusBridgeSummaryPanel caseId="case-1" />);

    expect(screen.getByText(/Carregando o resumo read-only da bridge/i)).toBeInTheDocument();

    request.resolve(readySummary);

    expect(await screen.findByText("Status Protheus")).toBeInTheDocument();
    expect(screen.getByText("Pronta")).toBeInTheDocument();
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("Bridge operacional para simulações seguras.")).toBeInTheDocument();
  });

  it("mostra status blocked com bloqueio e erro sanitizados", async () => {
    vi.mocked(admissionWorkspaceService.getProtheusBridgeSummary).mockResolvedValue(blockedSummary);

    render(<AdmissionProtheusBridgeSummaryPanel caseId="case-1" />);

    expect(await screen.findByText("Bloqueada")).toBeInTheDocument();
    const errorBlock = screen.getByTestId("bridge-error-block");
    expect(errorBlock).toHaveTextContent("Guardrail bloqueou execução real (would_execute ativo)");
    expect(errorBlock).toHaveTextContent("Bloqueio de segurança Protheus");
    expect(errorBlock).toHaveTextContent("PROTHEUS_BLOCKED");
    expect(screen.getByRole("link", { name: /Abrir cockpit técnico/i })).toHaveAttribute(
      "href",
      "http://localhost:5180",
    );
  });

  it("mostra status unavailable sem quebrar o painel", async () => {
    vi.mocked(admissionWorkspaceService.getProtheusBridgeSummary).mockResolvedValue(unavailableSummary);

    render(<AdmissionProtheusBridgeSummaryPanel caseId="case-1" />);

    expect(await screen.findByText("Indisponível")).toBeInTheDocument();
    expect(screen.getByText("Protheus Bridge indisponível no momento.")).toBeInTheDocument();
    expect(screen.getByText(/modo memory ou full/i)).toBeInTheDocument();
  });

  it("mostra status disabled", async () => {
    vi.mocked(admissionWorkspaceService.getProtheusBridgeSummary).mockResolvedValue(disabledSummary);

    render(<AdmissionProtheusBridgeSummaryPanel caseId="case-1" />);

    expect(await screen.findByText("Desativada")).toBeInTheDocument();
    expect(screen.getByText("Integração Protheus Bridge desativada neste ambiente.")).toBeInTheDocument();
  });

  it("permite recarregar e não expõe botões perigosos nem segredos", async () => {
    const user = userEvent.setup();

    render(<AdmissionProtheusBridgeSummaryPanel caseId="case-1" />);

    await screen.findByText("Pronta");
    const safeBanner = screen.getByTestId("real-send-blocked-banner");
    expect(safeBanner).toHaveTextContent(/Envio real ao Protheus está bloqueado neste ambiente/i);
    expect(safeBanner).toHaveTextContent(/Apenas simulações seguras/i);
    await user.click(screen.getByRole("button", { name: /Recarregar/i }));

    await waitFor(() => {
      expect(admissionWorkspaceService.getProtheusBridgeSummary).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByText("X-Internal-Api-Key")).not.toBeInTheDocument();
    expect(screen.queryByText("Authorization")).not.toBeInTheDocument();
    expect(screen.queryByText("123.456.789-00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cadastrar no Protheus/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enviar produção/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Forçar envio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ignorar bloqueios/i })).not.toBeInTheDocument();
  });
});
