import { httpRequest } from "./http";

export type ManualCandidatePayload = {
  full_name: string;
  email?: string;
  phone?: string;
  job_id?: string;
  resume_summary?: string;
};

export type ManualCandidateResult = {
  candidate_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_id: string | null;
  job_linked: boolean;
  duplicate_warning: string | null;
};

export type ImportRowError = {
  row: number;
  message: string;
};

export type ImportPreviewAnalysis = {
  analysis_id?: string | null;
  status?: string | null;
  created?: boolean;
  blocked?: boolean;
  reused?: boolean;
  stuck?: boolean;
  reason?: string | null;
  stage?: string | null;
  trigger_source?: string | null;
};

export type ImportPreviewRow = {
  row?: number;
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  status?: string;
  job_linked?: boolean;
  job_link_error?: string;
  analysis?: ImportPreviewAnalysis | null;
  [key: string]: unknown;
};

export type ImportCandidatesResult = {
  created: number;
  linked: number;
  duplicates: number;
  errors: ImportRowError[];
  preview: ImportPreviewRow[];
};

export const candidaturasService = {
  async createManual(payload: ManualCandidatePayload): Promise<ManualCandidateResult> {
    return httpRequest<ManualCandidateResult>("/api/v1/candidaturas/manual", {
      method: "POST",
      body: payload,
    });
  },

  async importCSV(file: File, defaultJobId?: string): Promise<ImportCandidatesResult> {
    const form = new FormData();
    form.append("file", file);
    if (defaultJobId) form.append("default_job_id", defaultJobId);
    return httpRequest<ImportCandidatesResult>("/api/v1/candidaturas/import", {
      method: "POST",
      body: form,
    });
  },

  buildCSVTemplate(): string {
    return "nome,email,telefone,vaga,observacao\nJoão Silva,joao@exemplo.com,(11) 99999-0001,,\n";
  },
};
