import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BehavioralTemplatesPage } from "../BehavioralTemplatesPage";
import * as behavioralTemplatesService from "../../services/behavioralTemplatesService";
import * as toast from "../../shared/utils/toast";
import * as templateImporter from "../../features/behavioral-templates/templateImporter";

vi.mock("../../services/behavioralTemplatesService");
vi.mock("../../shared/utils/toast");
vi.mock("../../features/behavioral-templates/templateImporter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/behavioral-templates/templateImporter")>();
  return {
    ...actual,
    importTemplateToApi: vi.fn(),
    BUNDLED_TEMPLATES: [
      {
        name: "Avaliação Comportamental — Teste",
        description: "Template de teste",
        version: 1,
        status: "draft",
        estimated_minutes: 10,
        competencies: [
          {
            key: "comp_1",
            name: "Competência Teste",
            description: "Desc",
            weight: 100,
            questions: [
              { key: "q1", type: "text", required: true, weight: 10, prompt: "Pergunta 1" },
            ],
          },
        ],
      },
    ],
  };
});

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

    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

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

  it("bloqueia salvamento quando nome do template está vazio", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhum template criado ainda")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Novo Template"));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    expect(vi.mocked(toast.toast.error)).toHaveBeenCalledWith("Nome do template é obrigatório");
    expect(behavioralTemplatesService.behavioralTemplatesService.createTemplate).not.toHaveBeenCalled();
  });

  it("exibe mensagem de erro do backend ao falhar na criação", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.createTemplate).mockRejectedValue(
      new Error("Template com esse nome já existe")
    );

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhum template criado ainda")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Novo Template"));
    const nameInput = screen.getByPlaceholderText("Ex: Avaliação de Liderança");
    fireEvent.change(nameInput, { target: { value: "Duplicado" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => {
      expect(vi.mocked(toast.toast.error)).toHaveBeenCalledWith("Template com esse nome já existe");
    });
  });

  it("abre formulário em modo edição ao clicar em Editar", async () => {
    const mockTemplates = [
      {
        id: "1",
        name: "Template Existente",
        description: "Descrição original",
        status: "draft",
        version: 1,
        competency_count: 1,
        question_count: 2,
        created_at: "2026-05-13T00:00:00Z",
        updated_at: "2026-05-13T00:00:00Z",
      },
    ];

    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue(mockTemplates);

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Template Existente")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByText("Editar template")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Nome do template") as HTMLInputElement).value).toBe("Template Existente");
  });

  it("abre galeria de modelos ao clicar em 'Usar modelo pronto'", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhum template criado ainda")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /usar modelo pronto/i }));

    expect(screen.getByText("Modelos prontos")).toBeInTheDocument();
    expect(screen.getByText("Teste")).toBeInTheDocument();
  });

  it("importa template da galeria e fecha modal", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);
    vi.mocked(templateImporter.importTemplateToApi).mockResolvedValue({ id: "imported-1" });

    render(<BehavioralTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("Nenhum template criado ainda")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /usar modelo pronto/i }));

    await waitFor(() => {
      expect(screen.getByText("Modelos prontos")).toBeInTheDocument();
    });

    const useButtons = screen.getAllByRole("button", { name: /usar modelo/i });
    fireEvent.click(useButtons[useButtons.length - 1]);

    await waitFor(() => {
      expect(templateImporter.importTemplateToApi).toHaveBeenCalled();
      expect(vi.mocked(toast.toast.success)).toHaveBeenCalledWith(
        expect.stringContaining("importado"),
      );
    });

    expect(screen.queryByText("Modelos prontos")).not.toBeInTheDocument();
  });

  it("build passa", () => {
    expect(BehavioralTemplatesPage).toBeDefined();
  });
});
