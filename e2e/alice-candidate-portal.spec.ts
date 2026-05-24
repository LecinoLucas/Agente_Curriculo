import { expect, test, type APIRequestContext } from "@playwright/test";
import { API_BASE_URL } from "./helpers/api";
import { buildPdfBuffer } from "./helpers/pdf";

// Portal do candidato — roda no project "unauthenticated":
// não usa storageState admin, faz signup público próprio, valida login
// pelo formulário do candidato e a renderização do portal.

interface PortalCandidateSeed {
  fullName: string;
  firstName: string;
  email: string;
  cpf: string;
  password: string;
}

function buildPortalSeed(suffix: number): PortalCandidateSeed {
  // CPF 11 dígitos, único por execução. O backend só normaliza (strip), sem
  // validação semântica do dígito verificador.
  const cpf = String(10_000_000_000 + (suffix % 89_999_999_999));
  return {
    fullName: `Alice Portal QA ${suffix}`,
    firstName: "Alice",
    email: `alice.portal.${suffix}@example.com`,
    cpf,
    password: "PortalAlice@1234",
  };
}

async function applyPublicCandidate(
  request: APIRequestContext,
  seed: PortalCandidateSeed,
): Promise<void> {
  const resume = buildPdfBuffer(
    [
      `Currículo de ${seed.fullName}`,
      "Resumo: Profissional generalista, 3+ anos em projetos digitais.",
      "Skills: Comunicação, organização, trabalho em equipe.",
    ].join("\n"),
  );

  const res = await request.post(`${API_BASE_URL}/api/v1/public/candidates/apply`, {
    multipart: {
      full_name: seed.fullName,
      cpf: seed.cpf,
      email: seed.email,
      phone: "81999990000",
      city: "Recife",
      state: "PE",
      salary_expectation: "5000",
      desired_contract_type: "CLT",
      works_at_marajo_group: "false",
      password: seed.password,
      confirm_password: seed.password,
      lgpd_consent: "true",
      resume_file: {
        name: "portal-resume.pdf",
        mimeType: "application/pdf",
        buffer: resume,
      },
    },
  });
  expect(
    res.ok(),
    `POST /public/candidates/apply HTTP ${res.status()} body=${await res.text()}`,
  ).toBeTruthy();
}

test("portal do candidato: cadastro público + login + renderização", async ({ page, request }) => {
  const suffix = Date.now();
  const seed = buildPortalSeed(suffix);

  // ── seed: candidato público (sem job_id) ──
  // O endpoint aceita job_id opcional; sem ele, o candidato fica em
  // "Aguardando vaga" e o portal renderiza a visão base.
  // Importante: usamos `request` (APIRequestContext isolado) para que o
  // cookie de sessão da apply NÃO contamine o `page`, garantindo que o
  // teste exercite o fluxo real de login pelo formulário do candidato.
  await applyPublicCandidate(request, seed);

  // ── login candidato pela UI ──
  await page.goto("/candidato/login");
  await expect(
    page.getByRole("heading", { name: /Entrar no Portal/i }),
  ).toBeVisible();

  await page.getByLabel("E-mail").fill(seed.email);
  await page.getByLabel("Senha").fill(seed.password);
  await page.getByRole("button", { name: /Acessar minha conta/i }).click();

  await page.waitForURL(/\/candidato\/portal/);

  // ── portal autenticado renderiza dados próprios ──
  // Header de saudação usa o primeiro nome (`full_name.split(' ')[0]`).
  await expect(
    page.getByRole("heading", { name: new RegExp(`Olá, ${seed.firstName}`) }),
  ).toBeVisible();

  // Sidebar navegável: 4 abas que existem hoje no portal.
  for (const tab of ["Início", "Minhas Candidaturas", "Avaliações", "Meu Perfil"]) {
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
  }

  // Resumo da situação aparece na aba inicial — confirma que o overview
  // foi carregado (status_public exibido, cards renderizados).
  await expect(page.getByText("Resumo da Situação")).toBeVisible();

  // Botão de logout sempre presente — protege contra portal que carrega
  // sem o shell.
  await expect(page.getByRole("button", { name: /Sair/ })).toBeVisible();

  // ── aba Avaliações: como não há job vinculado, o estado é determinístico ──
  await page.getByRole("button", { name: "Avaliações", exact: true }).click();
  await expect(
    page.getByText(/Nenhuma avaliação pendente no momento\./i),
  ).toBeVisible();
});
