import { publicApiClient } from './publicApiClient';

export interface ApplyPayload {
  full_name: string;
  cpf: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  salary_expectation: string;
  desired_contract_type: 'CLT' | 'PJ' | 'Indiferente';
  works_at_marajo_group: boolean;
  job_id: string | null;
  lgpd_consent: boolean;
  resume_file: File;
  password?: string;
  confirm_password?: string;
}

export interface ApplyResponse {
  candidate_id: string;
  resume_id: string;
  resume_version_id: string;
  job_id: string | null;
  pipeline_id: string | null;
  analysis_auto_requested: boolean;
  analysis_id: string | null;
  analysis_status: string | null;
  talent_pool: boolean;
  status: string;
  message: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — matches backend limit

export const publicApplicationService = {
  async apply(payload: ApplyPayload): Promise<ApplyResponse> {
    if (payload.resume_file.size > MAX_FILE_BYTES) {
      throw new Error('O arquivo de currículo deve ter no máximo 10 MB.');
    }

    const fd = new FormData();
    fd.append('full_name', payload.full_name.trim());
    // Strip formatting characters so the backend receives digits only
    fd.append('cpf', payload.cpf.replace(/\D/g, ''));
    fd.append('email', payload.email.trim());
    fd.append('phone', payload.phone.trim());
    fd.append('city', payload.city.trim());
    fd.append('state', payload.state.trim().toUpperCase());
    fd.append('salary_expectation', payload.salary_expectation.trim());
    fd.append('desired_contract_type', payload.desired_contract_type);
    fd.append('works_at_marajo_group', payload.works_at_marajo_group ? 'true' : 'false');
    if (payload.job_id) fd.append('job_id', payload.job_id);
    if (payload.password) fd.append('password', payload.password);
    if (payload.confirm_password) fd.append('confirm_password', payload.confirm_password);
    fd.append('lgpd_consent', payload.lgpd_consent ? 'true' : 'false');
    fd.append('resume_file', payload.resume_file, payload.resume_file.name);

    return publicApiClient.postForm<ApplyResponse>('/candidates/apply', fd);
  },
};
