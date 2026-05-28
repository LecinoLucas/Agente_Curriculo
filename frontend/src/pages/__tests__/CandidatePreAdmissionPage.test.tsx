import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidatePreAdmissionPage } from "../CandidatePreAdmissionPage";
import { candidatePortalService } from "../../services/candidatePortalService";
import { HttpError } from "../../services/http";
import { toast } from "../../shared/utils/toast";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    getPreAdmission: vi.fn(),
    uploadPreAdmissionDocument: vi.fn(),
    downloadPreAdmissionDocument: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function buildItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    item_id: "item-1",
    title: "CPF",
    description: "Envie uma cópia do CPF.",
    required: true,
    status: "pending",
    rejection_reason_public: null,
    uploaded_document: null,
    allowed_file_types: ["application/pdf", "image/jpeg", "image/png"],
    max_file_size_mb: 10,
    ...overrides,
  };
}

function buildEnvelope(overrides: Partial<Record<string, unknown>> = {}) {
  const items = (overrides.checklist_items as ReturnType<typeof buildItem>[] | undefined) ?? [
    buildItem(),
    buildItem({
      item_id: "item-2",
      title: "RG",
      status: "rejected",
      rejection_reason_public: "Foto borrada. Reenvie em PDF.",
      uploaded_document: {
        id: "doc-rg",
        original_filename: "rg.pdf",
        mime_type: "application/pdf",
        size_bytes: 1234,
        status: "rejected",
        uploaded_at: "2026-05-22T10:00:00Z",
      },
    }),
    buildItem({
      item_id: "item-3",
      title: "Comprovante de endereço",
      status: "received",
      uploaded_document: {
        id: "doc-cpe",
        original_filename: "endereco.pdf",
        mime_type: "application/pdf",
        size_bytes: 800,
        status: "uploaded",
        uploaded_at: "2026-05-23T10:00:00Z",
      },
    }),
    buildItem({
      item_id: "item-4",
      title: "Dados bancários",
      status: "approved",
      uploaded_document: {
        id: "doc-dados",
        original_filename: "dados.pdf",
        mime_type: "application/pdf",
        size_bytes: 600,
        status: "approved",
        uploaded_at: "2026-05-21T09:00:00Z",
      },
    }),
  ];

  const total = items.length;
  const approved = items.filter((i) => i.status === "approved").length;
  const summary = {
    has_pre_admission_case: true,
    pre_admission_status: "documents_pending",
    documents_total: total,
    documents_pending: total - approved,
    documents_submitted: items.filter((i) =>
      ["received", "approved"].includes(String(i.status)),
    ).length,
    documents_approved: approved,
    next_pending_document: "CPF",
  };

  return {
    case: {
      id: "case-1",
      status: "documents_pending",
      salary_offer: null,
      start_date: null,
      work_model: null,
      checklist_items: items,
      summary,
      ...overrides,
    },
    summary,
  };
}

function renderPage(initial: string = "/candidato/pre-admissao") {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={[initial]}>
      <Routes>
        <Route path="/candidato/pre-admissao" element={<CandidatePreAdmissionPage />} />
        <Route path="/candidato/portal" element={<div>Portal destino</div>} />
        <Route path="/candidato" element={<div>Login destino</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CandidatePreAdmissionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (candidatePortalService.uploadPreAdmissionDocument as any).mockResolvedValue({
      id: "doc-new",
      original_filename: "cpf.pdf",
      mime_type: "application/pdf",
      size_bytes: 100,
      status: "uploaded",
      uploaded_at: "2026-05-26T10:00:00Z",
    });
    (candidatePortalService.downloadPreAdmissionDocument as any).mockResolvedValue(
      new Blob(["pdf"]),
    );
  });

  it("renderiza título e progresso da pré-admissão", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());

    renderPage();

    expect(await screen.findByRole("heading", { name: /Minha pré-admissão/i })).toBeInTheDocument();
    const progress = await screen.findByTestId("candidate-pre-admission-progress");
    expect(within(progress).getByTestId("candidate-pre-admission-progress-counts")).toHaveTextContent(
      /1 de 4 documentos aprovados/i,
    );
  });

  it("lista documentos pendentes e em análise", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());

    renderPage();

    const pending = await screen.findByTestId("candidate-pre-admission-pending-list");
    expect(within(pending).getByText("CPF")).toBeInTheDocument();
    const inReview = await screen.findByTestId("candidate-pre-admission-in-review-list");
    expect(within(inReview).getByText("Comprovante de endereço")).toBeInTheDocument();
    const approved = await screen.findByTestId("candidate-pre-admission-approved-list");
    expect(within(approved).getByText("Dados bancários")).toBeInTheDocument();
  });

  it("mostra rejection_reason_public para documento rejeitado", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());

    renderPage();

    const rejected = await screen.findByTestId("candidate-pre-admission-rejected-list");
    expect(within(rejected).getByText("RG")).toBeInTheDocument();
    expect(
      within(rejected).getByTestId("candidate-pre-admission-rejection-reason"),
    ).toHaveTextContent(/Foto borrada/);
  });

  it("usa fallback genérico quando rejection_reason_public é null", async () => {
    const env = buildEnvelope({
      checklist_items: [
        buildItem({
          item_id: "item-x",
          title: "Foto 3x4",
          status: "rejected",
          rejection_reason_public: null,
          uploaded_document: {
            id: "doc-x",
            original_filename: "foto.jpg",
            mime_type: "image/jpeg",
            size_bytes: 500,
            status: "rejected",
            uploaded_at: "2026-05-20T10:00:00Z",
          },
        }),
      ],
    });
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(env);

    renderPage();

    const reason = await screen.findByTestId("candidate-pre-admission-rejection-reason");
    expect(reason).toHaveTextContent(/Documento rejeitado\. Envie uma nova versão para análise\./i);
  });

  it("não renderiza review_notes, reviewed_by, Protheus, pipeline nem export_package", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());

    const { container } = renderPage();
    await screen.findByTestId("candidate-pre-admission-progress");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/review_notes/i);
    expect(text).not.toMatch(/reviewed_by/i);
    expect(text).not.toMatch(/reviewed_at/i);
    expect(text).not.toMatch(/protheus/i);
    expect(text).not.toMatch(/pipeline/i);
    expect(text).not.toMatch(/export[_ ]package/i);
  });

  it("upload chama endpoint correto e recarrega envelope", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());

    renderPage();

    const pending = await screen.findByTestId("candidate-pre-admission-pending-list");
    const input = within(pending).getByLabelText(/Enviar documento para CPF/i) as HTMLInputElement;
    const file = new File(["pdf"], "cpf.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(candidatePortalService.uploadPreAdmissionDocument).toHaveBeenCalledWith(
        "case-1",
        "item-1",
        expect.any(FormData),
      );
    });
    expect((candidatePortalService.getPreAdmission as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(toast.success).toHaveBeenCalledWith("Documento enviado para análise.");
  });

  it("estado sem caso mostra mensagem dedicada", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue({
      case: null,
      summary: {
        has_pre_admission_case: false,
        pre_admission_status: null,
        documents_total: 0,
        documents_pending: 0,
        documents_submitted: 0,
        documents_approved: 0,
        next_pending_document: null,
      },
    });

    renderPage();

    expect(await screen.findByTestId("candidate-pre-admission-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-pre-admission-progress")).not.toBeInTheDocument();
  });

  it("estado de loading aparece antes do envelope chegar", async () => {
    let resolveEnvelope: ((value: unknown) => void) | null = null;
    (candidatePortalService.getPreAdmission as any).mockReturnValue(
      new Promise((resolve) => {
        resolveEnvelope = resolve;
      }),
    );

    renderPage();

    expect(await screen.findByTestId("candidate-pre-admission-loading")).toBeInTheDocument();
    resolveEnvelope?.(buildEnvelope());
    await screen.findByTestId("candidate-pre-admission-progress");
  });

  it("estado de erro mostra mensagem e botão de tentar novamente", async () => {
    (candidatePortalService.getPreAdmission as any).mockRejectedValueOnce(
      new Error("Falha de rede."),
    );

    renderPage();

    const error = await screen.findByTestId("candidate-pre-admission-error");
    expect(error).toHaveTextContent(/Falha de rede/i);
    expect(within(error).getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
  });

  it("redireciona para /candidato quando a sessão expira (401)", async () => {
    (candidatePortalService.getPreAdmission as any).mockRejectedValueOnce(
      new HttpError(401, "unauthorized"),
    );

    renderPage();

    expect(await screen.findByText("Login destino")).toBeInTheDocument();
  });

  it("link de voltar leva ao portal", async () => {
    (candidatePortalService.getPreAdmission as any).mockResolvedValue(buildEnvelope());

    renderPage();

    const back = await screen.findByTestId("candidate-pre-admission-back-link");
    expect(back).toHaveAttribute("href", "/candidato/portal");
  });
});
