import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "../../app/ProtectedRoute";
import { PreAdmissionChecklistsPage } from "../PreAdmissionChecklistsPage";
import { preAdmissionChecklistTemplatesService } from "../../services/preAdmissionChecklistTemplatesService";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../services/preAdmissionChecklistTemplatesService", () => ({
  preAdmissionChecklistTemplatesService: {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
    duplicateTemplate: vi.fn(),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

const listTemplatesMock = vi.mocked(preAdmissionChecklistTemplatesService.listTemplates);
const getTemplateMock = vi.mocked(preAdmissionChecklistTemplatesService.getTemplate);
const createTemplateMock = vi.mocked(preAdmissionChecklistTemplatesService.createTemplate);
const archiveTemplateMock = vi.mocked(preAdmissionChecklistTemplatesService.archiveTemplate);
const createItemMock = vi.mocked(preAdmissionChecklistTemplatesService.createItem);

const baseTemplate = {
  id: "template-1",
  name: "Checklist CLT",
  description: "Documentos padrão CLT",
  admission_type: "CLT",
  is_active: true,
  is_default: true,
  item_count: 1,
  created_at: "2026-05-26T10:00:00Z",
  updated_at: "2026-05-26T10:10:00Z",
};

const baseDetail = {
  ...baseTemplate,
  items: [
    {
      id: "item-1",
      template_id: "template-1",
      document_key: "cpf",
      title: "CPF",
      candidate_description: "Envie o CPF.",
      is_required: true,
      accepted_file_types: ["application/pdf", "image/jpeg", "image/png"],
      max_file_size_mb: 10,
      display_order: 0,
      is_active: true,
      created_at: "2026-05-26T10:00:00Z",
      updated_at: "2026-05-26T10:10:00Z",
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter future={routerFuture}>
      <PreAdmissionChecklistsPage />
    </MemoryRouter>,
  );
}

function renderProtectedPage() {
  return render(
    <MemoryRouter initialEntries={["/admissao/checklists"]} future={routerFuture}>
      <Routes>
        <Route
          path="/admissao/checklists"
          element={
            <ProtectedRoute allowedRoles={["admin", "hr"]}>
              <PreAdmissionChecklistsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: "user-1",
      role: "hr",
      must_change_password: false,
    },
  });
  listTemplatesMock.mockResolvedValue([baseTemplate]);
  getTemplateMock.mockResolvedValue(baseDetail);
  createTemplateMock.mockResolvedValue({
    ...baseTemplate,
    id: "template-2",
    name: "Novo checklist",
    is_default: false,
  });
  archiveTemplateMock.mockResolvedValue({
    ...baseTemplate,
    is_active: false,
    is_default: false,
  });
  createItemMock.mockResolvedValue({
    id: "item-2",
    template_id: "template-1",
    document_key: "rg",
    title: "RG",
    candidate_description: "Envie o RG.",
    is_required: true,
    accepted_file_types: ["application/pdf"],
    max_file_size_mb: 10,
    display_order: 1,
    is_active: true,
    created_at: "2026-05-26T10:00:00Z",
    updated_at: "2026-05-26T10:10:00Z",
  });
});

describe("PreAdmissionChecklistsPage", () => {
  it("lista checklists existentes", async () => {
    renderPage();

    expect(await screen.findByText("Checklist CLT")).toBeInTheDocument();
    expect(screen.getByText("Documentos padrão CLT")).toBeInTheDocument();
    expect(screen.getByText("1 documentos")).toBeInTheDocument();
  });

  it("cria checklist", async () => {
    renderPage();

    await screen.findByText("Checklist CLT");
    fireEvent.click(screen.getByRole("button", { name: /novo checklist/i }));
    const createForm = await screen.findByTestId("checklist-create-form");

    fireEvent.change(within(createForm).getByPlaceholderText(/checklist admissional padrão/i), {
      target: { value: "Novo checklist" },
    });
    fireEvent.change(within(createForm).getByLabelText(/tipo de admissão/i), {
      target: { value: "CLT" },
    });
    fireEvent.click(within(createForm).getByRole("button", { name: /criar checklist/i }));

    await waitFor(() => {
      expect(createTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Novo checklist", admission_type: "CLT" }),
      );
    });
  });

  it("adiciona documento obrigatório", async () => {
    renderPage();

    await screen.findByText("Checklist CLT");
    const createItemForm = await screen.findByTestId("checklist-item-create-form");

    fireEvent.change(within(createItemForm).getByPlaceholderText("cpf"), {
      target: { value: "rg" },
    });
    fireEvent.change(within(createItemForm).getByPlaceholderText("CPF"), {
      target: { value: "RG" },
    });
    fireEvent.click(within(createItemForm).getByRole("button", { name: /adicionar documento/i }));

    await waitFor(() => {
      expect(createItemMock).toHaveBeenCalledWith(
        "template-1",
        expect.objectContaining({
          document_key: "rg",
          title: "RG",
          is_required: true,
        }),
      );
    });
  });

  it("arquiva checklist", async () => {
    renderPage();

    await screen.findByText("Checklist CLT");
    fireEvent.click(screen.getByRole("button", { name: /arquivar/i }));

    await waitFor(() => {
      expect(archiveTemplateMock).toHaveBeenCalledWith("template-1");
    });
  });

  it("valida campos obrigatórios na criação", async () => {
    renderPage();

    await screen.findByText("Checklist CLT");
    fireEvent.click(screen.getByRole("button", { name: /novo checklist/i }));
    const createForm = await screen.findByTestId("checklist-create-form");
    fireEvent.click(within(createForm).getByRole("button", { name: /criar checklist/i }));

    expect(await screen.findByText(/o nome do checklist é obrigatório/i)).toBeInTheDocument();
    expect(createTemplateMock).not.toHaveBeenCalled();
  });

  it("não mostra a tela para perfil candidato", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "candidate-1",
        role: "candidate",
        must_change_password: false,
      },
    });

    renderProtectedPage();

    expect(await screen.findByText(/acesso negado/i)).toBeInTheDocument();
    expect(screen.queryByText(/checklists de documentos/i)).not.toBeInTheDocument();
  });
});
