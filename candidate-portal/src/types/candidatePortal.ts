export type JobArea =
  | 'tecnologia'
  | 'comercial'
  | 'operacional'
  | 'administrativo'
  | 'rh'
  | 'financeiro'
  | 'logistica';

export type WorkModel = 'presencial' | 'remoto' | 'hibrido';

export type SeniorityLevel =
  | 'estagiario'
  | 'junior'
  | 'pleno'
  | 'senior'
  | 'especialista'
  | 'lideranca';

export type ProcessStep =
  | 'candidatura'
  | 'triagem'
  | 'avaliacao'
  | 'entrevista'
  | 'admissao';

export type ApplicationStatus =
  | 'em_andamento'
  | 'aprovado'
  | 'reprovado'
  | 'aguardando'
  | 'finalizado';

export type DocumentStatus = 'pendente' | 'enviado' | 'aprovado' | 'rejeitado';

export interface PublicJobUnit {
  id: string;
  public_name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  reference_point: string | null;
}

export interface PublicJob {
  id: string;
  slug: string;
  title: string;
  company: string;
  location: string;
  area: JobArea;
  work_model: WorkModel;
  seniority: SeniorityLevel;
  salary_range?: string;
  short_description: string;
  about_role: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  image_url?: string;
  published_at: string;
  applicants_count?: number;
  job_units?: PublicJobUnit[];
}

export interface ApplicationFormStep1 {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  nationality: string;
  address_city: string;
  address_state: string;
  education_level: string;
  salary_expectation: string;
}

export interface ApplicationFormData extends ApplicationFormStep1 {
  resume_file_name?: string;
}

export interface CandidateApplication {
  id: string;
  job_id: string;
  job_title: string;
  job_slug: string;
  company: string;
  current_step: ProcessStep;
  completed_steps: ProcessStep[];
  status: ApplicationStatus;
  applied_at: string;
  next_action?: string;
  next_action_route?: string;
}

export interface CandidateProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  profile_completion: number;
  profile_items: Array<{ label: string; done: boolean }>;
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  options: Array<{ value: number; label: string }>;
}

export interface AssessmentAnswers {
  [questionId: string]: number;
}

export interface DocumentItem {
  id: string;
  name: string;
  description: string;
  required: boolean;
  status: DocumentStatus;
  file_name?: string;
  file_size?: string;
  rejection_reason?: string;
}

export const PROCESS_STEPS: Array<{ id: ProcessStep; label: string }> = [
  { id: 'candidatura', label: 'Candidatura' },
  { id: 'triagem', label: 'Triagem' },
  { id: 'avaliacao', label: 'Avaliação' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'admissao', label: 'Admissão' },
];

export const JOB_AREA_LABELS: Record<JobArea, string> = {
  tecnologia: 'Tecnologia',
  comercial: 'Comercial',
  operacional: 'Operacional',
  administrativo: 'Administrativo',
  rh: 'RH',
  financeiro: 'Financeiro',
  logistica: 'Logística',
};

export const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  presencial: 'Presencial',
  remoto: 'Remoto',
  hibrido: 'Híbrido',
};

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  estagiario: 'Estágio',
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sênior',
  especialista: 'Especialista',
  lideranca: 'Liderança',
};
