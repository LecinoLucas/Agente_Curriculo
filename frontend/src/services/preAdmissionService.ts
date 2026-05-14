import { API_BASE_URL, httpRequest, HttpError } from "./http";
import { tokenStorage } from "../utils/storage";
import type {
  PreAdmissionCase,
  PreAdmissionChecklistItem,
  PreAdmissionChecklistItemPayload,
  PreAdmissionChecklistItemUpdatePayload,
  PreAdmissionDocument,
  PreAdmissionDocumentsResponse,
  PreAdmissionEnvelope,
  PreAdmissionEventsResponse,
  PreAdmissionPayload,
  PreAdmissionUpdatePayload,
} from "../types/domain";

export async function getPreAdmission(
  jobId: string,
  candidateId: string,
): Promise<PreAdmissionEnvelope> {
  return httpRequest<PreAdmissionEnvelope>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/pre-admission`,
  );
}

export async function createPreAdmission(
  jobId: string,
  candidateId: string,
  payload: PreAdmissionPayload,
): Promise<PreAdmissionCase> {
  return httpRequest<PreAdmissionCase>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/pre-admission`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updatePreAdmission(
  caseId: string,
  payload: PreAdmissionUpdatePayload,
): Promise<PreAdmissionCase> {
  return httpRequest<PreAdmissionCase>(`/api/v1/pre-admission/${caseId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function createPreAdmissionChecklistItem(
  caseId: string,
  payload: PreAdmissionChecklistItemPayload,
): Promise<PreAdmissionChecklistItem> {
  return httpRequest<PreAdmissionChecklistItem>(
    `/api/v1/pre-admission/${caseId}/checklist-items`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updatePreAdmissionChecklistItem(
  caseId: string,
  itemId: string,
  payload: PreAdmissionChecklistItemUpdatePayload,
): Promise<PreAdmissionChecklistItem> {
  return httpRequest<PreAdmissionChecklistItem>(
    `/api/v1/pre-admission/${caseId}/checklist-items/${itemId}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function getPreAdmissionEvents(caseId: string): Promise<PreAdmissionEventsResponse> {
  return httpRequest<PreAdmissionEventsResponse>(`/api/v1/pre-admission/${caseId}/events`);
}

export async function listPreAdmissionDocuments(caseId: string): Promise<PreAdmissionDocumentsResponse> {
  return httpRequest<PreAdmissionDocumentsResponse>(`/api/v1/pre-admission/${caseId}/documents`);
}

export async function approvePreAdmissionDocument(documentId: string): Promise<PreAdmissionDocument> {
  return httpRequest<PreAdmissionDocument>(`/api/v1/pre-admission/documents/${documentId}/approve`, {
    method: "POST",
  });
}

export async function rejectPreAdmissionDocument(
  documentId: string,
  reviewNotes: string,
): Promise<PreAdmissionDocument> {
  return httpRequest<PreAdmissionDocument>(`/api/v1/pre-admission/documents/${documentId}/reject`, {
    method: "POST",
    body: { review_notes: reviewNotes },
  });
}

export async function downloadPreAdmissionDocument(documentId: string): Promise<Blob> {
  const headers = new Headers();
  const token = tokenStorage.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}/api/v1/pre-admission/documents/${documentId}/download`, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new HttpError(response.status, "Não foi possível baixar o documento.");
  }
  return response.blob();
}
