# Revisão Funcional — Pré-admissão

**Data:** 2026-06-04  
**Referência:** AUDIT_REPORT.md → seção "Resultado da Auditoria Funcional"

---

## Fluxo RH/Admin — Checklist de Validação

| Ação | Status | Evidência | Notas |
|------|--------|-----------|-------|
| Abrir caso admissional | ✓ OK | `CandidatePreAdmissionPanel → handleCreateCase → createPreAdmission()` | Via drawer do candidato |
| Ver resumo do candidato | ✓ OK | `getOverview()` → `AdmissionCandidateSummarySchema` | Nome, vaga, stage |
| Ver status geral do caso | ✓ OK | `overview.case.status` → `AdmissionCaseHeader` badge | 11 estados possíveis |
| Ver checklist | ✓ OK | `getDocuments()` → `AdmissionChecklistCard` | Com progresso bar |
| Ver documentos pendentes | ✓ OK | Itens `pending`/`received` listados | Dots de status presentes |
| Ver documentos enviados | ✓ OK | `AdmissionDocumentsCard` | Com tamanho e data |
| Aprovar documento | ✓ OK | `handleApproveDocument → approvePreAdmissionDocument → POST /pre-admission/documents/{id}/approve` | Sem confirmação modal |
| Rejeitar documento | ✓ OK | Modal com motivo → `rejectPreAdmissionDocument` → POST | Modal com 2 campos |
| Solicitar correção | ✓ OK | Mesmo endpoint de rejeição, campo diferente | Texto diferente para o candidato |
| Marcar item não obrigatório | ✓ OK | `handleMarkNotRequired → admissionWorkspaceService.markChecklistItemNotRequired` | Sem confirmação |
| Marcar pronto para exportação | ✓ OK (com blockers) | `handleMarkReady → admissionWorkspaceService.markCaseReadyForExport` | `extractBlockersFromError` trata 422 |
| Ver histórico / eventos | ✓ OK | `loadEvents → getEvents → AdmissionRecentEventsCard` | Máx. 20, sem paginação |
| Ver status ERP/Protheus | ✓ OK | `AdmissionProtheusIntegrationPanel → getPackageByCaseId + listErpAttempts` | |
| Tentar exportar quando não pronto | ✓ OK | Backend retorna 422 com blockers, frontend exibe mensagem | |
| Erro de API com retry | ✓ OK | `SectionErrorState` com "Tentar novamente" por seção | |
| Lista vazia | ✓ OK | Cards renderizam empty state interno | |
| Documento ausente | ✓ OK | Item aparece como `pending`, bloqueio listado | |

### Problemas funcionais encontrados no fluxo RH

**F-03 — Botão "Voltar" não aparece (severidade: alto)**

`AdmissionCasePage.tsx` não passa `openPageHref` para `AdmissionCaseWorkspacePanel`. O `AdmissionCasePageHeader` só renderiza o botão de voltar quando `backHref` existe. Resultado: RH não tem navegação explícita de retorno.

```tsx
// AdmissionCasePage.tsx — ANTES (problema):
return (
  <AdmissionCaseWorkspacePanel
    caseId={caseId}
    integrationHref={integrationHref}
    // openPageHref não passado → sem botão de voltar
  />
);
```

**F-04 — Status dot `received` usa cor verde = `approved`**

```tsx
// AdmissionChecklistCard.tsx:29:
received: "bg-[hsl(var(--success))]",  // mesmo verde de approved
```

O RH ao varrer a lista visualmente pode confundir "em análise aguardando revisão" com "aprovado".

**F-08 — "Next Actions" não foca documento específico**

Todos os botões de ação no `AdmissionNextActionsCard` (exceto Protheus) chamam `onOpenChecklist()` que apenas scrolla para a seção de checklist. Não há foco no item específico que precisa de ação.

---

## Fluxo Candidato — Checklist de Validação

| Ação | Status | Evidência | Notas |
|------|--------|-----------|-------|
| Abrir área de pré-admissão | ✓ OK | `GET /candidate-portal/pre-admission` | Requer autenticação de candidato |
| Ver pendências | ✓ OK | `ApiChecklistItem.status` + `STATUS_CONFIG` por status | Ícones e cores por status |
| Enviar documento | ✓ OK | `candidatePreAdmissionService.uploadDocument()` | POST com multipart/form-data |
| Ver documento em análise | ✓ OK | Status `received` = "Em análise" | Ícone Clock + badge amber |
| Ver documento rejeitado com motivo | ✓ OK | `rejection_reason_public` exibido | Público, não interno |
| Reenviar documento corrigido | ✓ OK | Upload de novo arquivo, anterior marcado `replaced` | |
| Ver progresso geral | ✗ AUSENTE | Não há indicador de progresso X/Y no portal | Item a implementar futuramente |
| Mensagens de erro | ✓ OK | `HttpError` tratado com redirect para 401 | |

### Problema no fluxo do candidato

**Sem indicador de progresso global.** O `CandidatePreAdmissionPage` não exibe quantos documentos de X foram aprovados. O candidato não sabe o quanto falta para completar o processo. O backend retorna `documents_total`, `documents_approved` via `ApiPreAdmissionSummary` mas esses dados não parecem estar usados no topo da página.

---

## Permissões — Verificação

| Role | Acesso workspace `/admission/cases/` | Criar caso | Aprovar/Rejeitar | Marcar pronto |
|------|-------------------------------------|-----------|-----------------|---------------|
| `admin` | ✓ | ✓ | ✓ | ✓ |
| `hr` | ✓ | ✓ | ✓ | ✓ |
| `recruiter` | ✗ Sem acesso | ✗ | ✗ | ✗ |
| `viewer` | ✗ Sem acesso | ✗ | ✗ | ✗ |
| `manager` | ✗ Sem acesso | ✗ | ✗ | ✗ |
| `candidate` | Apenas portal `/candidate-portal/pre-admission` | N/A | N/A | N/A |

**Nota sobre `recruiter`:** A constante `PRE_ADMISSION_AREA_ROLES = ["admin", "hr"]` exclui recrutadores explicitamente. No drawer de candidatos (`getVisibleCandidateTabs`), a tab de pré-admissão é ocultada para roles sem acesso. Isso é consistente, mas não está documentado para o usuário final — o recruiter não sabe por que não vê a tab.

---

## State Machine — Verificação de Transições

### PreAdmissionCase

```
draft
  → offer_preparing, offer_sent, offer_accepted,
    documents_pending, documents_received, cancelled

offer_preparing → offer_sent, offer_accepted,
                  documents_pending, documents_received, cancelled

offer_sent → offer_accepted, offer_declined,
             documents_pending, documents_received, cancelled

offer_accepted → documents_pending, documents_received,
                 ready_for_admission, cancelled

offer_declined (terminal)

documents_pending → documents_received, ready_for_admission, cancelled

documents_received → documents_pending, ready_for_admission, cancelled

ready_for_admission → documents_pending, documents_received,
                      admitted, cancelled

admitted → dismissed

dismissed (terminal)

cancelled (terminal)
```

**Observação:** O frontend atual parece usar apenas `draft → documents_pending/received → ready_for_admission → admitted`. Os estados `offer_preparing / offer_sent / offer_accepted / offer_declined` existem no backend mas não parecem ter telas dedicadas no frontend. Possível funcionalidade não completamente implementada.

### ChecklistItem

```
pending → received, waived
received → approved, rejected, waived
approved (terminal)
rejected → received, waived
waived (terminal)
```

**Funcionando corretamente:** O backend impede transições inválidas via state machine. Aprovar um item `pending` (sem documento) retornaria erro.

### Document

```
uploaded → approved, rejected
approved (terminal)
rejected → replaced
replaced (terminal)
```

**Funcionando:** Ao rejeitar um documento, o candidato pode fazer novo upload. O documento antigo fica com status `rejected`, o novo fica `uploaded`. Apenas o mais recente é considerado nas blockers.

---

## Análise de Endpoints

### Endpoints com potencial inconsistência

| Endpoint | Observação |
|---------|-----------|
| `POST /admission/checklist-items/{id}/approve` | Usa "admission" prefix (workspace) |
| `POST /pre-admission/documents/{id}/approve` | Usa "pre-admission" prefix — dois prefixos para operações similares |
| `GET /admission/cases/{id}/workspace` | Endpoint principal do workspace |
| `GET /pre-admission/cases/{id}/overview` | Endpoint de overview separado do workspace |

Os dois endpoints principais (`/admission/cases/{id}/workspace` e `/pre-admission/cases/{id}/overview`) parecem retornar dados sobrepostos. O frontend usa `getOverview()` e `getDocuments()` separadamente ao invés de um único `getWorkspace()` — isso resulta em 2 calls onde 1 poderia ser suficiente para o estado inicial.

---

## Conclusão Funcional

O fluxo funciona. A state machine está correta. As validações de bloqueio funcionam. O principal problema funcional é **performance** (F-01, F-02) e **navegação/orientação visual** (F-03, F-04). Nenhum bug que impeça a conclusão de um processo admissional foi encontrado.
