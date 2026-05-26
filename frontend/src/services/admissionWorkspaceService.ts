import { httpRequest } from "./http";
import type { AdmissionCaseWorkspace } from "../types/domain";

async function getWorkspace(caseId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(`/api/v1/admission/cases/${caseId}/workspace`);
}

async function approveChecklistItem(itemId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(`/api/v1/admission/checklist-items/${itemId}/approve`, {
    method: "POST",
  });
}

async function rejectChecklistItem(itemId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(`/api/v1/admission/checklist-items/${itemId}/reject`, {
    method: "POST",
  });
}

async function requestChecklistItemCorrection(itemId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(
    `/api/v1/admission/checklist-items/${itemId}/request-correction`,
    { method: "POST" },
  );
}

async function markChecklistItemNotRequired(itemId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(
    `/api/v1/admission/checklist-items/${itemId}/mark-not-required`,
    { method: "POST" },
  );
}

async function markCaseReadyForExport(caseId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(`/api/v1/admission/cases/${caseId}/mark-ready-for-export`, {
    method: "POST",
  });
}

export const admissionWorkspaceService = {
  getWorkspace,
  approveChecklistItem,
  rejectChecklistItem,
  requestChecklistItemCorrection,
  markChecklistItemNotRequired,
  markCaseReadyForExport,
};
