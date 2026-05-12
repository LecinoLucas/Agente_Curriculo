import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewCandidateModal } from "../NewCandidateModal";
import { usePipeline } from "../PipelineContext";
import { candidatesService } from "../../../services/candidatesService";
import "@testing-library/jest-dom";

// Mock do hook usePipeline
vi.mock("../PipelineContext", () => ({
  usePipeline: vi.fn(),
}));

// Mock dos serviços
vi.mock("../../../services/candidatesService", () => ({
  candidatesService: {
    checkDuplicate: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../../services/resumeService", () => ({
  resumeService: {
    initiateUpload: vi.fn(),
    uploadPdf: vi.fn(),
  },
}));

vi.mock("../../../services/pipelineService", () => ({
  pipelineService: {
    addCandidateToJob: vi.fn(),
  },
}));

vi.mock("../../../services/feedback", () => ({
  feedback: {
    createCandidate: {
      processing: vi.fn(),
      success: vi.fn(),
    },
  },
}));

vi.mock("../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("NewCandidateModal", () => {
  const mockOnClose = vi.fn();
  const mockOnCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (usePipeline as any).mockReturnValue({
      jobs: [],
      jobsError: null,
      jobsLoading: false,
      loadJobs: vi.fn(),
      notifyCandidatesChanged: vi.fn(),
      invalidateBoard: vi.fn(),
    });
  });

  it("deve fechar o modal e chamar onCreated ao criar candidato com sucesso", async () => {
    (candidatesService.checkDuplicate as any).mockResolvedValue({ exists: false });
    (candidatesService.create as any).mockResolvedValue({ id: "123" });

    render(
      <NewCandidateModal
        isOpen={true}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Nome do candidato"), {
      target: { value: "Teste Silva" },
    });
    fireEvent.change(screen.getByPlaceholderText("email@exemplo.com"), {
      target: { value: "teste@exemplo.com" },
    });

    fireEvent.click(screen.getByText("Salvar candidato"));

    await waitFor(() => {
      expect(candidatesService.create).toHaveBeenCalled();
      expect(mockOnCreated).toHaveBeenCalledWith("123");
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("deve manter o modal aberto e resetar o formulário se 'Cadastrar outro' estiver marcado", async () => {
    (candidatesService.checkDuplicate as any).mockResolvedValue({ exists: false });
    (candidatesService.create as any).mockResolvedValue({ id: "123" });

    render(
      <NewCandidateModal
        isOpen={true}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Nome do candidato"), {
      target: { value: "Teste Silva" },
    });
    fireEvent.change(screen.getByPlaceholderText("email@exemplo.com"), {
      target: { value: "teste@exemplo.com" },
    });

    fireEvent.click(screen.getByLabelText("Cadastrar outro"));
    fireEvent.click(screen.getByText("Salvar candidato"));

    await waitFor(() => {
      expect(candidatesService.create).toHaveBeenCalled();
      expect(mockOnCreated).toHaveBeenCalledWith("123");
      expect(mockOnClose).not.toHaveBeenCalled();
      
      // O formulário deve ter sido resetado (nome vazio)
      expect(screen.getByPlaceholderText("Nome do candidato")).toHaveValue("");
    });
  });

  it("deve manter o modal aberto e mostrar erro se a criação falhar", async () => {
    (candidatesService.checkDuplicate as any).mockResolvedValue({ exists: false });
    (candidatesService.create as any).mockRejectedValue(new Error("Erro de rede"));

    render(
      <NewCandidateModal
        isOpen={true}
        onClose={mockOnClose}
        onCreated={mockOnCreated}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Nome do candidato"), {
      target: { value: "Teste Silva" },
    });
    fireEvent.change(screen.getByPlaceholderText("email@exemplo.com"), {
      target: { value: "teste@exemplo.com" },
    });

    fireEvent.click(screen.getByText("Salvar candidato"));

    await waitFor(() => {
      expect(candidatesService.create).toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByText("Erro de rede")).toBeInTheDocument();
    });
  });
});
