# AUDIT REPORT — ADMISSION-UX-FLOW-AUDIT-1

**Data:** 2026-06-16  
**Tipo:** Read-only / Safe-first  
**Resultado geral:** `WARN_WITH_FINDINGS` — nenhum bloqueador crítico de segurança confirmado; múltiplos achados de UX e regra que requerem correção antes de produção real.

---

## 1. Resumo executivo

O módulo de pré-admissão está funcionalmente estruturado. A máquina de estados é explícita, as permissões de backend estão corretas, e os dados internos do RH (notes, review_notes) não vazam para o candidato nas rotas do portal. O fluxo principal de aprovação/rejeição de documento via workspace funciona.

**O que está correto:**
- State machine declarativa e explícita para case, checklist_item, document, admission_package, erp_attempt
- `review_notes` não aparece na resposta do portal do candidato (separação limpa de schemas)
- Backend restringe pré-admissão a `hr` e `admin` via `PreAdmissionReadStaff = HrOrAdmin`
- Frontend restringe via `CANDIDATE_PRE_ADMISSION_ROLES = ["admin", "hr"]`
- Flags de envio real bloqueadas e validadas no startup (`PROTHEUS_REAL_SEND_ENABLED=false`)
- Payload do Protheus tem validador separado e adapter de mock funcionando
- Sanitização de filename no download (Unicode → ASCII, path traversal protegido)
- Upload validado por tamanho e MIME antes de armazenar

**O que precisa de atenção:**
- 2 achados HIGH sobre mensagem pública faltando para candidato em certas rotas de rejeição
- 1 achado HIGH sobre descrição de permissão errada no frontend
- Painel Protheus Bridge mostra termos técnicos sem tradução para o usuário de RH
- Componente legado `PreAdmissionChecklist.tsx` coexiste com o workspace novo — risco de manutenção
- Estado vazio ausente em `AdmissionChecklistCard.tsx`
- `window.confirm()` para aprovação de documento é inconsistente com design system

---

## 2. Mapa do fluxo atual

### Status do caso (PreAdmissionCase)

```
draft
 ├─► offer_preparing
 │    ├─► offer_sent
 │    │    ├─► offer_accepted ──────────────────────────────────┐
 │    │    ├─► offer_declined (TERMINAL)                        │
 │    │    └─► documents_pending / documents_received ──────────┤
 │    └─► offer_accepted / documents_pending / documents_received│
 └─► offer_sent / offer_accepted / documents_pending / ...      │
                                                                 │
documents_pending ◄──────────────────────────────────────────────┤
 └─► documents_received ─────────────────────────────────────────┤
      └─► ready_for_admission ──────────────────────────────────────►admitted──►dismissed (TERMINAL)
                                                                         │
                                                                  cancelled (TERMINAL, from any)
```

**Status derivados automaticamente do checklist:**
- Qualquer item `rejected` → case volta para `documents_pending`
- Algum item `received|approved|waived` → `documents_received`
- Todos itens required em `approved|waived` → não avança automaticamente (requer ação manual `mark-ready-for-export`)

### Status do item de checklist
```
pending → received → approved (TERMINAL)
                  → rejected  → received (re-envio candidato)
                             → waived (TERMINAL — "não obrigatório")
pending → waived (dispensado pelo RH)
```

### Status do documento
```
uploaded → approved (TERMINAL)
         → rejected → replaced (TERMINAL — substituído pelo candidato)
```

### Status do Admission Package
```
draft → ready_for_review → approved_for_export → exported (TERMINAL)
     → cancelled (TERMINAL, from any non-terminal)
```

### Status do ERP Integration Attempt
```
draft → ready → sent (TERMINAL)
             → failed → simulated (TERMINAL)
             → simulated (TERMINAL)
     → validation_failed (TERMINAL)
```

### Quando um caso é criado
- Requer: `hiring_decision.decision_outcome == "hire"` AND pipeline stage em `{hired, pre_admission, protheus}`
- Idempotente: se já existe caso para a decisão, retorna o existente
- Cria snapshot do checklist template no momento da criação (snapshot imutável)

### Quem pode criar
- Somente `HR` ou `ADMIN` (backend + frontend)

### Quando fica pronto para exportação
- Ação manual: botão "Marcar pronto para exportação" → endpoint `mark-ready-for-export`
- Backend valida bloqueadores antes de aceitar
- Status muda para `ready_for_admission`

---

## 3. O que está correto

### Backend / Regras
| Item | Status |
|---|---|
| State machine explícita e testável | ✓ |
| Transições proibidas levantam exceção tipada | ✓ |
| `review_notes` ausente no schema do candidato | ✓ |
| `rejection_reason_public` nunca vaza ao RH como dado técnico | ✓ |
| Upload com validação de MIME e tamanho | ✓ |
| Sanitização de filename no download | ✓ |
| Caso de pré-admissão requer `hire` decision | ✓ |
| Caso é idempotente na criação | ✓ |
| Checklist deriva status do case automaticamente | ✓ |
| `mark-ready-for-export` valida bloqueadores antes de aceitar | ✓ |
| Flags ERP bloqueadas por configuração | ✓ |
| Protheus tem adapter de mock (não chama ERP real) | ✓ |
| Endpoint de dry-run/preflight separado de enqueue | ✓ |

### Frontend
| Item | Status |
|---|---|
| `canAccessCandidatePreAdmission` retorna true somente para admin/hr | ✓ |
| Status labels traduzidos no workspace (`utils.ts`) | ✓ |
| Status label do candidato usa `status_public_label` da API | ✓ |
| Modal de rejeição de documento exige `rejection_reason_public` | ✓ |
| `review_notes` marcada como "Nota interna do RH" no modal | ✓ |
| Documento anterior marcado como "Versão anterior" e botões desabilitados | ✓ |
| Loading, error e empty states no workspace panel | ✓ |
| Retry individual por seção (checklist, documentos, histórico) | ✓ |
| AbortController implementado (fase MEMORY-CACHE-FIX-FRONTEND-3) | ✓ |

### Protheus / ERP
| Item | Status |
|---|---|
| `PROTHEUS_REAL_SEND_ENABLED=false` verificado no startup | ✓ |
| `ERP_ALLOW_REAL_SEND=false` verificado no startup | ✓ |
| `dev-full.sh` trava se flags estiverem ligadas | ✓ |
| Disclaimer no painel Bridge: "somente leitura, nenhum envio real" | ✓ |
| Preflight/dry-run antes de enqueue | ✓ |

---

## 4. Achados por severidade

### CRITICAL — Nenhum

Não foram encontrados achados críticos (riscos de envio real, vazamento de dados sensíveis confirmado ou transição de estado exploitável).

---

### HIGH — 3 achados

#### H-01 — `_reject_or_request_correction` não seta `rejection_reason_public`

**Arquivo:** `backend/src/application/services/admission_case_workspace_service.py:273–308`  
**Endpoints afetados:**
- `POST /admission/checklist-items/{item_id}/reject`
- `POST /admission/checklist-items/{item_id}/request-correction`

**Descrição:** Quando o RH usa os endpoints de rejeição/solicitação de correção via **item de checklist** (não via documento), o serviço chama `_reject_or_request_correction` que define:
```python
document.review_notes = "Item rejeitado."   # ou "Correção solicitada."
# document.rejection_reason_public não é definido → permanece None
```
O candidato vê `rejection_reason_public` no portal. Se esta for `None`, o candidato vê apenas o badge vermelho "Correção solicitada" **sem nenhuma mensagem explicando o que corrigir**.

**Impacto:** Candidato fica sem instrução. Pode re-enviar o mesmo arquivo com erro.

**Nota:** No workspace atual, o botão de rejeição está em `AdmissionDocumentsCard.tsx` (não no checklist card), que usa o endpoint de documento (`/pre-admission/documents/{document_id}/reject`) com campo obrigatório de mensagem pública. Porém os endpoints de checklist existem e são chamáveis — devem estar consistentes.

**Risco:** MÉDIO-ALTO para candidato; BAIXO para segurança.

---

#### H-02 — `PreAdmissionChecklist.tsx` (legacy drawer) rejeita documentos sem `rejection_reason_public`

**Arquivo:** `frontend/src/features/candidates/drawer/components/PreAdmissionChecklist.tsx:91–96`  
**Função:** `handleReject`

**Descrição:**
```tsx
await onRejectDocument?.(documentId, reviewNotes.trim());
// Prop: onRejectDocument?: (documentId: string, reviewNotes: string) => Promise<void>
```
O componente passa apenas `reviewNotes` ao rejeitar — que é mapeado para `review_notes` (nota interna). `rejection_reason_public` nunca é preenchido nesse path. O candidato não recebe mensagem explicativa.

**Impacto:** Se esse componente estiver ativo na tab do drawer de candidato ou em qualquer outra rota, rejeições feitas por esse caminho deixam o candidato sem instrução.

**Onde verificar:** `CandidateProfilePreAdmissionTab.tsx` — confirmar se `PreAdmissionChecklist` ainda está em uso ativo ou foi substituído pelo workspace.

---

#### H-03 — Descrição de permissão errada no `CandidatePreAdmissionPanel.tsx`

**Arquivo:** `frontend/src/features/candidates/drawer/components/CandidatePreAdmissionPanel.tsx:205`

**Descrição:** Quando o usuário não tem permissão de acesso, o empty state diz:
```
"A criação e gestão do caso admissional ficam disponíveis para administradores, RH e recrutadores."
```

Porém `CANDIDATE_PRE_ADMISSION_ROLES = ["admin", "hr"]` — **recrutadores não têm acesso**. A mensagem cria expectativa falsa e pode gerar chamados de suporte ("o sistema disse que tenho acesso mas está negando").

---

### MEDIUM — 8 achados

#### M-01 — Painel `AdmissionProtheusBridgeSummaryPanel` com termos técnicos expostos ao RH

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionProtheusBridgeSummaryPanel.tsx:210–231`

Exibe campos técnicos sem tradução para o usuário de RH:
- `would_execute` → true/false
- `erp_send_attempted` → true/false
- `registration_routine_called` → true/false
- `storage_mode` (sem explicação)
- `readiness` (sem explicação)
- `trace_id` (UUID técnico)
- `blocked_reason` / `error_code` em formato interno

**Impacto:** RH não consegue interpretar esses campos. Em uma situação de bloqueio real, não sabe o que fazer.

---

#### M-02 — `window.confirm()` para aprovação de documento

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionDocumentsCard.tsx:266`

```tsx
if (!window.confirm("Confirmar aprovação deste documento?")) return;
void onApprove(document);
```

**Impacto:** Diálogo nativo do browser quebra a experiência de design. Não é possível customizar aparência. Não é acessível por padrão. Inconsistente com o modal elaborado de rejeição.

---

#### M-03 — Estado vazio ausente em `AdmissionChecklistCard.tsx`

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx:140–194`

Quando `items.length === 0`, o card renderiza o cabeçalho e uma lista vazia sem mensagem. O RH não sabe se o checklist está vazio por design (template sem itens) ou por erro de carregamento.

---

#### M-04 — `PreAdmissionChecklist.tsx` (legacy) coexiste com workspace — duplicação

**Arquivos:**
- `frontend/src/features/candidates/drawer/components/PreAdmissionChecklist.tsx` (legacy)
- `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx` (novo)

Dois componentes com propósito similar em manutenção paralela. O legacy tem lógica diferente de status e rejeição (sem `rejection_reason_public`). Risco de regressão caso o legacy seja invocado inadvertidamente.

---

#### M-05 — `PreAdmissionStatusCard.tsx` permite mudança manual de status sem confirmação

**Arquivo:** `frontend/src/features/candidates/drawer/components/PreAdmissionStatusCard.tsx:46–58`

O componente renderiza um `<select>` com todos os status possíveis. Um usuário de RH pode mover o status para `admitted` ou `cancelled` acidentalmente com um clique, sem nenhuma confirmação ou validação de pré-condições.

**Nota:** O backend tem a state machine e rejeita transições inválidas — mas a UX não previne o erro nem informa o motivo ao usuário.

---

#### M-06 — Candidato sem estado final claro após envio de todos os documentos

**Arquivo:** `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx:284–295`

Quando todos os documentos obrigatórios são enviados, o banner "Todos os documentos obrigatórios foram enviados!" aparece apenas na seção de lista, mas não há mensagem de status global mostrando o que acontece em seguida (aguardar análise, prazo, contato esperado).

**Impacto:** Candidato fica ansioso sem saber se concluiu o processo ou se há mais etapas.

---

#### M-07 — Ausência de teste para `AdmissionChecklistCard.tsx`

Os fluxos de `onMarkNotRequired`, `onReviewDocument` e o menu de ações do checklist não possuem testes automatizados no frontend.

**Arquivos sem cobertura:**
- `AdmissionChecklistCard.tsx` — menu "Não obrigatório", "Revisar documento"
- `AdmissionCaseHeader.tsx` — botão "Marcar pronto para exportação" e mensagem de bloqueio

---

#### M-08 — Aprovação via workspace não exige confirmação de obrigatoriedade

**Arquivo:** `backend/src/application/services/admission_case_workspace_service.py:145–178`

`approve_checklist_item` aprova o item e o documento vinculado, mas não verifica se o documento foi efetivamente analisado (apenas transfere status). Não há campo `approved_by_name` visível no checklist card — só na lista de documentos.

---

### LOW — 5 achados

#### L-01 — Ícone de documento sempre vermelho em `AdmissionDocumentsCard`

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionDocumentsCard.tsx:169`

```tsx
<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft">
  <FileText className="h-5 w-5 text-danger" />
</div>
```

O ícone é vermelho para todos os documentos, independente do status. Um documento aprovado também aparece com ícone vermelho.

---

#### L-02 — Histórico limitado a 20 eventos sem paginação no workspace

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:282`

`getEvents(caseId, 1, 20)` — carrega apenas os 20 eventos mais recentes. Não há botão "carregar mais" no `AdmissionRecentEventsCard`. Para casos com histórico longo, eventos anteriores são invisíveis.

---

#### L-03 — Terminologia mista EN/PT no painel Protheus

Painel usa termos em inglês sem glossário: `Bridge`, `storage_mode`, `readiness`, `trace_id`, `action_type`. Para usuário de RH que não conhece o stack, esses campos parecem ruído técnico.

---

#### L-04 — "Recarregar workspace" no final de uma página longa

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionCaseWorkspacePanel.tsx:651–659`

Botão de recarga global fica no fim do scroll. Para workspace com muitos documentos, usuário precisa rolar toda a página para encontrar o botão de atualização.

---

#### L-05 — Data/hora duplicada sem contexto no item de checklist

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionChecklistCard.tsx:172–178`

```tsx
{item.updated_by_name
  ? `${formatDateTime(item.updated_at)}`
  : item.document_id
    ? formatDateTime(item.updated_at)
    : "—"}
```
Tanto com nome quanto sem nome o resultado é o mesmo (data formatada). O `updated_by_name` nunca é exibido ao lado da data — torna o campo inútil quando presente.

---

## 5. Problemas de regra de negócio

### R-01 — Endpoint `/admission/checklist-items/{item_id}/reject` existe mas UI principal não o usa

O `AdmissionChecklistCard` não tem botão de rejeição direta — apenas "Revisar documento" (que leva ao card de documentos) e "Não obrigatório". O endpoint existe e está disponível via API, mas a experiência de RH foi projetada para rejeitar via documento. Isso cria inconsistência: se alguém chama o endpoint diretamente (automação, postman, integração futura), o candidato não recebe mensagem pública.

**Recomendação:** Ou o endpoint passa a exigir `rejection_reason_public` no body, ou é documentado como "interno" e não pode ser chamado externamente.

---

### R-02 — `derive_case_status_from_checklist` não avança para `ready_for_admission` automaticamente

**Arquivo:** `backend/src/application/services/pre_admission_state_machine.py:103–128`

Mesmo quando todos os itens obrigatórios estão `approved|waived`, o sistema não avança automaticamente para `ready_for_admission`. Isso é intencional (requer ação manual de RH), mas:
1. Não existe orientação clara no workspace indicando "agora marque como pronto para exportação"
2. O `AdmissionNextActionsCard` deveria mostrar essa ação como destaque quando todos os itens estiverem aprovados

---

### R-03 — Status `documents_received` é transitório e pode confundir o RH

O status `documents_received` significa "algum documento foi recebido mas não tudo" — mas para o RH pode parecer "todos os documentos foram recebidos". O label mostrado ao RH precisa ser verificado em `PRE_ADMISSION_WORKSPACE_STATUS_LABELS`.

---

## 6. Problemas de UX

### U-01 — Modal de rejeição combina "Rejeitar" e "Solicitar correção" no mesmo componente sem distinção visual clara

**Arquivo:** `frontend/src/features/admission-workspace/components/AdmissionDocumentsCard.tsx:308–408`

O modal tem `modalMode === "request-correction"` vs `"reject"` — o título e o botão de confirmação mudam, mas o formulário é idêntico. Para o RH, a diferença entre "rejeitar" (permanente) e "solicitar correção" (candidato pode reenviar) pode não estar clara.

**Distinção técnica:**
- Ambos chamam o mesmo endpoint com os mesmos campos
- A diferença é apenas semântica no event_type gerado
- O estado resultante do documento é `rejected` em ambos os casos

**Recomendação:** Esclarecer se as duas ações devem ter consequências diferentes (ex: "rejeitar" fecha o item permanentemente, "solicitar correção" mantém upload habilitado). Atualmente ambas permitem reenvio do candidato (estado `rejected` permite novo upload).

---

### U-02 — Candidato sem explicação quando status é `rejected` mas `rejection_reason_public` é null

**Arquivo:** `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx:445–449`

```tsx
{item.status === 'rejected' && item.rejectionReasonPublic && (
  <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
    <p className="text-xs text-red-700">{item.rejectionReasonPublic}</p>
  </div>
)}
```

Se `rejectionReasonPublic` for null, o candidato vê apenas o badge "Correção solicitada" sem nenhum texto explicativo. Não há fallback genérico ("Entre em contato com o RH para mais informações.").

---

### U-03 — `AdmissionCaseHeader.tsx` não foi auditado (sem leitura do arquivo)

O header é o CTA principal com o botão "Marcar pronto para exportação". Não foi possível confirmar se o estado de bloqueio (`summaryMessage`) é exibido de forma compreensível para o RH.

---

## 7. Problemas de permissão

### P-01 — Backend correto, frontend com 1 inconsistência

**Correto no backend:** `PreAdmissionReadStaff = PreAdmissionWriteStaff = HrOrAdmin` — só HR e admin têm acesso.

**Inconsistência no frontend:** A mensagem de "sem permissão" em `CandidatePreAdmissionPanel.tsx` diz que "recrutadores" têm acesso, mas `CANDIDATE_PRE_ADMISSION_ROLES = ["admin", "hr"]` exclui recrutadores. Ver H-03.

### P-02 — Recruiter vê o painel de pré-admissão em branco sem saber o motivo

Se um recruiter abrir a tab de pré-admissão no drawer do candidato, vê a mensagem "sem permissão" com descrição errada. Não consegue criar caso, não sabe a quem escalar.

### P-03 — Manager e Viewer não têm acesso nem leitura a pré-admissão

`CANDIDATE_PRE_ADMISSION_ROLES` não inclui manager ou viewer. Isso é provavelmente correto (dado o nível de sensibilidade), mas não está documentado como decisão intencional.

---

## 8. Problemas do portal do candidato

### PC-01 — Progresso usa "enviados + aprovados" mas não exclui rejeitados

**Arquivo:** `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx:213–216`

```tsx
const sent = summary.documentsSubmitted + summary.documentsApproved;
const progress = total > 0 ? Math.round((sent / total) * 100) : 0;
```

O campo `documentsSubmitted` da API inclui itens `in_review`, `approved`, `waived`. Itens rejeitados não são subtraídos. Isso pode mostrar progresso de 100% mesmo com documentos rejeitados pendentes.

**No backend:** `_build_summary` calcula `documents_submitted` como `{submitted, in_review, approved, waived}`. Mas o campo `documents_pending` inclui rejeitados (`pending = sum... if not in {approved, waived}`). Há divergência entre o que o candidato vê como "progresso" e o que ainda precisa ser feito.

---

### PC-02 — `allRequiredSent` ignora status `rejected`

**Arquivo:** `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx:217–219`

```tsx
const allRequiredSent = caseData.checklistItems
    .filter((i) => i.required)
    .every((i) => i.status !== 'pending' && i.status !== 'rejected');
```

Isso é correto (exclui rejected). Mas o banner verde aparece quando itens estão em `received` ou `approved`. Um candidato pode ver o banner verde "Todos os documentos obrigatórios foram enviados!" mesmo com documentos aguardando revisão (status `received`) — o que é adequado, mas pode gerar expectativa incorreta de que a admissão está "concluída".

---

### PC-03 — Ausência de mensagem quando não há pré-admissão e candidato chega à URL direto

**Arquivo:** `candidate-portal/src/pages/CandidatePreAdmissionPage.tsx:196–211`

Estado `empty` mostra mensagem vaga. Não indica ao candidato que deve aguardar contato do RH ou quando a pré-admissão será aberta.

---

## 9. Problemas de Protheus / ERP

### PQ-01 — Painel Protheus Bridge não traduz status para o RH

**Arquivo:** `frontend/src/features/admission-workspace/AdmissionProtheusBridgeSummaryPanel.tsx`

`STATUS_LABELS` traduz 5 status principais. Mas campos como `storage_mode`, `readiness`, `action_type`, `trace_id` são exibidos sem contexto. Um RH que vê `readiness: "not_ready"` ou `storage_mode: "local"` não sabe o que isso significa ou o que fazer.

**Recomendação:** Traduzir ou substituir esses campos por mensagens acionáveis ("Integração pronta para uso" vs "Integração indisponível — contate o suporte técnico").

---

### PQ-02 — `ProtheusExportQueueCreateRequest` tem valores stub no padrão

**Arquivo:** `backend/src/interface/api/routers/pre_admission.py:848–851`

```python
unit_code=body.unit_code or "STUB",
protheus_group_code=body.protheus_group_code or "T01",
protheus_branch_code=body.protheus_branch_code or "01",
```

Se o frontend não fornecer esses campos, os valores padrão são `STUB`, `T01`, `01`. Em um cenário real de produção, esses valores incorretos podem criar registros no Protheus com código errado. Requer validação ou configuração por ambiente.

---

### PQ-03 — Dashboard de exportação Protheus (`/pre-admission/protheus-export-dashboard/items`) sem limite máximo

**Arquivo:** `backend/src/interface/api/routers/pre_admission.py:804`

```python
limit: int = Query(default=25, ge=1),
```

Não há `le=N` (limite superior). Um cliente mal-comportado pode chamar `?limit=99999` e sobrecarregar a fila.

---

### PQ-04 — `last_error_message_redacted` no schema mas sem garantia de redação completa

**Schema:** `ProtheusExportQueueStatusResponse.last_error_message_redacted`

O campo chama-se `_redacted` sugerindo que dados sensíveis foram removidos. Porém sem ver a implementação do `protheus_export_queue_service.py` completa, não é possível confirmar que erros técnicos do Protheus (que podem conter IPs, URLs internas, credenciais em stack trace) estão sendo redatados adequadamente.

---

## 10. Lacunas de teste

### Backend
| Área | Cobertura | Gap |
|---|---|---|
| State machine (transitions) | ✓ Implícita nos integration tests | Teste unitário explícito de `assert_transition_allowed` |
| `reject_document` com só `review_notes` (sem `rejection_reason_public`) | Não encontrado | Teste de que backend aceita apenas `review_notes` (ao menos um) |
| `_reject_or_request_correction` não seta `rejection_reason_public` | Não encontrado | Teste explícito do achado H-01 |
| Download com `actor_type=candidate` para case cancelado | Mencionado no código | Confirmar cobertura |
| `mark_ready_for_export` com bloqueadores | Existente (`test_admission_case_workspace.py`) | ✓ |
| Protheus payload builder com campos inválidos | Existente | ✓ |
| Dry-run / preflight | Existente | ✓ |

### Frontend
| Área | Cobertura | Gap |
|---|---|---|
| `AdmissionChecklistCard` — ações do menu | Não encontrado | Testes de "Não obrigatório" e "Revisar documento" |
| `AdmissionCaseHeader` — botão "Marcar pronto" com blockers | Não encontrado | Loading state, mensagem de bloqueio |
| `CandidatePreAdmissionPage` (candidate-portal) | Não encontrado | Carregamento, rejeição com/sem public reason, upload |
| `AdmissionDocumentsCard` — modal reject/request-correction | Existente | ✓ (parcial) |
| `AdmissionProtheusBridgeSummaryPanel` — error state | Existente | ✓ |

---

## 11. Recomendações

### Imediatas (antes de qualquer uso real em produção)

1. **H-01:** Adicionar `rejection_reason_public` como parâmetro obrigatório nos endpoints de rejeição via checklist item, ou remover esses endpoints e forçar rejeição apenas via documento.
2. **H-02:** Confirmar se `PreAdmissionChecklist.tsx` está ativo; se sim, corrigir para passar `rejection_reason_public` ao rejeitar.
3. **H-03:** Corrigir a mensagem de "sem permissão" em `CandidatePreAdmissionPanel.tsx` — remover "recrutadores" da descrição.
4. **U-02:** Adicionar fallback genérico no portal do candidato quando `rejectionReasonPublic` é null mas item está `rejected`.

### Médio prazo

5. **M-01:** Traduzir termos técnicos do painel Protheus Bridge para linguagem de RH.
6. **M-02:** Substituir `window.confirm()` por modal do design system para aprovação de documento.
7. **M-03:** Adicionar empty state em `AdmissionChecklistCard` quando `items.length === 0`.
8. **M-05:** Adicionar confirmação explícita antes de alterar status via `PreAdmissionStatusCard`.
9. **PQ-03:** Adicionar `le=200` no limit do dashboard de exportação.
10. **PQ-02:** Validar `unit_code`, `protheus_group_code`, `protheus_branch_code` via configuração de ambiente antes de enfileirar.

### Futuro / roadmap

11. Avaliar descontinuação de `PreAdmissionChecklist.tsx` (legacy drawer) em favor do workspace completo.
12. Implementar orientação "próximo passo" no workspace quando todos os itens obrigatórios estiverem aprovados.
13. Adicionar "load more" no histórico de eventos.
14. Verificar redação de mensagens de erro do Protheus antes de exposição ao RH.
