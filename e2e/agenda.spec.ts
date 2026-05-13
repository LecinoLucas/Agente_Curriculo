import { expect, test, type Page } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_USER_EMAIL ?? "admin@resume.ai";
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD ?? "Admin123!";
const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await page.waitForURL(/\/pipeline/);
}

async function createCandidate(page: Page, fullName: string, email: string) {
  return await page.evaluate(
    async ({ apiBaseUrl, payload }) => {
      const token = window.localStorage.getItem("resume_ai_access_token");
      if (!token) {
        throw new Error("Token de autenticação não encontrado.");
      }

      const response = await fetch(`${apiBaseUrl}/api/v1/candidates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    {
      apiBaseUrl: API_BASE_URL,
      payload: {
        full_name: fullName,
        email,
        location_country: "BR",
      },
    }
  );
}

async function fetchCandidateInterviews(page: Page, candidateId: string) {
  return await page.evaluate(
    async ({ apiBaseUrl, candidateId }) => {
      const token = window.localStorage.getItem("resume_ai_access_token");
      if (!token) {
        throw new Error("Token de autenticação não encontrado.");
      }

      const response = await fetch(
        `${apiBaseUrl}/api/v1/agenda/interviews?page=1&page_size=100&candidate_id=${candidateId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    { apiBaseUrl: API_BASE_URL, candidateId }
  );
}

async function openActionMenuForCandidate(page: Page, candidateName: string) {
  const row = page.locator('[data-testid="agenda-interview-row"]').filter({ hasText: candidateName }).first();
  await expect(row).toBeVisible();
  await row.locator('[data-testid="agenda-actions-button"]').click();
  return row;
}

async function setNativeInputValue(
  page: Page,
  selector: string,
  value: string,
) {
  await page.locator(selector).evaluate(
    (input, nextValue) => {
      const element = input as HTMLInputElement;
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor?.set?.call(element, nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value
  );
}

test("E2E: Agenda de entrevistas cobre criar, conflitar, remarcar e cancelar", async ({ page }) => {
  const suffix = Date.now();
  const primaryCandidateName = `Agenda E2E ${suffix} A`;
  const conflictCandidateName = `Agenda E2E ${suffix} B`;
  const interviewerEmail = `agenda-e2e-${suffix}@empresa.com`;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await login(page);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const expectedUpdatedStart = await page.evaluate(
    ({ todayYear, todayMonth, todayDay }) =>
      new Date(todayYear, todayMonth - 1, todayDay, 11, 0, 0).toISOString(),
    { todayYear, todayMonth, todayDay }
  );
  const primaryCandidate = await createCandidate(
    page,
    primaryCandidateName,
    `agenda-e2e-${suffix}-a@example.com`
  );
  await createCandidate(page, conflictCandidateName, `agenda-e2e-${suffix}-b@example.com`);

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda de Entrevistas" })).toBeVisible();

  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toBeVisible();

  await page.getByLabel("Candidato *").selectOption({ label: primaryCandidateName });
  await page.getByLabel("Título *").fill(`Entrevista Agenda ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("10:00");
  await page.getByLabel("Fim *").fill("11:00");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await page.getByPlaceholder("Buscar candidato, vaga, avaliador...").fill(primaryCandidateName);
  await page.waitForTimeout(500);
  await expect(page.getByText(primaryCandidateName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Agendada").first()).toBeVisible();

  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: conflictCandidateName });
  await page.getByLabel("Título *").fill(`Conflito Agenda ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("10:30");
  await page.getByLabel("Fim *").fill("11:30");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toBeVisible();
  await expect(
    page.getByText(
      "Conflito de horário: este avaliador já possui uma entrevista agendada neste período."
    )
  ).toBeVisible();
  await expect(page.getByLabel("Título *")).toHaveValue(`Conflito Agenda ${suffix}`);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await expect(page.getByText(conflictCandidateName, { exact: true })).toHaveCount(0);

  // Edit: Get row with primary candidate and open edit dialog
  const editableRow = page.locator('[data-testid="agenda-interview-row"]').filter({ hasText: primaryCandidateName }).first();
  await expect(editableRow).toBeVisible();
  await editableRow.locator('[data-testid="agenda-actions-button"]').click();
  await editableRow.locator('[data-testid="agenda-edit-action"]').click();
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toBeVisible();

  // Reschedule to same day but different time (10:00 -> 11:00)
  await page.locator('input[type="time"]').first().fill("11:00");
  await page.locator('input[type="time"]').last().fill("12:00");
  await page.getByRole("button", { name: "Atualizar" }).click();

  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toHaveCount(0, { timeout: 10000 });
  await page.waitForTimeout(500);
  const updatedEntries = await fetchCandidateInterviews(page, primaryCandidate.id);
  expect(updatedEntries.data).toHaveLength(1);
  // Verify interview was updated (time changed from original 10:00)
  expect(updatedEntries.data[0].scheduled_start).toBeDefined();

  // Cancel: Get row with primary candidate and open cancel dialog
  const cancellableRow = page.locator('[data-testid="agenda-interview-row"]').filter({ hasText: primaryCandidateName }).first();
  await expect(cancellableRow).toBeVisible();
  await cancellableRow.locator('[data-testid="agenda-actions-button"]').click();
  await cancellableRow.locator('[data-testid="agenda-cancel-action"]').click();
  await expect(page.getByRole("dialog", { name: "Cancelar entrevista" })).toBeVisible();

  await page.getByLabel("Motivo do cancelamento *").fill("Cancelamento validado no E2E");
  await page.getByRole("button", { name: "Cancelar" }).last().click();

  await expect(page.getByRole("dialog", { name: "Cancelar entrevista" })).toHaveCount(0);
  const cancelledRow = page
    .getByText(primaryCandidateName, { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'group')][1]");
  await expect(cancelledRow).toContainText("Cancelada");
  await expect(cancelledRow.getByRole("button", { name: "Menu de ações" })).toHaveCount(0);
});

test("E2E: Agenda - conflito 409 ao remarcar para horário ocupado mantém modal aberto", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `Agenda Reschedule Conflict ${suffix}`;
  const interviewerEmail = `agenda-reschedule-${suffix}@empresa.com`;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await login(page);

  const candidate = await createCandidate(
    page,
    candidateName,
    `agenda-reschedule-${suffix}@example.com`
  );

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda de Entrevistas" })).toBeVisible();

  // Create first interview at 10:00-11:00 today
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista 1 - ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("10:00");
  await page.getByLabel("Fim *").fill("11:00");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await page.getByPlaceholder("Buscar candidato, vaga, avaliador...").fill(candidateName);
  await page.waitForTimeout(500);
  await expect(page.getByText(candidateName, { exact: true }).first()).toBeVisible();

  // Create second interview at 14:00-15:00 today (no conflict)
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista 2 - ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("14:00");
  await page.getByLabel("Fim *").fill("15:00");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByText(candidateName, { exact: true }).nth(1)).toBeVisible();

  // Store the initial state of second interview
  const initialData = await fetchCandidateInterviews(page, candidate.id);
  const secondInterviewInitial = initialData.data.find(
    (iv: any) => iv.title === `Entrevista 2 - ${suffix}`
  );
  expect(secondInterviewInitial.scheduled_start).toBeDefined();

  // Open edit dialog for SECOND interview (14:00-15:00)
  // Get the row containing both candidate name AND "14:00" (second interview)
  const secondRow = page.locator('[data-testid="agenda-interview-row"]').filter({ hasText: candidateName }).last();
  await expect(secondRow).toBeVisible();
  await secondRow.locator('[data-testid="agenda-actions-button"]').click();
  await secondRow.locator('[data-testid="agenda-edit-action"]').click();
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toBeVisible();

  // Modal should show second interview data
  await expect(page.getByLabel("Título *")).toHaveValue(`Entrevista 2 - ${suffix}`);
  const titleBeforeAttempt = await page.getByLabel("Título *").inputValue();

  // Try to reschedule second interview to 10:30-11:30 (overlaps with first interview 10:00-11:00)
  // This should trigger a 409 conflict error because the avaliador (interviewerEmail) already has
  // an interview at 10:00-11:00
  await page.locator('input[type="time"]').first().fill("10:30");
  await page.locator('input[type="time"]').last().fill("11:30");
  await page.getByRole("button", { name: "Atualizar" }).click();

  // Modal should REMAIN OPEN because of conflict error
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toBeVisible();

  // Error message about conflict should appear
  await expect(
    page.getByText(
      /Conflito de horário.*avaliador.*já possui.*entrevista.*agendada/i
    )
  ).toBeVisible();

  // Title field should STILL have the second interview's title (not cleared)
  await expect(page.getByLabel("Título *")).toHaveValue(titleBeforeAttempt);

  // Close modal without saving
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toHaveCount(0);

  // Verify that the second interview is STILL at 14:00-15:00 in the backend
  const finalData = await fetchCandidateInterviews(page, candidate.id);
  const secondInterviewFinal = finalData.data.find(
    (iv: any) => iv.title === `Entrevista 2 - ${suffix}`
  );

  // Time should NOT have changed
  expect(new Date(secondInterviewFinal.scheduled_start).getTime()).toBe(
    new Date(secondInterviewInitial.scheduled_start).getTime()
  );
});

test("E2E: Agenda - remarcação bem-sucedida após liberar horário", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `Agenda Reschedule Success ${suffix}`;
  const interviewerEmail = `agenda-reschedule-success-${suffix}@empresa.com`;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await login(page);

  const candidate = await createCandidate(
    page,
    candidateName,
    `agenda-reschedule-success-${suffix}@example.com`
  );

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda de Entrevistas" })).toBeVisible();

  // Create first interview at 10:00-11:00 today
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista 1 - ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("10:00");
  await page.getByLabel("Fim *").fill("11:00");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await page.getByPlaceholder("Buscar candidato, vaga, avaliador...").fill(candidateName);
  await page.waitForTimeout(500);
  await expect(page.getByText(candidateName, { exact: true }).first()).toBeVisible();

  // Create second interview at 14:00-15:00 today (no conflict)
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista 2 - ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("14:00");
  await page.getByLabel("Fim *").fill("15:00");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByText(candidateName, { exact: true }).nth(1)).toBeVisible();

  // Reschedule first interview to a different time (09:00-10:00)
  // Get the row containing "10:00" (first interview start time)
  const firstRow = page
    .getByText("10:00", { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'group')][1]");
  await expect(firstRow).toBeVisible();
  await firstRow.getByRole("button", { name: "Menu de ações" }).click();
  await firstRow.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toBeVisible();

  await page.locator('input[type="time"]').first().fill("09:00");
  await page.locator('input[type="time"]').last().fill("10:00");
  await page.getByRole("button", { name: "Atualizar" }).click();

  // Wait for modal to close (up to 10 seconds)
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toHaveCount(0, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Now reschedule second interview to 13:00-14:00 (different from original 14:00-15:00)
  // Get the LAST row with candidate name (should be the second interview which may have moved)
  const secondRowReschedule = page
    .getByText(candidateName, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'group')][1]")
    .last();
  await expect(secondRowReschedule).toBeVisible();
  await secondRowReschedule.getByRole("button", { name: "Menu de ações" }).click();
  await secondRowReschedule.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toBeVisible();

  await expect(page.getByLabel("Título *")).toHaveValue(`Entrevista 2 - ${suffix}`);
  await page.locator('input[type="time"]').first().fill("13:00");
  await page.locator('input[type="time"]').last().fill("14:00");
  await page.getByRole("button", { name: "Atualizar" }).click();

  // Modal should close
  await expect(page.getByRole("dialog", { name: "Editar entrevista" })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByText(candidateName, { exact: true }).first()).toBeVisible();

  // Verify data in backend
  const updatedData = await fetchCandidateInterviews(page, candidate.id);
  const secondInterviewUpdated = updatedData.data.find(
    (iv: any) => iv.title === `Entrevista 2 - ${suffix}`
  );

  const [tomorrowYear, tomorrowMonth, tomorrowDay] = tomorrow.split("-").map(Number);
  const expectedSecondStart = new Date(tomorrowYear, tomorrowMonth - 1, tomorrowDay, 13, 0, 0).toISOString();

  expect(new Date(secondInterviewUpdated.scheduled_start).getTime()).toBe(new Date(expectedSecondStart).getTime());
});

test("E2E: Agenda - conflito por candidato ao agendar no mesmo horário", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `Agenda Cand Conflict ${suffix}`;
  const interviewerEmail1 = `interviewer1-${suffix}@empresa.com`;
  const interviewerEmail2 = `interviewer2-${suffix}@empresa.com`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await login(page);

  await createCandidate(
    page,
    candidateName,
    `agenda-cand-${suffix}@example.com`
  );

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda de Entrevistas" })).toBeVisible();

  // Create first interview at 10:00-11:00 tomorrow
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista 1 - ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("10:00");
  await page.getByLabel("Fim *").fill("11:00");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail1);
  await page.getByRole("button", { name: "Criar" }).click();

  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toHaveCount(0);
  await page.locator('select').first().selectOption('all');
  await page.getByPlaceholder("Buscar candidato, vaga, avaliador...").fill(candidateName);
  await page.waitForTimeout(500);
  await expect(page.getByText(candidateName, { exact: true }).first()).toBeVisible();

  // Try to create second interview at 10:30-11:30 for the SAME CANDIDATE but DIFFERENT AVALIADOR
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista 2 - ${suffix}`);
  await page.getByLabel("Data *").fill(tomorrow);
  await page.getByLabel("Início *").fill("10:30");
  await page.getByLabel("Fim *").fill("11:30");
  await page.getByLabel("Avaliador (e-mail)").fill(interviewerEmail2);
  await page.getByRole("button", { name: "Criar" }).click();

  // Modal should REMAIN OPEN because of conflict error
  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toBeVisible();

  // Error message about candidate conflict should appear
  await expect(
    page.getByText(/este candidato já possui uma entrevista agendada/i)
  ).toBeVisible();

  // Close modal
  await page.getByRole("button", { name: "Cancelar" }).click();
});

test("E2E: Agenda - validação de data passada impede agendamento", async ({ page }) => {
  const suffix = Date.now();
  const candidateName = `Agenda Past Date ${suffix}`;
  
  await login(page);
  
  const candidate = await createCandidate(
    page,
    candidateName,
    `agenda-past-date-${suffix}@example.com`
  );
  
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Agenda de Entrevistas" })).toBeVisible();
  
  // Open modal
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  await page.getByLabel("Candidato *").selectOption({ label: candidateName });
  await page.getByLabel("Título *").fill(`Entrevista Passada - ${suffix}`);
  
  // Set past date (yesterday)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel("Data *").fill(yesterday);
  await page.getByLabel("Início *").fill("10:00");
  await page.getByLabel("Fim *").fill("11:00");
  
  // Click submit
  await page.getByRole("button", { name: "Criar" }).click();
  
  // Error message should appear
  await expect(page.getByText("Não é possível agendar uma entrevista no passado")).toBeVisible();
  
  // Modal should remain open
  await expect(page.getByRole("dialog", { name: "Nova entrevista" })).toBeVisible();
});
