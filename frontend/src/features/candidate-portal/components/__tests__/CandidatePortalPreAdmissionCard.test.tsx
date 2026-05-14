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
    },
  };
});

vi.mock("../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseEnvelope: CandidatePortalPreAdmissionEnvelope = {
  case: {
    id: "case-1",
    status: "documents_pending",
    salary_offer: null,
    start_date: null,
    work_model: null,
    checklist_items: [
      {
        id: "item-1",
        case_id: "case-1",
        item_type: "cpf",
        title: "CPF",
        status: "pending",
        required: true,
        notes: null,
        created_at: "2026-05-14T10:00:00Z",
        updated_at: "2026-05-14T10:00:00Z",
        documents: [],
      },
    ],
  },
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
  });

  it("mostra empty state sem pré-admissão", () => {
    render(<CandidatePortalPreAdmissionCard preAdmission={{ case: null }} onUploaded={vi.fn()} />);

    expect(screen.getByText(/Nenhuma pré-admissão disponível/i)).toBeInTheDocument();
  });

  it("mostra checklist pendente", () => {
    render(<CandidatePortalPreAdmissionCard preAdmission={baseEnvelope} onUploaded={vi.fn()} />);

    expect(screen.getByText("CPF")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();
    expect(screen.getByLabelText(/Enviar documento para CPF/i)).toBeInTheDocument();
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
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "received",
                documents: [
                  {
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
                  },
                ],
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.getByText("cpf.pdf")).toBeInTheDocument();
  });

  it("documento rejeitado mostra motivo", () => {
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "rejected",
                documents: [
                  {
                    id: "doc-1",
                    case_id: "case-1",
                    checklist_item_id: "item-1",
                    candidate_id: "candidate-1",
                    original_filename: "cpf.pdf",
                    mime_type: "application/pdf",
                    size_bytes: 42,
                    status: "rejected",
                    uploaded_at: "2026-05-14T10:00:00Z",
                    reviewed_at: "2026-05-14T11:00:00Z",
                    reviewed_by: "user-1",
                    review_notes: "Documento ilegível.",
                    created_at: "2026-05-14T10:00:00Z",
                    updated_at: "2026-05-14T11:00:00Z",
                  },
                ],
              },
            ],
          },
        }}
        onUploaded={vi.fn()}
      />,
    );

    expect(screen.getByText("Rejeitado")).toBeInTheDocument();
    expect(screen.getByText("Documento ilegível.")).toBeInTheDocument();
  });

  it("permite reenviar documento rejeitado", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    render(
      <CandidatePortalPreAdmissionCard
        preAdmission={{
          case: {
            ...baseEnvelope.case!,
            checklist_items: [
              {
                ...baseEnvelope.case!.checklist_items[0],
                status: "rejected",
                documents: [
                  {
                    id: "doc-1",
                    case_id: "case-1",
                    checklist_item_id: "item-1",
                    candidate_id: "candidate-1",
                    original_filename: "cpf.pdf",
                    mime_type: "application/pdf",
                    size_bytes: 42,
                    status: "rejected",
                    uploaded_at: "2026-05-14T10:00:00Z",
                    reviewed_at: "2026-05-14T11:00:00Z",
                    reviewed_by: "user-1",
                    review_notes: "Documento ilegível.",
                    created_at: "2026-05-14T10:00:00Z",
                    updated_at: "2026-05-14T11:00:00Z",
                  },
                ],
              },
            ],
          },
        }}
        onUploaded={onUploaded}
      />,
    );

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
});
