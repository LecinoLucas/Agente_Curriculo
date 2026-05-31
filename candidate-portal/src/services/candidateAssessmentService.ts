import { publicApiClient } from './publicApiClient';

// ── Raw API shapes (snake_case) ───────────────────────────────────────────────

interface ApiAnswer {
  question_id: string;
  answer_text: string | null;
  answer_value: number | null;
  selected_options_json: string[] | null;
}

interface ApiQuestion {
  id: string;
  question_text: string;
  answer_type: string;
  is_required: boolean;
  display_order: number;
  options_json: unknown;
  answer: ApiAnswer | null;
}

interface ApiCompetency {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  questions: ApiQuestion[];
}

interface ApiAssignmentSummary {
  id: string;
  candidate_id: string;
  job_id: string;
  job_title: string | null;
  template_name: string;
  status: string;
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  expires_at: string | null;
  answered_count: number;
  question_count: number;
  // ai_evaluation_status intentionally omitted — internal field, not for candidates
}

interface ApiAssignmentDetail extends ApiAssignmentSummary {
  competencies: ApiCompetency[];
}

// ── Internal types consumed by CandidateAssessmentPage ───────────────────────

export interface SavedAnswer {
  questionId: string;
  answerText: string | null;
  answerValue: number | null;
  selectedOptions: string[] | null;
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  answerType: 'text' | 'scale' | 'multiple_choice' | string;
  isRequired: boolean;
  displayOrder: number;
  optionsJson: unknown;
  savedAnswer: SavedAnswer | null;
}

export interface AssessmentCompetency {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  questions: AssessmentQuestion[];
}

export interface AssessmentSummary {
  id: string;
  jobTitle: string | null;
  templateName: string;
  status: string;
  assignedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  answeredCount: number;
  questionCount: number;
}

export interface AssessmentDetail extends AssessmentSummary {
  competencies: AssessmentCompetency[];
}

export interface AnswerPayload {
  question_id: string;
  answer_text: string | null;
  answer_value: number | null;
  selected_options_json: string[] | null;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapAnswer(a: ApiAnswer | null): SavedAnswer | null {
  if (!a) return null;
  return {
    questionId: a.question_id,
    answerText: a.answer_text,
    answerValue: a.answer_value,
    selectedOptions: a.selected_options_json,
  };
}

function mapQuestion(q: ApiQuestion): AssessmentQuestion {
  return {
    id: q.id,
    text: q.question_text,
    answerType: q.answer_type,
    isRequired: q.is_required,
    displayOrder: q.display_order,
    optionsJson: q.options_json,
    savedAnswer: mapAnswer(q.answer),
  };
}

function mapCompetency(c: ApiCompetency): AssessmentCompetency {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    displayOrder: c.display_order,
    questions: [...c.questions]
      .sort((a, b) => a.display_order - b.display_order)
      .map(mapQuestion),
  };
}

function mapSummary(a: ApiAssignmentSummary): AssessmentSummary {
  return {
    id: a.id,
    jobTitle: a.job_title,
    templateName: a.template_name,
    status: a.status,
    assignedAt: a.assigned_at,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    expiresAt: a.expires_at,
    answeredCount: a.answered_count,
    questionCount: a.question_count,
  };
}

function mapDetail(a: ApiAssignmentDetail): AssessmentDetail {
  return {
    ...mapSummary(a),
    competencies: [...a.competencies]
      .sort((x, y) => x.display_order - y.display_order)
      .map(mapCompetency),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

const BASE = '/candidate-portal/behavioral-assessments';

export const candidateAssessmentService = {
  async listAssessments(): Promise<AssessmentSummary[]> {
    const raw = await publicApiClient.get<ApiAssignmentSummary[]>(BASE);
    return raw.map(mapSummary);
  },

  async getAssessment(id: string): Promise<AssessmentDetail> {
    const raw = await publicApiClient.get<ApiAssignmentDetail>(`${BASE}/${id}`);
    return mapDetail(raw);
  },

  async startAssessment(id: string): Promise<AssessmentDetail> {
    const raw = await publicApiClient.post<ApiAssignmentDetail>(`${BASE}/${id}/start`);
    return mapDetail(raw);
  },

  async saveAnswers(id: string, answers: AnswerPayload[]): Promise<AssessmentDetail> {
    const raw = await publicApiClient.put<ApiAssignmentDetail>(`${BASE}/${id}/answers`, {
      answers,
    });
    return mapDetail(raw);
  },

  async submitAssessment(id: string, answers: AnswerPayload[]): Promise<AssessmentDetail> {
    const raw = await publicApiClient.post<ApiAssignmentDetail>(`${BASE}/${id}/submit`, {
      answers,
    });
    return mapDetail(raw);
  },
};
