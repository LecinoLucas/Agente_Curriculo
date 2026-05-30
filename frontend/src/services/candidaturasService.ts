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

export type ImportCandidatesResult = {
  created: number;
  linked: number;
  duplicates: number;
  errors: ImportRowError[];
  preview: Record<string, unknown>[];
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
