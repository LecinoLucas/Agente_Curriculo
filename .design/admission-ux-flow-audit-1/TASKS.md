# TASKS — ADMISSION-UX-FLOW-AUDIT-1

**Status:** Auditoria concluída — plano de correção a seguir  
**Data:** 2026-06-16  
**Resultado da auditoria:** WARN_WITH_FINDINGS

---

## Plano de correção em fases

---

## ADMISSION-FIX-RULES-1 — Corrigir rotas de rejeição sem mensagem pública

**Prioridade:** ALTA  
**Risco:** Candidato recebe rejeição sem explicação  
**Estimativa:** 1–2 horas  

### Achados tratados
- H-01: `_reject_or_request_correction` não define `rejection_reason_public`
- H-02: `PreAdmissionChecklist.tsx` passa só `reviewNotes` na rejeição

### Escopo permitido
- Alterar `admission_case_workspace_service.py`
- Alterar `PreAdmissionChecklist.tsx` (verificar se ainda está em uso ativo)
- Adicionar testes para os novos comportamentos
- Não alterar API (endpoints existem, apenas ajustar body/validação interna)

### Arquivos prováveis
```
backend/src/application/services/admission_case_workspace_service.py (linhas 180-204, 273-308)
frontend/src/features/candidates/drawer/components/PreAdmissionChecklist.tsx (linhas 91-96, prop onRejectDocument)
backend/tests/integration/test_admission_case_workspace.py
```

### Prompt cirúrgico
```
ADMISSION-FIX-RULES-1

Contexto:
- audit encontrou que reject_checklist_item e request_checklist_item_correction em admission_case_workspace_service.py
  chamam _reject_or_request_correction com review_notes mas sem rejection_reason_public.
- O candidato não recebe mensagem explicativa quando a rejeição vem desses endpoints.
- PreAdmissionChecklist.tsx (legacy drawer) também rejeita passando só reviewNotes.

Escopo:
1. Alterar _reject_or_request_correction para aceitar rejection_reason_public opcional.
2. Nos callers reject_checklist_item e request_checklist_item_correction, definir
   rejection_reason_public com string padrão humanizada (ex: "O documento precisa ser corrigido. Entre em contato com o RH.")
   OU tornar os endpoints de checklist aceitarem body com rejection_reason_public.
3. Verificar se PreAdmissionChecklist.tsx está em uso ativo. Se sim, corrigir prop onRejectDocument
   para aceitar e passar rejection_reason_public.
4. Adicionar testes backend: rejeição via checklist item deve resultar em document.rejection_reason_public != None.

Proibido:
- Não alterar state machine
- Não alterar endpoints (URL, método, response model)
- Não criar migration
```

---

## ADMISSION-FIX-UX-1 — Corrigir permissão e fallback no portal do candidato

**Prioridade:** ALTA  
**Risco:** UX confusa, candidato sem instrução após rejeição  
**Estimativa:** 30–60 min

### Achados tratados
- H-03: Mensagem de permissão errada menciona "recrutadores"
- U-02: Candidato sem fallback quando `rejection_reason_public` é null
- PC-03: Estado vazio vago no portal sem pré-admissão ativa

### Escopo permitido
- Alterar `CandidatePreAdmissionPanel.tsx`
- Alterar `CandidatePreAdmissionPage.tsx` (candidate-portal)
- Sem alteração de backend

### Arquivos prováveis
```
frontend/src/features/candidates/drawer/components/CandidatePreAdmissionPanel.tsx (linha 205)
candidate-portal/src/pages/CandidatePreAdmissionPage.tsx (linhas 445–449, 196–211)
```

### Prompt cirúrgico
```
ADMISSION-FIX-UX-1

Contexto:
- CandidatePreAdmissionPanel.tsx diz "ficam disponíveis para ... recrutadores" mas recrutadores não têm acesso.
- No portal do candidato, quando item.status === 'rejected' e rejectionReasonPublic é null,
  o candidato vê só o badge vermelho sem nenhuma instrução.
- Estado vazio da CandidatePreAdmissionPage ("Nenhuma pré-admissão ativa") não orienta o candidato.

Escopo:
1. Corrigir texto em CandidatePreAdmissionPanel.tsx: remover "recrutadores" da descrição de acesso.
2. Em CandidatePreAdmissionPage.tsx, adicionar fallback quando item.status === 'rejected' e
   rejectionReasonPublic é null: "Entre em contato com o RH para mais informações sobre este documento."
3. Melhorar mensagem do estado vazio ("Aguarde o contato do RH para iniciar o processo de admissão.").

Proibido:
- Não alterar backend
- Não alterar rotas
- Não criar novos componentes
```

---

## ADMISSION-FIX-UX-2 — Substituir window.confirm() e adicionar empty states

**Prioridade:** MÉDIA  
**Risco:** Baixo  
**Estimativa:** 1–2 horas

### Achados tratados
- M-02: `window.confirm()` para aprovação de documento
- M-03: Empty state ausente em `AdmissionChecklistCard.tsx`
- L-04: Botão "Recarregar workspace" inacessível no fim da página

### Escopo permitido
- Alterar `AdmissionDocumentsCard.tsx`
- Alterar `AdmissionChecklistCard.tsx`
- Alterar `AdmissionCaseWorkspacePanel.tsx` (mover/duplicar botão de reload)
- Sem alteração de backend

### Arquivos prováveis
```
frontend/src/features/admission-workspace/components/AdmissionDocumentsCard.tsx (linha 266)
frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx (área de items vazia)
frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx (linha 651-659)
```

### Prompt cirúrgico
```
ADMISSION-FIX-UX-2

Contexto:
- AdmissionDocumentsCard.tsx usa window.confirm() para confirmar aprovação de documento.
- AdmissionChecklistCard.tsx não tem empty state quando items.length === 0.
- O botão "Recarregar workspace" está no final da página.

Escopo:
1. Substituir window.confirm("Confirmar aprovação...") por inline confirmation: ao clicar em "Aprovar",
   o botão muda para "Confirmar aprovação" (verde) + "Cancelar" (2 segundos para confirmar).
   Alternativa: usar componente Dialog existente no projeto.
2. Adicionar empty state no AdmissionChecklistCard quando items.length === 0:
   "Nenhum item de checklist. O template não foi aplicado ou não possui itens ativos."
3. Adicionar botão "Recarregar" no header do workspace (AdmissionCaseHeader ou topo do panel)
   além do existente no fim da página.

Proibido:
- Não alterar API
- Não criar novos components de UI (usar existentes do projeto)
```

---

## ADMISSION-FIX-PROTHEUS-UX-1 — Humanizar painel Protheus Bridge para RH

**Prioridade:** MÉDIA  
**Risco:** RH não consegue interpretar erros técnicos  
**Estimativa:** 1–2 horas

### Achados tratados
- M-01: Termos técnicos expostos ao RH (`would_execute`, `erp_send_attempted`, `storage_mode`, etc.)
- PQ-01: Mensagens de status sem tradução
- L-03: Terminologia mista EN/PT

### Escopo permitido
- Alterar `AdmissionProtheusBridgeSummaryPanel.tsx`
- Sem alteração de backend (dados permanecem os mesmos)

### Arquivos prováveis
```
frontend/src/features/admission-workspace/AdmissionProtheusBridgeSummaryPanel.tsx
```

### Prompt cirúrgico
```
ADMISSION-FIX-PROTHEUS-UX-1

Contexto:
- AdmissionProtheusBridgeSummaryPanel.tsx exibe campos técnicos sem tradução:
  would_execute, erp_send_attempted, registration_routine_called, storage_mode, readiness, trace_id.
- O usuário de RH não sabe o que esses campos significam ou o que fazer quando são true/false.

Escopo:
1. Substituir os labels técnicos por texto humanizado:
   - "would_execute" → "Enviaria para o Protheus?" (tooltip: "Indica se o sistema tentaria executar o envio neste momento")
   - "erp_send_attempted" → "Envio real tentado?" (vermelho se true)
   - "registration_routine_called" → "Rotina de cadastro chamada?" (vermelho se true)
   - "storage_mode" → label friendly (ex: "local" → "Armazenamento local")
   - "readiness" → label friendly ("not_ready" → "Não pronto", "ready" → "Pronto")
   - "trace_id" → exibir apenas os primeiros 8 chars como "ID de rastreio: abc12345..." ou omitir
2. Adicionar tooltip ou nota ao lado de cada campo técnico.
3. Manter todos os dados — não remover informação, apenas traduzir.

Proibido:
- Não alterar API
- Não remover campos do painel (só traduzir labels)
```

---

## ADMISSION-FIX-PROTHEUS-API-1 — Limite no dashboard de exportação e validação de códigos

**Prioridade:** MÉDIA  
**Risco:** Overload por query sem limite; códigos stub em produção  
**Estimativa:** 30 min

### Achados tratados
- PQ-03: Sem limite superior em `limit` do dashboard
- PQ-02: Valores padrão `STUB`, `T01`, `01` no enqueue

### Escopo permitido
- Alterar `backend/src/interface/api/routers/pre_admission.py`
- Alterar `backend/src/interface/api/schemas/pre_admission_schemas.py` (default de ProtheusExportQueueCreateRequest)
- Adicionar testes

### Arquivos prováveis
```
backend/src/interface/api/routers/pre_admission.py (linha 804)
backend/src/interface/api/schemas/pre_admission_schemas.py (ProtheusExportQueueCreateRequest)
```

### Prompt cirúrgico
```
ADMISSION-FIX-PROTHEUS-API-1

Contexto:
- /pre-admission/protheus-export-dashboard/items aceita limit sem upper bound.
- ProtheusExportQueueCreateRequest tem defaults STUB/T01/01 que não são válidos em produção.

Escopo:
1. Adicionar le=200 no limit Query de list_protheus_export_dashboard_items.
2. Em ProtheusExportQueueCreateRequest, tornar unit_code, protheus_group_code, protheus_branch_code
   sem default (ou com default None) e validar no enqueue que não são vazios antes de prosseguir.
   Alternativa: ler valores padrão de settings (PROTHEUS_DEFAULT_UNIT_CODE etc.) com None como valor
   de produção que força o frontend a informar.
3. Adicionar teste para limit > 200 → 422.

Proibido:
- Não alterar o payload de exportação real
- Não criar migration
```

---

## ADMISSION-FIX-TESTS-1 — Cobrir gaps de teste

**Prioridade:** MÉDIA  
**Risco:** Regressão não detectada em futuras alterações  
**Estimativa:** 2–3 horas

### Achados tratados
- M-07: `AdmissionChecklistCard.tsx` sem testes
- Gaps de teste identificados na seção 10 do AUDIT_REPORT

### Escopo permitido
- Criar testes em `frontend/src/features/admission-workspace/components/__tests__/`

---

## ADMISSION-PROTHEUS-STATUS-UX-1

**Status:** Concluído  
**Data:** 2026-06-16

### Resultado
- Painel Protheus/ERP com labels humanizados para RH.
- Banner de bloqueio de envio real visível em modo seguro, sem aparência de erro.
- Dry-run/preflight e STUB mode destacados sem expor payload sensível.
- `error_code` e `blocked_reason` traduzidos, com código técnico mantido só como detalhe secundário.
- Nenhum botão falso de envio real criado.

### Arquivos tratados
- `frontend/src/features/admission-workspace/protheusExportStatus.ts`
- `frontend/src/features/admission-workspace/AdmissionProtheusBridgeSummaryPanel.tsx`
- `frontend/src/features/admission-workspace/AdmissionProtheusExportQueuePanel.tsx`
- `frontend/src/features/admission-workspace/__tests__/AdmissionProtheusExportQueuePanel.test.tsx`
- `frontend/src/features/admission-workspace/__tests__/AdmissionProtheusBridgeSummaryPanel.test.tsx`

---

## ADMISSION-UX-FINAL-REVIEW-1

**Status:** Concluído  
**Data:** 2026-06-16  
**Resultado final:** PASS_WITH_NOTES

### Conclusão

- Fluxo do RH está claro, orientado por próxima ação e com empty states mais úteis.
- Fluxo do candidato está compreensível, com correção/rejeição e upload bem orientados.
- Painel Protheus/ERP ficou legível para RH e continua sem sugerir envio real.
- Segurança e privacidade permanecem coerentes: sem botão falso de envio real e sem vazamento de `review_notes` ao candidato.

### Notas residuais

- Revisão visual desta sessão foi estrutural/read-only; não houve captura de screenshots porque não havia browser tool disponível.
- `PreAdmissionChecklist.tsx` continua no repositório como componente legado, marcado como não utilizado.
- Testes backend focados desta revisão não rodaram por ausência de env local carregado (`APP_SECRET_KEY`, `DATABASE_URL`, `JWT_SECRET_KEY`), mas a cobertura relevante foi mapeada por leitura.

### Artefatos

- Relatório final: `.design/admission-ux-flow-audit-1/FINAL_REVIEW.md`

---

## ADMISSION-CLEANUP-VALIDATION-1

**Status:** Concluído  
**Data:** 2026-06-16  
**Resultado final:** PASS_WITH_NOTES

### Resultado

- `PreAdmissionChecklist.tsx` confirmado como 100% órfão e removido com segurança.
- Frontend validado após remoção:
  - `npx tsc --noEmit` → sem erros
  - `AdmissionCasePage.test.tsx` → passando
  - `PreAdmissionChecklistsPage.test.tsx` → passando
- Teste backend focado da área principal executado com sucesso:
  - `cd backend && .venv/bin/python -m pytest tests/integration/test_admission_case_workspace.py`
  - Resultado: `19 passed`
- Suíte ampla `admission/pre_admission` executada com ambiente correto e documentada:
  - Resultado: `225 passed, 3 failed, 3163 deselected`
  - Falhas ficaram concentradas em `test_full_ats_flow.py` e `test_communication_event_integrations.py`, fora do escopo direto da limpeza de UX.
- Revisão visual desta sessão ficou `SKIPPED` por ausência de browser/screenshot tool.

### Ambiente

- O erro anterior de backend não era de código; faltava executar os testes com `cwd=backend` para o carregamento de `backend/.env`.
- Variáveis ausentes na tentativa anterior:
  - `APP_SECRET_KEY`
  - `DATABASE_URL`
  - `JWT_SECRET_KEY`

### Artefatos

- Relatório de cleanup: `.design/admission-ux-flow-audit-1/CLEANUP_VALIDATION_REPORT.md`
- Criar testes em `backend/tests/integration/`

### Arquivos prováveis
```
frontend/src/features/admission-workspace/components/__tests__/AdmissionChecklistCard.test.tsx (criar)
backend/tests/integration/test_admission_case_workspace.py (expandir)
```

### Prompt cirúrgico
```
ADMISSION-FIX-TESTS-1

Contexto:
- AdmissionChecklistCard.tsx não tem testes para: onMarkNotRequired, onReviewDocument, menu MoreHorizontal.
- backend admission_case_workspace_service não tem teste explícito de que rejeição via
  reject_checklist_item resulta em rejection_reason_public não nulo no documento.

Escopo:
1. Criar frontend/src/features/admission-workspace/components/__tests__/AdmissionChecklistCard.test.tsx:
   - Renderiza lista de items com status correto
   - Clique em MoreHorizontal abre menu
   - "Não obrigatório" chama onMarkNotRequired com item.id
   - "Revisar documento" desabilitado se document_id for null
   - Progresso calculado corretamente
2. Expandir test_admission_case_workspace.py:
   - Após reject_checklist_item: document.rejection_reason_public deve ser não None
   - Após request_checklist_item_correction: document.rejection_reason_public deve ser não None

Proibido:
- Não alterar código funcional nesta fase
```

---

## ADMISSION-FIX-STATUS-UX-1 — Esclarecer transição de status para o RH

**Prioridade:** BAIXA  
**Risco:** Mudança de status acidental  
**Estimativa:** 1 hora

### Achados tratados
- M-05: `PreAdmissionStatusCard.tsx` dropdown sem confirmação
- R-02: Orientação ausente sobre "marcar pronto para exportação"

### Escopo permitido
- Alterar `PreAdmissionStatusCard.tsx`
- Alterar `AdmissionNextActionsCard.tsx` (se necessário para orientação)
- Sem alteração de backend

### Arquivos prováveis
```
frontend/src/features/candidates/drawer/components/PreAdmissionStatusCard.tsx
frontend/src/features/admission-workspace/components/AdmissionNextActionsCard.tsx
```

---

## Status e priorização

| Fase | Achados | Prioridade | Estimativa | Status |
|---|---|---|---|---|
| ADMISSION-FIX-RULES-1 | H-01, H-02 | ALTA | 1–2h | CONCLUÍDO |
| ADMISSION-FIX-UX-1 | H-03, U-02, PC-03 | ALTA | 30–60min | CONCLUÍDO |
| ADMISSION-FIX-UX-2 | M-02, M-03, L-04 | MÉDIA | 1–2h | CONCLUÍDO |
| ADMISSION-FIX-PROTHEUS-UX-1 | M-01, PQ-01, L-03 | MÉDIA | 1–2h | PENDENTE |
| ADMISSION-FIX-PROTHEUS-API-1 | PQ-02, PQ-03 | MÉDIA | 30min | PENDENTE |
| ADMISSION-FIX-TESTS-1 | M-07 + gaps | MÉDIA | 2–3h | PENDENTE |
| ADMISSION-FIX-STATUS-UX-1 | M-05, R-02 | BAIXA | 1h | PENDENTE |

**Total estimado:** 8–12 horas

---

## Notas de contexto para próximas fases

### O que NÃO fazer nestas correções
- Não alterar a máquina de estados (`pre_admission_state_machine.py`)
- Não criar migrations de banco
- Não mudar URLs de endpoints
- Não ligar flags de envio real Protheus
- Não refatorar estrutura do workspace (apenas corrigir achados)

### Confirmações necessárias antes de ADMISSION-FIX-RULES-1
- Confirmar se `PreAdmissionChecklist.tsx` ainda é renderizado em alguma rota ativa
- Arquivo: `frontend/src/features/candidates/profile/components/CandidateProfilePreAdmissionTab.tsx`
- Buscar: qualquer uso de `<PreAdmissionChecklist` no codebase

### Arquivos centrais do módulo
```
backend:
  src/application/services/pre_admission_state_machine.py  ← regras de transição
  src/application/services/pre_admission_service.py         ← lógica do candidato
  src/application/services/admission_case_workspace_service.py ← lógica do RH
  src/interface/api/routers/pre_admission.py                ← endpoints
  src/interface/api/schemas/pre_admission_schemas.py        ← contratos

frontend (workspace):
  src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx ← entry point RH
  src/features/admission-workspace/components/AdmissionDocumentsCard.tsx
  src/features/admission-workspace/components/AdmissionChecklistCard.tsx

frontend (drawer):
  src/features/candidates/drawer/components/CandidatePreAdmissionPanel.tsx ← entry point drawer
  src/features/candidates/drawer/components/PreAdmissionChecklist.tsx ← legacy
  src/features/candidates/drawer/components/PreAdmissionStatusCard.tsx ← status manual

candidate-portal:
  candidate-portal/src/pages/CandidatePreAdmissionPage.tsx ← portal do candidato
```

---

## ADMISSION-UX-FIX-HIGH-1 — Corrigir achados HIGH e U-02

**Data:** 2026-06-16  
**Resultado:** CONCLUÍDO — 19/19 testes passaram, TypeScript sem erros

### Achados corrigidos

| ID | Local | Fix aplicado |
|---|---|---|
| H-01 | `admission_case_workspace_service.py` | `_reject_or_request_correction` agora aceita `rejection_reason_public` e persiste no documento. Callers recebem mensagem padrão humanizada em PT-BR. |
| H-02 | `PreAdmissionChecklist.tsx` | Confirmado como componente legado órfão (zero imports ativos). Marcado com comentário de aviso no topo do arquivo. Não removido (pendente confirmação). |
| H-03 | `CandidatePreAdmissionPanel.tsx:203` | Removido "recrutadores" da mensagem de permissão. Texto correto: "disponíveis para administradores e RH." |
| U-02 | `CandidatePreAdmissionPage.tsx:445` | Fallback adicionado: quando `item.status === 'rejected'` e `rejectionReasonPublic` é null, exibe mensagem orientando o candidato a enviar nova versão ou contatar o RH. |

### Testes adicionados

- `test_reject_checklist_item_sets_rejection_reason_public` — verifica que rejeição via checklist item define `rejection_reason_public != null` no documento
- `test_request_checklist_item_correction_sets_rejection_reason_public` — mesma verificação para solicitar correção

### Mensagens padrão definidas (H-01)

- Rejeição: `"Este documento foi rejeitado pelo RH. Envie uma nova versão ou entre em contato com o RH para mais informações."`
- Correção: `"O RH solicitou correção deste documento. Envie uma nova versão ou entre em contato com o RH para mais detalhes."`

### Fallback U-02

`"O RH solicitou correção deste documento. Envie uma nova versão ou entre em contato com o RH para mais detalhes."`

---

## ADMISSION-UX-FIX-WORKSPACE-MEDIUM-1 — UX workspace RH (M-02, M-03, L-04 + geral)

**Data:** 2026-06-16  
**Resultado:** CONCLUÍDO — 53/53 testes passou, TypeScript sem erros

### Achados corrigidos

| ID | Local | Fix aplicado |
|---|---|---|
| M-02 | `AdmissionDocumentsCard.tsx` | `window.confirm()` substituído por confirmação inline de dois cliques. Componente gerencia estado `confirmingApproveId`. Mesmo testid em ambos os estados. |
| M-03 | `AdmissionChecklistCard.tsx` | Empty state adicionado (`ClipboardList` icon + texto explicativo) quando `items.length === 0`. |
| L-04 | `AdmissionCaseHeader.tsx` | Botão "Atualizar workspace" (`RefreshCw`) adicionado ao header, recebe `onReload` prop do Panel. |

### Melhorias visuais adicionais

- **`AdmissionDocumentsCard.tsx`**: ícones de status por documento (Clock → uploaded, CheckCircle2 → approved, XCircle → rejected, FileText → replaced). Botões de ação em coluna vertical `lg:w-[230px]`.
- **`AdmissionRecentEventsCard.tsx`**: empty state com texto explicativo.
- **`AdmissionNextActionsCard.tsx`**: empty state com texto explicativo.
- **`AdmissionCaseWorkspacePanel.tsx`**: `updateDocumentLocally` refatorado para usar `documentsPayloadRef` (ref atualizada em cada render) em vez de closure variable. Corrige race condition com o scheduler do React que em cenários de múltiplos state updates (two-click inline confirm) não chama o updater sincronamente, retornando `applied=false` incorretamente.

### Testes atualizados

- `AdmissionCasePage.test.tsx`: padrão de dois cliques para aprovação (clique 1 → alertdialog → clique 2 confirma). `findByText("Exportação ERP")` → `findAllByText(...)` (ExportQueuePanel sempre exibe esse texto). Novo test: empty state de checklist.
- `AdmissionDocumentsCard.test.tsx`: removido `vi.spyOn(window, "confirm")` (não mais necessário).

### Restrições mantidas

- Backend: nenhuma alteração
- API: nenhuma alteração
- Permissões: nenhuma alteração
- Protheus real: flags mantidas em false

---

## ADMISSION-UX-FIX-CANDIDATE-PORTAL-1 — Melhorar UX do candidato na pré-admissão

**Data:** 2026-06-16  
**Resultado:** CONCLUÍDO — 34/34 testes novos passaram, 123/123 suite completa, TypeScript sem erros

### Escopo alterado

| Arquivo | Alteração |
|---|---|
| `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx` | Melhorias de UX descritas abaixo |
| `candidate-portal/src/pages/__tests__/CandidatePreAdmissionPage.test.tsx` | Novo arquivo de testes — 34 casos |

### Melhorias aplicadas

**STATUS_CONFIG — labels humanizados locais:**
- Adicionado campo `label` ao `STATUS_CONFIG`: `pending→"Pendente de envio"`, `received→"Em análise pelo RH"`, `approved→"Aprovado"`, `rejected→"Correção solicitada"`, `waived→"Dispensado"`
- Badge agora usa `cfg.label` em vez de `item.statusLabel` (que vinha do backend)
- Backend label (`item.statusLabel`) não exposto mais — descartado

**Progresso clarificado:**
- Barra de progresso mostra `aprovados/total` (antes: `(submetidos+aprovados)/total`)
- Strip inline de stats abaixo da barra: pendentes · em análise · correção solicitada · aprovados — visível em mobile também
- Dica "Próxima ação: envie 'X'" quando `nextPendingDocument` está preenchido e há pendentes
- Sidebar: anel de progresso mostra `aprovados/total` com label "documentos aprovados"

**Correção solicitada — nova contagem:**
- `rejected = checklistItems.filter(i => i.status === 'rejected').length` (não vem no summary)
- Resumo lateral exibe linha "Correção solicitada" em vermelho apenas quando count > 0
- Item com status `rejected` tem borda vermelha na card (`border-red-200`)

**Bloco de rejeição melhorado:**
- Ícone `XCircle` + título "Correção solicitada" em negrito
- `rejectionReasonPublic` em destaque; fallback genérico quando null
- Texto de ação: "Envie uma nova versão abaixo ↓"
- `review_notes` NUNCA exposto (não está no tipo `ChecklistItem`)

**UploadZone com dicas:**
- Prop `hint` adicionada: renderiza `"Formatos: PDF, JPG · Máx. 5 MB"` abaixo da zona
- `friendlyFileTypes()` helper: converte `['.pdf', '.jpg']` → `"PDF, JPG"`
- Mensagens de erro específicas para 413 (arquivo grande no servidor) e 415 (formato inválido)

**Estados melhorados:**
- Loading: skeleton animado que esboça a estrutura da página (`animate-pulse`)
- Error: botão "Tentar novamente" + re-chama `load()` + link "Voltar"
- Empty: texto adicional "Se acredita que isso é um engano, entre em contato com o RH"

### Restrições mantidas

- Backend: nenhuma alteração
- API: nenhuma alteração
- Migration: nenhuma criação
- Permissões: nenhuma alteração
- Status reais: nenhuma alteração
- Workspace RH: não tocado
- Protheus: não tocado
- `review_notes`: nunca exposto ao candidato
- Docker: nenhuma alteração

---

## ADMISSION-REGRESSION-FAILURES-1

**Data:** 2026-06-16  
**Resultado:** CORRIGIDO

### Causa de cada falha

- `tests/e2e/test_full_ats_flow.py::test_admission_package_validation_blocks_with_pending_docs`
  Causa: teste desatualizado após mudanças legítimas de contrato no fluxo de admissão. O cenário passou a exigir: `behavioral_template_id` ativo na vaga, assignment comportamental submetido, avaliação AI concluída, pipeline em `hired`, checklist padrão ativo de pré-admissão e transição válida de status do caso antes de `ready_for_admission`.
- `tests/integration/test_communication_event_integrations.py::test_pre_admission_and_document_events_create_safe_communications`
  Causa: teste/fixture desatualizado. O cenário montava a pré-admissão e os documentos por um caminho antigo, incompatível com o fluxo atual de portal do candidato, aprovações/rejeições e permissões operacionais.
- `tests/integration/test_communication_event_integrations.py::test_admission_package_approved_creates_communication`
  Causa: mesma classe de desatualização do teste anterior, com fluxo de pré-admissão/documentos e transições de status fora do contrato operacional atual.

### Correção aplicada

- E2E de admissão: incluído seed mínimo de template comportamental ativo, conclusão artificial controlada do assignment/evaluation comportamental, ajuste do pipeline para `hired`, seed de checklist padrão ativo e avanço do caso pela sequência válida `documents_pending -> ready_for_admission`.
- Integrações de comunicação: testes reescritos para usar o fluxo atual de pré-admissão, portal do candidato, upload real de documento, aprovação/rejeição real e transições válidas até o pacote aprovado, preservando a checagem de comunicação segura sem expor `review_notes`.

### Testes executados

- `cd backend && .venv/bin/python -m pytest tests/e2e/test_full_ats_flow.py::test_admission_package_validation_blocks_with_pending_docs -vv`
- `cd backend && .venv/bin/python -m pytest tests/integration/test_communication_event_integrations.py -vv`
- `cd backend && .venv/bin/python -m pytest tests -k "admission or pre_admission"`

### Resultado final

- `tests/e2e/test_full_ats_flow.py::test_admission_package_validation_blocks_with_pending_docs` → `PASSED`
- `tests/integration/test_communication_event_integrations.py` → `4 passed`
- `tests -k "admission or pre_admission"` → `228 passed, 3163 deselected`

### Riscos restantes

- O teste E2E continua acoplado ao contrato operacional completo de contratação e pré-admissão; mudanças futuras em gates comportamentais, pipeline ou checklist padrão exigirão atualização coordenada da fixture.
- As integrações de comunicação continuam dependendo de templates/event keys seedados em fixture; mudanças nessas chaves ou na audiência dos eventos exigirão ajuste sincronizado dos testes.
