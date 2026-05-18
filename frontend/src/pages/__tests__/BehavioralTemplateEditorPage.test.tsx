import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BehavioralTemplateEditorPage } from "../BehavioralTemplateEditorPage";
import * as behavioralTemplatesService from "../../services/behavioralTemplatesService";
import * as toast from "../../shared/utils/toast";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

// Mock react-router hooks
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ templateId: "efe6fa5c-61d7-4cd6-927b-2cd584ade1e8" }),
  };
});

vi.mock("../../services/behavioralTemplatesService");
vi.mock("../../shared/utils/toast");

describe("BehavioralTemplateEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.getTemplate).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.createCompetency).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.updateCompetency).mockReset();
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).mockReset();
  });

  const mockTemplate = {
    id: "efe6fa5c-61d7-4cd6-927b-2cd584ade1e8",
    name: "Template de Teste",
    description: '{"description":"Descrição Comercial","category":"Geral","target_audience":"Todos","duration":15}',
    status: "draft",
    version: 1,
    estimated_minutes: 15,
    competencies: [
      {
        id: "comp-1",
        name: "Liderança",
        description: "Capacidade de liderar equipes",
        weight: 100,
        display_order: 0,
        questions: [
          {
            id: "q-1",
            question_text: '{"text":"Pergunta 1?","instruction":"Dicas","evidence":"Ações","criteria":"Excelente","alert":"flags","notes":"internas","scale_labels":{"1":"Ruim","3":"Médio","5":"Excelente"}}',
            answer_type: "text" as const,
            is_required: true,
            weight: 50,
            display_order: 0,
          }
        ]
      }
    ]
  };

  it("carrega e renderiza o workspace do editor com competências e perguntas", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.getTemplate).mockResolvedValue(mockTemplate);

    render(
      <MemoryRouter future={routerFuture}>
        <BehavioralTemplateEditorPage />
      </MemoryRouter>
    );

    // Renderiza loading inicialmente
    expect(screen.getByText("Carregando workspace do editor…")).toBeInTheDocument();

    // Aguarda carregar dados
    await waitFor(() => {
      expect(screen.getByText("Template de Teste")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Liderança").length).toBeGreaterThan(0);
  });

  it("permite adicionar uma nova competência", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.getTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.createCompetency).mockResolvedValue({
      id: "comp-2",
      name: "Nova Competência 2",
      description: "Descrição da competência",
      weight: 10,
      display_order: 1,
    });

    render(
      <MemoryRouter future={routerFuture}>
        <BehavioralTemplateEditorPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Template de Teste")).toBeInTheDocument();
    });

    // Clica em adicionar competência (rotulada como 'Add' no cabeçalho da sidebar)
    const addCompBtn = screen.getByRole("button", { name: /add/i });
    fireEvent.click(addCompBtn);

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.createCompetency).toHaveBeenCalledWith(
        mockTemplate.id,
        expect.objectContaining({ name: "Nova Competência 2" })
      );
    });
  });

  it("não chama o endpoint de atualizar competência enquanto digita, mas chama no blur", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.getTemplate).mockResolvedValue(mockTemplate);

    render(
      <MemoryRouter future={routerFuture}>
        <BehavioralTemplateEditorPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Template de Teste")).toBeInTheDocument();
    });

    // Seleciona a competência "Liderança"
    const compItem = screen.getAllByText("Liderança")[0];
    fireEvent.click(compItem);

    // Encontra o input do nome da competência (usando o valor atual)
    const nameInput = screen.getByDisplayValue("Liderança");

    // Simula digitação (altera estado local, não deve chamar a API)
    fireEvent.change(nameInput, { target: { value: "Liderança Renovada" } });
    expect(behavioralTemplatesService.behavioralTemplatesService.updateCompetency).not.toHaveBeenCalled();

    // Simula blur (deve disparar a chamada à API)
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.updateCompetency).toHaveBeenCalledWith(
        mockTemplate.id,
        "comp-1",
        expect.objectContaining({ name: "Liderança Renovada" })
      );
    });
  });

  it("valida a publicação e chama a API se tudo estiver válido", async () => {
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.getTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).mockResolvedValue({
      ...mockTemplate,
      status: "active",
    });

    render(
      <MemoryRouter future={routerFuture}>
        <BehavioralTemplateEditorPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Template de Teste")).toBeInTheDocument();
    });

    // Encontra e clica no botão "Publicar Versão"
    const publishBtn = screen.getByText("Publicar Versão");
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(behavioralTemplatesService.behavioralTemplatesService.activateTemplate).toHaveBeenCalledWith(mockTemplate.id);
      expect(toast.toast.success).toHaveBeenCalledWith("Template publicado com sucesso!");
      expect(mockNavigate).toHaveBeenCalledWith("/admin/behavioral-templates");
    });
  });
});
