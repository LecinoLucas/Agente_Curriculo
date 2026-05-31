import { publicApiClient, HttpError } from './publicApiClient';
import type { PublicJob, JobArea, WorkModel, SeniorityLevel } from '../types/candidatePortal';

// ── API response shapes (snake_case, as returned by the backend) ──────────────

interface ApiJobListItem {
  id: string;
  title: string;
  location: string | null;
  job_area: string | null;
}

interface ApiJobDetail {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
  location: string | null;
  job_area: string | null;
  work_model: string | null;
  seniority_level: string | null;
  benefits: string[];
  working_hours: string | null;
  published_at: string | null;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

// Converts a freeform text block to an array of bullet items.
function splitTextBlock(text: string | null): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.replace(/^[\s\-•*]+/, '').trim())
    .filter(Boolean);
}

function formatPublishedAt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Maps a list-endpoint item to the internal PublicJob shape.
// Fields not available from the list endpoint are set to safe empty defaults.
function mapListItem(item: ApiJobListItem): PublicJob {
  return {
    id: item.id,
    // No slug from API — use id so links resolve via the :identifier route param.
    slug: item.id,
    title: item.title,
    company: 'Rede Marajó',
    location: item.location ?? '',
    area: (item.job_area ?? 'operacional') as JobArea,
    // work_model is not returned by the list endpoint.
    work_model: '' as WorkModel,
    seniority: 'pleno' as SeniorityLevel,
    short_description: '',
    about_role: '',
    responsibilities: [],
    requirements: [],
    benefits: [],
    published_at: '',
  };
}

// Maps the detail-endpoint response to the internal PublicJob shape.
function mapDetail(item: ApiJobDetail): PublicJob {
  return {
    id: item.id,
    slug: item.id,
    title: item.title,
    company: 'Rede Marajó',
    location: item.location ?? '',
    area: (item.job_area ?? 'operacional') as JobArea,
    work_model: (item.work_model ?? '') as WorkModel,
    seniority: (item.seniority_level ?? '') as SeniorityLevel,
    short_description: '',
    about_role: item.description,
    responsibilities: splitTextBlock(item.responsibilities),
    requirements: splitTextBlock(item.requirements),
    benefits: Array.isArray(item.benefits) ? item.benefits : splitTextBlock(item.benefits as unknown as string | null),
    published_at: formatPublishedAt(item.published_at),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const publicJobsService = {
  async listJobs(): Promise<PublicJob[]> {
    const data = await publicApiClient.get<ApiJobListItem[]>('/jobs');
    return data.map(mapListItem);
  },

  async getJobById(id: string): Promise<PublicJob | null> {
    try {
      const data = await publicApiClient.get<ApiJobDetail>(`/jobs/${id}`);
      return mapDetail(data);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
  },
};
