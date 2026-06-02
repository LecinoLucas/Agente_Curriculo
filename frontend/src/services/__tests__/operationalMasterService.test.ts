import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
}));

vi.mock("../http", () => ({
  httpRequest: httpRequestMock,
}));

import { operationalMasterService } from "../operationalMasterService";

function paginated<T>(data: T[]) {
  return {
    data,
    total: data.length,
    page: 1,
    page_size: 100,
    total_pages: 1,
  };
}

describe("operationalMasterService", () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
    httpRequestMock.mockResolvedValue({});
  });

  it("lista grupos operacionais com filtros", async () => {
    httpRequestMock.mockResolvedValueOnce(paginated([]));

    await operationalMasterService.listOperationalGroups({
      page: 2,
      page_size: 25,
      active: false,
      search: "postos",
    });

    const [requestUrl] = httpRequestMock.mock.calls[0];
    const url = new URL(requestUrl, "http://localhost");

    expect(url.pathname).toBe("/api/v1/operational-groups");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("25");
    expect(url.searchParams.get("active")).toBe("false");
    expect(url.searchParams.get("search")).toBe("postos");
  });

  it("envia create e patch de grupos preservando null explicito", async () => {
    await operationalMasterService.createOperationalGroup({
      group_code: "02",
      name: "Postos",
      description: null,
    });

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/operational-groups", {
      method: "POST",
      body: { code: "02", name: "Postos", description: null },
    });

    await operationalMasterService.updateOperationalGroup("group-1", {
      description: null,
      is_active: false,
    });

    expect(httpRequestMock).toHaveBeenLastCalledWith("/api/v1/operational-groups/group-1", {
      method: "PATCH",
      body: { description: null, is_active: false },
    });
  });

  it("mapeia code do backend para group_code no frontend", async () => {
    httpRequestMock.mockResolvedValueOnce(
      paginated([
        {
          id: "group-1",
          code: "02",
          name: "Postos",
          normalized_name: "postos",
          description: null,
          is_active: true,
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-02T10:00:00Z",
        },
      ]),
    );

    const response = await operationalMasterService.listOperationalGroups();

    expect(response.data[0]).toMatchObject({
      group_code: "02",
      name: "Postos",
    });
    expect("code" in response.data[0]).toBe(false);
  });

  it("prioriza group_code quando o backend tambem envia code legado", async () => {
    httpRequestMock.mockResolvedValueOnce(
      paginated([
        {
          id: "group-1",
          code: "4201",
          group_code: "02",
          name: "Postos",
          normalized_name: "postos",
          description: null,
          is_active: true,
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-02T10:00:00Z",
        },
      ]),
    );

    const response = await operationalMasterService.listOperationalGroups();

    expect(response.data[0]).toMatchObject({
      group_code: "02",
      name: "Postos",
    });
    expect(response.data[0].group_code).not.toBe("4201");
  });

  it("lista localidades com status, tipo e busca", async () => {
    httpRequestMock.mockResolvedValueOnce(paginated([]));

    await operationalMasterService.listLocationGroups({
      page_size: 100,
      active: true,
      type: "city",
      search: "peritoro",
    });

    const [requestUrl] = httpRequestMock.mock.calls[0];
    const url = new URL(requestUrl, "http://localhost");

    expect(url.pathname).toBe("/api/v1/location-groups");
    expect(url.searchParams.get("page_size")).toBe("100");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.get("type")).toBe("city");
    expect(url.searchParams.get("search")).toBe("peritoro");
  });

  it("envia create e patch de localidades", async () => {
    await operationalMasterService.createLocationGroup({
      name: "Peritoro",
      state: "MA",
      city: null,
      type: "city",
    });

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/location-groups", {
      method: "POST",
      body: { name: "Peritoro", state: "MA", city: null, type: "city" },
    });

    await operationalMasterService.updateLocationGroup("location-1", {
      city: null,
      is_active: false,
    });

    expect(httpRequestMock).toHaveBeenLastCalledWith("/api/v1/location-groups/location-1", {
      method: "PATCH",
      body: { city: null, is_active: false },
    });
  });

  it("lista filiais/postos com todos os filtros operacionais", async () => {
    httpRequestMock.mockResolvedValueOnce(paginated([]));

    await operationalMasterService.listOperationalUnits({
      page: 1,
      page_size: 50,
      active: true,
      group_id: "group-1",
      location_group_id: "location-1",
      type: "gas_station",
      search: "4301",
    });

    const [requestUrl] = httpRequestMock.mock.calls[0];
    const url = new URL(requestUrl, "http://localhost");

    expect(url.pathname).toBe("/api/v1/operational-units");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.get("group_id")).toBe("group-1");
    expect(url.searchParams.get("location_group_id")).toBe("location-1");
    expect(url.searchParams.get("type")).toBe("gas_station");
    expect(url.searchParams.get("search")).toBe("4301");
  });

  it("envia create e patch de filiais/postos preservando null explicito", async () => {
    await operationalMasterService.createOperationalUnit({
      group_id: "group-1",
      location_group_id: "location-1",
      branch_code: "4301",
      name: "Posto 4301",
      public_name: null,
      type: "gas_station",
      reference_point: null,
      address: null,
      city: "Peritoro",
      state: "MA",
    });

    expect(httpRequestMock).toHaveBeenCalledWith("/api/v1/operational-units", {
      method: "POST",
      body: {
        group_id: "group-1",
        location_group_id: "location-1",
        code: "4301",
        name: "Posto 4301",
        public_name: null,
        type: "gas_station",
        reference_point: null,
        address: null,
        city: "Peritoro",
        state: "MA",
      },
    });

    await operationalMasterService.updateOperationalUnit("unit-1", {
      public_name: null,
      reference_point: null,
      address: null,
      city: null,
      state: null,
    });

    expect(httpRequestMock).toHaveBeenLastCalledWith("/api/v1/operational-units/unit-1", {
      method: "PATCH",
      body: {
        public_name: null,
        reference_point: null,
        address: null,
        city: null,
        state: null,
      },
    });
  });

  it("mapeia code do backend para branch_code no frontend", async () => {
    httpRequestMock.mockResolvedValueOnce(
      paginated([
        {
          id: "unit-1",
          group_id: "group-1",
          location_group_id: "location-1",
          code: "4201",
          name: "NOVA CRIXÁS",
          normalized_name: "nova crixas",
          public_name: null,
          type: "gas_station",
          reference_point: "BR",
          address: null,
          city: "NOVA CRIXÁS",
          state: "GO",
          is_active: true,
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-02T10:00:00Z",
          group: {
            id: "group-1",
            code: "02",
            name: "Postos",
            normalized_name: "postos",
            description: null,
            is_active: true,
            created_at: "2026-05-01T10:00:00Z",
            updated_at: "2026-05-02T10:00:00Z",
          },
        },
      ]),
    );

    const response = await operationalMasterService.listOperationalUnits();

    expect(response.data[0]).toMatchObject({
      branch_code: "4201",
      name: "NOVA CRIXÁS",
      group: {
        group_code: "02",
        name: "Postos",
      },
    });
    expect("code" in response.data[0]).toBe(false);
  });

  it("prioriza branch_code da filial e group_code do grupo vinculado", async () => {
    httpRequestMock.mockResolvedValueOnce(
      paginated([
        {
          id: "unit-1",
          group_id: "group-1",
          location_group_id: "location-1",
          code: "02",
          branch_code: "4201",
          name: "NOVA CRIXÁS",
          normalized_name: "nova crixas",
          public_name: null,
          type: "gas_station",
          reference_point: "BR",
          address: null,
          city: "NOVA CRIXÁS",
          state: "GO",
          is_active: true,
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-02T10:00:00Z",
          group: {
            id: "group-1",
            code: "4201",
            group_code: "02",
            name: "Postos",
            normalized_name: "postos",
            description: null,
            is_active: true,
            created_at: "2026-05-01T10:00:00Z",
            updated_at: "2026-05-02T10:00:00Z",
          },
        },
      ]),
    );

    const response = await operationalMasterService.listOperationalUnits();

    expect(response.data[0]).toMatchObject({
      branch_code: "4201",
      name: "NOVA CRIXÁS",
      group: {
        group_code: "02",
        name: "Postos",
      },
    });
    expect(response.data[0].branch_code).not.toBe("02");
    expect(response.data[0].group?.group_code).not.toBe("4201");
  });
});
