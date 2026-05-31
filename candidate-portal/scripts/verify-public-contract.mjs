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
const passwordSetup = read('src/pages/PasswordSetupPage.tsx');
const institutional = read('src/pages/InstitutionalPages.tsx');

const expectedRoutes = [
  'path="/"',
  'path="/vagas"',
  'path="/vagas/:identifier"',
  'path="/login"',
  'path="/definir-senha"',
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
  login.includes('Primeiro acesso ou esqueci minha senha'),
  'Login first access CTA missing',
);
assert.ok(
  login.includes('candidateAuthService.requestPasswordSetup'),
  'Login must call real password setup request service',
);
assert.ok(
  passwordSetup.includes('candidateAuthService.confirmPasswordSetup'),
  'Password setup page must call real password setup confirm service',
);
assert.ok(
  applicationForm.includes('Já existe um cadastro com estes dados'),
  'Application 409 guidance missing',
);
assert.ok(
  applicationForm.includes('to="/login?firstAccess=1"'),
  'Application 409 first access link missing',
);

process.stdout.write('candidate-portal public contract checks passed\n');
