import { publicApiClient } from './publicApiClient';

// ── Raw API shapes (snake_case from backend) ──────────────────────────────────

interface ApiUploadedDocument {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string; // 'uploaded' | 'approved' | 'rejected' | 'replaced'
  status_public_label: string;
  uploaded_at: string;
}

interface ApiChecklistItem {
  item_id: string;
  title: string;
  description: string | null;
  required: boolean;
  status: string; // 'pending' | 'received' | 'approved' | 'rejected' | 'waived'
  status_public_label: string;
  rejection_reason_public: string | null;
  uploaded_document: ApiUploadedDocument | null;
  allowed_file_types: string[];
  max_file_size_mb: number;
}

interface ApiPreAdmissionSummary {
  has_pre_admission_case: boolean;
  pre_admission_status: string | null;
  status_public_label: string | null;
  documents_total: number;
  documents_pending: number;
  documents_submitted: number;
  documents_approved: number;
  next_pending_document: string | null;
}

interface ApiPreAdmissionCase {
  id: string;
  status: string;
  status_public_label: string;
  salary_offer: string | null;
  start_date: string | null;
  work_model: string | null;
  checklist_items: ApiChecklistItem[];
  summary: ApiPreAdmissionSummary;
}

interface ApiPreAdmissionEnvelope {
  case: ApiPreAdmissionCase | null;
  summary: ApiPreAdmissionSummary;
}

interface ApiDocumentUploadResponse {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  status_public_label: string;
  uploaded_at: string;
}

// ── Internal types consumed by CandidatePreAdmissionPage ─────────────────────

export type ItemStatus = 'pending' | 'received' | 'approved' | 'rejected' | 'waived' | string;
export type DocumentStatus = 'uploaded' | 'approved' | 'rejected' | 'replaced' | string;

export interface UploadedDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  statusLabel: string;
  uploadedAt: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  status: ItemStatus;
  statusLabel: string;
  rejectionReasonPublic: string | null;
  uploadedDocument: UploadedDocument | null;
  allowedFileTypes: string[];
  maxFileSizeMb: number;
}

export interface PreAdmissionSummary {
  hasCase: boolean;
  statusLabel: string | null;
  documentsTotal: number;
  documentsPending: number;
  documentsSubmitted: number;
  documentsApproved: number;
  nextPendingDocument: string | null;
}

export interface PreAdmissionCase {
  id: string;
  status: string;
  statusLabel: string;
  salaryOffer: string | null;
  startDate: string | null;
  workModel: string | null;
  checklistItems: ChecklistItem[];
  summary: PreAdmissionSummary;
}

export interface PreAdmissionEnvelope {
  case: PreAdmissionCase | null;
  summary: PreAdmissionSummary;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapSummary(s: ApiPreAdmissionSummary): PreAdmissionSummary {
  return {
    hasCase: s.has_pre_admission_case,
    statusLabel: s.status_public_label,
    documentsTotal: s.documents_total,
    documentsPending: s.documents_pending,
    documentsSubmitted: s.documents_submitted,
    documentsApproved: s.documents_approved,
    nextPendingDocument: s.next_pending_document,
  };
}

function mapDocument(d: ApiUploadedDocument): UploadedDocument {
  return {
    id: d.id,
    filename: d.original_filename,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    status: d.status,
    statusLabel: d.status_public_label,
    uploadedAt: d.uploaded_at,
  };
}

function mapItem(i: ApiChecklistItem): ChecklistItem {
  return {
    id: i.item_id,
    title: i.title,
    description: i.description,
    required: i.required,
    status: i.status,
    statusLabel: i.status_public_label,
    rejectionReasonPublic: i.rejection_reason_public,
    uploadedDocument: i.uploaded_document ? mapDocument(i.uploaded_document) : null,
    allowedFileTypes: i.allowed_file_types,
    maxFileSizeMb: i.max_file_size_mb,
  };
}

function mapCase(c: ApiPreAdmissionCase): PreAdmissionCase {
  return {
    id: c.id,
    status: c.status,
    statusLabel: c.status_public_label,
    salaryOffer: c.salary_offer,
    startDate: c.start_date,
    workModel: c.work_model,
    checklistItems: c.checklist_items.map(mapItem),
    summary: mapSummary(c.summary),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

const BASE = '/candidate-portal/pre-admission';

export const candidatePreAdmissionService = {
  async getPreAdmission(): Promise<PreAdmissionEnvelope> {
    const raw = await publicApiClient.get<ApiPreAdmissionEnvelope>(BASE);
    return {
      case: raw.case ? mapCase(raw.case) : null,
      summary: mapSummary(raw.summary),
    };
  },

  async uploadDocument(
    caseId: string,
    itemId: string,
    file: File,
  ): Promise<UploadedDocument> {
    const fd = new FormData();
    fd.append('document_file', file, file.name);
    const raw = await publicApiClient.postForm<ApiDocumentUploadResponse>(
      `${BASE}/${caseId}/checklist-items/${itemId}/documents`,
      fd,
    );
    return mapDocument(raw);
  },

  // Returns the URL to open/navigate to for downloading a document.
  // The browser sends the HttpOnly session cookie automatically (SameSite=Lax).
  downloadUrl(documentId: string): string {
    return `${publicApiClient.baseUrl}${BASE}/documents/${documentId}/download`;
  },
};
