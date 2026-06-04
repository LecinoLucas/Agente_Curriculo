# Plano de Correção — PRE-ADMISSION-AUDIT-1

**Data:** 2026-06-04  
**Baseado em:** AUDIT_REPORT.md, FUNCTIONAL_REVIEW.md, UX_REVIEW.md

> **Regra:** Nenhuma tarefa abaixo deve ser executada sem autorização explícita.  
> Não commitar, não alterar regra de negócio, não criar migration, não alterar backend.

---

## BLOCO 1 — Bugs críticos/altos (1-5 linhas cada, sem risco de regressão)

### TASK-01 — Passar `openPageHref` correto em `AdmissionCasePage`

**Arquivo:** `frontend/src/pages/AdmissionCasePage.tsx`  
**Problema:** C-01 — Botão de voltar nunca aparece  
**Correção:**
```tsx
// Adicionar openPageHref com href de retorno ao pipeline/admitidos
return (
  <AdmissionCaseWorkspacePanel
    caseId={caseId}
    integrationHref={integrationHref}
    openPageHref="/admitidos"  // ← ou derivar da navigação anterior
  />
);
```
**Risco:** Baixo — apenas adiciona prop que já é suportado  
**Referência:** C-01

---

### TASK-02 — Corrigir cor do status dot `received`

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx:29`  
**Problema:** C-02 — Status "received" tem mesma cor verde de "approved"  
**Correção:**
```tsx
const colorMap: Record<string, string> = {
  approved:     "bg-[hsl(var(--success))]",
  received:     "bg-[hsl(var(--warning))]",  // ← trocar para amber/warning
  rejected:     "bg-[hsl(var(--danger))]",
  not_required: "bg-[hsl(var(--text-muted))]",
  pending:      "bg-[hsl(var(--warning))]",
};
```
**Risco:** Baixo — mudança puramente visual  
**Referência:** C-02

---

### TASK-03 — Remover bloco "Vaga ativa" duplicado da Summary Bar

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionCaseHeader.tsx`  
**Problema:** H-01 — Job title duplicado  
**Correção:** Remover o bloco `admission-summary-bar__block` que exibe "Vaga ativa" + `workspace.job.title` (já aparece no bloco do candidato)  
**Risco:** Baixo — remove informação redundante  
**Referência:** H-01

---

### TASK-04 — Reduzir reloads pós-mutação de documento

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx`  
**Problema:** P-01 — Cada aprovação dispara 3 API calls  
**Correção:**
```typescript
// handleApproveDocument e handleRejectDocument:
// ANTES:
await Promise.all([loadOverview(), loadDocuments(), loadEvents()]);

// DEPOIS: eventos não mudam ao aprovar/rejeitar documento
await Promise.all([loadOverview(), loadDocuments()]);
// loadEvents() apenas quando handleMarkReady ou handleMarkNotRequired
```
**Risco:** Médio — verificar que eventos não são criados por approve/reject antes de remover  
**Nota:** Confirmar no backend se `approve_checklist_item` gera evento. Se sim, manter loadEvents() apenas para handleMarkReady.  
**Referência:** P-01

---

### TASK-05 — Converter breadcrumb em links navegáveis

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionCaseHeader.tsx`  
**Problema:** M-01 — Breadcrumb sem links  
**Correção:**
```tsx
// Transformar texto "Pipeline" e "Admissão" em links:
<li><Link to="/pipeline">Pipeline</Link></li>
<li><Link to="/admitidos">Admissão</Link></li>
<li className="font-semibold text-text">{candidateName}</li>
```
**Risco:** Baixo  
**Referência:** M-01

---

## BLOCO 2 — Médio prazo (requer mais contexto ou revisão)

### TASK-06 — Condicionar carga do ProtheusPanel embedded

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx` +  
            `frontend/src/features/admission-workspace/AdmissionProtheusIntegrationPanel.tsx`  
**Problema:** H-03 + P-02 — ProtheusPanel faz calls independentes mesmo quando irrelevante  
**Correção:** Renderizar o ProtheusPanel apenas quando `workspace.summary.ready_for_export === true`  
```tsx
// Em AdmissionCaseWorkspacePanel.tsx:
{workspace.summary.ready_for_export && (
  <AdmissionProtheusIntegrationPanel
    caseId={caseId}
    variant="embedded"
    workspace={workspace}
  />
)}
```
**Risco:** Médio — ProtheusPanel precisa continuar funcionando quando exibido  
**Referência:** H-03, P-02

---

### TASK-07 — Ocultar ou renomear "Revisar documento" quando sem documento

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx:72-82`  
**Problema:** F — Botão "Revisar documento" ativo/desabilitado quando item não tem documento  
**Correção:** Ocultar o item do menu quando `!documentId` ao invés de desabilitar  
**Risco:** Baixo  

---

### TASK-08 — Adicionar confirmação para "Marcar pronto para exportação"

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionSummaryCard.tsx`  
**Problema:** M-03 — Ação irreversível sem confirmação  
**Correção:** Adicionar modal de confirmação simples antes de `onMarkReady()`  
**Risco:** Baixo — adiciona step de confirmação sem alterar lógica  

---

### TASK-09 — Adicionar paginação/load-more para eventos

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:190-208`  
**Problema:** M-04 — Máximo 20 eventos sem como carregar mais  
**Correção:** Adicionar botão "Ver mais" que carrega `page 2, 3...` e append na lista  
**Risco:** Baixo — additive  

---

### TASK-10 — Limpar `highlightedDocumentId` após ação

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx`  
**Problema:** L-01 — Highlight não limpo  
**Correção:** Após `reloadSections()`, limpar `setHighlightedDocumentId(null)`  
**Risco:** Baixo  

---

### TASK-11 — Adicionar empty state ao ChecklistCard quando items = []

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx`  
**Problema:** L-02  
**Correção:** Adicionar `if (!items.length) return <EmptyState .../>` com mensagem contextual  
**Risco:** Baixo  

---

## BLOCO 3 — Longo prazo / arquitetura (requerem design brief separado)

### TASK-12 — Reorganizar coluna direita do workspace

**Problema:** M-05, U-03  
**Escopo:** Mover EventsCard e ProtheusPanel para area secundária ou accordeon  
**Risco:** Médio — mudança estrutural no layout  
**Nota:** Antes de implementar, criar design brief com proposta visual aprovada pelo usuário  

---

### TASK-13 — Indicador de progresso no portal do candidato

**Arquivo:** `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx`  
**Problema:** Candidato não sabe quantos documentos de X foram aprovados  
**Dados disponíveis:** `summary.documents_total`, `summary.documents_approved` já chegam no payload  
**Correção:** Adicionar barra de progresso no topo da página usando esses dados  
**Risco:** Baixo — additive  

---

## Prioridade Recomendada

```
Sprint imediata (triviais, sem risco):
  TASK-01, TASK-02, TASK-03, TASK-05, TASK-07, TASK-10, TASK-11

Sprint seguinte (verificar antes de alterar):
  TASK-04 (confirmar comportamento de eventos no backend)
  TASK-06 (testar ProtheusPanel após ocultação)
  TASK-08 (decidir texto do modal de confirmação)

Backlog (requer design ou análise):
  TASK-09, TASK-12, TASK-13
```

---

## Registrado como NÃO alterar

- State machine do backend (pre_admission_state_machine.py)
- Endpoints de API e contratos
- Permissões por role
- Integração Protheus/ERP (lógica)
- Fluxo do portal do candidato (exceto TASK-13 que é additive)
- Modelos de banco de dados
