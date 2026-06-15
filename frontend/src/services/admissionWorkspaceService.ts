import { httpRequest } from "./http";
import type {
  AdmissionCaseDocumentsPayload,
  AdmissionCaseEventsPage,
  AdmissionCaseOverview,
  AdmissionProtheusBridgeSummary,
  AdmissionCaseWorkspace,
} from "../types/domain";

async function getOverview(caseId: string): Promise<AdmissionCaseOverview> {
  return httpRequest<AdmissionCaseOverview>(`/api/v1/pre-admission/cases/${caseId}/overview`);
}

async function getDocuments(caseId: string): Promise<AdmissionCaseDocumentsPayload> {
  return httpRequest<AdmissionCaseDocumentsPayload>(`/api/v1/pre-admission/cases/${caseId}/documents`);
}

async function getEvents(
  caseId: string,
  page = 1,
  pageSize = 20,
): Promise<AdmissionCaseEventsPage> {
  return httpRequest<AdmissionCaseEventsPage>(
    `/api/v1/pre-admission/cases/${caseId}/events?page=${page}&page_size=${pageSize}`,
  );
}

async function getWorkspace(caseId: string): Promise<AdmissionCaseWorkspace> {
  return httpRequest<AdmissionCaseWorkspace>(`/api/v1/admission/cases/${caseId}/workspace`);
}

async function getProtheusBridgeSummary(caseId: string): Promise<AdmissionProtheusBridgeSummary> {
  return httpRequest<AdmissionProtheusBridgeSummary>(
    `/api/v1/pre-admission/cases/${caseId}/protheus-bridge-summary`,
  );
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
  getOverview,
  getDocuments,
  getEvents,
  getWorkspace,
  getProtheusBridgeSummary,
  approveChecklistItem,
  rejectChecklistItem,
  requestChecklistItemCorrection,
  markChecklistItemNotRequired,
  markCaseReadyForExport,
};
