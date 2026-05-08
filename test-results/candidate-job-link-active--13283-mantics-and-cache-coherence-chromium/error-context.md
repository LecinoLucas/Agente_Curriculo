# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: candidate-job-link.spec.ts >> active-terminal-reactivation flow keeps domain semantics and cache coherence
- Location: e2e/candidate-job-link.spec.ts:357:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('row').filter({ hasText: 'QA Active Terminal 1778175262010' }).first()
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('row').filter({ hasText: 'QA Active Terminal 1778175262010' }).first()

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e7]: Marajo RH AI System
    - generic [ref=e8]:
      - generic [ref=e9]:
        - heading "Recrutamento com mais contexto, menos retrabalho." [level=1] [ref=e10]:
          - text: Recrutamento com mais contexto,
          - text: menos retrabalho.
        - paragraph [ref=e11]: Centralize currículos, candidatos, vagas e análises em uma operação mais clara para o time de recrutamento.
      - generic [ref=e12]:
        - generic [ref=e13]:
          - img [ref=e14]
          - generic [ref=e17]:
            - paragraph [ref=e18]: Triagem organizada
            - paragraph [ref=e19]: Visualize documentos, perfis e análises em uma jornada única.
        - generic [ref=e20]:
          - img [ref=e21]
          - generic [ref=e24]:
            - paragraph [ref=e25]: Critérios consistentes
            - paragraph [ref=e26]: Use skills, senioridade e matching com a mesma linguagem operacional.
        - generic [ref=e27]:
          - img [ref=e28]
          - generic [ref=e31]:
            - paragraph [ref=e32]: Mais confiança no processo
            - paragraph [ref=e33]: Saiba quem solicitou análises, o que foi processado e como cada vaga está evoluindo.
    - paragraph [ref=e34]: © 2026 Marajo RH IA · Todos os direitos reservados
  - generic [ref=e36]:
    - generic [ref=e37]:
      - heading "Acessar plataforma" [level=2] [ref=e38]
      - paragraph [ref=e39]: Entre com sua conta para continuar no painel de recrutamento.
    - generic [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e42]: E-mail
        - textbox "E-mail" [ref=e43]:
          - /placeholder: seu@email.com
      - generic [ref=e44]:
        - generic [ref=e45]: Senha
        - generic [ref=e46]:
          - textbox "Senha Mostrar senha" [ref=e47]:
            - /placeholder: ••••••••
          - button "Mostrar senha" [ref=e48] [cursor=pointer]:
            - img [ref=e49]
      - button "Entrar no painel" [ref=e52] [cursor=pointer]
    - paragraph [ref=e53]: Seu acesso define quais áreas da plataforma estarão disponíveis.
```

# Test source

```ts
  88  |         throw new Error(`createSkill failed (${createSkillResponse.status()}): ${errorBody}`);
  89  |       }
  90  |     }
  91  |     const refreshedSkillsResponse = await page.request.get(`${API_BASE_URL}/api/v1/skills?limit=2`, {
  92  |       headers: {
  93  |         Authorization: `Bearer ${token}`,
  94  |       },
  95  |     });
  96  |     if (!refreshedSkillsResponse.ok()) {
  97  |       const errorBody = await refreshedSkillsResponse.text();
  98  |       throw new Error(`refreshSkills failed (${refreshedSkillsResponse.status()}): ${errorBody}`);
  99  |     }
  100 |     skills = (await refreshedSkillsResponse.json()) as Array<{ id: string; name: string }>;
  101 |   }
  102 | 
  103 |   for (const skill of skills.slice(0, 2)) {
  104 |     const addSkillResponse = await page.request.post(`${API_BASE_URL}/api/v1/jobs/${createdJob.id}/skills`, {
  105 |       headers: {
  106 |         Authorization: `Bearer ${token}`,
  107 |       },
  108 |       data: {
  109 |         skill_id: skill.id,
  110 |         is_mandatory: true,
  111 |         weight: 1,
  112 |       },
  113 |     });
  114 |     if (!addSkillResponse.ok() && addSkillResponse.status() !== 409) {
  115 |       const errorBody = await addSkillResponse.text();
  116 |       throw new Error(`addJobSkill failed (${addSkillResponse.status()}): ${errorBody}`);
  117 |     }
  118 |   }
  119 | 
  120 |   const publishResponse = await page.request.patch(`${API_BASE_URL}/api/v1/jobs/${createdJob.id}/publish`, {
  121 |     headers: {
  122 |       Authorization: `Bearer ${token}`,
  123 |     },
  124 |   });
  125 |   if (!publishResponse.ok()) {
  126 |     const errorBody = await publishResponse.text();
  127 |     throw new Error(`publishJob failed (${publishResponse.status()}): ${errorBody}`);
  128 |   }
  129 |   return createdJob;
  130 | }
  131 | 
  132 | async function createCandidateViaApi(
  133 |   page: Parameters<typeof test>[0]["page"],
  134 |   token: string,
  135 |   name: string,
  136 |   email: string,
  137 | ) {
  138 |   const response = await page.request.post(`${API_BASE_URL}/api/v1/candidates`, {
  139 |     headers: {
  140 |       Authorization: `Bearer ${token}`,
  141 |     },
  142 |     data: {
  143 |       full_name: name,
  144 |       email,
  145 |       location_city: "São Paulo",
  146 |       location_state: "SP",
  147 |       location_country: "Brasil",
  148 |     },
  149 |   });
  150 |   expect(response.ok()).toBeTruthy();
  151 |   return (await response.json()) as { id: string };
  152 | }
  153 | 
  154 | async function createCandidateViaModal(page: Parameters<typeof test>[0]["page"], name: string, email: string) {
  155 |   await page.getByRole("button", { name: "Novo candidato" }).click();
  156 |   const modal = page.getByRole("dialog", { name: "Novo candidato" });
  157 |   await expect(modal).toBeVisible();
  158 |   await modal.getByLabel("Nome completo *").fill(name);
  159 |   await modal.getByLabel("E-mail *").fill(email);
  160 |   return modal;
  161 | }
  162 | 
  163 | async function searchCandidate(page: Parameters<typeof test>[0]["page"], name: string) {
  164 |   await page.getByPlaceholder(/Buscar por nome ou e-mail/).fill(name);
  165 |   const row = page.getByRole("row").filter({ hasText: name }).first();
  166 |   await expect(row).toBeVisible();
  167 |   return row;
  168 | }
  169 | 
  170 | async function openCandidateDrawerById(
  171 |   page: Parameters<typeof test>[0]["page"],
  172 |   candidateId: string,
  173 |   _candidateName: string,
  174 | ) {
  175 |   await page.goto(`/candidatos?candidateId=${candidateId}`);
  176 |   if (/\/login(\/|$)/.test(page.url())) {
  177 |     await login(page);
  178 |     await page.goto(`/candidatos?candidateId=${candidateId}`);
  179 |   }
  180 |   const drawer = page.getByRole("complementary", { name: "Painel do candidato" });
  181 |   await expect(drawer).toBeVisible({ timeout: 20000 });
  182 | }
  183 | 
  184 | async function addCandidateToJobViaApi(
  185 |   page: Parameters<typeof test>[0]["page"],
  186 |   token: string,
  187 |   candidateId: string,
> 188 |   jobId: string,
      |                       ^ Error: expect(locator).toBeVisible() failed
  189 | ) {
  190 |   const response = await page.request.post(`${API_BASE_URL}/api/v1/pipeline/${candidateId}/add-to-job`, {
  191 |     headers: {
  192 |       Authorization: `Bearer ${token}`,
  193 |     },
  194 |     data: {
  195 |       job_id: jobId,
  196 |       initial_stage: "entry",
  197 |     },
  198 |   });
  199 |   if (!response.ok()) {
  200 |     const errorBody = await response.text();
  201 |     throw new Error(`addCandidateToJobViaApi failed (${response.status()}): ${errorBody}`);
  202 |   }
  203 | }
  204 | 
  205 | async function getPipelineBoardViaApi(
  206 |   page: Parameters<typeof test>[0]["page"],
  207 |   token: string,
  208 |   jobId: string,
  209 | ) {
  210 |   const response = await page.request.get(`${API_BASE_URL}/api/v1/pipeline/${jobId}`, {
  211 |     headers: {
  212 |       Authorization: `Bearer ${token}`,
  213 |     },
  214 |   });
  215 |   expect(response.ok()).toBeTruthy();
  216 |   return (await response.json()) as {
  217 |     columns: Array<{ candidates: Array<{ candidate_id: string }> }>;
  218 |   };
  219 | }
  220 | 
  221 | function boardHasCandidate(
  222 |   board: { columns: Array<{ candidates: Array<{ candidate_id: string }> }> },
  223 |   candidateId: string,
  224 | ) {
  225 |   return board.columns.some((column) =>
  226 |     column.candidates.some((candidate) => candidate.candidate_id === candidateId),
  227 |   );
  228 | }
  229 | 
  230 | async function getPipelineHistoryViaApi(
  231 |   page: Parameters<typeof test>[0]["page"],
  232 |   token: string,
  233 |   jobId: string,
  234 |   candidateId: string,
  235 | ) {
  236 |   const response = await page.request.get(`${API_BASE_URL}/api/v1/pipeline/${jobId}/${candidateId}/history`, {
  237 |     headers: {
  238 |       Authorization: `Bearer ${token}`,
  239 |     },
  240 |   });
  241 |   expect(response.ok()).toBeTruthy();
  242 |   return (await response.json()) as {
  243 |     current_stage: string;
  244 |     status: string;
  245 |   };
  246 | }
  247 | 
  248 | test("create_candidate_without_job", async ({ page }) => {
  249 |   const suffix = Date.now();
  250 |   const candidateName = `QA Sem Vaga ${suffix}`;
  251 |   const candidateEmail = `qa.sem.vaga.${suffix}@example.com`;
  252 |   const publishedJobTitle = `QA Pipeline Check ${suffix}`;
  253 | 
  254 |   await login(page);
  255 |   const token = await getToken(page);
  256 |   const job = await createJobViaApi(page, token, publishedJobTitle, "paused");
  257 | 
  258 |   await page.goto("/candidatos");
  259 |   const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  260 |   await expect(modal.getByText("Sem vaga selecionada")).toBeVisible();
  261 |   await modal.getByRole("button", { name: "Criar candidato sem vaga" }).click();
  262 | 
  263 |   const drawer = page.getByRole("dialog", { name: "Painel do candidato" });
  264 |   await expect(drawer).toBeVisible();
  265 |   await expect(drawer).toContainText(candidateName);
  266 |   await expect(drawer.getByText("Não vinculado à vaga ativa", { exact: true })).toBeVisible();
  267 |   await drawer.getByRole("button", { name: "Fechar painel" }).click();
  268 | 
  269 |   await page.goto("/candidatos");
  270 |   const row = await searchCandidate(page, candidateName);
  271 |   await expect(row).toContainText("Sem vínculo");
  272 |   await expect(row).toContainText("—");
  273 | 
  274 |   await page.goto(`/pipeline/${job.id}`);
  275 |   await expect(page).toHaveURL(new RegExp(`/pipeline/${job.id}$`));
  276 |   await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
  277 | });
  278 | 
  279 | test("create_candidate_with_job", async ({ page }) => {
  280 |   const suffix = Date.now();
  281 |   const candidateName = `QA Com Vaga ${suffix}`;
  282 |   const candidateEmail = `qa.com.vaga.${suffix}@example.com`;
  283 |   const jobTitle = `QA Job Publicada ${suffix}`;
  284 | 
  285 |   await login(page);
  286 |   const token = await getToken(page);
  287 |   const job = await createJobViaApi(page, token, jobTitle, "published");
  288 | 
```