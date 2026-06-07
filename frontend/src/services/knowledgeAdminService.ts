import { httpRequest } from "./http";

export type KnowledgeDocumentStatus = "draft" | "published" | "archived";

export type KnowledgeChunkPreview = {
  id: string;
  chunk_index: number;
  content_preview: string;
  token_count: number | null;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  source_type: string;
  domain: string;
  content: string;
  visibility: string;
  allowed_roles: string[];
  sensitivity_level: string;
  tags: string[];
  status: KnowledgeDocumentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  source_uri: string | null;
  indexing_status: string;
  last_indexed_at: string | null;
  last_index_error: string | null;
  chunk_count: number;
  chunks: KnowledgeChunkPreview[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type KnowledgeDocumentListResponse = {
  items: KnowledgeDocument[];
  total: number;
  embedding_provider_status: string;
  embedding_provider_message: string | null;
};

export type KnowledgeDocumentPayload = {
  title: string;
  source_type: string;
  domain: string;
  content: string;
  visibility: "internal" | "admin_only";
  allowed_roles: string[];
  sensitivity_level: "low" | "medium" | "high" | "restricted";
  tags: string[];
  status: KnowledgeDocumentStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  source_uri?: string | null;
};

export const knowledgeAdminService = {
  list() {
    return httpRequest<KnowledgeDocumentListResponse>("/api/v1/ai/knowledge/documents");
  },

  get(id: string) {
    return httpRequest<KnowledgeDocument>(`/api/v1/ai/knowledge/documents/${id}`);
  },

  create(payload: KnowledgeDocumentPayload) {
    return httpRequest<KnowledgeDocument>("/api/v1/ai/knowledge/documents", {
      method: "POST",
      body: payload,
    });
  },

  update(id: string, payload: Partial<KnowledgeDocumentPayload>) {
    return httpRequest<KnowledgeDocument>(`/api/v1/ai/knowledge/documents/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  reindex(id: string) {
    return httpRequest<{
      ok: boolean;
      document_id: string;
      indexing_status: string;
      chunks_created: number;
      embeddings_created: number;
      warnings: string[];
    }>(`/api/v1/ai/knowledge/documents/${id}/reindex`, {
      method: "POST",
    });
  },

  archive(id: string) {
    return httpRequest<{ ok: boolean; document_id: string; status: string }>(
      `/api/v1/ai/knowledge/documents/${id}/archive`,
      { method: "POST" },
    );
  },
};
