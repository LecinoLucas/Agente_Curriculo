import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BehavioralTemplatesPage } from "../BehavioralTemplatesPage";
import * as behavioralTemplatesService from "../../services/behavioralTemplatesService";
import * as toast from "../../shared/utils/toast";
import * as templateImporter from "../../features/behavioral-templates/templateImporter";

// Mock react-router useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
    mockNavigate.mockClear();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.createTemplate).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.archiveTemplate).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.getTemplate).mockReset();
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

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Template 1")).toBeInTheDocument();
    });

    expect(screen.getByText("Desc 1")).toBeInTheDocument();
    expect(screen.getByText("2 competências")).toBeInTheDocument();
    expect(screen.getByText("4 perguntas")).toBeInTheDocument();
  });

  it("mostra empty state quando sem templates", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum template encontrado")).toBeInTheDocument();
    });
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

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum template encontrado")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /novo builder/i }));

    const nameInput = screen.getByPlaceholderText("Ex: Avaliação de Atendimento ao Cliente");
    fireEvent.change(nameInput, { target: { value: "New Template" } });

    const descInput = screen.getByPlaceholderText(/Explique os objetivos/i);
    fireEvent.change(descInput, { target: { value: "Custom Description" } });

    fireEvent.click(screen.getByRole("button", { name: /confirmar e editar/i }));

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.createTemplate).toHaveBeenCalled();
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

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("To Activate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Ativar Avaliação"));

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

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Empty Template")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Ativar Avaliação"));

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

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("To Archive")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Arquivar Avaliação"));

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.archiveTemplate).toHaveBeenCalledWith("1");
    });
  });

  it("bloqueia salvamento quando nome do template está vazio", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum template encontrado")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /novo builder/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar e editar/i }));

    expect(vi.mocked(toast.toast.error)).toHaveBeenCalledWith("O nome do template é obrigatório.");
    expect(behavioralTemplatesService.behavioralTemplatesService.createTemplate).not.toHaveBeenCalled();
  });

  it("exibe mensagem de erro do backend ao falhar na criação", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.createTemplate).mockRejectedValue(
      new Error("Template com esse nome já existe")
    );

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum template encontrado")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /novo builder/i }));
    const nameInput = screen.getByPlaceholderText("Ex: Avaliação de Atendimento ao Cliente");
    fireEvent.change(nameInput, { target: { value: "Duplicado" } });

    const descInput = screen.getByPlaceholderText(/Explique os objetivos/i);
    fireEvent.change(descInput, { target: { value: "Description" } });

    fireEvent.click(screen.getByRole("button", { name: /confirmar e editar/i }));

    await waitFor(() => {
      expect(vi.mocked(toast.toast.error)).toHaveBeenCalledWith("Template com esse nome já existe");
    });
  });

  it("navega para rota de workspace ao clicar em Editar Estrutura", async () => {
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

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Template Existente")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /editar estrutura/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/behavioral-templates/1/edit");
  });

  it("abre galeria de modelos ao clicar em 'Usar modelo pronto'", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum template encontrado")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /usar modelo pronto/i }));

    expect(screen.getByText("Modelos prontos")).toBeInTheDocument();
    expect(screen.getByText("Teste")).toBeInTheDocument();
  });

  it("importa template da galeria e navega para editor", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.listTemplates).mockResolvedValue([]);
    vi.mocked(templateImporter.importTemplateToApi).mockResolvedValue({ id: "imported-1" });

    render(
      <MemoryRouter>
        <BehavioralTemplatesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Nenhum template encontrado")).toBeInTheDocument();
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
        expect.stringContaining("sucesso"),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/admin/behavioral-templates/imported-1/edit");
    });
  });

  it("build passa", () => {
    expect(BehavioralTemplatesPage).toBeDefined();
  });
});
