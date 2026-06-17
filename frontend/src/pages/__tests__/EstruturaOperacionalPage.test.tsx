import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstruturaOperacionalPage } from "../EstruturaOperacionalPage";
import { HttpError } from "../../services/http";
import { operationalMasterService } from "../../services/operationalMasterService";
import type { UserRole } from "../../types/auth";

const { authMock, toastMock } = vi.hoisted(() => ({
  authMock: {
    role: "admin" as UserRole,
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "admin@example.com",
      full_name: "Admin",
      role: authMock.role,
      status: "active",
      real_ai_token_spend_enabled: false,
      must_change_password: false,
      last_login_at: null,
      created_at: null,
    },
  }),
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: toastMock,
}));

vi.mock("../../services/operationalMasterService", () => ({
  operationalMasterService: {
    listOperationalGroups: vi.fn(),
    createOperationalGroup: vi.fn(),
    updateOperationalGroup: vi.fn(),
    listLocationGroups: vi.fn(),
    createLocationGroup: vi.fn(),
    updateLocationGroup: vi.fn(),
    listOperationalUnits: vi.fn(),
    createOperationalUnit: vi.fn(),
    updateOperationalUnit: vi.fn(),
  },
}));

const group = {
  id: "group-1",
  group_code: "02",
  name: "Postos",
  normalized_name: "postos",
  description: "Grupo operacional de postos",
  is_active: true,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T10:00:00Z",
};

const location = {
  id: "location-1",
  name: "Peritoro",
  normalized_name: "peritoro",
  state: "MA",
  city: "Peritoro",
  type: "city" as const,
  is_active: true,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T10:00:00Z",
};

const baseUnit = {
  id: "unit-1",
  group_id: "group-1",
  location_group_id: "location-1",
  branch_code: "4201",
  name: "NOVA CRIXÁS",
  normalized_name: "nova-crixas",
  public_name: "Posto Peritoro",
  type: "gas_station" as const,
  reference_point: "BR",
  address: null,
  city: "Peritoro",
  state: "MA",
  is_active: true,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T10:00:00Z",
  group,
};

function mockLists(options?: {
  groups?: typeof group[];
  locations?: typeof location[];
  units?: typeof baseUnit[];
}) {
  vi.mocked(operationalMasterService.listOperationalGroups).mockResolvedValue({
    data: options?.groups ?? [group],
    total: (options?.groups ?? [group]).length,
    page: 1,
    page_size: 100,
    total_pages: 1,
  });
  vi.mocked(operationalMasterService.listLocationGroups).mockResolvedValue({
    data: options?.locations ?? [location],
    total: (options?.locations ?? [location]).length,
    page: 1,
    page_size: 100,
    total_pages: 1,
  });
  vi.mocked(operationalMasterService.listOperationalUnits).mockResolvedValue({
    data: options?.units ?? [baseUnit],
    total: (options?.units ?? [baseUnit]).length,
    page: 1,
    page_size: 100,
    total_pages: 1,
  });
}

describe("EstruturaOperacionalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.role = "admin";
    mockLists();
    vi.mocked(operationalMasterService.createOperationalGroup).mockResolvedValue(group);
    vi.mocked(operationalMasterService.updateOperationalGroup).mockResolvedValue(group);
    vi.mocked(operationalMasterService.createLocationGroup).mockResolvedValue(location);
    vi.mocked(operationalMasterService.updateLocationGroup).mockResolvedValue(location);
    vi.mocked(operationalMasterService.createOperationalUnit).mockResolvedValue(baseUnit);
    vi.mocked(operationalMasterService.updateOperationalUnit).mockResolvedValue(baseUnit);
  });

  it("abre em unidades operacionais com hierarquia e preview do candidato", async () => {
    render(<EstruturaOperacionalPage />);

    expect(await screen.findByText("NOVA CRIXÁS")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /unidades operacionais/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("columnheader", { name: "Grupo operacional" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Código interno" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Unidade operacional" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Como o candidato verá" })).toBeInTheDocument();
    expect(screen.getByText("Posto Peritoro — Peritoro/MA — BR")).toBeInTheDocument();
    expect(screen.getByText(/preview exibido ao candidato no portal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nova unidade operacional/i })).toBeInTheDocument();
  });

  it("mantem recruiter em modo somente leitura", async () => {
    authMock.role = "recruiter";

    render(<EstruturaOperacionalPage />);

    expect(await screen.findByText("NOVA CRIXÁS")).toBeInTheDocument();
    expect(screen.getByText(/pode visualizar, mas não criar ou editar/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nova unidade operacional/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
  });

  it("cria grupo operacional como admin com labels revisados", async () => {
    const user = userEvent.setup();

    render(<EstruturaOperacionalPage />);

    await screen.findByText("NOVA CRIXÁS");
    await user.click(screen.getByRole("tab", { name: /grupos operacionais/i }));
    await user.click(screen.getByRole("button", { name: /novo grupo operacional/i }));

    const dialog = screen.getByRole("dialog", { name: /novo grupo operacional/i });
    await user.type(within(dialog).getByLabelText("Código do grupo operacional"), "03");
    await user.type(within(dialog).getByLabelText("Nome do grupo operacional"), "Escritorio");
    await user.type(within(dialog).getByLabelText("Descrição"), "Grupo corporativo");
    await user.click(within(dialog).getByRole("button", { name: /criar grupo/i }));

    await waitFor(() => {
      expect(operationalMasterService.createOperationalGroup).toHaveBeenCalledWith({
        group_code: "03",
        name: "Escritorio",
        description: "Grupo corporativo",
      });
    });
    expect(toastMock.success).toHaveBeenCalledWith("Grupo criado.");
  });

  it("mostra preview do candidato no formulario da unidade e alerta quando nome publico esta vazio", async () => {
    const user = userEvent.setup();

    render(<EstruturaOperacionalPage />);

    await screen.findByText("NOVA CRIXÁS");
    await user.click(screen.getByRole("button", { name: /nova unidade operacional/i }));

    const dialog = screen.getByRole("dialog", { name: /nova unidade operacional/i });
    expect(within(dialog).getByText(/nome público não informado/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Nome público exibido ao candidato"), "Posto Marajo Centro");
    await user.type(within(dialog).getByLabelText("Cidade"), "Goiania");
    await user.type(within(dialog).getByLabelText("UF"), "GO");
    await user.type(within(dialog).getByLabelText("Ponto de referência"), "Próximo à Av. X");

    expect(within(dialog).getByText("Posto Marajo Centro — Goiania/GO — Próximo à Av. X")).toBeInTheDocument();
  });

  it("pede confirmação antes de inativar unidade operacional", async () => {
    const user = userEvent.setup();

    render(<EstruturaOperacionalPage />);

    await screen.findByText("NOVA CRIXÁS");
    await user.click(screen.getByRole("button", { name: /^inativar$/i }));

    const dialog = screen.getByRole("dialog", { name: /inativar unidade operacional/i });
    expect(within(dialog).getByText(/pode estar vinculada a vagas, candidaturas, pipeline ou pré-admissão/i)).toBeInTheDocument();
    expect(operationalMasterService.updateOperationalUnit).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /confirmar inativação/i }));

    await waitFor(() => {
      expect(operationalMasterService.updateOperationalUnit).toHaveBeenCalledWith("unit-1", {
        is_active: false,
      });
    });
    expect(toastMock.success).toHaveBeenCalledWith("Unidade operacional inativada.");
  });

  it("pede confirmação antes de reativar unidade operacional", async () => {
    const user = userEvent.setup();
    mockLists({
      units: [
        {
          ...baseUnit,
          is_active: false,
        },
      ],
    });
    vi.mocked(operationalMasterService.updateOperationalUnit).mockResolvedValue({
      ...baseUnit,
      is_active: false,
    });

    render(<EstruturaOperacionalPage />);

    await screen.findByText("NOVA CRIXÁS");
    await user.click(screen.getByRole("button", { name: /^reativar$/i }));

    const dialog = screen.getByRole("dialog", { name: /reativar unidade operacional/i });
    expect(within(dialog).getByText(/volta a ficar disponível para novas vagas e candidaturas/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /confirmar reativação/i }));

    await waitFor(() => {
      expect(operationalMasterService.updateOperationalUnit).toHaveBeenCalledWith("unit-1", {
        is_active: true,
      });
    });
  });

  it("mostra detalhe útil do backend em vez de toast genérico", async () => {
    const user = userEvent.setup();
    vi.mocked(operationalMasterService.createOperationalUnit).mockRejectedValue(
      new HttpError(400, "Grupo operacional é obrigatório.", undefined, {
        detail: "Grupo operacional é obrigatório.",
      }, "Grupo operacional é obrigatório."),
    );

    render(<EstruturaOperacionalPage />);

    await screen.findByText("NOVA CRIXÁS");
    await user.click(screen.getByRole("button", { name: /nova unidade operacional/i }));

    const dialog = screen.getByRole("dialog", { name: /nova unidade operacional/i });
    await user.type(within(dialog).getByLabelText("Código interno da unidade"), "5501");
    await user.type(within(dialog).getByLabelText("Nome interno da unidade operacional"), "Posto Teste");
    await user.click(within(dialog).getByRole("button", { name: /criar unidade operacional/i }));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith("Grupo operacional é obrigatório.");
    });
  });

  it("mantem estado vazio de unidades operacionais", async () => {
    mockLists({ units: [] });

    render(<EstruturaOperacionalPage />);

    expect(await screen.findByText("Nenhuma unidade operacional encontrada")).toBeInTheDocument();
    expect(screen.getByText(/cadastre unidades reais somente depois de ter grupo operacional e localidade/i)).toBeInTheDocument();
  });
});
