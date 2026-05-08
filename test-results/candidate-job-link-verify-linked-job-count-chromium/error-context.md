# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: candidate-job-link.spec.ts >> verify_linked_job_count
- Location: e2e/candidate-job-link.spec.ts:473:5

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - button "RA Marajo RH AI System Recrutamento com IA e pipeline operacional" [ref=e7] [cursor=pointer]:
        - generic [ref=e8]: RA
        - generic [ref=e9]:
          - paragraph [ref=e10]: Marajo RH AI System
          - paragraph [ref=e11]: Recrutamento com IA e pipeline operacional
      - navigation [ref=e12]:
        - link "Pipeline Fluxo e etapas" [ref=e13] [cursor=pointer]:
          - /url: /pipeline
          - generic [ref=e14]: Pipeline
          - generic [ref=e15]: Fluxo e etapas
        - link "Candidatos Base de perfis" [ref=e16] [cursor=pointer]:
          - /url: /candidatos
          - generic [ref=e17]: Candidatos
          - generic [ref=e18]: Base de perfis
        - link "Vagas Oportunidades abertas" [ref=e19] [cursor=pointer]:
          - /url: /vagas
          - generic [ref=e20]: Vagas
          - generic [ref=e21]: Oportunidades abertas
        - link "Análises IA Execuções e status" [ref=e22] [cursor=pointer]:
          - /url: /analises-ia
          - generic [ref=e23]: Análises IA
          - generic [ref=e24]: Execuções e status
        - button "Admin Gerenciamento" [ref=e26] [cursor=pointer]:
          - generic [ref=e27]:
            - generic [ref=e28]: Admin
            - img [ref=e29]
          - generic [ref=e31]: Gerenciamento
      - generic [ref=e32]:
        - button "Ativar tema escuro" [ref=e33] [cursor=pointer]:
          - img [ref=e34]
        - button "Meu perfil Admin Administrador A" [ref=e36] [cursor=pointer]:
          - generic [ref=e37]:
            - paragraph [ref=e38]: Meu perfil
            - paragraph [ref=e39]: Admin
            - paragraph [ref=e40]: Administrador
          - generic [ref=e41]: A
        - button "Abrir ações de perfil" [ref=e44] [cursor=pointer]:
          - img [ref=e45]
  - main [ref=e49]:
    - generic [ref=e51]:
      - generic [ref=e52]:
        - generic [ref=e53]:
          - heading "Pipeline" [level=1] [ref=e54]
          - paragraph [ref=e55]: Acompanhe e mova candidatos entre etapas do processo de admissão.
        - generic [ref=e56]:
          - button "Adicionar candidatos" [ref=e57] [cursor=pointer]:
            - img [ref=e58]
            - text: Adicionar candidatos
          - button "Atualizar" [ref=e61] [cursor=pointer]
      - generic [ref=e63]:
        - generic [ref=e64]:
          - generic [ref=e65]:
            - text: Vaga
            - combobox "Vaga" [ref=e66]:
              - option "QA Reject Job 1778175256645" [selected]
              - option "QA Reject Job 1778175254160"
              - option "QA Reject Job 1778175196909"
              - option "QA Job Publicada 1778175051912"
              - option "QA Reject Job 1778174963227"
              - option "QA Reject Job 1778174856784"
              - option "QA Reject Job 1778174795448"
              - option "QA Reject Job 1778174724775"
              - option "QA Match Job 1778078227200"
              - option "QA Match Job 1778078192595"
              - option "Especialista Protheus"
              - option "Desenvolvedor Fullstack Pleno"
              - option "Auxiliar Administrativo"
              - option "Líder de IA e Automação"
              - option "QA Match Job 1778003507251"
              - option "QA Match Job 1778002333127"
              - option "Analista De Dados Senior"
              - option "Analista de Sistemas Pleno - Reteste Forte Fase 6.1"
          - generic [ref=e67]:
            - generic [ref=e68]:
              - generic [ref=e69]: Status
              - generic [ref=e71]: Publicada
            - generic [ref=e72]:
              - generic [ref=e73]: Senioridade
              - generic [ref=e74]: Pleno
            - generic [ref=e75]:
              - generic [ref=e76]: Modelo
              - generic [ref=e77]: Remoto
            - generic [ref=e78]:
              - generic [ref=e79]: Local
              - generic [ref=e80]: Brasil
        - button "Ocultar ranking" [expanded] [ref=e81] [cursor=pointer]:
          - img [ref=e82]
          - generic [ref=e85]: Ocultar ranking
      - generic [ref=e86]:
        - generic [ref=e87]:
          - generic [ref=e89]:
            - generic [ref=e90]:
              - paragraph [ref=e91]: Pipeline da vaga
              - generic [ref=e92]: 0 em processo
            - heading "QA Reject Job 1778175256645" [level=2] [ref=e93]
            - paragraph [ref=e94]: Abra um card para consultar detalhes do candidato e mover a etapa pelo drawer.
          - generic [ref=e96]:
            - generic [ref=e97]:
              - generic [ref=e98]:
                - generic [ref=e99]: Entrada
                - generic [ref=e100]: "0"
              - generic [ref=e102]: Vazio
            - generic [ref=e103]:
              - generic [ref=e104]:
                - generic [ref=e105]: Triagem
                - generic [ref=e106]: "0"
              - generic [ref=e108]: Vazio
            - generic [ref=e109]:
              - generic [ref=e110]:
                - generic [ref=e111]: Entrevista RH
                - generic [ref=e112]: "0"
              - generic [ref=e114]: Vazio
            - generic [ref=e115]:
              - generic [ref=e116]:
                - generic [ref=e117]: Técnica
                - generic [ref=e118]: "0"
              - generic [ref=e120]: Vazio
            - generic [ref=e121]:
              - generic [ref=e122]:
                - generic [ref=e123]: Final
                - generic [ref=e124]: "0"
              - generic [ref=e126]: Vazio
            - generic [ref=e127]:
              - generic [ref=e128]:
                - generic [ref=e129]: Oferta
                - generic [ref=e130]: "0"
              - generic [ref=e132]: Vazio
            - generic [ref=e133]:
              - generic [ref=e134]:
                - generic [ref=e135]: Contratado
                - generic [ref=e136]: "0"
              - generic [ref=e138]: Vazio
            - generic [ref=e140]:
              - generic [ref=e141]:
                - generic [ref=e142]: Reprovado
                - generic [ref=e143]: "0"
              - generic [ref=e145]: Vazio
          - generic [ref=e147]:
            - paragraph [ref=e148]: Pipeline sem candidatos
            - paragraph [ref=e149]: Adicione talentos existentes ou deixe a IA sugerir matches compatíveis.
            - generic [ref=e150]:
              - button "Adicionar candidatos" [ref=e151] [cursor=pointer]:
                - img [ref=e152]
                - text: Adicionar candidatos
              - button "Criar manualmente" [ref=e155] [cursor=pointer]
        - complementary [ref=e156]:
          - generic [ref=e157]:
            - generic [ref=e158]:
              - paragraph [ref=e159]: Ranking da vaga
              - heading "QA Reject Job 1778175256645" [level=3] [ref=e160]
              - paragraph [ref=e161]: Apoio a decisao. O ranking nao altera a etapa do pipeline.
            - generic [ref=e162]:
              - button "Atualizar" [ref=e163] [cursor=pointer]:
                - img [ref=e164]
                - generic [ref=e169]: Atualizar
              - button "Recolher" [expanded] [ref=e170] [cursor=pointer]:
                - img [ref=e171]
                - generic [ref=e174]: Recolher
          - generic [ref=e176]:
            - generic [ref=e177]: 🏁
            - strong [ref=e178]: Ainda não há ranking para esta vaga
            - paragraph [ref=e179]: Assim que houver candidatos com análise concluída, o ranking aparecerá aqui.
      - dialog "Painel do candidato" [ref=e180]
```

# Test source

```ts
  432 |   expect(linkResponse.ok()).toBeTruthy();
  433 | 
  434 |   await page.goto(`/pipeline/${targetJob.id}`);
  435 |   await page.getByRole("button", { name: "Adicionar candidatos" }).click();
  436 |   await page.getByPlaceholder("Buscar candidato por nome ou e-mail...").fill(candidateName);
  437 | 
  438 |   const candidateCard = page.locator("div.rounded-lg.border.p-3").filter({ hasText: candidateName }).first();
  439 |   await expect(candidateCard.getByText(candidateName, { exact: true })).toBeVisible();
  440 |   await expect(candidateCard.getByRole("button", { name: "Adicionar" })).toBeVisible();
  441 |   await candidateCard.getByRole("button", { name: "Adicionar" }).click();
  442 |   await expect(candidateCard.getByText("Use transferência para mover o candidato.")).toBeVisible();
  443 |   await expect(candidateCard.getByRole("button", { name: "Abrir" })).toBeVisible();
  444 |   await candidateCard.getByRole("button", { name: "Abrir" }).click();
  445 | 
  446 |   await expect(page).toHaveURL(new RegExp(`/candidatos\\?candidateId=${candidate.id}$`));
  447 |   await expect(page.getByRole("dialog", { name: "Painel do candidato" })).toBeVisible();
  448 | });
  449 | 
  450 | test("create_candidate_with_invalid_job", async ({ page }) => {
  451 |   const suffix = Date.now();
  452 |   const candidateName = `QA Vaga Invalida ${suffix}`;
  453 |   const candidateEmail = `qa.vaga.invalida.${suffix}@example.com`;
  454 |   const draftJobTitle = `QA Job Rascunho ${suffix}`;
  455 | 
  456 |   await login(page);
  457 |   const token = await getToken(page);
  458 |   await createJobViaApi(page, token, draftJobTitle, "draft");
  459 | 
  460 |   await page.goto("/candidatos");
  461 |   const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  462 |   await modal.getByLabel("Vaga (opcional)").selectOption({ label: `${draftJobTitle} - Rascunho` });
  463 |   await expect(modal.getByText("Para vincular, a vaga precisa estar publicada ou pausada.")).toBeVisible();
  464 |   await modal.getByRole("button", { name: "Criar e adicionar à vaga" }).click();
  465 | 
  466 |   await expect(modal.getByText("A vaga selecionada não pode receber novos candidatos.")).toBeVisible();
  467 |   await expect(modal.getByText("Escolha uma vaga publicada ou pausada, ou limpe o campo para criar sem vínculo.")).toBeVisible();
  468 | 
  469 |   await page.goto("/candidatos");
  470 |   await expect(page.getByRole("row").filter({ hasText: candidateName })).toHaveCount(0);
  471 | });
  472 | 
  473 | test("verify_linked_job_count", async ({ page }) => {
  474 |   const suffix = Date.now();
  475 |   const noLinkName = `QA Count Zero ${suffix}`;
  476 |   const oneLinkName = `QA Count One ${suffix}`;
  477 |   const multiLinkName = `QA Count Multi ${suffix}`;
  478 |   const noLinkEmail = `qa.count.zero.${suffix}@example.com`;
  479 |   const oneLinkEmail = `qa.count.one.${suffix}@example.com`;
  480 |   const multiLinkEmail = `qa.count.multi.${suffix}@example.com`;
  481 |   const jobAName = `QA Count Job A ${suffix}`;
  482 |   const jobBName = `QA Count Job B ${suffix}`;
  483 | 
  484 |   await login(page);
  485 |   const token = await getToken(page);
  486 |   const jobA = await createJobViaApi(page, token, jobAName, "paused");
  487 |   const jobB = await createJobViaApi(page, token, jobBName, "paused");
  488 |   await createCandidateViaApi(page, token, noLinkName, noLinkEmail);
  489 |   const oneLinkCandidate = await createCandidateViaApi(page, token, oneLinkName, oneLinkEmail);
  490 |   const multiLinkCandidate = await createCandidateViaApi(page, token, multiLinkName, multiLinkEmail);
  491 | 
  492 |   const oneLinkResponse = await page.request.post(
  493 |     `${API_BASE_URL}/api/v1/pipeline/${oneLinkCandidate.id}/add-to-job`,
  494 |     {
  495 |       headers: {
  496 |         Authorization: `Bearer ${token}`,
  497 |       },
  498 |       data: {
  499 |         job_id: jobA.id,
  500 |         initial_stage: "entry",
  501 |       },
  502 |     },
  503 |   );
  504 |   expect(oneLinkResponse.ok()).toBeTruthy();
  505 | 
  506 |   const multiLinkFirstResponse = await page.request.post(
  507 |     `${API_BASE_URL}/api/v1/pipeline/${multiLinkCandidate.id}/add-to-job`,
  508 |     {
  509 |       headers: {
  510 |         Authorization: `Bearer ${token}`,
  511 |       },
  512 |       data: {
  513 |         job_id: jobA.id,
  514 |         initial_stage: "entry",
  515 |       },
  516 |     },
  517 |   );
  518 |   expect(multiLinkFirstResponse.ok()).toBeTruthy();
  519 | 
  520 |   const multiLinkResponse = await page.request.post(
  521 |     `${API_BASE_URL}/api/v1/pipeline/${multiLinkCandidate.id}/add-to-job`,
  522 |     {
  523 |       headers: {
  524 |         Authorization: `Bearer ${token}`,
  525 |       },
  526 |       data: {
  527 |         job_id: jobB.id,
  528 |         initial_stage: "entry",
  529 |       },
  530 |     },
  531 |   );
> 532 |   expect(multiLinkResponse.ok()).toBeTruthy();
      |                                  ^ Error: expect(received).toBeTruthy()
  533 | 
  534 |   await page.goto("/candidatos");
  535 | 
  536 |   let row = await searchCandidate(page, noLinkName);
  537 |   await expect(row).toContainText("Sem vínculo");
  538 |   await expect(row).toContainText("—");
  539 | 
  540 |   row = await searchCandidate(page, oneLinkName);
  541 |   await expect(row).toContainText("Vinculado");
  542 |   await expect(row).toContainText("1 vaga");
  543 | 
  544 |   row = await searchCandidate(page, multiLinkName);
  545 |   await expect(row).toContainText("Vinculado");
  546 |   await expect(row).toContainText("2 vagas");
  547 | });
  548 | 
  549 | test("verify_no_pipeline_entry_when_no_job", async ({ page }) => {
  550 |   const suffix = Date.now();
  551 |   const candidateName = `QA Sem Pipeline ${suffix}`;
  552 |   const candidateEmail = `qa.sem.pipeline.${suffix}@example.com`;
  553 |   const jobTitle = `QA Board Check ${suffix}`;
  554 | 
  555 |   await login(page);
  556 |   const token = await getToken(page);
  557 |   const job = await createJobViaApi(page, token, jobTitle, "paused");
  558 | 
  559 |   await page.goto("/candidatos");
  560 |   const modal = await createCandidateViaModal(page, candidateName, candidateEmail);
  561 |   await modal.getByRole("button", { name: "Criar candidato sem vaga" }).click();
  562 |   await page.getByRole("button", { name: "Fechar painel" }).click();
  563 | 
  564 |   await page.goto(`/pipeline/${job.id}`);
  565 |   await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
  566 | });
  567 | 
```