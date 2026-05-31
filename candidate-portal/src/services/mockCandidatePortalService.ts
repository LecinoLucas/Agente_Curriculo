import {
  MOCK_JOBS,
  MOCK_CANDIDATE,
  MOCK_ASSESSMENT_QUESTIONS,
  MOCK_DOCUMENTS,
} from '../data/mockCandidatePortal';
import type {
  PublicJob,
  MockCandidate,
  AssessmentQuestion,
  DocumentItem,
  ApplicationFormData,
  AssessmentAnswers,
} from '../types/candidatePortal';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getPublicJobs(): Promise<PublicJob[]> {
  await delay(300);
  return [...MOCK_JOBS];
}

export async function getPublicJobBySlug(slug: string): Promise<PublicJob | null> {
  await delay(250);
  return MOCK_JOBS.find((job) => job.slug === slug) ?? null;
}

export async function submitMockApplication(
  _slug: string,
  _data: ApplicationFormData,
): Promise<{ success: boolean; application_id: string }> {
  await delay(800);
  return { success: true, application_id: 'app-' + Date.now() };
}

export async function loginMockCandidate(
  email: string,
  _password: string,
): Promise<MockCandidate | null> {
  await delay(600);
  if (email === MOCK_CANDIDATE.email || email.includes('@')) {
    return MOCK_CANDIDATE;
  }
  return null;
}

export async function getCandidateHome(): Promise<MockCandidate> {
  await delay(350);
  return MOCK_CANDIDATE;
}

export async function getAssessmentQuestions(): Promise<AssessmentQuestion[]> {
  await delay(300);
  return [...MOCK_ASSESSMENT_QUESTIONS];
}

export async function submitMockAssessment(
  _answers: AssessmentAnswers,
): Promise<{ success: boolean }> {
  await delay(700);
  return { success: true };
}

export async function getPreAdmissionDocuments(): Promise<DocumentItem[]> {
  await delay(300);
  return [...MOCK_DOCUMENTS];
}

export async function uploadMockDocument(
  documentId: string,
  fileName: string,
): Promise<{ success: boolean; document_id: string }> {
  await delay(1000);
  return { success: true, document_id: documentId + '-' + fileName };
}
