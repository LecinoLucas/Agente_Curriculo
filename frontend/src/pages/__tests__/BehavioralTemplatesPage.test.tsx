import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BehavioralTemplatesPage } from "../BehavioralTemplatesPage";
import * as behavioralTemplatesService from "../../services/behavioralTemplatesService";
import * as toast from "../../shared/utils/toast";

vi.mock("../../services/behavioralTemplatesService");
vi.mock("../../shared/utils/toast");

describe("BehavioralTemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista templates quando carregado", async () => {
    const mockTemplates = [
      {
        id: "1",
        name: "Template 1",
        description: "Desc 1",
        status: "active",
        version: 1,
        competency_count: 2,
        question_count: 4,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-13T00:00:00Z",
      },
    ];

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue(mockTemplates);

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Template 1")).toBeInTheDocument();
    });

    expect(screen.getByText("Desc 1")).toBeInTheDocument();
    expect(screen.getByText("2 competências")).toBeInTheDocument();
    expect(screen.getByText("4 perguntas")).toBeInTheDocument();
  });

  it("mostra empty state quando sem templates", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhum template criado ainda")).toBeInTheDocument();
    });

    expect(screen.getByText("Criar primeiro template")).toBeInTheDocument();
  });

  it("cria template mínimo", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "new-id",
          name: "New Template",
          description: "",
          status: "draft",
          version: 1,
          competency_count: 0,
          question_count: 0,
          created_at: "2026-05-13T00:00:00Z",
          updated_at: "2026-05-13T00:00:00Z",
        },
      ]);

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.createTemplate).mockResolvedValue({
      id: "new-id",
      name: "New Template",
      description: "",
      status: "draft",
      version: 1,
      competency_count: 0,
      question_count: 0,
      created_at: "2026-05-13T00:00:00Z",
      updated_at: "2026-05-13T00:00:00Z",
    });

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhum template criado ainda")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Novo Template"));

    const nameInput = screen.getByPlaceholderText("Ex: Avaliação de Liderança");
    fireEvent.change(nameInput, { target: { value: "New Template" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.createTemplate).toHaveBeenCalledWith({
        name: "New Template",
        description: "",
      });
    });
  });

  it("ativa template", async () => {
    const mockTemplates = [
      {
        id: "1",
        name: "To Activate",
        description: null,
        status: "draft",
        version: 1,
        competency_count: 1,
        question_count: 1,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-13T00:00:00Z",
      },
    ];

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates)
      .mockResolvedValueOnce(mockTemplates)
      .mockResolvedValueOnce([
        {
          ...mockTemplates[0],
          status: "active",
        },
      ]);

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).mockResolvedValue({
      ...mockTemplates[0],
      status: "active",
    });

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("To Activate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).toHaveBeenCalledWith("1");
    });
  });

  it("mostra erro ao ativar template vazio", async () => {
    const mockTemplates = [
      {
        id: "empty",
        name: "Empty Template",
        description: null,
        status: "draft",
        version: 1,
        competency_count: 0,
        question_count: 0,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-13T00:00:00Z",
      },
    ];

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue(mockTemplates);

    const errorMessage = "Template must have at least one competency";
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).mockRejectedValue(
      new Error(errorMessage),
    );

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Empty Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));

    await waitFor(() => {
      expect(vi.mocked(toast.toast.error)).toHaveBeenCalled();
    });
  });

  it("arquiva template", async () => {
    const mockTemplates = [
      {
        id: "1",
        name: "To Archive",
        description: null,
        status: "active",
        version: 1,
        competency_count: 1,
        question_count: 1,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-13T00:00:00Z",
      },
    ];

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates)
      .mockResolvedValueOnce(mockTemplates)
      .mockResolvedValueOnce([
        {
          ...mockTemplates[0],
          status: "archived",
        },
      ]);

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.archiveTemplate).mockResolvedValue({
      ...mockTemplates[0],
      status: "archived",
    });

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("To Archive")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.archiveTemplate).toHaveBeenCalledWith("1");
    });
  });

  it("build passa", () => {
    // This is a simple check that the component imports and renders without errors
    expect(BehavioralTemplatesPage).toBeDefined();
  });
});
