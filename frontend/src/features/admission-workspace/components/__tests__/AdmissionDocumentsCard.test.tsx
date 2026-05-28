import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdmissionWorkspaceDocument } from "../../../../types/domain";
import { AdmissionDocumentsCard } from "../AdmissionDocumentsCard";

const rejectedDocument: AdmissionWorkspaceDocument = {
  id: "doc-1",
  checklist_item_id: "item-1",
  checklist_title: "CPF",
  required: true,
  filename: "cpf.pdf",
  document_type: "cpf",
  mime_type: "application/pdf",
  size_bytes: 204800,
  status: "rejected",
  uploaded_at: "2025-05-23T14:03:00Z",
  reviewed_at: "2025-05-23T14:08:00Z",
  reviewed_by_name: "Ana Paula",
  review_notes: "Validar novamente o recorte quando o arquivo novo chegar.",
  rejection_reason_public: "Envie um documento legível e sem cortes.",
  approved_at: null,
  is_current_for_item: true,
};

describe("AdmissionDocumentsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renderiza lista de documentos enviados", () => {
    render(
      <AdmissionDocumentsCard
        documents={[rejectedDocument]}
        highlightedDocumentId={null}
        loadingActionKey={null}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByText("cpf.pdf")).toBeInTheDocument();
    expect(screen.getByText(/CPF · CPF/i)).toBeInTheDocument();
  });

  it("abre modal de rejeição e exige mensagem pública", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    render(
      <AdmissionDocumentsCard
        documents={[{ ...rejectedDocument, status: "uploaded", review_notes: null, rejection_reason_public: null }]}
        highlightedDocumentId={null}
        loadingActionKey={null}
        onApprove={vi.fn()}
        onReject={onReject}
        onDownload={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("admission-document-request-correction-doc-1"));
    const dialog = await screen.findByRole("dialog", { name: /Solicitar correção do documento/i });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Solicitar correção" }));
    expect(await screen.findByTestId("admission-document-rejection-error")).toHaveTextContent(
      "Informe a mensagem para o candidato.",
    );
    expect(onReject).not.toHaveBeenCalled();
  });

  it("envia nota interna como opcional e separada da mensagem pública", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn().mockResolvedValue(undefined);
    render(
      <AdmissionDocumentsCard
        documents={[{ ...rejectedDocument, status: "uploaded", review_notes: null, rejection_reason_public: null }]}
        highlightedDocumentId={null}
        loadingActionKey={null}
        onApprove={vi.fn()}
        onReject={onReject}
        onDownload={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("admission-document-reject-doc-1"));
    const dialog = await screen.findByRole("dialog", { name: /Rejeitar documento/i });
    await user.type(within(dialog).getByTestId("admission-public-reason"), "Reenvie o PDF completo.");
    await user.click(within(dialog).getByRole("button", { name: "Rejeitar documento" }));

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith(
        expect.objectContaining({ id: "doc-1" }),
        {
          rejection_reason_public: "Reenvie o PDF completo.",
          review_notes: null,
        },
        "reject",
      );
    });
  });

  it("mostra motivo público e nota interna em áreas separadas", () => {
    render(
      <AdmissionDocumentsCard
        documents={[rejectedDocument]}
        highlightedDocumentId="doc-1"
        loadingActionKey={null}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByTestId("admission-document-public-reason")).toHaveTextContent(
      "Envie um documento legível e sem cortes.",
    );
    expect(screen.getByTestId("admission-document-internal-notes")).toHaveTextContent(
      "Validar novamente o recorte quando o arquivo novo chegar.",
    );
  });
});
