import { expect, type APIRequestContext } from "@playwright/test";
import { API_BASE_URL } from "./api";

export interface CreatePublishedJobOptions {
  title: string;
  description?: string;
  requirements?: string;
  responsibilities?: string;
  prioritySkills?: string[];
}

const DEFAULT_DESCRIPTION =
  "Vaga criada via E2E para validar fluxos do ATS. Construir e manter APIs em Python e PostgreSQL com testes automatizados.";
const DEFAULT_REQUIREMENTS =
  "Experiência sólida com Python, FastAPI e bancos relacionais. Familiaridade com design de APIs REST, testes automatizados e versionamento.";
const DEFAULT_RESPONSIBILITIES =
  "Construir e manter APIs, escrever testes automatizados, colaborar com o time de produto.";
const DEFAULT_PRIORITY_SKILLS = ["Python", "FastAPI"];

export async function createPublishedJobViaApi(
  request: APIRequestContext,
  token: string,
  options: CreatePublishedJobOptions,
): Promise<{ id: string; title: string }> {
  const auth = { Authorization: `Bearer ${token}` };

  const createRes = await request.post(`${API_BASE_URL}/api/v1/jobs`, {
    headers: auth,
    data: {
      title: options.title,
      description: options.description ?? DEFAULT_DESCRIPTION,
      requirements: options.requirements ?? DEFAULT_REQUIREMENTS,
      responsibilities: options.responsibilities ?? DEFAULT_RESPONSIBILITIES,
      seniority_level: "senior",
      work_model: "remote",
      job_area: "Tecnologia",
      minimum_years_experience: 3,
      priority: "normal",
      selection_flow_type: "simple",
      requires_behavioral_assessment: false,
      requires_behavioral_ai_evaluation: false,
      requires_interview: false,
      requires_scorecard: false,
      requires_manager_review: false,
    },
  });
  expect(createRes.ok(), `POST /jobs HTTP ${createRes.status()}`).toBeTruthy();
  const created = (await createRes.json()) as { id: string; title: string };

  const skills = options.prioritySkills ?? DEFAULT_PRIORITY_SKILLS;
  for (const skillName of skills) {
    const skillRes = await request.post(
      `${API_BASE_URL}/api/v1/jobs/${created.id}/skills`,
      {
        headers: auth,
        data: { skill_name: skillName, priority_level: "priority" },
      },
    );
    expect(
      skillRes.ok(),
      `POST /jobs/${created.id}/skills HTTP ${skillRes.status()}`,
    ).toBeTruthy();
  }

  const publishRes = await request.patch(
    `${API_BASE_URL}/api/v1/jobs/${created.id}/publish`,
    { headers: auth },
  );
  expect(
    publishRes.ok(),
    `PATCH /jobs/${created.id}/publish HTTP ${publishRes.status()}`,
  ).toBeTruthy();
  const published = (await publishRes.json()) as {
    id: string;
    title: string;
    status: string;
  };
  expect(published.status).toBe("published");
  return { id: published.id, title: published.title };
}

export async function updateJobTitleViaApi(
  request: APIRequestContext,
  token: string,
  jobId: string,
  newTitle: string,
): Promise<void> {
  const res = await request.patch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: newTitle },
  });
  expect(res.ok(), `PATCH /jobs/${jobId} HTTP ${res.status()}`).toBeTruthy();
}
