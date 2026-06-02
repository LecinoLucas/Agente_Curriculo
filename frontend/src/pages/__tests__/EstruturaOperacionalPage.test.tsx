import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstruturaOperacionalPage } from "../EstruturaOperacionalPage";
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

const unit = {
  id: "unit-1",
  group_id: "group-1",
  location_group_id: "location-1",
  branch_code: "4201",
  name: "NOVA CRIXÁS",
  normalized_name: "posto-4301",
  public_name: "Posto Peritoro",
  type: "gas_station" as const,
  reference_point: "BR",
  address: null,
  city: "Peritoro",
  state: "MA",
  is_active: true,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T10:00:00Z",
};

function mockLists() {
  vi.mocked(operationalMasterService.listOperationalGroups).mockResolvedValue({
    data: [group],
    total: 1,
    page: 1,
    page_size: 100,
    total_pages: 1,
  });
  vi.mocked(operationalMasterService.listLocationGroups).mockResolvedValue({
    data: [location],
    total: 1,
    page: 1,
    page_size: 100,
    total_pages: 1,
  });
  vi.mocked(operationalMasterService.listOperationalUnits).mockResolvedValue({
    data: [unit],
    total: 1,
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
    vi.mocked(operationalMasterService.createOperationalUnit).mockResolvedValue(unit);
    vi.mocked(operationalMasterService.updateOperationalUnit).mockResolvedValue(unit);
  });

  it("renderiza grupos, localidades e filiais/postos carregados dos endpoints", async () => {
    const user = userEvent.setup();

    render(<EstruturaOperacionalPage />);

    expect(await screen.findByText("Postos")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Grupo" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nome" })).toBeInTheDocument();
    expect(screen.queryByText("4201")).not.toBeInTheDocument();
    expect(screen.queryByText("NOVA CRIXÁS")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /localidades/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filiais\/postos/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /localidades/i }));
    expect((await screen.findAllByText("Peritoro")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /filiais\/postos/i }));
    expect(await screen.findByText("4201")).toBeInTheDocument();
    expect(screen.getByText("NOVA CRIXÁS")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Filial" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Ponto de referência" })).toBeInTheDocument();

    await waitFor(() => {
      expect(operationalMasterService.listOperationalGroups).toHaveBeenCalled();
      expect(operationalMasterService.listLocationGroups).toHaveBeenCalled();
      expect(operationalMasterService.listOperationalUnits).toHaveBeenCalled();
    });
  });

  it("mantem recruiter em modo somente leitura", async () => {
    authMock.role = "recruiter";

    render(<EstruturaOperacionalPage />);

    expect(await screen.findByText("Postos")).toBeInTheDocument();
    expect(screen.getByText(/pode visualizar, mas não criar ou editar/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /novo cadastro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
  });

  it("cria grupo operacional como admin", async () => {
    const user = userEvent.setup();

    render(<EstruturaOperacionalPage />);

    await screen.findByText("Postos");
    await user.click(screen.getByRole("button", { name: /novo cadastro/i }));

    const dialog = screen.getByRole("dialog", { name: /novo grupo/i });
    await user.type(within(dialog).getByLabelText("Grupo"), "03");
    await user.type(within(dialog).getByLabelText("Nome"), "Escritorio");
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

  it("inativa e reativa registros via PATCH sem delete", async () => {
    const user = userEvent.setup();

    render(<EstruturaOperacionalPage />);

    await screen.findByText("Postos");
    await user.click(screen.getByRole("button", { name: /inativar/i }));

    await waitFor(() => {
      expect(operationalMasterService.updateOperationalGroup).toHaveBeenCalledWith("group-1", {
        is_active: false,
      });
    });
  });
});
