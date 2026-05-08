# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: candidate-job-link.spec.ts >> create_candidate_with_invalid_job
- Location: e2e/candidate-job-link.spec.ts:450:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: 'Novo candidato' }).getByText('A vaga selecionada não pode receber novos candidatos.')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('dialog', { name: 'Novo candidato' }).getByText('A vaga selecionada não pode receber novos candidatos.')

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
            - generic [ref=e54]:
              - heading "Candidatos" [level=2] [ref=e55]
              - paragraph [ref=e56]: 92 candidatos no total
            - generic [ref=e57]:
              - button "Atualizar" [ref=e58] [cursor=pointer]:
                - img [ref=e59]
                - text: Atualizar
              - button "+ Novo candidato" [ref=e64] [cursor=pointer]
          - paragraph [ref=e65]: Candidatos são perfis externos gerenciados pelo sistema. Eles não possuem acesso ao sistema interno.
          - paragraph [ref=e66]: Sem vínculo = candidato ainda não associado a nenhuma vaga.
          - paragraph [ref=e67]: A lista prioriza o match da vaga ativa. O score geral IA aparece apenas como contexto quando necessário.
        - generic [ref=e69]:
          - generic [ref=e70]:
            - generic [ref=e71]:
              - img [ref=e72]
              - textbox "Buscar por nome ou e-mail…" [ref=e75]
            - combobox [ref=e76]:
              - option "Todos os currículos" [selected]
              - option "Com currículo"
              - option "Sem currículo"
            - combobox [ref=e77]:
              - option "Todos os status IA" [selected]
              - option "IA Concluída"
              - option "IA Pendente / Processando"
              - option "IA Falhou"
          - generic [ref=e78]:
            - table [ref=e80]:
              - rowgroup [ref=e81]:
                - row "Nome E-mail Telefone Currículo Vínculo Vagas Status da IA Match da vaga ativa Criado em" [ref=e82]:
                  - columnheader "Nome" [ref=e83]
                  - columnheader "E-mail" [ref=e84]
                  - columnheader "Telefone" [ref=e85]
                  - columnheader "Currículo" [ref=e86]
                  - columnheader "Vínculo" [ref=e87]
                  - columnheader "Vagas" [ref=e88]
                  - columnheader "Status da IA" [ref=e89]
                  - columnheader "Match da vaga ativa" [ref=e90]
                  - columnheader "Criado em" [ref=e91]
              - rowgroup [ref=e92]:
                - row "QA Candidato Vinculado 1778175294960 qa.candidato.vinculado.1778175294960@example.com — — Vinculado 1 vaga — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e93] [cursor=pointer]:
                  - cell "QA Candidato Vinculado 1778175294960" [ref=e94]:
                    - generic [ref=e95]: QA Candidato Vinculado 1778175294960
                  - cell "qa.candidato.vinculado.1778175294960@example.com" [ref=e96]
                  - cell "—" [ref=e97]
                  - cell "—" [ref=e98]
                  - cell "Vinculado" [ref=e99]:
                    - generic [ref=e100]: Vinculado
                  - cell "1 vaga" [ref=e101]
                  - cell "—" [ref=e102]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e103]:
                    - generic [ref=e104]:
                      - generic [ref=e105]: —
                      - generic [ref=e106]: Compatibilidade Contextual
                      - generic [ref=e107]: Revisão recomendada
                  - cell "07/05/2026" [ref=e108]
                - row "QA Active Terminal 1778175262041 qa.active.terminal.1778175262041@example.com — — Vinculado 1 vaga — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e109] [cursor=pointer]:
                  - cell "QA Active Terminal 1778175262041" [ref=e110]:
                    - generic [ref=e111]: QA Active Terminal 1778175262041
                  - cell "qa.active.terminal.1778175262041@example.com" [ref=e112]
                  - cell "—" [ref=e113]
                  - cell "—" [ref=e114]
                  - cell "Vinculado" [ref=e115]:
                    - generic [ref=e116]: Vinculado
                  - cell "1 vaga" [ref=e117]
                  - cell "—" [ref=e118]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e119]:
                    - generic [ref=e120]:
                      - generic [ref=e121]: —
                      - generic [ref=e122]: Compatibilidade Contextual
                      - generic [ref=e123]: Revisão recomendada
                  - cell "07/05/2026" [ref=e124]
                - row "QA Active Terminal 1778175262010 qa.active.terminal.1778175262010@example.com — — Vinculado 1 vaga — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e125] [cursor=pointer]:
                  - cell "QA Active Terminal 1778175262010" [ref=e126]:
                    - generic [ref=e127]: QA Active Terminal 1778175262010
                  - cell "qa.active.terminal.1778175262010@example.com" [ref=e128]
                  - cell "—" [ref=e129]
                  - cell "—" [ref=e130]
                  - cell "Vinculado" [ref=e131]:
                    - generic [ref=e132]: Vinculado
                  - cell "1 vaga" [ref=e133]
                  - cell "—" [ref=e134]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e135]:
                    - generic [ref=e136]:
                      - generic [ref=e137]: —
                      - generic [ref=e138]: Compatibilidade Contextual
                      - generic [ref=e139]: Revisão recomendada
                  - cell "07/05/2026" [ref=e140]
                - row "QA Rejected 1778175256645 qa.rejected.1778175256645@example.com — — Reprovado QA Reject Job 1778175256645 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e141] [cursor=pointer]:
                  - cell "QA Rejected 1778175256645" [ref=e142]:
                    - generic [ref=e143]: QA Rejected 1778175256645
                  - cell "qa.rejected.1778175256645@example.com" [ref=e144]
                  - cell "—" [ref=e145]
                  - cell "—" [ref=e146]
                  - cell "Reprovado" [ref=e147]:
                    - generic [ref=e148]: Reprovado
                  - cell "QA Reject Job 1778175256645" [ref=e149]
                  - cell "—" [ref=e150]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e151]:
                    - generic [ref=e152]:
                      - generic [ref=e153]: —
                      - generic [ref=e154]: Compatibilidade Contextual
                      - generic [ref=e155]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e156]
                - row "QA Rejected 1778175254160 qa.rejected.1778175254160@example.com — — Reprovado QA Reject Job 1778175254160 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e157] [cursor=pointer]:
                  - cell "QA Rejected 1778175254160" [ref=e158]:
                    - generic [ref=e159]: QA Rejected 1778175254160
                  - cell "qa.rejected.1778175254160@example.com" [ref=e160]
                  - cell "—" [ref=e161]
                  - cell "—" [ref=e162]
                  - cell "Reprovado" [ref=e163]:
                    - generic [ref=e164]: Reprovado
                  - cell "QA Reject Job 1778175254160" [ref=e165]
                  - cell "—" [ref=e166]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e167]:
                    - generic [ref=e168]:
                      - generic [ref=e169]: —
                      - generic [ref=e170]: Compatibilidade Contextual
                      - generic [ref=e171]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e172]
                - row "QA Active Terminal 1778175202793 qa.active.terminal.1778175202793@example.com — — Vinculado 1 vaga — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e173] [cursor=pointer]:
                  - cell "QA Active Terminal 1778175202793" [ref=e174]:
                    - generic [ref=e175]: QA Active Terminal 1778175202793
                  - cell "qa.active.terminal.1778175202793@example.com" [ref=e176]
                  - cell "—" [ref=e177]
                  - cell "—" [ref=e178]
                  - cell "Vinculado" [ref=e179]:
                    - generic [ref=e180]: Vinculado
                  - cell "1 vaga" [ref=e181]
                  - cell "—" [ref=e182]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e183]:
                    - generic [ref=e184]:
                      - generic [ref=e185]: —
                      - generic [ref=e186]: Compatibilidade Contextual
                      - generic [ref=e187]: Revisão recomendada
                  - cell "07/05/2026" [ref=e188]
                - row "QA Rejected 1778175196909 qa.rejected.1778175196909@example.com — — Reprovado QA Reject Job 1778175196909 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e189] [cursor=pointer]:
                  - cell "QA Rejected 1778175196909" [ref=e190]:
                    - generic [ref=e191]: QA Rejected 1778175196909
                  - cell "qa.rejected.1778175196909@example.com" [ref=e192]
                  - cell "—" [ref=e193]
                  - cell "—" [ref=e194]
                  - cell "Reprovado" [ref=e195]:
                    - generic [ref=e196]: Reprovado
                  - cell "QA Reject Job 1778175196909" [ref=e197]
                  - cell "—" [ref=e198]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e199]:
                    - generic [ref=e200]:
                      - generic [ref=e201]: —
                      - generic [ref=e202]: Compatibilidade Contextual
                      - generic [ref=e203]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e204]
                - row "QA Sem Vaga 1778175023746 qa.sem.vaga.1778175023746@example.com — — Sem vínculo — — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e205] [cursor=pointer]:
                  - cell "QA Sem Vaga 1778175023746" [ref=e206]:
                    - generic [ref=e207]: QA Sem Vaga 1778175023746
                  - cell "qa.sem.vaga.1778175023746@example.com" [ref=e208]
                  - cell "—" [ref=e209]
                  - cell "—" [ref=e210]
                  - cell "Sem vínculo" [ref=e211]:
                    - generic [ref=e212]: Sem vínculo
                  - cell "—" [ref=e213]
                  - cell "—" [ref=e214]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e215]:
                    - generic [ref=e216]:
                      - generic [ref=e217]: —
                      - generic [ref=e218]: Compatibilidade Contextual
                      - generic [ref=e219]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e220]
                - row "QA Active Terminal 1778174976823 qa.active.terminal.1778174976823@example.com — — Vinculado 1 vaga — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e221] [cursor=pointer]:
                  - cell "QA Active Terminal 1778174976823" [ref=e222]:
                    - generic [ref=e223]: QA Active Terminal 1778174976823
                  - cell "qa.active.terminal.1778174976823@example.com" [ref=e224]
                  - cell "—" [ref=e225]
                  - cell "—" [ref=e226]
                  - cell "Vinculado" [ref=e227]:
                    - generic [ref=e228]: Vinculado
                  - cell "1 vaga" [ref=e229]
                  - cell "—" [ref=e230]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e231]:
                    - generic [ref=e232]:
                      - generic [ref=e233]: —
                      - generic [ref=e234]: Compatibilidade Contextual
                      - generic [ref=e235]: Revisão recomendada
                  - cell "07/05/2026" [ref=e236]
                - row "QA Rejected 1778174963227 qa.rejected.1778174963227@example.com — — Reprovado QA Reject Job 1778174963227 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e237] [cursor=pointer]:
                  - cell "QA Rejected 1778174963227" [ref=e238]:
                    - generic [ref=e239]: QA Rejected 1778174963227
                  - cell "qa.rejected.1778174963227@example.com" [ref=e240]
                  - cell "—" [ref=e241]
                  - cell "—" [ref=e242]
                  - cell "Reprovado" [ref=e243]:
                    - generic [ref=e244]: Reprovado
                  - cell "QA Reject Job 1778174963227" [ref=e245]
                  - cell "—" [ref=e246]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e247]:
                    - generic [ref=e248]:
                      - generic [ref=e249]: —
                      - generic [ref=e250]: Compatibilidade Contextual
                      - generic [ref=e251]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e252]
                - row "QA Active Terminal 1778174873153 qa.active.terminal.1778174873153@example.com — — Vinculado 1 vaga — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e253] [cursor=pointer]:
                  - cell "QA Active Terminal 1778174873153" [ref=e254]:
                    - generic [ref=e255]: QA Active Terminal 1778174873153
                  - cell "qa.active.terminal.1778174873153@example.com" [ref=e256]
                  - cell "—" [ref=e257]
                  - cell "—" [ref=e258]
                  - cell "Vinculado" [ref=e259]:
                    - generic [ref=e260]: Vinculado
                  - cell "1 vaga" [ref=e261]
                  - cell "—" [ref=e262]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e263]:
                    - generic [ref=e264]:
                      - generic [ref=e265]: —
                      - generic [ref=e266]: Compatibilidade Contextual
                      - generic [ref=e267]: Revisão recomendada
                  - cell "07/05/2026" [ref=e268]
                - row "QA Rejected 1778174856784 qa.rejected.1778174856784@example.com — — Reprovado QA Reject Job 1778174856784 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e269] [cursor=pointer]:
                  - cell "QA Rejected 1778174856784" [ref=e270]:
                    - generic [ref=e271]: QA Rejected 1778174856784
                  - cell "qa.rejected.1778174856784@example.com" [ref=e272]
                  - cell "—" [ref=e273]
                  - cell "—" [ref=e274]
                  - cell "Reprovado" [ref=e275]:
                    - generic [ref=e276]: Reprovado
                  - cell "QA Reject Job 1778174856784" [ref=e277]
                  - cell "—" [ref=e278]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e279]:
                    - generic [ref=e280]:
                      - generic [ref=e281]: —
                      - generic [ref=e282]: Compatibilidade Contextual
                      - generic [ref=e283]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e284]
                - row "QA Active Terminal 1778174800725 qa.active.terminal.1778174800725@example.com — — Vinculado 2 vagas — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e285] [cursor=pointer]:
                  - cell "QA Active Terminal 1778174800725" [ref=e286]:
                    - generic [ref=e287]: QA Active Terminal 1778174800725
                  - cell "qa.active.terminal.1778174800725@example.com" [ref=e288]
                  - cell "—" [ref=e289]
                  - cell "—" [ref=e290]
                  - cell "Vinculado" [ref=e291]:
                    - generic [ref=e292]: Vinculado
                  - cell "2 vagas" [ref=e293]
                  - cell "—" [ref=e294]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e295]:
                    - generic [ref=e296]:
                      - generic [ref=e297]: —
                      - generic [ref=e298]: Compatibilidade Contextual
                      - generic [ref=e299]: Revisão recomendada
                  - cell "07/05/2026" [ref=e300]
                - row "QA Rejected 1778174795448 qa.rejected.1778174795448@example.com — — Reprovado QA Reject Job 1778174795448 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e301] [cursor=pointer]:
                  - cell "QA Rejected 1778174795448" [ref=e302]:
                    - generic [ref=e303]: QA Rejected 1778174795448
                  - cell "qa.rejected.1778174795448@example.com" [ref=e304]
                  - cell "—" [ref=e305]
                  - cell "—" [ref=e306]
                  - cell "Reprovado" [ref=e307]:
                    - generic [ref=e308]: Reprovado
                  - cell "QA Reject Job 1778174795448" [ref=e309]
                  - cell "—" [ref=e310]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e311]:
                    - generic [ref=e312]:
                      - generic [ref=e313]: —
                      - generic [ref=e314]: Compatibilidade Contextual
                      - generic [ref=e315]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e316]
                - row "QA Active Terminal 1778174728502 qa.active.terminal.1778174728502@example.com — — Vinculado 2 vagas — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e317] [cursor=pointer]:
                  - cell "QA Active Terminal 1778174728502" [ref=e318]:
                    - generic [ref=e319]: QA Active Terminal 1778174728502
                  - cell "qa.active.terminal.1778174728502@example.com" [ref=e320]
                  - cell "—" [ref=e321]
                  - cell "—" [ref=e322]
                  - cell "Vinculado" [ref=e323]:
                    - generic [ref=e324]: Vinculado
                  - cell "2 vagas" [ref=e325]
                  - cell "—" [ref=e326]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e327]:
                    - generic [ref=e328]:
                      - generic [ref=e329]: —
                      - generic [ref=e330]: Compatibilidade Contextual
                      - generic [ref=e331]: Revisão recomendada
                  - cell "07/05/2026" [ref=e332]
                - row "QA Rejected 1778174724775 qa.rejected.1778174724775@example.com — — Reprovado QA Reject Job 1778174724775 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e333] [cursor=pointer]:
                  - cell "QA Rejected 1778174724775" [ref=e334]:
                    - generic [ref=e335]: QA Rejected 1778174724775
                  - cell "qa.rejected.1778174724775@example.com" [ref=e336]
                  - cell "—" [ref=e337]
                  - cell "—" [ref=e338]
                  - cell "Reprovado" [ref=e339]:
                    - generic [ref=e340]: Reprovado
                  - cell "QA Reject Job 1778174724775" [ref=e341]
                  - cell "—" [ref=e342]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e343]:
                    - generic [ref=e344]:
                      - generic [ref=e345]: —
                      - generic [ref=e346]: Compatibilidade Contextual
                      - generic [ref=e347]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e348]
                - row "QA Active Terminal 1778174540177 qa.active.terminal.1778174540177@example.com — — Vinculado 2 vagas — — Compatibilidade Contextual Revisão recomendada 07/05/2026" [ref=e349] [cursor=pointer]:
                  - cell "QA Active Terminal 1778174540177" [ref=e350]:
                    - generic [ref=e351]: QA Active Terminal 1778174540177
                  - cell "qa.active.terminal.1778174540177@example.com" [ref=e352]
                  - cell "—" [ref=e353]
                  - cell "—" [ref=e354]
                  - cell "Vinculado" [ref=e355]:
                    - generic [ref=e356]: Vinculado
                  - cell "2 vagas" [ref=e357]
                  - cell "—" [ref=e358]
                  - cell "— Compatibilidade Contextual Revisão recomendada" [ref=e359]:
                    - generic [ref=e360]:
                      - generic [ref=e361]: —
                      - generic [ref=e362]: Compatibilidade Contextual
                      - generic [ref=e363]: Revisão recomendada
                  - cell "07/05/2026" [ref=e364]
                - row "QA Rejected 1778174537545 qa.rejected.1778174537545@example.com — — Reprovado QA Reject Job 1778174537545 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e365] [cursor=pointer]:
                  - cell "QA Rejected 1778174537545" [ref=e366]:
                    - generic [ref=e367]: QA Rejected 1778174537545
                  - cell "qa.rejected.1778174537545@example.com" [ref=e368]
                  - cell "—" [ref=e369]
                  - cell "—" [ref=e370]
                  - cell "Reprovado" [ref=e371]:
                    - generic [ref=e372]: Reprovado
                  - cell "QA Reject Job 1778174537545" [ref=e373]
                  - cell "—" [ref=e374]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e375]:
                    - generic [ref=e376]:
                      - generic [ref=e377]: —
                      - generic [ref=e378]: Compatibilidade Contextual
                      - generic [ref=e379]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e380]
                - row "QA Active Terminal 1778174317808 qa.active.terminal.1778174317808@example.com — — Reprovado QA Active Terminal Job 1778174317808 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e381] [cursor=pointer]:
                  - cell "QA Active Terminal 1778174317808" [ref=e382]:
                    - generic [ref=e383]: QA Active Terminal 1778174317808
                  - cell "qa.active.terminal.1778174317808@example.com" [ref=e384]
                  - cell "—" [ref=e385]
                  - cell "—" [ref=e386]
                  - cell "Reprovado" [ref=e387]:
                    - generic [ref=e388]: Reprovado
                  - cell "QA Active Terminal Job 1778174317808" [ref=e389]
                  - cell "—" [ref=e390]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e391]:
                    - generic [ref=e392]:
                      - generic [ref=e393]: —
                      - generic [ref=e394]: Compatibilidade Contextual
                      - generic [ref=e395]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e396]
                - row "QA Rejected 1778174315014 qa.rejected.1778174315014@example.com — — Reprovado QA Reject Job 1778174315014 — — Compatibilidade Contextual Sem vaga ativa 07/05/2026" [ref=e397] [cursor=pointer]:
                  - cell "QA Rejected 1778174315014" [ref=e398]:
                    - generic [ref=e399]: QA Rejected 1778174315014
                  - cell "qa.rejected.1778174315014@example.com" [ref=e400]
                  - cell "—" [ref=e401]
                  - cell "—" [ref=e402]
                  - cell "Reprovado" [ref=e403]:
                    - generic [ref=e404]: Reprovado
                  - cell "QA Reject Job 1778174315014" [ref=e405]
                  - cell "—" [ref=e406]
                  - cell "— Compatibilidade Contextual Sem vaga ativa" [ref=e407]:
                    - generic [ref=e408]:
                      - generic [ref=e409]: —
                      - generic [ref=e410]: Compatibilidade Contextual
                      - generic [ref=e411]: Sem vaga ativa
                  - cell "07/05/2026" [ref=e412]
            - generic [ref=e414]:
              - generic [ref=e415]:
                - button "Primeiro" [disabled]:
                  - img
                  - text: Primeiro
                - button "Anterior" [disabled]:
                  - img
                  - text: Anterior
                - generic [ref=e416]:
                  - button "1" [disabled]
                  - button "2" [ref=e417] [cursor=pointer]
                  - button "3" [ref=e418] [cursor=pointer]
                  - button "4" [ref=e419] [cursor=pointer]
                  - button "5" [ref=e420] [cursor=pointer]
                - button "Próxima" [ref=e421] [cursor=pointer]:
                  - text: Próxima
                  - img [ref=e422]
                - button "Último" [ref=e424] [cursor=pointer]:
                  - text: Último
                  - img [ref=e425]
              - generic [ref=e429]: Página 1 de 5
  - generic [ref=e430]:
    - button "Fechar modal" [ref=e431]
    - dialog "Novo candidato" [ref=e432]:
      - generic [ref=e433]:
        - heading "Novo candidato" [level=2] [ref=e434]
        - paragraph [ref=e435]: "Conteúdo do modal: Novo candidato"
      - generic [ref=e437]:
        - generic [ref=e438]:
          - paragraph [ref=e439]: A vaga é opcional. Você pode vincular depois. Se quiser, já crie o candidato com uma vaga selecionada.
          - generic [ref=e440]:
            - generic [ref=e441]: Criar candidato
            - generic [ref=e442]: Vínculo opcional
        - generic [ref=e443]:
          - generic [ref=e444]:
            - generic [ref=e445]:
              - paragraph [ref=e446]: Vaga selecionada
              - paragraph [ref=e447]: QA Job Rascunho 1778175298480 · Rascunho
            - button "Limpar vaga" [ref=e448] [cursor=pointer]
          - generic [ref=e449]:
            - generic [ref=e450]: Rascunho
            - generic [ref=e451]: Pleno
          - paragraph [ref=e452]: Para vincular, a vaga precisa estar publicada ou pausada. Você pode limpar o campo para criar sem vínculo.
        - generic [ref=e453]:
          - generic [ref=e454]:
            - generic [ref=e455]: Nome completo *
            - textbox "Nome completo *" [ref=e456]:
              - /placeholder: Nome do candidato
              - text: QA Vaga Invalida 1778175298480
          - generic [ref=e457]:
            - generic [ref=e458]: E-mail *
            - textbox "E-mail *" [ref=e459]:
              - /placeholder: email@exemplo.com
              - text: qa.vaga.invalida.1778175298480@example.com
          - generic [ref=e460]:
            - generic [ref=e461]: Telefone
            - textbox "Telefone" [ref=e462]:
              - /placeholder: (11) 99999-9999
          - generic [ref=e463]:
            - generic [ref=e464]: CPF
            - textbox "CPF" [ref=e465]:
              - /placeholder: 000.000.000-00
        - generic [ref=e466]:
          - generic [ref=e467]:
            - generic [ref=e468]: Vaga (opcional)
            - combobox "Vaga (opcional)" [ref=e469]:
              - option "Sem vaga"
              - option "QA Job Rascunho 1778175298480 - Rascunho" [selected]
              - option "QA Destino 1778175294960 - Pausada"
              - option "QA Origem 1778175294960 - Pausada"
              - option "QA Active Terminal Job 1778175262010 - Pausada"
              - option "QA Active Terminal Job 1778175262041 - Pausada"
              - option "QA Reject Job 1778175256645 - Publicada"
              - option "QA Reject Job 1778175254160 - Publicada"
              - option "QA Active Terminal Job 1778175202793 - Pausada"
              - option "QA Reject Job 1778175196909 - Publicada"
              - option "QA Job Publicada 1778175051912 - Publicada"
              - option "QA Pipeline Check 1778175023746 - Pausada"
              - option "QA Active Terminal Job 1778174976823 - Pausada"
              - option "QA Reject Job 1778174963227 - Publicada"
              - option "QA Active Terminal Job 1778174873153 - Pausada"
              - option "QA Reject Job 1778174856784 - Publicada"
              - option "QA Active Terminal Job 1778174800725 - Pausada"
              - option "QA Reject Job 1778174795448 - Publicada"
              - option "QA Active Terminal Job 1778174728502 - Pausada"
              - option "QA Reject Job 1778174724775 - Publicada"
              - option "QA Active Terminal Job 1778174540177 - Pausada"
              - option "QA Reject Job 1778174537545 - Pausada"
              - option "QA Active Terminal Job 1778174317808 - Pausada"
              - option "QA Reject Job 1778174315014 - Pausada"
              - option "QA Active Terminal Job 1778174098433 - Pausada"
              - option "QA Reject Job 1778174095872 - Pausada"
              - option "QA Active Terminal Job 1778174038070 - Pausada"
              - option "QA Reject Job 1778174035321 - Pausada"
              - option "QA Active Terminal Job 1778173953348 - Pausada"
              - option "QA Reject Job 1778173949740 - Pausada"
              - option "QA Active Terminal Job 1778173732363 - Pausada"
              - option "QA Reject Job 1778173729634 - Pausada"
              - option "QA Active Terminal Job 1778173509578 - Pausada"
              - option "QA Reject Job 1778173507150 - Pausada"
              - option "QA Active Terminal Job 1778173456885 - Pausada"
              - option "QA Reject Job 1778173454443 - Pausada"
              - option "QA Active Terminal Job 1778173381519 - Pausada"
              - option "QA Reject Job 1778173373926 - Pausada"
              - option "QA Active Terminal Job 1778173311955 - Pausada"
              - option "QA Reject Job 1778173308997 - Pausada"
              - option "QA Active Terminal Job 1778173238329 - Pausada"
              - option "QA Reject Job 1778173235846 - Pausada"
              - option "QA Active Terminal Job 1778173179802 - Pausada"
              - option "QA Reject Job 1778173177572 - Pausada"
              - option "QA Active Terminal Job 1778173132950 - Pausada"
              - option "QA Reject Job 1778173130795 - Pausada"
              - option "QA Active Terminal Job 1778173071037 - Pausada"
              - option "QA Reject Job 1778173066747 - Pausada"
              - option "QA Active Terminal Job 1778173043140 - Pausada"
              - option "QA Reject Job 1778173039777 - Pausada"
              - option "QA Active Terminal Job 1778173016186 - Pausada"
              - option "QA Reject Job 1778173013858 - Pausada"
              - option "QA Active Terminal Job 1778172979492 - Pausada"
              - option "QA Reject Job 1778172975550 - Pausada"
              - option "QA Reject Job 1778172935308 - Pausada"
              - option "QA Reject Job 1778172874733 - Pausada"
              - option "QA Match Job 1778078227200 - Publicada"
              - option "QA Match Job 1778078192595 - Publicada"
              - option "Especialista Protheus - Publicada"
              - option "Líder de IA e Automação - Publicada"
              - option "Auxiliar Administrativo - Publicada"
              - option "Desenvolvedor Fullstack Pleno - Publicada"
              - option "QA Match Job 1778003507251 - Publicada"
              - option "QA Match Job 1778002333127 - Publicada"
              - option "QA Match Job 1778001732482 - Encerrada"
              - option "Analista De Dados Senior - Publicada"
              - option "F2 Job 1777943863470 - Encerrada"
              - option "Analista de Sistemas Pleno - Reteste Forte Fase 6.1 - Publicada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de Sistemas Pleno - Teste Fase 6 - Pausada"
              - option "Analista de TI - Pausada"
              - option "Analista de TI - Trace - Pausada"
              - option "Analista de TI - Encerrada"
          - paragraph [ref=e470]: A vaga selecionada precisa estar publicada ou pausada para receber candidatos.
        - generic [ref=e471]:
          - button "Cancelar" [ref=e472] [cursor=pointer]
          - button "Criar e adicionar à vaga" [active] [ref=e473] [cursor=pointer]
      - button "Fechar modal" [ref=e474] [cursor=pointer]:
        - img [ref=e475]
```

# Test source

```ts
  366 |   await page.getByRole("button", { name: "Reprovar", exact: true }).first().click();
  367 |   await expect(page.getByRole("heading", { name: "Última vaga vinculada" })).toBeVisible();
  368 |   await expect(page.getByRole("heading", { name: "Vaga ativa" })).toHaveCount(0);
  369 |   await expect(page.getByText("Status final", { exact: true })).toBeVisible();
  370 |   await expect(page.getByText("Reprovado", { exact: true }).first()).toBeVisible();
  371 | 
  372 |   // Reprovar e trocar de aba
  373 |   await page.getByRole("button", { name: "Score & Análise", exact: true }).click();
  374 |   await expect(page.getByText("Compatibilidade Contextual", { exact: true }).first()).toBeVisible();
  375 |   await page.getByRole("button", { name: "Resumo", exact: true }).click();
  376 |   await expect(page.getByRole("heading", { name: "Última vaga vinculada" })).toBeVisible();
  377 | 
  378 |   // Reprovar e refresh mantém estado
  379 |   await page.reload();
  380 |   const rejectedAfterRefresh = await getPipelineHistoryViaApi(page, token, job.id, candidate.id);
  381 |   expect(rejectedAfterRefresh.status).toBe("rejected");
  382 |   expect(rejectedAfterRefresh.current_stage).toBe("rejected");
  383 | 
  384 |   // Candidato não aparece mais como ativo para vaga e não entra no board ativo
  385 |   let board = await getPipelineBoardViaApi(page, token, job.id);
  386 |   expect(boardHasCandidate(board, candidate.id)).toBeFalsy();
  387 | 
  388 |   await page.goto(`/pipeline/${job.id}`);
  389 |   await expect(page).toHaveURL(new RegExp(`/pipeline/${job.id}$`));
  390 |   await expect(page.getByText(candidateName, { exact: true })).toHaveCount(0);
  391 | 
  392 |   // Reativar candidato
  393 |   await addCandidateToJobViaApi(page, token, candidate.id, job.id);
  394 | 
  395 |   // Reativar e voltar para pipeline
  396 |   await page.goto(`/pipeline/${job.id}`);
  397 | 
  398 |   // Refresh final mantém estado ativo no pipeline
  399 |   await page.reload();
  400 |   await page.goto(`/pipeline/${job.id}`);
  401 | 
  402 |   board = await getPipelineBoardViaApi(page, token, job.id);
  403 |   expect(boardHasCandidate(board, candidate.id)).toBeTruthy();
  404 | 
  405 |   const history = await getPipelineHistoryViaApi(page, token, job.id, candidate.id);
  406 |   expect(history.status).toBe("active");
  407 |   expect(history.current_stage).toBe("entry");
  408 | });
  409 | 
  410 | test("linked candidate in add flow shows open action", async ({ page }) => {
  411 |   const suffix = Date.now();
  412 |   const sourceJobTitle = `QA Origem ${suffix}`;
  413 |   const targetJobTitle = `QA Destino ${suffix}`;
  414 |   const candidateName = `QA Candidato Vinculado ${suffix}`;
  415 |   const candidateEmail = `qa.candidato.vinculado.${suffix}@example.com`;
  416 | 
  417 |   await login(page);
  418 |   const token = await getToken(page);
  419 |   const sourceJob = await createJobViaApi(page, token, sourceJobTitle, "paused");
  420 |   const targetJob = await createJobViaApi(page, token, targetJobTitle, "paused");
  421 |   const candidate = await createCandidateViaApi(page, token, candidateName, candidateEmail);
  422 | 
  423 |   const linkResponse = await page.request.post(`${API_BASE_URL}/api/v1/pipeline/${candidate.id}/add-to-job`, {
  424 |     headers: {
  425 |       Authorization: `Bearer ${token}`,
  426 |     },
  427 |     data: {
  428 |       job_id: sourceJob.id,
  429 |       initial_stage: "entry",
  430 |     },
  431 |   });
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
> 466 |   await expect(modal.getByText("A vaga selecionada não pode receber novos candidatos.")).toBeVisible();
      |                                                                                          ^ Error: expect(locator).toBeVisible() failed
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
  532 |   expect(multiLinkResponse.ok()).toBeTruthy();
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
```