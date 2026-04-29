# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: candidate-job-link.spec.ts >> create_candidate_without_job
- Location: e2e/candidate-job-link.spec.ts:82:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: 'Novo candidato' }).getByText('Sem vaga selecionada')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('dialog', { name: 'Novo candidato' }).getByText('Sem vaga selecionada')

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - banner:
        - generic:
          - generic:
            - button:
              - generic: RA
              - generic:
                - paragraph: Marajo RH AI System
                - paragraph: Recrutamento com IA e pipeline operacional
          - navigation:
            - link:
              - /url: /pipeline
              - generic: Pipeline
              - generic: Fluxo e etapas
            - link:
              - /url: /candidatos
              - generic: Candidatos
              - generic: Base de perfis
            - link:
              - /url: /vagas
              - generic: Vagas
              - generic: Oportunidades abertas
            - link:
              - /url: /analises-ia
              - generic: Análises IA
              - generic: Execuções e status
            - link:
              - /url: /admin
              - generic: Painel admin
              - generic: Visão geral
            - link:
              - /url: /admin/usuarios
              - generic: Usuários internos
              - generic: Equipe e acessos
          - generic:
            - button:
              - img
            - button:
              - generic:
                - paragraph: Meu perfil
                - paragraph: Administrador Dev
                - paragraph: Administrador
              - generic: A
            - generic:
              - generic:
                - button:
                  - img
      - main:
        - generic:
          - generic:
            - generic:
              - generic:
                - heading [level=1]: Pipeline
                - paragraph: Acompanhe e mova candidatos entre etapas do processo de admissão.
              - generic:
                - button: Novo candidato
                - button: Atualizar
            - generic:
              - generic:
                - generic:
                  - generic:
                    - text: Vaga
                    - combobox
                  - generic:
                    - generic:
                      - generic: Status
                      - generic:
                        - generic: Publicada
                    - generic:
                      - generic: Senioridade
                      - generic: —
                    - generic:
                      - generic: Modelo
                      - generic: —
                    - generic:
                      - generic: Local
                      - generic: —
                - button [expanded]:
                  - img
                  - generic: Ocultar ranking
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - paragraph: Pipeline da vaga
                      - generic: 0 em processo
                    - heading [level=2]: QA Pipeline Check 1777456792616
                    - paragraph: Abra um card para consultar detalhes do candidato e mover a etapa pelo drawer.
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - generic: Entrada
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Triagem
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Entrevista RH
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Técnica
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Final
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Oferta
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Contratado
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                    - generic:
                      - generic:
                        - generic: Reprovado
                        - generic: "0"
                      - generic:
                        - generic: Vazio
                - generic:
                  - generic: 📋
                  - strong: Ainda não há candidatos nesta vaga
                  - paragraph: Adicione um candidato ou envie um currículo para iniciar o acompanhamento neste pipeline.
              - complementary:
                - generic:
                  - generic:
                    - paragraph: Ranking da vaga
                    - heading [level=3]: QA Pipeline Check 1777456792616
                    - paragraph: Apoio a decisao. O ranking nao altera a etapa do pipeline.
                  - generic:
                    - button:
                      - img
                      - generic: Atualizar
                    - button [expanded]:
                      - img
                      - generic: Recolher
                - generic:
                  - generic:
                    - generic: 🏁
                    - strong: Ainda não há ranking para esta vaga
                    - paragraph: Assim que houver candidatos com análise concluída, o ranking aparecerá aqui.
            - dialog:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - paragraph: —
                    - generic:
                      - paragraph: Sem contato informado
                  - button: ✕
                - generic:
                  - generic:
                    - paragraph: Vaga atual
                    - generic: QA Pipeline Check 1777456792616
                  - generic:
                    - paragraph: Etapa atual
                    - generic: Não vinculado
                  - generic:
                    - paragraph: Compatibilidade
                    - generic: —
                  - generic:
                    - paragraph: Status do vínculo
                    - generic: Não vinculado à vaga ativa
              - generic:
                - generic:
                  - button:
                    - generic: Resumo
                  - button:
                    - generic: Score
                  - button:
                    - generic: Análise IA
                  - button:
                    - generic: Documentos
                  - button:
                    - generic: Histórico
                  - button:
                    - generic: Ações
  - dialog "Novo candidato" [ref=e2]:
    - generic [ref=e3]:
      - heading "Novo candidato" [level=2] [ref=e4]
      - paragraph [ref=e5]: "Conteúdo do modal: Novo candidato"
    - generic [ref=e7]:
      - generic [ref=e8]:
        - paragraph [ref=e9]: A vaga é opcional. Você pode vincular depois. Se quiser, já crie o candidato com uma vaga selecionada.
        - generic [ref=e10]:
          - generic [ref=e11]: Criar candidato
          - generic [ref=e12]: Vínculo opcional
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]:
            - paragraph [ref=e16]: Vaga selecionada
            - paragraph [ref=e17]: QA Pipeline Check 1777456792616 · Publicada
          - button "Limpar vaga" [ref=e18] [cursor=pointer]
        - generic [ref=e20]: Publicada
        - paragraph [ref=e21]: Este candidato será criado e vinculado automaticamente à vaga selecionada.
      - generic [ref=e22]:
        - generic [ref=e23]:
          - generic [ref=e24]: Nome completo *
          - textbox "Nome completo *" [ref=e25]:
            - /placeholder: Nome do candidato
            - text: QA Sem Vaga 1777456792616
        - generic [ref=e26]:
          - generic [ref=e27]: E-mail *
          - textbox "E-mail *" [active] [ref=e28]:
            - /placeholder: email@exemplo.com
            - text: qa.sem.vaga.1777456792616@example.com
        - generic [ref=e29]:
          - generic [ref=e30]: Telefone
          - textbox "Telefone" [ref=e31]:
            - /placeholder: (11) 99999-9999
        - generic [ref=e32]:
          - generic [ref=e33]: CPF
          - textbox "CPF" [ref=e34]:
            - /placeholder: 000.000.000-00
      - generic [ref=e36]:
        - generic [ref=e37]: Vaga (opcional)
        - combobox "Vaga (opcional)" [ref=e38]:
          - option "Sem vaga"
          - option "QA Pipeline Check 1777456792616 - Publicada" [selected]
          - option "QA Vaga Rascunho 1777433779646 - Rascunho"
          - option "QA Vaga Publicada 1777433779646 - Publicada"
          - option "QA Vaga Rascunho 1777433728674 - Rascunho"
          - option "QA Vaga Publicada 1777433728674 - Publicada"
          - option "QA Vaga Publicada 1777433710148 - Publicada"
          - option "QA Cache Job B 1777432912083 - Publicada"
          - option "QA Cache Job A 1777432912083 Updated - Publicada"
          - option "QA Deal Breaker 1777432776918 - Publicada"
          - option "QA Cache Job B 1777432759978 - Publicada"
          - option "QA Cache Job A 1777432759978 Updated - Publicada"
          - option "QA Deal Breaker 1777432727518 - Publicada"
          - option "QA Cache Job B 1777432576864 - Publicada"
          - option "QA Cache Job A 1777432576864 - Publicada"
          - option "QA Deal Breaker 1777432576864 - Publicada"
          - option "QA Deal Breaker 1777432394903 - Publicada"
          - option "Vaga Teste - Backend Pleno - Publicada"
          - option "QA Deal Breaker 1777425746294 - Publicada"
          - option "QA Deal Breaker 1777425529210 - Publicada"
          - option "QA Deal Breaker 1777425470961 - Publicada"
          - option "Auxiliar Administrativo - Publicada"
          - option "Analista de Sistema - Publicada"
          - option "Product Manager - Publicada"
          - option "Analista de Dados - Publicada"
          - option "Engenheiro de Software - Backend - Publicada"
      - generic [ref=e39]:
        - button "Cancelar" [ref=e40] [cursor=pointer]
        - button "Criar e adicionar à vaga" [ref=e41] [cursor=pointer]
    - button "Fechar" [ref=e42] [cursor=pointer]:
      - img [ref=e43]
      - generic [ref=e46]: Fechar
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | 
  3   | const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8100";
  4   | const LOGIN_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@resume.ai";
  5   | const LOGIN_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Admin123!";
  6   | 
  7   | async function login(page: Parameters<typeof test>[0]["page"]) {
  8   |   await page.goto("/login");
  9   |   await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
  10  |   await page.getByLabel("Senha").fill(LOGIN_PASSWORD);
  11  |   await page.getByRole("button", { name: "Entrar no painel" }).click();
  12  |   await expect(page).toHaveURL(/\/pipeline(\/|$)/);
  13  | }
  14  | 
  15  | async function getToken(page: Parameters<typeof test>[0]["page"]) {
  16  |   const token = await page.evaluate(() => localStorage.getItem("resume_ai_access_token"));
  17  |   expect(token).toBeTruthy();
  18  |   return token as string;
  19  | }
  20  | 
  21  | async function createJobViaApi(
  22  |   page: Parameters<typeof test>[0]["page"],
  23  |   token: string,
  24  |   title: string,
  25  |   status: "draft" | "published" | "paused",
  26  | ) {
  27  |   const response = await page.request.post(`${API_BASE_URL}/api/v1/jobs`, {
  28  |     headers: {
  29  |       Authorization: `Bearer ${token}`,
  30  |     },
  31  |     data: {
  32  |       title,
  33  |       description: `Descricao da vaga ${title}`,
  34  |       requirements: "Python, FastAPI, PostgreSQL",
  35  |       status,
  36  |       salary_currency: "BRL",
  37  |       deal_breakers: [],
  38  |     },
  39  |   });
  40  |   expect(response.ok()).toBeTruthy();
  41  |   return (await response.json()) as { id: string };
  42  | }
  43  | 
  44  | async function createCandidateViaApi(
  45  |   page: Parameters<typeof test>[0]["page"],
  46  |   token: string,
  47  |   name: string,
  48  |   email: string,
  49  | ) {
  50  |   const response = await page.request.post(`${API_BASE_URL}/api/v1/candidates`, {
  51  |     headers: {
  52  |       Authorization: `Bearer ${token}`,
  53  |     },
  54  |     data: {
  55  |       full_name: name,
  56  |       email,
  57  |       location_city: "São Paulo",
  58  |       location_state: "SP",
  59  |       location_country: "Brasil",
  60  |     },
  61  |   });
  62  |   expect(response.ok()).toBeTruthy();
  63  |   return (await response.json()) as { id: string };
  64  | }
  65  | 
  66  | async function createCandidateViaModal(page: Parameters<typeof test>[0]["page"], name: string, email: string) {
  67  |   await page.getByRole("button", { name: "Novo candidato" }).click();
  68  |   const modal = page.getByRole("dialog", { name: "Novo candidato" });
  69  |   await expect(modal).toBeVisible();
  70  |   await modal.getByLabel("Nome completo *").fill(name);
  71  |   await modal.getByLabel("E-mail *").fill(email);
  72  |   return modal;
  73  | }
  74  | 
  75  | async function searchCandidate(page: Parameters<typeof test>[0]["page"], name: string) {
  76  |   await page.getByPlaceholder("Buscar por nome ou e-mail…").fill(name);
  77  |   const row = page.getByRole("row").filter({ hasText: name }).first();
  78  |   await expect(row).toBeVisible();
  79  |   return row;
  80  | }
  81  | 
  82  | test("create_candidate_without_job", async ({ page }) => {
  83  |   const suffix = Date.now();
  84  |   const candidateName = `QA Sem Vaga ${suffix}`;
  85  |   const candidateEmail = `qa.sem.vaga.${suffix}@example.com`;
  86  |   const publishedJobTitle = `QA Pipeline Check ${suffix}`;
  87  | 
  88  |   await login(page);
  89  |   const token = await getToken(page);
  90  |   const job = await createJobViaApi(page, token, publishedJobTitle, "published");
  91  | 
  92  |   await page.goto("/candidates");
  93  |   const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
> 94  |   await expect(modal.getByText("Sem vaga selecionada")).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
  95  |   await modal.getByRole("button", { name: "Criar candidato sem vaga" }).click();
  96  | 
  97  |   const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  98  |   await expect(drawer).toBeVisible();
  99  |   await expect(drawer.getByText(candidateName, { exact: true })).toBeVisible();
  100 |   await expect(drawer.getByText("Sem vaga ativa", { exact: true })).toBeVisible();
  101 |   await expect(drawer.getByText("Não vinculado à vaga ativa", { exact: true })).toBeVisible();
  102 |   await drawer.getByRole("button", { name: "Fechar painel" }).click();
  103 | 
  104 |   await page.goto("/candidates");
  105 |   const row = await searchCandidate(page, candidateName);
  106 |   await expect(row).toContainText("Sem vínculo");
  107 |   await expect(row).toContainText("—");
  108 | 
  109 |   await page.goto(`/pipeline/${job.id}`);
  110 |   await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
  111 | });
  112 | 
  113 | test("create_candidate_with_job", async ({ page }) => {
  114 |   const suffix = Date.now();
  115 |   const candidateName = `QA Com Vaga ${suffix}`;
  116 |   const candidateEmail = `qa.com.vaga.${suffix}@example.com`;
  117 |   const jobTitle = `QA Job Publicada ${suffix}`;
  118 | 
  119 |   await login(page);
  120 |   const token = await getToken(page);
  121 |   const job = await createJobViaApi(page, token, jobTitle, "published");
  122 | 
  123 |   await page.goto(`/pipeline/${job.id}`);
  124 |   await expect(page.locator("#pipeline-job-select")).toHaveValue(job.id);
  125 | 
  126 |   const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  127 |   await expect(modal.getByText(jobTitle, { exact: true })).toBeVisible();
  128 |   await modal.getByRole("button", { name: "Criar e adicionar à vaga" }).click();
  129 | 
  130 |   const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  131 |   await expect(drawer).toBeVisible();
  132 |   await expect(drawer.getByText(jobTitle, { exact: true })).toBeVisible();
  133 |   await expect(drawer.getByText("Vinculado à vaga ativa", { exact: true })).toBeVisible();
  134 |   await drawer.getByRole("button", { name: "Ações" }).click();
  135 |   await expect(drawer.getByRole("button", { name: "Adicionar a outra vaga" })).toBeVisible();
  136 |   await expect(drawer.getByRole("button", { name: "Transferir/corrigir vaga" })).toBeVisible();
  137 |   await drawer.getByRole("button", { name: "Fechar painel" }).click();
  138 | 
  139 |   await expect(page.getByText(candidateName, { exact: true })).toBeVisible();
  140 | 
  141 |   await page.goto("/candidates");
  142 |   const row = await searchCandidate(page, candidateName);
  143 |   await expect(row).toContainText("Vinculado");
  144 |   await expect(row).toContainText("1 vaga");
  145 | });
  146 | 
  147 | test("create_candidate_with_invalid_job", async ({ page }) => {
  148 |   const suffix = Date.now();
  149 |   const candidateName = `QA Vaga Invalida ${suffix}`;
  150 |   const candidateEmail = `qa.vaga.invalida.${suffix}@example.com`;
  151 |   const draftJobTitle = `QA Job Rascunho ${suffix}`;
  152 | 
  153 |   await login(page);
  154 |   const token = await getToken(page);
  155 |   await createJobViaApi(page, token, draftJobTitle, "draft");
  156 | 
  157 |   await page.goto("/candidates");
  158 |   const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  159 |   await modal.getByLabel("Vaga (opcional)").selectOption({ label: `${draftJobTitle} - Rascunho` });
  160 |   await expect(modal.getByText("Para vincular, a vaga precisa estar publicada ou pausada.")).toBeVisible();
  161 |   await modal.getByRole("button", { name: "Criar e adicionar à vaga" }).click();
  162 | 
  163 |   await expect(page.getByRole("alert").filter({ hasText: "não permite vínculo" })).toBeVisible();
  164 | 
  165 |   const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  166 |   await expect(drawer).toBeVisible();
  167 |   await drawer.getByRole("button", { name: "Fechar painel" }).click();
  168 | 
  169 |   await page.goto("/candidates");
  170 |   const row = await searchCandidate(page, candidateName);
  171 |   await expect(row).toContainText("Sem vínculo");
  172 |   await expect(row).toContainText("—");
  173 | });
  174 | 
  175 | test("verify_linked_job_count", async ({ page }) => {
  176 |   const suffix = Date.now();
  177 |   const noLinkName = `QA Count Zero ${suffix}`;
  178 |   const oneLinkName = `QA Count One ${suffix}`;
  179 |   const multiLinkName = `QA Count Multi ${suffix}`;
  180 |   const noLinkEmail = `qa.count.zero.${suffix}@example.com`;
  181 |   const oneLinkEmail = `qa.count.one.${suffix}@example.com`;
  182 |   const multiLinkEmail = `qa.count.multi.${suffix}@example.com`;
  183 |   const jobAName = `QA Count Job A ${suffix}`;
  184 |   const jobBName = `QA Count Job B ${suffix}`;
  185 | 
  186 |   await login(page);
  187 |   const token = await getToken(page);
  188 |   const jobA = await createJobViaApi(page, token, jobAName, "published");
  189 |   const jobB = await createJobViaApi(page, token, jobBName, "published");
  190 |   await createCandidateViaApi(page, token, noLinkName, noLinkEmail);
  191 |   const oneLinkCandidate = await createCandidateViaApi(page, token, oneLinkName, oneLinkEmail);
  192 |   const multiLinkCandidate = await createCandidateViaApi(page, token, multiLinkName, multiLinkEmail);
  193 | 
  194 |   const oneLinkResponse = await page.request.post(
```