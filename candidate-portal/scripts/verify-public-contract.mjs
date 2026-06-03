import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const router = read('src/routes/CandidatePortalRouter.tsx');
const header = read('src/components/layout/PublicHeader.tsx');
const footer = read('src/components/layout/PublicFooter.tsx');
const applicationForm = read('src/pages/ApplicationFormPage.tsx');
const login = read('src/pages/CandidateLoginPage.tsx');
const recoverAccess = read('src/pages/RecoverAccessPage.tsx');
const passwordSetup = read('src/pages/PasswordSetupPage.tsx');
const institutional = read('src/pages/InstitutionalPages.tsx');
const faqPage = read('src/pages/InstitutionalPages.tsx');
const jobsPage = read('src/pages/PublicJobsPage.tsx');
const candidatePortalService = read('src/services/candidatePortalService.ts');
const publicApplicationService = read('src/services/publicApplicationService.ts');
const candidateHome = read('src/pages/CandidateHomePage.tsx');
const successPage = read('src/pages/ApplicationSuccessPage.tsx');
const appSource = read('src/App.tsx');
const salaryExpectation = read('src/utils/salaryExpectation.ts');

const expectedRoutes = [
  'path="/"',
  'path="/vagas"',
  'path="/vagas/:identifier"',
  'path="/login"',
  'path="/recuperar-acesso"',
  'path="/definir-senha"',
  'path="/completar-cadastro"',
  'path="/sobre-nos"',
  'path="/unidades"',
  'path="/duvidas-frequentes"',
  'path="/contato"',
  'path="/privacidade"',
  'path="/termos"',
  'path="/minha-area"',
];

for (const route of expectedRoutes) {
  assert.ok(router.includes(route), `Missing route ${route}`);
}

const sourceWithLinks = [header, footer, applicationForm].join('\n');
assert.equal(/href=["']#["']|to=["']#["']|href:\s*["']#["']/.test(sourceWithLinks), false, 'Placeholder # link found');

const expectedLinks = [
  "href: '/'",
  "href: '/vagas'",
  "href: '/sobre-nos'",
  "href: '/unidades'",
  "href: '/duvidas-frequentes'",
  "href: '/contato'",
  'to="/privacidade"',
  'to="/termos"',
  'to="/login"',
];

for (const link of expectedLinks) {
  assert.ok(sourceWithLinks.includes(link), `Missing public link ${link}`);
}

for (const page of ['AboutPage', 'UnitsPage', 'FaqPage', 'ContactPage', 'PrivacyPage', 'TermsPage']) {
  assert.ok(institutional.includes(`export function ${page}`), `Missing ${page}`);
}

assert.ok(login.includes('Informe um e-mail válido'), 'Login email validation message missing');
assert.ok(login.includes('Informe sua senha'), 'Login password validation message missing');
assert.ok(login.includes('candidateAuthService.login'), 'Login must call real auth service');
assert.equal(login.includes("navigate('/minha-area')"), true, 'Login success must navigate to /minha-area');
assert.ok(
  login.includes('Recuperar ou criar senha de acesso'),
  'Login recovery CTA must clarify it is for existing candidates, not new registration',
);
assert.ok(
  recoverAccess.includes('candidateAuthService.requestPasswordSetup'),
  'RecoverAccessPage must call real password setup request service',
);
assert.ok(
  passwordSetup.includes('candidateAuthService.confirmPasswordSetup'),
  'Password setup page must call real password setup confirm service',
);
assert.ok(
  applicationForm.includes('Já existe um cadastro ou candidatura com estes dados'),
  'Application 409 guidance missing',
);
assert.ok(
  applicationForm.includes('to="/recuperar-acesso"'),
  'Application 409 must link to /recuperar-acesso for first access / password recovery',
);

// ── CP-C8A: Google Login integration ─────────────────────────────────────────
const candidateAuthServiceSrc = read('src/services/candidateAuthService.ts');

assert.ok(
  candidateAuthServiceSrc.includes('loginWithGoogle'),
  'candidateAuthService must export loginWithGoogle method',
);
assert.ok(
  candidateAuthServiceSrc.includes('/auth/google'),
  'loginWithGoogle must call POST /auth/google backend endpoint',
);
assert.ok(
  candidateAuthServiceSrc.includes('id_token'),
  'loginWithGoogle must send id_token in request body',
);
assert.ok(
  login.includes('VITE_GOOGLE_CLIENT_ID'),
  'Login page must read VITE_GOOGLE_CLIENT_ID to gate the Google button',
);
assert.ok(
  login.includes('loginWithGoogle'),
  'Login page must call loginWithGoogle on Google credential response',
);
assert.ok(
  login.includes('needs_completion'),
  'Login page must handle needs_completion response from Google auth',
);
assert.ok(
  !login.includes('localStorage') && !login.includes('sessionStorage'),
  'Login page must not persist id_token or Google state in browser storage',
);
// The id_token must never appear in a URL (no href containing the token)
assert.equal(
  /href=.*credential|href=.*id_token/.test(login),
  false,
  'Login page must not expose id_token in any URL',
);

// ── CP-C8: Clarified login / signup UX ───────────────────────────────────────
assert.ok(
  login.includes('Recuperar ou criar senha de acesso'),
  'Login recovery button must use clarified label (not "Primeiro acesso")',
);
assert.ok(
  login.includes('já enviou uma candidatura'),
  'Login must explain recovery is for candidates who already applied',
);
assert.ok(
  applicationForm.includes('Crie sua senha de acesso'),
  'Application form password label must clarify this creates portal access',
);
assert.ok(
  applicationForm.includes('Minha Área'),
  'Application form must mention Minha Área so candidate knows why they need a password',
);

// ── CP-B2: Duplicate job conflict ─────────────────────────────────────────────
assert.ok(
  applicationForm.includes('duplicateJobConflict'),
  'Application form must handle duplicate job (409 candidatura em andamento) separately',
);
assert.ok(
  applicationForm.includes('to="/minha-area"'),
  'Application form must offer link to /minha-area for duplicate job conflict',
);

// ── CP-B3: Minha Área — analysis status ──────────────────────────────────────
assert.ok(
  candidatePortalService.includes('analysis_status'),
  'candidatePortalService must read analysis_status from API response',
);
assert.ok(
  candidatePortalService.includes('analysisStatus'),
  'candidatePortalService must expose analysisStatus in CandidateOverview',
);
assert.ok(
  candidateHome.includes('analysisStatus'),
  'CandidateHomePage must display analysisStatus from real application data',
);
assert.ok(
  candidatePortalService.includes('getAnalysisStatusInfo') ||
  candidateHome.includes('ANALYSIS_STATUS_MAP'),
  'Analysis status info must be defined in service (getAnalysisStatusInfo) or inline map',
);
assert.ok(
  candidateHome.includes('AnalysisStatusBadge') ||
  candidateHome.includes('AnalysisStatusIndicator'),
  'CandidateHomePage must have an analysis status display component',
);
assert.ok(
  successPage.includes('analysisAutoRequested'),
  'ApplicationSuccessPage must conditionally show analysis message based on analysisAutoRequested',
);
assert.ok(
  successPage.includes('to="/minha-area"'),
  'ApplicationSuccessPage must link to /minha-area',
);

// ── CP-B6: Session-aware landing banner ──────────────────────────────────────
assert.ok(
  jobsPage.includes('useCandidateSession'),
  'PublicJobsPage must use useCandidateSession to gate banner by auth state',
);
assert.ok(
  jobsPage.includes('candidateName'),
  'PublicJobsPage must conditionally render based on candidateName',
);
assert.ok(
  jobsPage.includes('to="/minha-area"'),
  'PublicJobsPage must have /minha-area link for authenticated users',
);
assert.ok(
  jobsPage.includes('to="/login"'),
  'PublicJobsPage must still have /login link for unauthenticated users',
);

// ── CP-B5: Public entry, login CTAs, institutional pages, no placeholder links ─
// Required FAQ questions per spec
assert.ok(
  faqPage.includes('análise em andamento'),
  'FAQ must explain "analysis in-progress" status',
);
assert.ok(
  faqPage.includes('acompanho minha candidatura') || faqPage.includes('Como acompanho'),
  'FAQ must answer how to track a candidacy',
);
assert.ok(
  faqPage.includes('Esqueci minha senha') || faqPage.includes('não consigo acessar'),
  'FAQ must address forgotten password / access issues',
);
assert.ok(
  faqPage.includes('candidatar novamente') || faqPage.includes('candidatar-me novamente'),
  'FAQ must address reapplication',
);

// Login must offer new candidate CTA to job listing
assert.ok(
  login.includes('to="/vagas"') || login.includes("href: '/vagas'"),
  'Login page must link to job listing for new candidates',
);

// Application form LGPD consent must link to real route, not "#"
assert.ok(
  applicationForm.includes('to="/privacidade"'),
  'Application form LGPD link must point to real /privacidade route, never "#"',
);
assert.ok(
  applicationForm.includes('target="_blank"') &&
    applicationForm.includes('rel="noopener noreferrer"'),
  'Application form LGPD privacy link must open in a new tab safely',
);
assert.equal(
  applicationForm.includes('href="#"') || applicationForm.includes('to="#"'),
  false,
  'Application form must have no placeholder # links',
);

// ── CP-C5A: Public application UX quick fixes ────────────────────────────────
assert.ok(
  applicationForm.includes("type={showPassword ? 'text' : 'password'}"),
  'Application form password field must toggle between password and text',
);
assert.ok(
  applicationForm.includes('type="button"'),
  'Application form password visibility toggle must not submit the form',
);
assert.ok(
  applicationForm.includes("'Ocultar senha'") && applicationForm.includes("'Mostrar senha'"),
  'Application form password visibility toggle must have accessible labels',
);
assert.ok(
  applicationForm.includes('EyeOff') && applicationForm.includes('Eye'),
  'Application form password visibility toggle must use Eye/EyeOff icons',
);

// ── CP-C5B: Salary expectation step validation and BRL mask ──────────────────
assert.ok(
  applicationForm.includes('getSalaryExpectationError(f.salary_expectation)'),
  'Salary expectation must be validated in step 1 before advancing',
);
assert.ok(
  applicationForm.includes('const step1Error = validateStep1(form)'),
  'Final submit must still run step 1 validation defensively',
);
assert.ok(
  applicationForm.includes('error={salaryExpectationError}'),
  'Salary expectation validation must render as an inline field error',
);
assert.ok(
  applicationForm.includes('placeholder="Ex: R$ 2.500,00"'),
  'Salary expectation must keep the BRL placeholder example',
);
assert.ok(
  applicationForm.includes('inputMode="numeric"') || applicationForm.includes('inputMode="decimal"'),
  'Salary expectation must use a mobile-friendly numeric inputMode',
);
assert.ok(
  applicationForm.includes('formatSalaryExpectationInput(e.target.value)'),
  'Salary expectation input must apply the BRL mask while typing',
);
assert.ok(
  salaryExpectation.includes('Informe sua pretensão salarial para continuar.'),
  'Blank salary expectation must use the step-blocking required message',
);
assert.ok(
  salaryExpectation.includes('Informe uma pretensão salarial válida.'),
  'Invalid salary expectation must use the invalid value message',
);
assert.ok(
  publicApplicationService.includes('normalizeSalaryExpectationForApi(payload.salary_expectation)'),
  'Public application payload must normalize masked salary before FormData append',
);
assert.equal(
  publicApplicationService.includes("fd.append('salary_expectation', payload.salary_expectation.trim())"),
  false,
  'Public application payload must not send the masked salary string directly',
);

// Success page must have CTA to /minha-area
assert.ok(
  successPage.includes('to="/minha-area"'),
  'Success page must have CTA linking to /minha-area',
);

// Jobs page must guide returning candidates to their area
assert.ok(
  jobsPage.includes('to="/login"') || jobsPage.includes('href="/login"'),
  'Jobs landing page must have a link to login for returning candidates',
);

// ── CP-B4: Analysis polling ───────────────────────────────────────────────────
assert.ok(
  candidatePortalService.includes('IN_PROGRESS_ANALYSIS_STATUSES'),
  'Service must export IN_PROGRESS_ANALYSIS_STATUSES set for polling decisions',
);
assert.ok(
  candidatePortalService.includes('shouldPollAnalysis'),
  'Service must export shouldPollAnalysis utility function',
);
assert.ok(
  candidateHome.includes('shouldPollAnalysis'),
  'CandidateHomePage must use shouldPollAnalysis to gate polling',
);
assert.ok(
  candidateHome.includes('setInterval'),
  'CandidateHomePage must set up polling interval',
);
assert.ok(
  candidateHome.includes('clearInterval'),
  'CandidateHomePage must clean up interval on unmount',
);
assert.ok(
  candidateHome.includes('Atualizando automaticamente'),
  'AnalysisStatusIndicator must show auto-update note while polling',
);

// ── CP-C6: Silent session probe (no 401 on public pages) ─────────────────────
assert.ok(
  appSource.includes('getSession'),
  'App must use getSession() for session hydration, not getOverview()',
);
assert.equal(
  appSource.includes('.getOverview('),
  false,
  'App must NOT call .getOverview() — use getSession() to avoid 401 on public pages',
);
assert.ok(
  candidatePortalService.includes('getSession'),
  'candidatePortalService must export getSession() silent session probe',
);
assert.ok(
  candidatePortalService.includes('/auth/session'),
  'getSession() must call GET /auth/session backend endpoint',
);
assert.ok(
  candidatePortalService.includes('getOverview'),
  'getOverview() must still exist in candidatePortalService for compatibility',
);
assert.ok(
  candidateHome.includes('getMe') && candidateHome.includes('getApplications'),
  'CandidateHomePage must use getMe() and getApplications() for real logged-in data',
);

// ── CP-C3: Session hydration deduplication ───────────────────────────────────
assert.ok(
  candidatePortalService.includes('_overviewInflight'),
  'candidatePortalService must deduplicate concurrent getOverview calls via in-flight guard',
);
assert.ok(
  candidatePortalService.includes('.finally('),
  'candidatePortalService in-flight guard must clear itself in finally to avoid stale cache',
);
// No localStorage or sessionStorage as source of truth
const allSrc = [candidatePortalService, candidateHome, appSource].join('\n');
assert.equal(
  /localStorage\.\w+\(/.test(allSrc),
  false,
  'Service and pages must not use localStorage as auth/data source',
);
assert.equal(
  /sessionStorage\.\w+\(/.test(allSrc),
  false,
  'Service and pages must not use sessionStorage as auth/data source',
);

// ── CP-C2: Minha Área hardening ───────────────────────────────────────────────

// getAnalysisStatusInfo must be exported from the service
assert.ok(
  candidatePortalService.includes('getAnalysisStatusInfo'),
  'candidatePortalService must export getAnalysisStatusInfo',
);
assert.ok(
  candidatePortalService.includes('AnalysisStatusInfo'),
  'candidatePortalService must export AnalysisStatusInfo interface',
);

// CandidateHomePage must use getAnalysisStatusInfo (not inline ANALYSIS_STATUS_MAP)
assert.ok(
  candidateHome.includes('getAnalysisStatusInfo'),
  'CandidateHomePage must use getAnalysisStatusInfo from service',
);
assert.ok(
  !candidateHome.includes('ANALYSIS_STATUS_MAP'),
  'CandidateHomePage must not contain inline ANALYSIS_STATUS_MAP — use service helper',
);

// Empty state must have CTA to job listing
assert.ok(
  candidateHome.includes('Nenhuma candidatura ativa'),
  'CandidateHomePage must have honest empty state message',
);
assert.ok(
  candidateHome.includes('Ver vagas disponíveis'),
  'CandidateHomePage empty state must have CTA to job listing',
);

// Active application must have secondary CTA to browse jobs
assert.ok(
  candidateHome.includes('Ver outras vagas abertas') || candidateHome.includes('Ver vagas abertas'),
  'CandidateHomePage active application must have secondary CTA to browse jobs',
);

// Analysis status muted variant must not say "completed" or mislead
assert.ok(
  candidatePortalService.includes("variant: 'muted'"),
  'Service must define muted variant for failed/cancelled statuses',
);

// Polling must still be present
assert.ok(
  candidateHome.includes('shouldPollAnalysis'),
  'CandidateHomePage must preserve shouldPollAnalysis polling guard',
);
assert.ok(
  candidateHome.includes('setInterval'),
  'CandidateHomePage must preserve polling setInterval',
);

// ── CP-C1: Session audit — hydration and 401 consistency ─────────────────────

// App must quietly probe session on mount for landing hydration
assert.ok(
  appSource.includes('candidatePortalService'),
  'App must import candidatePortalService for session hydration',
);
assert.ok(
  appSource.includes('useEffect'),
  'App must use useEffect for session hydration on mount',
);
assert.ok(
  appSource.includes('.catch'),
  'App session probe must silently ignore errors (401, 403, network)',
);
assert.ok(
  appSource.includes('setCandidateName'),
  'App session probe must update candidateName on success',
);

// /minha-area must redirect to /login on 401
assert.ok(
  candidateHome.includes("navigate('/login')"),
  'CandidateHomePage must redirect to /login on 401',
);

// Polling must redirect to /login on 401
assert.ok(
  candidateHome.includes('status === 401'),
  'CandidateHomePage polling must handle 401 and redirect to /login',
);

// Logout must clear context and navigate to /login
const layoutSource = read('src/components/layout/CandidatePortalLayout.tsx');
assert.ok(
  layoutSource.includes("navigate('/login')"),
  'CandidatePortalLayout logout must navigate to /login',
);
assert.ok(
  layoutSource.includes('setCandidateName(null)'),
  'CandidatePortalLayout logout must clear candidateName from context',
);

// Auth service must call correct backend paths (no hardcoded "#" or broken paths)
const authService = read('src/services/candidateAuthService.ts');
assert.ok(
  authService.includes('/auth/login'),
  'candidateAuthService must call /auth/login',
);
assert.ok(
  authService.includes('/auth/logout'),
  'candidateAuthService must call /auth/logout',
);
assert.ok(
  authService.includes('/auth/request-password-setup'),
  'candidateAuthService must call /auth/request-password-setup',
);
assert.ok(
  authService.includes('/auth/confirm-password-setup'),
  'candidateAuthService must call /auth/confirm-password-setup',
);

// No localStorage or sessionStorage usage as auth source
const allSources = [appSource, candidateHome, authService, candidatePortalService].join('\n');
assert.equal(
  /localStorage\s*\.\s*(getItem|setItem|removeItem)/.test(allSources),
  false,
  'Auth/session code must not use localStorage as auth source',
);
assert.equal(
  /sessionStorage\s*\.\s*(getItem|setItem|removeItem)/.test(allSources),
  false,
  'Auth/session code must not use sessionStorage as auth source',
);

process.stdout.write('candidate-portal public contract checks passed\n');
