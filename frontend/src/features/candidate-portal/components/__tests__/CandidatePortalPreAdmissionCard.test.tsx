import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidatePortalPreAdmissionCard } from "../CandidatePortalPreAdmissionCard";
import {
  candidatePortalService,
  type CandidatePortalPreAdmissionEnvelope,
} from "../../../../services/candidatePortalService";

vi.mock("../../../../services/candidatePortalService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../services/candidatePortalService")>();
  return {
    ...actual,
    candidatePortalService: {
      ...actual.candidatePortalService,
      uploadPreAdmissionDocument: vi.fn(),
      downloadPreAdmissionDocument: vi.fn(),
    },
  };
});

vi.mock("../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseSummary = {
  has_pre_admission_case: true,
  pre_admission_status: "documents_pending" as const,
  documents_total: 1,
  documents_pending: 1,
  documents_submitted: 0,
  documents_approved: 0,
  next_pending_document: "CPF",
};

const baseEnvelope: CandidatePortalPreAdmissionEnvelope = {
  case: {
    id: "case-1",
    status: "documents_pending",
    salary_offer: null,
    start_date: null,
    work_model: null,
    checklist_items: [
      {
        item_id: "item-1",
        title: "CPF",
        description: "Envie o CPF.",
        required: true,
        status: "pending",
        rejection_reason_public: null,
        uploaded_document: null,
        allowed_file_types: ["application/pdf", "image/jpeg", "image/png"],
        max_file_size_mb: 10,
      },
    ],
    summary: baseSummary,
  },
  summary: baseSummary,
};

describe("CandidatePortalPreAdmissionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(candidatePortalService.uploadPreAdmissionDocument).mockResolvedValue({
      id: "doc-1",
      case_id: "case-1",
      checklist_item_id: "item-1",
      candidate_id: "candidate-1",
      original_filename: "cpf.pdf",
      mime_type: "application/pdf",
      size_bytes: 42,
      status: "uploaded",
      uploaded_at: "2026-05-14T10:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      review_notes: null,
      created_at: "2026-05-14T10:00:00Z",
      updated_at: "2026-05-14T10:00:00Z",
    });
    vi.mocked(candidatePortalService.downloadPreAdmissionDocument).mockResolvedValue(new Blob(["pdf"]));
  });

  it("não renderiza nada quando não há caso de pré-admissão", () => {
    const { container } = render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          case: null,
          summary: { ...baseSummary, has_pre_admission_case: false, documents_total: 0 },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("mostra checklist pendente", () => {
    render(<CandidatePortalPreAdmissionCard preAdmission={baseEnvelope} onUploaded={vi.fn()} />);

    expect(screen.getByText("CPF")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getByLabelText(/Enviar documento para CPF/i)).toBeInTheDocument();
    expect(screen.getByText(/0 de 1 documentos aprovados/i)).toBeInTheDocument();
  });

  it("upload de documento funciona", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    render(<CandidatePortalPreAdmissionCard preAdmission={baseEnvelope} onUploaded={onUploaded} />);

    const file = new File(["%PDF-1.4"], "cpf.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Enviar documento para CPF/i), file);

    await waitFor(() => {
      expect(candidatePortalService.uploadPreAdmissionDocument).toHaveBeenCalledWith(
        "case-1",
        "item-1",
        expect.any(FormData),
      );
      expect(onUploaded).toHaveBeenCalled();
    });
  });

  it("mostra status enviado", () => {
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          ...baseEnvelope,
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "received",
                uploaded_document: {
                  id: "doc-1",
                  original_filename: "cpf.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 42,
                  status: "uploaded",
                  uploaded_at: "2026-05-14T10:00:00Z",
                },
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(screen.getByText("Enviado para análise")).toBeInTheDocument();
    expect(screen.getByText("cpf.pdf")).toBeInTheDocument();
  });

  it("item rejeitado sem rejection_reason_public mostra fallback genérico", () => {
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          ...baseEnvelope,
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "rejected",
                rejection_reason_public: null,
                uploaded_document: {
                  id: "doc-1",
                  original_filename: "cpf.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 42,
                  status: "rejected",
                  uploaded_at: "2026-05-14T10:00:00Z",
                },
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("candidate-portal-pre-admission-rejection-reason"),
    ).toHaveTextContent(/Documento rejeitado\. Envie uma nova versão para análise\./i);
  });

  it("não renderiza review_notes ou identificadores internos no card do portal", () => {
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          ...baseEnvelope,
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "rejected",
                rejection_reason_public: "Reenvie em PDF.",
                uploaded_document: {
                  id: "doc-1",
                  original_filename: "cpf.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 42,
                  status: "rejected",
                  uploaded_at: "2026-05-14T10:00:00Z",
                },
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(screen.queryByText(/review_notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reviewed_by/i)).not.toBeInTheDocument();
  });

  it("item rejeitado mostra motivo público", () => {
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          ...baseEnvelope,
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "rejected",
                rejection_reason_public: "Documento ilegível.",
                uploaded_document: {
                  id: "doc-1",
                  original_filename: "cpf.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 42,
                  status: "rejected",
                  uploaded_at: "2026-05-14T10:00:00Z",
                },
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("candidate-portal-pre-admission-rejection-reason"),
    ).toHaveTextContent(/Documento ilegível/);
  });

  it("permite substituir arquivo rejeitado", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          ...baseEnvelope,
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "rejected",
                rejection_reason_public: "Documento ilegível.",
                uploaded_document: {
                  id: "doc-1",
                  original_filename: "cpf.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 42,
                  status: "rejected",
                  uploaded_at: "2026-05-14T10:00:00Z",
                },
              },
            ],
          },
        }}
        onUploaded={onUploaded}
      />,
    );

    expect(screen.getByText(/Substituir arquivo/i)).toBeInTheDocument();
    const file = new File(["%PDF-1.4"], "cpf-novo.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Enviar documento para CPF/i), file);

    await waitFor(() => {
      expect(candidatePortalService.uploadPreAdmissionDocument).toHaveBeenCalled();
      expect(onUploaded).toHaveBeenCalled();
    });
  });

  it("mostra loading", () => {
    render(<CandidatePortalPreAdmissionCard preAdmission={null} loading onUploaded={vi.fn()} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("permite download do documento aprovado e bloqueia novo upload em caso admitido", async () => {
    const user = userEvent.setup();
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          ...baseEnvelope,
          case: {
            ...baseEnvelope.case!,
            status: "admitted",
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "approved",
                uploaded_document: {
                  id: "doc-1",
                  original_filename: "cpf.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 42,
                  status: "approved",
                  uploaded_at: "2026-05-14T10:00:00Z",
                },
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/Enviar documento para CPF/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Novos uploads estão bloqueados/i)).toBeInTheDocument();
    expect(screen.getByText(/Documento aprovado pelo RH/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Baixar/i }));

    await waitFor(() => {
      expect(candidatePortalService.downloadPreAdmissionDocument).toHaveBeenCalledWith("doc-1");
    });
  });
});
