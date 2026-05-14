import { API_BASE_URL, httpRequest, HttpError } from "./http";
import { tokenStorage } from "../utils/storage";
import type {
  AdmissionPackage,
  ErpIntegrationAttempt,
  ErpIntegrationAttemptListResponse,
} from "../types/domain";

export async function createPackage(caseId: string): Promise<AdmissionPackage> {
  return httpRequest<AdmissionPackage>(
    `/api/v1/pre-admission/${caseId}/admission-package`,
    {
      method: "POST",
      body: {},
    },
  );
}

export async function getPackageByCaseId(caseId: string): Promise<AdmissionPackage | null> {
  try {
    return await httpRequest<AdmissionPackage | null>(
      `/api/v1/pre-admission/${caseId}/admission-package`,
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function approvePackage(packageId: string): Promise<AdmissionPackage> {
  return httpRequest<AdmissionPackage>(
    `/api/v1/admission-packages/${packageId}/approve`,
    {
      method: "POST",
      body: {},
    },
  );
}

export async function cancelPackage(
  packageId: string,
  reason?: string,
): Promise<AdmissionPackage> {
  return httpRequest<AdmissionPackage>(
    `/api/v1/admission-packages/${packageId}/cancel`,
    {
      method: "POST",
      body: { reason: reason || null },
    },
  );
}

export async function downloadJson(packageId: string): Promise<Blob> {
  const token = tokenStorage.get();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/admission-packages/${packageId}/export-json`,
    {
      method: "GET",
      credentials: "include",
      headers,
    },
  );

  if (!response.ok) {
    throw new HttpError(response.status, "Erro ao exportar JSON");
  }

  return response.blob();
}

export async function downloadCsv(packageId: string): Promise<Blob> {
  const token = tokenStorage.get();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/admission-packages/${packageId}/export-csv`,
    {
      method: "GET",
      credentials: "include",
      headers,
    },
  );

  if (!response.ok) {
    throw new HttpError(response.status, "Erro ao exportar CSV");
  }

  return response.blob();
}

export async function createProtheusDryRunAttempt(
  packageId: string,
): Promise<ErpIntegrationAttempt> {
  return httpRequest<ErpIntegrationAttempt>(
    `/api/v1/admission-packages/${packageId}/erp/protheus/dry-run`,
    {
      method: "POST",
      body: {},
    },
  );
}

export async function listErpAttempts(
  packageId: string,
): Promise<ErpIntegrationAttemptListResponse> {
  return httpRequest<ErpIntegrationAttemptListResponse>(
    `/api/v1/admission-packages/${packageId}/erp/attempts`,
  );
}

export async function getErpAttempt(
  attemptId: string,
): Promise<ErpIntegrationAttempt> {
  return httpRequest<ErpIntegrationAttempt>(
    `/api/v1/erp-integration-attempts/${attemptId}`,
  );
}

export async function simulateErpAttempt(
  attemptId: string,
): Promise<ErpIntegrationAttempt> {
  return httpRequest<ErpIntegrationAttempt>(
    `/api/v1/erp-integration-attempts/${attemptId}/simulate`,
    {
      method: "POST",
      body: {},
    },
  );
}

// Re-export for convenience
export const admissionPackageService = {
  createPackage,
  getPackageByCaseId,
  approvePackage,
  cancelPackage,
  downloadJson,
  downloadCsv,
  createProtheusDryRunAttempt,
  listErpAttempts,
  getErpAttempt,
  simulateErpAttempt,
};
