import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidatePreAdmissionPanel } from "../CandidatePreAdmissionPanel";
import * as preAdmissionService from "../../../../../services/preAdmissionService";
import type { PreAdmissionCase, PreAdmissionDocument, PreAdmissionEvent } from "../../../../../types/domain";

vi.mock("../../../../../services/preAdmissionService");

const preAdmissionCase: PreAdmissionCase = {
  id: "case-1",
  candidate_id: "candidate-1",
  job_id: "job-1",
  hiring_decision_id: "decision-1",
  status: "offer_preparing",
  salary_offer: "12000.00",
  start_date: "2026-06-01",
  work_model: "Híbrido",
  notes: "Oferta em preparação.",
  created_by: "user-1",
  created_at: "2026-05-14T10:00:00Z",
  updated_at: "2026-05-14T10:00:00Z",
  closed_at: null,
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
    },
  ],
};

const event: PreAdmissionEvent = {
  id: "event-1",
  case_id: "case-1",
  event_type: "case_created",
  actor_id: "user-1",
  payload_json: { status: "draft" },
  created_at: "2026-05-14T10:00:00Z",
};

const document: PreAdmissionDocument = {
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
};

describe("CandidatePreAdmissionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      hiring_decision_outcome: "hold",
      can_create: false,
    });
    vi.mocked(preAdmissionService.getPreAdmissionEvents).mockResolvedValue({ events: [] });
    vi.mocked(preAdmissionService.listPreAdmissionDocuments).mockResolvedValue({ documents: [] });
    vi.mocked(preAdmissionService.createPreAdmission).mockResolvedValue(preAdmissionCase);
    vi.mocked(preAdmissionService.updatePreAdmission).mockResolvedValue(preAdmissionCase);
    vi.mocked(preAdmissionService.createPreAdmissionChecklistItem).mockResolvedValue(
      preAdmissionCase.checklist_items[0],
    );
    vi.mocked(preAdmissionService.updatePreAdmissionChecklistItem).mockResolvedValue({
      ...preAdmissionCase.checklist_items[0],
      status: "received",
    });
    vi.mocked(preAdmissionService.approvePreAdmissionDocument).mockResolvedValue({
      ...document,
      status: "approved",
    });
    vi.mocked(preAdmissionService.rejectPreAdmissionDocument).mockResolvedValue({
      ...document,
      status: "rejected",
      review_notes: "Documento ilegível.",
    });
    vi.mocked(preAdmissionService.downloadPreAdmissionDocument).mockResolvedValue(new Blob(["pdf"]));
  });

  it("mostra bloqueio sem decisão hire", async () => {
    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText(/Pré-admissão disponível apenas após decisão de contratação/i)).toBeInTheDocument();
  });

  it("mostra botão criar quando há decisão hire", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      hiring_decision_outcome: "hire",
      can_create: true,
    });

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByRole("button", { name: /Criar pré-admissão/i })).toBeInTheDocument();
  });

  it("cria pré-admissão", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: null,
      hiring_decision_outcome: "hire",
      can_create: true,
    });
    vi.mocked(preAdmissionService.getPreAdmissionEvents).mockResolvedValue({ events: [event] });
    const user = userEvent.setup();

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    await user.type(await screen.findByLabelText(/Oferta salarial/i), "12000.00");
    await user.type(screen.getByLabelText(/Data prevista/i), "2026-06-01");
    await user.type(screen.getByLabelText(/Modelo de trabalho/i), "Híbrido");
    await user.click(screen.getByRole("button", { name: /Criar pré-admissão/i }));

    await waitFor(() => {
      expect(preAdmissionService.createPreAdmission).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({ salary_offer: "12000.00", start_date: "2026-06-01" }),
      );
    });
  });

  it("renderiza status", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: preAdmissionCase,
      hiring_decision_outcome: "hire",
      can_create: false,
    });

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    expect((await screen.findAllByText("Oferta em preparação")).length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s?12\.000,00/)).toBeInTheDocument();
  });

  it("renderiza checklist", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: preAdmissionCase,
      hiring_decision_outcome: "hire",
      can_create: false,
    });

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText("Documentos e pendências")).toBeInTheDocument();
    expect(screen.getAllByText("CPF").length).toBeGreaterThan(0);
  });

  it("atualiza item de checklist", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: preAdmissionCase,
      hiring_decision_outcome: "hire",
      can_create: false,
    });
    const user = userEvent.setup();

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText("Documentos e pendências");
    await user.selectOptions(screen.getByDisplayValue("Pendente"), "received");

    await waitFor(() => {
      expect(preAdmissionService.updatePreAdmissionChecklistItem).toHaveBeenCalledWith(
        "case-1",
        "item-1",
        { status: "received" },
      );
    });
  });

  it("aprova documento enviado", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: preAdmissionCase,
      hiring_decision_outcome: "hire",
      can_create: false,
    });
    vi.mocked(preAdmissionService.listPreAdmissionDocuments).mockResolvedValue({ documents: [document] });
    const user = userEvent.setup();

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText("cpf.pdf");
    await user.click(screen.getByRole("button", { name: /Aprovar/i }));

    await waitFor(() => {
      expect(preAdmissionService.approvePreAdmissionDocument).toHaveBeenCalledWith("doc-1");
    });
  });

  it("rejeita documento com motivo", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: preAdmissionCase,
      hiring_decision_outcome: "hire",
      can_create: false,
    });
    vi.mocked(preAdmissionService.listPreAdmissionDocuments).mockResolvedValue({ documents: [document] });
    const user = userEvent.setup();

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText("cpf.pdf");
    await user.click(screen.getByRole("button", { name: /^Rejeitar$/i }));
    await user.type(screen.getByPlaceholderText(/Motivo da rejeição/i), "Documento ilegível.");
    await user.click(screen.getByRole("button", { name: /Confirmar rejeição/i }));

    await waitFor(() => {
      expect(preAdmissionService.rejectPreAdmissionDocument).toHaveBeenCalledWith(
        "doc-1",
        "Documento ilegível.",
      );
    });
  });

  it("mostra timeline", async () => {
    vi.mocked(preAdmissionService.getPreAdmission).mockResolvedValue({
      case: preAdmissionCase,
      hiring_decision_outcome: "hire",
      can_create: false,
    });
    vi.mocked(preAdmissionService.getPreAdmissionEvents).mockResolvedValue({ events: [event] });

    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText("Timeline de eventos")).toBeInTheDocument();
    expect(await screen.findByText("Caso criado")).toBeInTheDocument();
  });

  it("renderiza loading, error e empty states", async () => {
    const pending = new Promise<never>(() => undefined);
    vi.mocked(preAdmissionService.getPreAdmission).mockReturnValueOnce(pending);
    const { unmount } = render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);
    expect(screen.getByRole("status", { hidden: true })).toBeInTheDocument();
    unmount();

    vi.mocked(preAdmissionService.getPreAdmission).mockRejectedValueOnce(new Error("fail"));
    render(<CandidatePreAdmissionPanel jobId="job-1" candidateId="candidate-1" />);
    expect(await screen.findByText(/Não foi possível carregar a pré-admissão/i)).toBeInTheDocument();
  });
});
