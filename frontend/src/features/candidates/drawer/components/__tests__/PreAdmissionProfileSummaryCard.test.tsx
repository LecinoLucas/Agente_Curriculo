import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { admissionWorkspaceService } from "../../../../../services/admissionWorkspaceService";
import type { AdmissionCaseOverview } from "../../../../../types/domain";
import { PreAdmissionProfileSummaryCard } from "../PreAdmissionProfileSummaryCard";

vi.mock("../../../../../services/admissionWorkspaceService", () => ({
  admissionWorkspaceService: {
    getOverview: vi.fn(),
  },
}));

const overview: AdmissionCaseOverview = {
  case: {
    id: "case-1",
    status: "documents_pending",
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
  status_label: "Documentos pendentes",
  progress: {
    total: 8,
    approved: 3,
    pending: 4,
    rejected: 1,
    in_review: 0,
    waived: 0,
  },
  main_blocker: {
    type: "missing_document",
    severity: "high",
    title: "Foto 3x4 ausente",
    description: "Solicite o envio para prosseguir com o checklist.",
    action: "request_document",
  },
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
  next_action: {
    type: "approve_document",
    label: "Aprovar documento",
    enabled: true,
    disabled_reason: null,
  },
  summary: {
    responsible_name: "Ana Paula",
    created_at: "2026-05-24T10:00:00Z",
    last_update_at: "2026-05-25T14:00:00Z",
    readiness_status: "not_ready",
    ready_for_export: false,
  },
  integration_status: {
    state: "pending",
    label: "Pendente",
    ready_for_export: false,
  },
  updated_at: "2026-05-25T14:00:00Z",
};

function renderCard() {
  return render(
    <MemoryRouter>
      <PreAdmissionProfileSummaryCard caseId="case-1" />
    </MemoryRouter>,
  );
}

describe("PreAdmissionProfileSummaryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admissionWorkspaceService.getOverview).mockResolvedValue(overview);
  });

  it("renderiza apenas o resumo com status, vaga, progresso, pendência e CTA", async () => {
    renderCard();

    const card = await screen.findByTestId("pre-admission-profile-summary");
    const view = within(card);

    expect(admissionWorkspaceService.getOverview).toHaveBeenCalledWith("case-1");
    expect(view.getByText("Pré-admissão em andamento")).toBeInTheDocument();
    expect(view.getByText("Assistente Administrativo")).toBeInTheDocument();
    expect(view.getByTestId("pre-admission-summary-progress")).toHaveTextContent("3/8");
    expect(view.getByText("Foto 3x4 ausente")).toBeInTheDocument();
    expect(view.getByText(/Protheus: Pendente/i)).toBeInTheDocument();
    expect(view.getByTestId("pre-admission-summary-open-cta")).toHaveAttribute(
      "href",
      "/admissao/case-1",
    );
  });

  it("não renderiza checklist, documentos, histórico ou painel operacional no perfil", async () => {
    renderCard();

    await screen.findByTestId("pre-admission-profile-summary");

    expect(screen.queryByText("Documento de identidade")).not.toBeInTheDocument();
    expect(screen.queryByText("RG_Larissa.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Documento enviado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Aprovar$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Simulação Protheus/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Preparar simulação Protheus/i })).not.toBeInTheDocument();
  });
});
