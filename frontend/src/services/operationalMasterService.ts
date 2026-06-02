import { httpRequest } from "./http";
import type { PaginatedResponse } from "../types/domain";

export type OperationalGroup = {
  id: string;
  group_code: string;
  name: string;
  normalized_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LocationGroupType = "city" | "district" | "corporate" | "other";

export type LocationGroup = {
  id: string;
  name: string;
  normalized_name: string;
  state: string;
  city: string | null;
  type: LocationGroupType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OperationalUnitType = "office" | "gas_station" | "store" | "other";

export type OperationalUnit = {
  id: string;
  group_id: string;
  location_group_id: string;
  branch_code: string;
  name: string;
  normalized_name: string;
  public_name: string | null;
  type: OperationalUnitType;
  reference_point: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  group?: OperationalGroup | null;
};

export type OperationalMasterListParams = {
  page?: number;
  page_size?: number;
  active?: boolean;
  search?: string;
};

export type LocationGroupListParams = OperationalMasterListParams & {
  type?: LocationGroupType;
};

export type OperationalUnitListParams = OperationalMasterListParams & {
  group_id?: string;
  location_group_id?: string;
  type?: OperationalUnitType;
};

export type CreateOperationalGroupPayload = {
  group_code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
};

export type UpdateOperationalGroupPayload = Partial<CreateOperationalGroupPayload>;

export type CreateLocationGroupPayload = {
  name: string;
  state: string;
  city?: string | null;
  type?: LocationGroupType;
  is_active?: boolean;
};

export type UpdateLocationGroupPayload = Partial<CreateLocationGroupPayload>;

export type CreateOperationalUnitPayload = {
  group_id: string;
  location_group_id: string;
  branch_code: string;
  name: string;
  public_name?: string | null;
  type?: OperationalUnitType;
  reference_point?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  is_active?: boolean;
};

export type UpdateOperationalUnitPayload = Partial<CreateOperationalUnitPayload>;

type OperationalGroupApi = Omit<OperationalGroup, "group_code"> & {
  code?: string;
  group_code?: string;
};

type OperationalUnitApi = Omit<OperationalUnit, "branch_code" | "group"> & {
  code?: string;
  branch_code?: string;
  group?: OperationalGroupApi | null;
};

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

function mapPaginatedResponse<TInput, TOutput>(
  response: PaginatedResponse<TInput>,
  mapper: (item: TInput) => TOutput,
): PaginatedResponse<TOutput> {
  return {
    ...response,
    data: response.data.map(mapper),
  };
}

function mapOperationalGroup(item: OperationalGroupApi): OperationalGroup {
  return {
    id: item.id,
    group_code: item.group_code ?? item.code ?? "",
    name: item.name,
    normalized_name: item.normalized_name,
    description: item.description,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function mapOperationalUnit(item: OperationalUnitApi): OperationalUnit {
  return {
    id: item.id,
    group_id: item.group_id,
    location_group_id: item.location_group_id,
    branch_code: item.branch_code ?? item.code ?? "",
    name: item.name,
    normalized_name: item.normalized_name,
    public_name: item.public_name,
    type: item.type,
    reference_point: item.reference_point,
    address: item.address,
    city: item.city,
    state: item.state,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
    group: item.group ? mapOperationalGroup(item.group) : undefined,
  };
}

function toOperationalGroupApiPayload(
  payload: CreateOperationalGroupPayload | UpdateOperationalGroupPayload,
) {
  const { group_code, ...rest } = payload;
  return group_code === undefined ? rest : { ...rest, code: group_code };
}

function toOperationalUnitApiPayload(
  payload: CreateOperationalUnitPayload | UpdateOperationalUnitPayload,
) {
  const { branch_code, ...rest } = payload;
  return branch_code === undefined ? rest : { ...rest, code: branch_code };
}

export const operationalMasterService = {
  listOperationalGroups(
    params: OperationalMasterListParams = {},
  ): Promise<PaginatedResponse<OperationalGroup>> {
    return httpRequest<PaginatedResponse<OperationalGroupApi>>(
      `/api/v1/operational-groups${buildQuery(params)}`,
    ).then((response) => mapPaginatedResponse(response, mapOperationalGroup));
  },

  createOperationalGroup(payload: CreateOperationalGroupPayload): Promise<OperationalGroup> {
    return httpRequest<OperationalGroupApi>("/api/v1/operational-groups", {
      method: "POST",
      body: toOperationalGroupApiPayload(payload),
    }).then(mapOperationalGroup);
  },

  updateOperationalGroup(
    id: string,
    payload: UpdateOperationalGroupPayload,
  ): Promise<OperationalGroup> {
    return httpRequest<OperationalGroupApi>(`/api/v1/operational-groups/${id}`, {
      method: "PATCH",
      body: toOperationalGroupApiPayload(payload),
    }).then(mapOperationalGroup);
  },

  listLocationGroups(params: LocationGroupListParams = {}): Promise<PaginatedResponse<LocationGroup>> {
    return httpRequest<PaginatedResponse<LocationGroup>>(
      `/api/v1/location-groups${buildQuery(params)}`,
    );
  },

  createLocationGroup(payload: CreateLocationGroupPayload): Promise<LocationGroup> {
    return httpRequest<LocationGroup>("/api/v1/location-groups", {
      method: "POST",
      body: payload,
    });
  },

  updateLocationGroup(id: string, payload: UpdateLocationGroupPayload): Promise<LocationGroup> {
    return httpRequest<LocationGroup>(`/api/v1/location-groups/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  listOperationalUnits(
    params: OperationalUnitListParams = {},
  ): Promise<PaginatedResponse<OperationalUnit>> {
    return httpRequest<PaginatedResponse<OperationalUnitApi>>(
      `/api/v1/operational-units${buildQuery(params)}`,
    ).then((response) => mapPaginatedResponse(response, mapOperationalUnit));
  },

  createOperationalUnit(payload: CreateOperationalUnitPayload): Promise<OperationalUnit> {
    return httpRequest<OperationalUnitApi>("/api/v1/operational-units", {
      method: "POST",
      body: toOperationalUnitApiPayload(payload),
    }).then(mapOperationalUnit);
  },

  updateOperationalUnit(id: string, payload: UpdateOperationalUnitPayload): Promise<OperationalUnit> {
    return httpRequest<OperationalUnitApi>(`/api/v1/operational-units/${id}`, {
      method: "PATCH",
      body: toOperationalUnitApiPayload(payload),
    }).then(mapOperationalUnit);
  },
};
