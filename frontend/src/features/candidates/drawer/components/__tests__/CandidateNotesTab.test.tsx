import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateNotesTab } from "../CandidateNotesTab";
import { candidatesService } from "../../../../../services/candidatesService";
import { HttpError } from "../../../../../services/http";

vi.mock("../../../../../services/candidatesService", () => ({
  candidatesService: {
    listNotes: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

describe("CandidateNotesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza estado vazio e texto de privacidade", async () => {
    vi.mocked(candidatesService.listNotes).mockResolvedValue([]);

    render(<CandidateNotesTab candidateId="candidate-1" />);

    expect(await screen.findByText("Nenhuma observação registrada para este candidato.")).toBeInTheDocument();
    expect(screen.getByText("Essas observações são internas e não ficam visíveis para o candidato.")).toBeInTheDocument();
  });

  it("habilita botão ao digitar e salva observação", async () => {
    vi.mocked(candidatesService.listNotes).mockResolvedValue([]);
    vi.mocked(candidatesService.createNote).mockResolvedValue({
      id: "note-1",
      candidate_id: "candidate-1",
      note_text: "Ótima comunicação com o time.",
      visibility: "internal",
      is_pinned: false,
      created_at: "2026-05-17T10:00:00Z",
      updated_at: "2026-05-17T10:00:00Z",
      is_edited: false,
      can_edit: true,
      can_delete: true,
      author: { id: "user-1", name: "Recrutador Teste" },
    });

    render(<CandidateNotesTab candidateId="candidate-1" />);

    const button = await screen.findByRole("button", { name: "Salvar observação" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Escreva uma observação interna sobre este candidato..."), {
      target: { value: "Ótima comunicação com o time." },
    });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(candidatesService.createNote).toHaveBeenCalledWith("candidate-1", {
        note_text: "Ótima comunicação com o time.",
      });
    });

    expect(await screen.findByText("Ótima comunicação com o time.")).toBeInTheDocument();
    expect(screen.getByText("Recrutador Teste")).toBeInTheDocument();
    expect(screen.getByText(/\d{2}\/\d{2}\/\d{2}/)).toBeInTheDocument();
  });

  it("mostra erro amigável quando API falha", async () => {
    vi.mocked(candidatesService.listNotes).mockResolvedValue([]);
    vi.mocked(candidatesService.createNote).mockRejectedValue(new Error("Erro"));

    render(<CandidateNotesTab candidateId="candidate-1" />);

    fireEvent.change(screen.getByPlaceholderText("Escreva uma observação interna sobre este candidato..."), {
      target: { value: "Comentário interno" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Salvar observação" }));

    expect(await screen.findByText("Não foi possível salvar a observação. Tente novamente.")).toBeInTheDocument();
  });

  it("mostra erro amigável quando API retorna 422", async () => {
    vi.mocked(candidatesService.listNotes).mockResolvedValue([]);
    vi.mocked(candidatesService.createNote).mockRejectedValue(
      new HttpError(422, "Dados inválidos", undefined, {}, "Observação deve ter no máximo 2000 caracteres."),
    );

    render(<CandidateNotesTab candidateId="candidate-1" />);

    fireEvent.change(screen.getByPlaceholderText("Escreva uma observação interna sobre este candidato..."), {
      target: { value: "Comentário interno" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Salvar observação" }));

    expect(await screen.findByText("Observação deve ter no máximo 2000 caracteres.")).toBeInTheDocument();
  });
});
