import {
  expect,
  test,
  type APIResponse,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test';

const PORTAL_BASE_URL =
  process.env.CANDIDATE_PORTAL_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  'http://localhost:5174';

const PUBLIC_API_BASE_URL =
  process.env.CANDIDATE_PORTAL_PUBLIC_API_BASE_URL ??
  process.env.VITE_PUBLIC_API_BASE_URL ??
  'http://localhost:8000/api/v1/public';

const E2E_CANDIDATE_EMAIL = process.env.E2E_CANDIDATE_EMAIL ?? '';
const E2E_CANDIDATE_PASSWORD = process.env.E2E_CANDIDATE_PASSWORD ?? '';
const DEV_CANDIDATE_LOGIN_ENABLED =
  process.env.VITE_ENABLE_DEV_CANDIDATE_LOGIN === 'true' ||
  process.env.E2E_DEV_CANDIDATE_LOGIN === '1';
const DEV_CANDIDATE_EMAIL =
  process.env.E2E_DEV_CANDIDATE_EMAIL ?? 'dev-candidato@local.test';
const DEV_CANDIDATE_NAME =
  process.env.E2E_DEV_CANDIDATE_NAME ?? 'Candidato Teste';
const SMOKE_UNKNOWN_EMAIL =
  process.env.E2E_UNKNOWN_CANDIDATE_EMAIL ?? 'candidate-portal-smoke-no-account@redemarajo.com.br';
const RECOVERY_EMAIL = E2E_CANDIDATE_EMAIL || SMOKE_UNKNOWN_EMAIL;

const DUPLICATE_JOB_ID = process.env.E2E_JOB_ID ?? '';
const DUPLICATE_CANDIDATE_NAME = process.env.E2E_EXISTING_CANDIDATE_NAME ?? '';
const DUPLICATE_CANDIDATE_EMAIL = process.env.E2E_EXISTING_CANDIDATE_EMAIL ?? '';
const DUPLICATE_CANDIDATE_CPF = process.env.E2E_EXISTING_CANDIDATE_CPF ?? '';
const DUPLICATE_CANDIDATE_PHONE = process.env.E2E_EXISTING_CANDIDATE_PHONE ?? '';
const DUPLICATE_CANDIDATE_CITY = process.env.E2E_EXISTING_CANDIDATE_CITY ?? 'Goiânia';
const DUPLICATE_CANDIDATE_STATE = process.env.E2E_EXISTING_CANDIDATE_STATE ?? 'GO';
const DUPLICATE_FORM_PASSWORD = process.env.E2E_DUPLICATE_FORM_PASSWORD ?? 'SenhaSmoke123!';

interface ApiDiagnostic {
  label: string;
  method: string;
  status: number;
  url: string;
  body: string;
}

test.describe('candidate-portal smoke E2E', () => {
  test('backend público está acessível', async ({ request }) => {
    const response = await request.get(`${PUBLIC_API_BASE_URL}/auth/session`);
    expect(response.status(), await safeResponseDiagnostic('auth/session', response)).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toMatchObject({ authenticated: false });
  });

  test('rotas públicas renderizam sem erro crítico de console e sem links #', async ({ page }) => {
    for (const route of ['/', '/login', '/recuperar-acesso', '/definir-senha?token=fake']) {
      const consoleErrors = collectCriticalConsole(page);
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('a[href="#"]')).toHaveCount(0);
      expect(consoleErrors, `Console crítico em ${route}`).toEqual([]);
      clearCriticalConsole(page);
    }
  });

  test('/minha-area sem sessão redireciona para login sem loop visual', async ({ page }) => {
    await page.goto('/minha-area');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Acesse sua área' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);

    const stableUrl = page.url();
    await page.waitForTimeout(500);
    expect(page.url()).toBe(stableUrl);
  });

  test('login inválido mostra mensagem segura sem vazar existência de cadastro', async ({ page }) => {
    await page.goto('/login');
    // exact: true para não colidir com o campo "E-mail do candidato de teste"
    // do bloco dev-login, que aparece quando VITE_ENABLE_DEV_CANDIDATE_LOGIN=true em dev.
    await page.getByLabel('E-mail', { exact: true }).fill(SMOKE_UNKNOWN_EMAIL);
    await page.getByLabel('Senha').fill('SenhaInvalida123');

    const loginResponsePromise = waitForApiResponse(page, '/auth/login');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const loginResponse = await loginResponsePromise;

    expect(loginResponse.status(), await safeResponseDiagnostic('auth/login', loginResponse)).toBe(401);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/E-mail ou senha inválidos/i);
    await expect(alert).not.toContainText(/não existe|cadastrado|encontrado/i);
  });

  test('recuperar acesso sempre mostra resposta pública genérica', async ({ page }) => {
    await page.goto('/recuperar-acesso');
    await page.getByLabel('E-mail').fill(RECOVERY_EMAIL);

    const recoveryResponsePromise = waitForApiResponse(page, '/auth/request-password-setup');
    await page.getByRole('button', { name: 'Enviar instruções' }).click();
    const recoveryResponse = await recoveryResponsePromise;

    expect(recoveryResponse.status(), await safeResponseDiagnostic('auth/request-password-setup', recoveryResponse)).toBe(200);
    await expect(page.getByText(/Se houver um cadastro com este e-mail/i)).toBeVisible();
  });

  test('login real cria cookie HttpOnly e carrega /me e /me/applications', async ({ page, context }) => {
    test.skip(
      !E2E_CANDIDATE_EMAIL || !E2E_CANDIDATE_PASSWORD,
      'Defina E2E_CANDIDATE_EMAIL e E2E_CANDIDATE_PASSWORD para rodar o smoke de login real.',
    );

    const diagnostics = captureApiDiagnostics(page, [
      ['/auth/login', 'auth/login'],
      ['/candidate-portal/me/applications', 'candidate-portal/me/applications'],
      ['/candidate-portal/me', 'candidate-portal/me'],
    ]);

    await page.goto('/login');
    // exact: true para não colidir com o campo dev-login "E-mail do candidato de teste".
    await page.getByLabel('E-mail', { exact: true }).fill(E2E_CANDIDATE_EMAIL);
    await page.getByLabel('Senha').fill(E2E_CANDIDATE_PASSWORD);

    const loginResponsePromise = waitForApiResponse(page, '/auth/login');
    const meResponsePromise = waitForExactApiPath(page, '/candidate-portal/me');
    const applicationsResponsePromise = waitForApiResponse(page, '/candidate-portal/me/applications');

    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const loginResponse = await loginResponsePromise;
    assertOkResponse(loginResponse, diagnostics, 'Falha no POST /auth/login');

    await expect(page).toHaveURL(/\/minha-area$/);
    const [meResponse, applicationsResponse] = await Promise.all([
      meResponsePromise,
      applicationsResponsePromise,
    ]);
    assertOkResponse(meResponse, diagnostics, 'Falha no GET /candidate-portal/me');
    assertOkResponse(
      applicationsResponse,
      diagnostics,
      'Falha no GET /candidate-portal/me/applications',
    );

    const cookies = await context.cookies(PUBLIC_API_BASE_URL);
    const sessionCookie = cookies.find((cookie) => cookie.name === 'candidate_portal_token');
    expect(Boolean(sessionCookie), 'cookie candidate_portal_token deve existir').toBe(true);
    expect(sessionCookie?.httpOnly, 'cookie de sessão deve ser HttpOnly').toBe(true);

    await expect(page.getByText('Área do candidato')).toBeVisible();
    await expect(page.getByText('Minhas candidaturas')).toBeVisible();
    await expect(
      page.getByText(/Nenhuma candidatura ativa|Ver detalhes/i).first(),
    ).toBeVisible();
  });


  test('candidatura duplicada 409 mostra CTAs seguros', async ({ page }) => {
    test.skip(
      !DUPLICATE_JOB_ID ||
        !DUPLICATE_CANDIDATE_NAME ||
        !DUPLICATE_CANDIDATE_EMAIL ||
        !DUPLICATE_CANDIDATE_CPF ||
        !DUPLICATE_CANDIDATE_PHONE,
      'Defina E2E_JOB_ID, E2E_EXISTING_CANDIDATE_NAME, E2E_EXISTING_CANDIDATE_EMAIL, E2E_EXISTING_CANDIDATE_CPF e E2E_EXISTING_CANDIDATE_PHONE para rodar o smoke de candidatura 409.',
    );

    await page.goto(`/candidatar/${DUPLICATE_JOB_ID}`);
    await expect(page.getByRole('heading', { name: /Candidatar-se/i })).toBeVisible();

    await page.getByLabel('Nome completo').fill(DUPLICATE_CANDIDATE_NAME);
    await page.getByLabel('CPF').fill(DUPLICATE_CANDIDATE_CPF);
    await page.getByLabel('E-mail').fill(DUPLICATE_CANDIDATE_EMAIL);
    await page.getByLabel('Telefone').fill(DUPLICATE_CANDIDATE_PHONE);
    await page.getByLabel('Cidade').fill(DUPLICATE_CANDIDATE_CITY);
    await page.getByLabel('Estado').selectOption(DUPLICATE_CANDIDATE_STATE);
    await page.getByLabel('Pretensão salarial').fill('R$ 5.000,00');
    await page.locator('#candidate-password').fill(DUPLICATE_FORM_PASSWORD);
    await page.getByLabel('Confirme a senha').fill(DUPLICATE_FORM_PASSWORD);
    await page.getByLabel('CLT').check();
    await page.getByRole('button', { name: /Próximo/i }).click();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'curriculo-smoke.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
    });
    await page.getByRole('button', { name: /Próximo/i }).click();

    await page.getByLabel(/Autorizo o uso dos meus dados/i).check();
    const applyResponsePromise = waitForApiResponse(page, '/candidates/apply');
    await page.getByRole('button', { name: 'Enviar candidatura' }).click();
    const applyResponse = await applyResponsePromise;

    expect(applyResponse.status(), await safeResponseDiagnostic('candidates/apply', applyResponse)).toBe(409);
    await expect(page).not.toHaveURL(/\/sucesso/);
    await expect(page.getByText(/Já existe um cadastro|candidatura em andamento/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Entrar na área do candidato/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Recuperar ou criar senha/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ver vagas abertas/i })).toBeVisible();
  });
});

function collectCriticalConsole(page: Page): string[] {
  const errors: string[] = [];
  const listener = (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (isIgnoredConsoleError(text)) return;
    errors.push(sanitizeDiagnosticText(text));
  };
  page.on('console', listener);
  page.once('close', () => page.off('console', listener));
  return errors;
}

function clearCriticalConsole(page: Page) {
  page.removeAllListeners('console');
}

function isIgnoredConsoleError(text: string) {
  return (
    text.includes('accounts.google.com/gsi/client') ||
    text.includes('Failed to load resource') && text.includes('favicon')
  );
}

function waitForApiResponse(page: Page, pathFragment: string) {
  return page.waitForResponse((response) => {
    return response.url().includes(pathFragment);
  });
}

function waitForExactApiPath(page: Page, expectedPath: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(expectedPath);
  });
}

function captureApiDiagnostics(page: Page, targets: Array<[string, string]>) {
  const diagnostics: ApiDiagnostic[] = [];
  page.on('response', async (response) => {
    const match = targets.find(([path]) => response.url().includes(path));
    if (!match) return;
    diagnostics.push({
      label: match[1],
      method: response.request().method(),
      status: response.status(),
      url: sanitizeDiagnosticText(response.url()),
      body: await safeResponseBody(response),
    });
  });
  return diagnostics;
}

function assertOkResponse(response: Response, diagnostics: ApiDiagnostic[], message: string) {
  if (response.ok()) return;
  throw new Error(`${message}\n${formatDiagnostics(diagnostics)}`);
}

async function safeResponseDiagnostic(label: string, response: Response | APIResponse) {
  return `${label} ${response.status()} ${sanitizeDiagnosticText(response.url())}\n${await safeResponseBody(response)}`;
}

async function safeResponseBody(response: Response | APIResponse) {
  try {
    const text = await response.text();
    return sanitizeDiagnosticText(text).slice(0, 700);
  } catch {
    return '[body indisponível]';
  }
}

function formatDiagnostics(diagnostics: ApiDiagnostic[]) {
  if (!diagnostics.length) return 'Sem respostas de API capturadas.';
  return diagnostics
    .map((item) => {
      return [
        `${item.method} ${item.label}`,
        `status=${item.status}`,
        `url=${item.url}`,
        `body=${item.body || '[vazio]'}`,
      ].join('\n');
    })
    .join('\n---\n');
}

function sanitizeDiagnosticText(text: string) {
  return text
    .replace(/candidate_portal_token=([^;\s]+)/gi, 'candidate_portal_token=[redacted]')
    .replace(/("id_token"\s*:\s*)"[^"]+"/gi, '$1"[redacted]"')
    .replace(/("password"\s*:\s*)"[^"]+"/gi, '$1"[redacted]"')
    .replace(/([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi, '[email]');
}
