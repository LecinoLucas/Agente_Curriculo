import { httpRequest } from "./http";
import type {
  AdmissionCaseDocumentsPayload,
  AdmissionCaseEventsPage,
  AdmissionCaseOverview,
  AdmissionProtheusBridgeSummary,
  AdmissionCaseWorkspace,
  ProtheusExportDashboardItemsParams,
  ProtheusExportDashboardItemsResponse,
  ProtheusExportDashboardSummary,
  ProtheusExportQueueCreateResponse,
  ProtheusExportQueuePreflight,
  ProtheusExportQueueItem,
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

async function getProtheusExportDashboard(): Promise<ProtheusExportDashboardSummary> {
  return httpRequest<ProtheusExportDashboardSummary>(
    "/api/v1/pre-admission/protheus-export-dashboard",
  );
}

async function getProtheusExportDashboardItems(
  params: ProtheusExportDashboardItemsParams = {},
): Promise<ProtheusExportDashboardItemsResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  const query = search.toString();
  return httpRequest<ProtheusExportDashboardItemsResponse>(
    `/api/v1/pre-admission/protheus-export-dashboard/items${query ? `?${query}` : ""}`,
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

async function createProtheusExportRequest(caseId: string): Promise<ProtheusExportQueueCreateResponse> {
  return httpRequest<ProtheusExportQueueCreateResponse>(
    `/api/v1/pre-admission/cases/${caseId}/protheus-export-requests`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

async function preflightProtheusExportRequest(caseId: string): Promise<ProtheusExportQueuePreflight> {
  return httpRequest<ProtheusExportQueuePreflight>(
    `/api/v1/pre-admission/cases/${caseId}/protheus-export-requests/preflight`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

async function getLatestProtheusExportRequest(caseId: string): Promise<ProtheusExportQueueItem> {
  return httpRequest<ProtheusExportQueueItem>(
    `/api/v1/pre-admission/cases/${caseId}/protheus-export-requests/latest`,
  );
}

async function cancelProtheusExportRequest(
  caseId: string,
  exportId: string,
): Promise<ProtheusExportQueueItem> {
  return httpRequest<ProtheusExportQueueItem>(
    `/api/v1/pre-admission/cases/${caseId}/protheus-export-requests/${exportId}/cancel`,
    { method: "POST" },
  );
}

export const admissionWorkspaceService = {
  getOverview,
  getDocuments,
  getEvents,
  getWorkspace,
  getProtheusBridgeSummary,
  getProtheusExportDashboard,
  getProtheusExportDashboardItems,
  approveChecklistItem,
  rejectChecklistItem,
  requestChecklistItemCorrection,
  markChecklistItemNotRequired,
  markCaseReadyForExport,
  preflightProtheusExportRequest,
  createProtheusExportRequest,
  getLatestProtheusExportRequest,
  cancelProtheusExportRequest,
};
