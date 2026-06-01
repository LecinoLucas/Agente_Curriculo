import { httpRequest } from "./http";
import type { PaginatedResponse } from "../types/domain";

export type OperationalGroup = {
  id: string;
  code: string;
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
  code: string;
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
  code: string;
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
  code: string;
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

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

export const operationalMasterService = {
  listOperationalGroups(
    params: OperationalMasterListParams = {},
  ): Promise<PaginatedResponse<OperationalGroup>> {
    return httpRequest<PaginatedResponse<OperationalGroup>>(
      `/api/v1/operational-groups${buildQuery(params)}`,
    );
  },

  createOperationalGroup(payload: CreateOperationalGroupPayload): Promise<OperationalGroup> {
    return httpRequest<OperationalGroup>("/api/v1/operational-groups", {
      method: "POST",
      body: payload,
    });
  },

  updateOperationalGroup(
    id: string,
    payload: UpdateOperationalGroupPayload,
  ): Promise<OperationalGroup> {
    return httpRequest<OperationalGroup>(`/api/v1/operational-groups/${id}`, {
      method: "PATCH",
      body: payload,
    });
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
    return httpRequest<PaginatedResponse<OperationalUnit>>(
      `/api/v1/operational-units${buildQuery(params)}`,
    );
  },

  createOperationalUnit(payload: CreateOperationalUnitPayload): Promise<OperationalUnit> {
    return httpRequest<OperationalUnit>("/api/v1/operational-units", {
      method: "POST",
      body: payload,
    });
  },

  updateOperationalUnit(id: string, payload: UpdateOperationalUnitPayload): Promise<OperationalUnit> {
    return httpRequest<OperationalUnit>(`/api/v1/operational-units/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },
};
