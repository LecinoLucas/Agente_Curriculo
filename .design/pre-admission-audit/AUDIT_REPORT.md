# Auditoria da Pré-admissão — PRE-ADMISSION-AUDIT-1

**Data:** 2026-06-04  
**Branch:** `save/behavioral-ai-and-wips`  
**Modelo:** Claude Sonnet 4.6

---

## Resumo Executivo

O fluxo de pré-admissão está **funcionalmente operacional** para os casos de uso principais (criar caso, aprovar/rejeitar documento, marcar pronto). Porém há **problemas de performance documentados, dois bugs visuais que induzem erro direto no RH, e sobrecarga de informação na tela principal**.

Os problemas mais urgentes:
1. **C-01** — Botão "Voltar" nunca aparece: `openPageHref` não é passado em `AdmissionCasePage`.
2. **C-02** — Status dot "received" usa verde idêntico a "approved" — o RH pode não perceber que há documentos aguardando revisão.
3. **P-01** — Cada ação de revisão dispara 3 calls de API concorrentes desnecessariamente (até 9 calls por aprovação).
4. **H-01** — Job title duplicado na barra de resumo.
5. **U-01** — Coluna direita com 5 cards empilhados, incluindo Protheus sempre visível.

---

## Escopo Auditado

| Área | Método | Status |
|------|--------|--------|
| State machine `pre_admission_state_machine.py` | Leitura de código | ✓ |
| `pre_admission_service.py` — métodos e fluxo | Leitura | ✓ |
| `admission_case_workspace_service.py` | Leitura | ✓ |
| Routers: `pre_admission.py`, `admissions.py`, `admission_packages.py` | Leitura | ✓ |
| `AdmissionCasePage.tsx` | Leitura | ✓ |
| `AdmissionCaseWorkspacePanel.tsx` | Leitura completa | ✓ |
| `AdmissionCaseHeader.tsx` (page header + summary bar) | Leitura | ✓ |
| `AdmissionChecklistCard.tsx` | Leitura | ✓ |
| `AdmissionDocumentsCard.tsx` (primeiros 100 linhas) | Leitura parcial | ✓ |
| `AdmissionSummaryCard.tsx` | Leitura | ✓ |
| `AdmissionNextActionsCard.tsx` | Leitura | ✓ |
| `AdmissionBlockersCard.tsx` | Leitura | ✓ |
| `AdmissionRecentEventsCard.tsx` | Leitura | ✓ |
| `AdmissionProtheusIntegrationPanel.tsx` (200 linhas) | Leitura parcial | ✓ |
| `CandidatePreAdmissionPanel.tsx` | Leitura | ✓ |
| Roles/permissões em `roles.ts` | Leitura | ✓ |
| `candidate-portal/src/services/candidatePreAdmissionService.ts` | Leitura | ✓ |
| `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx` | Leitura parcial | ✓ |
| Screenshots Playwright | Não executado (backend não disponível) | ✗ |

---

## Rotas e Telas Encontradas

### Staff / Admin

| Rota | Componente | Roles |
|------|-----------|-------|
| `/admission/cases/:caseId` | `AdmissionCasePage` → `AdmissionCaseWorkspacePanel` | admin, hr |
| `/admissao/:caseId` | Alias PT do acima | admin, hr |
| `/admission/cases/:caseId/integration` | `AdmissionIntegrationPlaceholderPage` | admin, hr |
| `/admissao/:caseId/integracao` | Alias PT do acima | admin, hr |
| `/admissao/checklists` | `PreAdmissionChecklistsPage` | admin, hr |
| `/admitidos` | `AdmitidosPage` | admin, hr |
| Tab "Pré-admissão" no drawer/perfil | `CandidatePreAdmissionPanel` | admin, hr |

### Candidate Portal

| Rota | Componente |
|------|-----------|
| `/pre-admissao` | `CandidatePreAdmissionPage` |
| Badge em `/minha-area` | `CandidateHomePage` (atalho) |

---

## Fluxo Atual Mapeado

### 1. Como um candidato entra em pré-admissão

```
Pipeline: candidato movido para etapa "hired"
  → Tab "Pré-admissão" aparece no drawer do candidato (visível para admin/hr)
  → CandidatePreAdmissionPanel carrega: GET /jobs/{jobId}/candidates/{candidateId}/pre-admission
  → Se envelope.can_create = true: botão "Iniciar pré-admissão" abre PreAdmissionStartDrawer
  → RH escolhe template → POST /jobs/{jobId}/candidates/{candidateId}/pre-admission
  → Caso criado com status "draft"
  → Candidato aparece em /admitidos
  → Link no admitidos abre /admission/cases/{caseId}
```

### 2. Como um caso admissional é criado

Dois caminhos:
- **Via drawer de candidato**: `CandidatePreAdmissionPanel` → `PreAdmissionStartDrawer` → `createPreAdmission(jobId, candidateId, { checklist_template_id })`
- **Via pipeline**: Ao mover para etapa `hired`, o backend pode criar automaticamente se configurado (via `candidate_application_pipeline_service.py`)

### 3. Como documentos são exibidos

`AdmissionCaseWorkspacePanel` faz `getDocuments(caseId)` que retorna um payload com:
- `checklist`: items com status e document_id se enviado
- `documents`: lista de documentos enviados com status, filename, size

Os documentos são exibidos em dois places:
- `AdmissionChecklistCard` — exibe itens do checklist com status
- `AdmissionDocumentsCard` — exibe documentos enviados com ações de revisão

### 4. Ações de revisão

| Ação | Endpoint | Handler |
|------|---------|---------|
| Aprovar documento | POST `/pre-admission/documents/{id}/approve` | `handleApproveDocument` |
| Rejeitar documento | POST `/pre-admission/documents/{id}/reject` | `handleRejectDocument` |
| Solicitar correção | POST `/pre-admission/documents/{id}/reject` (mesmo endpoint, flags diferentes) | `handleRejectDocument` |
| Marcar não obrigatório | POST `/admission/checklist-items/{id}/mark-not-required` | `handleMarkNotRequired` |
| Marcar pronto | POST `/admission/cases/{id}/mark-ready-for-export` | `handleMarkReady` |

### 5. Estados existentes

**PreAdmissionCase:** `draft → offer_preparing → offer_sent → offer_accepted → documents_pending → documents_received → ready_for_admission → admitted → dismissed` (+ `cancelled`, `offer_declined`)

**ChecklistItem:** `pending → received → approved / waived`; `received → rejected → received`

**Document:** `uploaded → approved / rejected → replaced`

**AdmissionPackage (ERP):** `draft → ready_for_review → approved_for_export → exported`

### 6. Permissões

| Ação | Roles permitidos |
|------|----------------|
| Ver workspace | admin, hr |
| Criar caso | admin, hr |
| Aprovar/rejeitar documento | admin, hr |
| Marcar não obrigatório | admin, hr |
| Marcar pronto para exportação | admin, hr |
| Recruiter | **Sem acesso** (apenas admin/hr) |
| Viewer | Sem acesso |
| Candidate | Apenas via portal `/pre-admissao` |

---

## Resultado da Auditoria Funcional

### O que funciona corretamente

| Funcionalidade | Verificação |
|---------------|------------|
| Criar caso admissional via drawer | ✓ Código OK |
| Aprovar documento | ✓ Endpoint + handler OK |
| Rejeitar documento com motivo público | ✓ Modal + endpoint OK |
| Solicitar correção | ✓ Mesmo endpoint com flag |
| Marcar item não obrigatório | ✓ OK |
| Marcar pronto para exportação | ✓ Com blockers tratados |
| Download de documento | ✓ Blob download OK |
| Candidato: visualizar documentos pendentes | ✓ OK |
| Candidato: fazer upload | ✓ OK |
| Loading states e skeletons | ✓ Bom |
| Empty states | ✓ Bem cobertos |
| Retry por seção em caso de erro | ✓ OK |
| State machine impede transições inválidas | ✓ Backend robusto |

### Problemas Funcionais

| ID | Problema | Severidade | Arquivo |
|----|---------|-----------|---------|
| F-01 | Cada ação de mutação dispara 3 API calls desnecessárias | Alto | `AdmissionCaseWorkspacePanel.tsx` |
| F-02 | ProtheusPanel embedded faz 2-3 calls próprias além das do workspace | Alto | `AdmissionProtheusIntegrationPanel.tsx` |
| F-03 | Botão "Voltar" nunca aparece — `openPageHref` não passado | Alto | `AdmissionCasePage.tsx` |
| F-04 | `ChecklistStatusDot`: status "received" tem cor verde = "approved" | Médio | `AdmissionChecklistCard.tsx:29` |
| F-05 | Eventos: sem paginação/load-more — máximo 20 eventos | Médio | `AdmissionCaseWorkspacePanel.tsx:194` |
| F-06 | `highlightedDocumentId` nunca é limpo após ação tomada | Baixo | `AdmissionCaseWorkspacePanel.tsx` |
| F-07 | Checklist sem empty state quando `items.length === 0` | Baixo | `AdmissionChecklistCard.tsx` |
| F-08 | "Próximas ações → Aprovar documento" apenas scrolla, não foca item | Médio | `AdmissionNextActionsCard.tsx` |

---

## Resultado da Auditoria Visual/UX

Detalhes completos em `UX_REVIEW.md`.

| ID | Problema | Severidade |
|----|---------|-----------|
| U-01 | Job title duplicado na summary bar | Alto |
| U-02 | Breadcrumb sem links — sem navegação de volta | Alto |
| U-03 | Coluna direita com 5 cards empilhados | Alto |
| U-04 | Protheus panel sempre visível mesmo irrelevante | Alto |
| U-05 | "Marcar pronto" na coluna secundária — ação primária escondida | Médio |
| U-06 | Botão de voltar inexistente na página do workspace | Crítico |
| U-07 | Modal de rejeição sem preview do documento | Médio |

---

## Resultado da Auditoria de Performance

| ID | Problema | Severidade |
|----|---------|-----------|
| P-01 | Cada mutação: 3 reloads concorrentes desnecessários | Alto |
| P-02 | ProtheusPanel embedded: 3 calls adicionais no mount | Alto |
| P-03 | 3 calls paralelas no mount (overview + docs + events) | Médio |
| P-04 | Candidato: todos itens carregados sem paginação | Baixo |
| P-05 | Sem cache local pós-carregamento | Baixo |

**Calls de API estimadas por interação:**
- Mount: 3 (overview + documents + events)
- Mount com case `readyForExport`: +3 (getWorkspace + getPackage + listAttempts)  
- 1 aprovação de documento: +3 (reload all)
- **Total em pior caso: 9 calls por aprovação**

---

## Problemas Críticos

### C-01 — Botão "Voltar" nunca aparece na página do workspace

**Arquivo:** `frontend/src/pages/AdmissionCasePage.tsx`  
**Evidência:**
```tsx
// AdmissionCasePage.tsx — openPageHref nunca é passado:
return (
  <AdmissionCaseWorkspacePanel
    caseId={caseId}
    integrationHref={integrationHref}
    // openPageHref ausente → botão de voltar não renderiza
  />
);
```

`AdmissionCaseHeader → AdmissionCasePageHeader` só renderiza o botão "Voltar" quando `backHref` é fornecido. `backHref` vem de `openPageHref`. Como `openPageHref` nunca é passado, o botão de voltar nunca aparece. O RH fica sem navegação de retorno explícita.

### C-02 — Status dot "received" usa verde idêntico a "approved"

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx:26-37`  
**Evidência:**
```tsx
const colorMap: Record<string, string> = {
  approved:     "bg-[hsl(var(--success))]",
  received:     "bg-[hsl(var(--success))]",  // ← ERRO: mesmo verde
  rejected:     "bg-[hsl(var(--danger))]",
  not_required: "bg-[hsl(var(--text-muted))]",
  pending:      "bg-[hsl(var(--warning))]",
};
```

Um documento "received" (aguardando revisão do RH) exibe exatamente o mesmo dot verde de "approved" (já revisado e aceito). O RH pode varrer a lista visualmente e concluir que todos os itens estão aprovados quando na verdade existem documentos esperando revisão.

---

## Problemas Altos

### H-01 — Job title duplicado na Summary Bar

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionCaseHeader.tsx:100-119`

O bloco do candidato no summary bar mostra o nome da vaga como subtítulo. Logo em seguida, o bloco "Vaga ativa" exibe o mesmo título novamente. Dois campos ocupam espaço mostrando informação idêntica.

```tsx
// Bloco candidato (linha ~101):
<p>{workspace.job.title}</p>   ← primeira ocorrência

// Bloco "Vaga ativa" (linha ~116):
<p>{workspace.job.title}</p>   ← segunda ocorrência (redundante)
```

### H-02 — 3 API calls em cada ação de mutação

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:253-258, 278-280, 303-305, 364-366`

Todos os handlers de ação chamam:
```typescript
await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);
```

Aprovar um documento não muda eventos. Marcar não obrigatório não muda documentos físicos. O reload de `events` após `approveDocument` é desnecessário e atrasado.

### H-03 — ProtheusPanel faz calls redundantes no modo embedded

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionProtheusIntegrationPanel.tsx`

Quando `variant="embedded"` com `workspace` passado E `readyForExport=true`, o painel dispara:
- `getPackageByCaseId(caseId)` 
- `listErpAttempts(packageId)`

Isso ocorre além das 3 calls do workspace principal.

---

## Problemas Médios

### M-01 — Breadcrumb sem links

`AdmissionCasePageHeader` renderiza breadcrumb "Pipeline > Admissão > [nome]" como texto estático. Nenhum item é clicável. O RH não tem navegação de breadcrumb funcional.

### M-02 — Next Actions não foca o item específico

`AdmissionNextActionsCard` — todos os botões de ação (exceto Protheus) chamam `onOpenChecklist()` que apenas faz `scrollIntoView` do card de checklist. Não abre nem foca o item específico que precisa de ação.

### M-03 — Sem confirmação para "Marcar pronto para exportação"

A ação dispara imediatamente sem diálogo de confirmação. Esta mudança de status é relevante operacionalmente.

### M-04 — Sem paginação de eventos

`loadEvents(caseId, 1, 20)` sempre busca a primeira página com 20 eventos. Casos com histórico longo não têm acesso aos eventos anteriores.

### M-05 — Coluna direita sobrecarregada com 5 cards

A coluna direita empilha: `AdmissionSummaryCard` + `AdmissionDocumentsCard` + `AdmissionNextActionsCard` + `AdmissionProtheusIntegrationPanel` + `AdmissionRecentEventsCard`. Em viewport ≤1440px, a coluna direita é mais longa que a esquerda. Em mobile, tudo vira uma lista enorme.

---

## Problemas Baixos

| ID | Descrição | Arquivo |
|----|---------|---------|
| L-01 | `highlightedDocumentId` nunca é limpo após ação | `AdmissionCaseWorkspacePanel.tsx` |
| L-02 | Checklist card sem empty state quando `items = []` | `AdmissionChecklistCard.tsx` |
| L-03 | `recruiter` não tem acesso a pré-admissão mas a UI não comunica isso | `roles.ts` |
| L-04 | Modal de rejeição sem preview do documento | `AdmissionDocumentsCard.tsx` |
| L-05 | Protheus panel sempre embedded mesmo quando caso está em `draft` | `AdmissionCaseWorkspacePanel.tsx` |

---

## Screenshots Gerados

Nenhum screenshot automático foi gerado — o backend não estava disponível nesta auditoria.

**Cenas recomendadas para execução manual:**
```bash
# Executar com servidor rodando:
playwright test e2e/pre-admission-smoke.spec.ts --headed
```

Screenshots a capturar:
- `01-workspace-with-pending-docs.png` — documentos aguardando revisão
- `02-workspace-all-approved.png` — caso pronto para exportar
- `03-workspace-with-blockers.png` — bloqueadores ativos
- `04-workspace-mobile-375.png` — layout mobile
- `05-reject-modal.png` — modal de rejeição
- `06-pre-admission-panel-drawer.png` — painel no drawer do candidato
- `07-candidate-portal-pre-admission.png` — tela do candidato
- `08-summary-bar-duplicate-title.png` — evidência do job title duplicado

---

## Riscos de Regressão

| Arquivo | Risco | Tipo |
|---------|-------|------|
| `AdmissionCaseWorkspacePanel.tsx` | Alto | Orquestrador principal; qualquer mudança no reload pode quebrar consistência de estado |
| `AdmissionProtheusIntegrationPanel.tsx` | Médio | Estado próprio de pacote/tentativas ERP; alterar carga pode quebrar painel |
| `AdmissionChecklistCard.tsx:colorMap` | Baixo | Mudança visual pura |
| `AdmissionCasePage.tsx` | Baixo | Wrapper simples; passar `openPageHref` é trivial e seguro |
| State machine backend | Crítico | Não alterar — está funcionando corretamente |

---

## Recomendações (ordenadas por prioridade)

1. **[C-01]** Passar `openPageHref` correto em `AdmissionCasePage` — 1 linha.
2. **[C-02]** Corrigir cor do dot `received` para amber/warning — 1 linha.
3. **[H-01]** Remover bloco "Vaga ativa" redundante da summary bar — trivial.
4. **[H-02]** Reduzir reloads pós-mutação: aprovar/rejeitar → recarregar só `overview` + `documents`; marcar não obrigatório → só `overview` + `documents`; eventos não precisam de reload imediato.
5. **[M-01]** Converter breadcrumb em links navegáveis.
6. **[H-03]** Condicionar carga do ProtheusPanel embedded: não disparar calls se `!readyForExport`.
7. **[M-05]** Mover ProtheusPanel e EventsCard para área secundária (aba ou accordeon).

---

## O que NÃO deve ser alterado nesta fase

- State machine da pré-admissão (backend)
- Endpoints da API (contratos estáveis)
- Permissões por role (aguardar decisão sobre recruiter)
- Fluxo do portal do candidato (funcional, sem bloqueadores)
- Integração Protheus/ERP (lógica operacional sensível)
- Modelos de banco / migrations

---

## Conclusão

O fluxo de pré-admissão está operacional mas tem dois bugs que induzem erro direto (**C-01** e **C-02**), um problema de performance relevante (**P-01**) e sobrecarga de informação na tela principal. As correções críticas e altas são na maioria mudanças de 1-10 linhas sem impacto em regra de negócio.
