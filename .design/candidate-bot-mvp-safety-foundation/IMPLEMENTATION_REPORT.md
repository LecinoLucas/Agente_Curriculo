# Implementation Report — Candidate Bot MVP Safety Foundation

**Data:** 2026-06-17  
**Branch:** save/behavioral-ai-and-wips  
**Classificação:** PASS

---

## Resumo

Implementada a camada mínima de segurança e operação para que o bot de triagem possa ser ativado no portal do candidato sem vazar dados internos de RH e sem abandonar candidatos que pedem atendimento humano.

Quatro entregáveis principais:
1. **CandidateSafeRetriever** — wrapper que restringe o RAG a documentos com `visibility='public'` e `audience='candidate'`
2. **Handoff humano real** — `ConversationHandoffModel` + migration + handler no `ConversationService`
3. **`handoff_required` no response** — `ConversationTurnResponse` expõe o flag para o frontend
4. **10 testes unitários** — cobertura das garantias de segurança e do handoff

---

## Arquivos Alterados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `backend/src/ai_orchestration/rag/in_memory_retriever.py` | Modificado | Adiciona filtros `visibility` e `audience` ao `_passes_filters` |
| `backend/src/ai_orchestration/rag/candidate_safe_retriever.py` | **Novo** | Wrapper que injeta `visibility='public'` e `audience='candidate'` obrigatoriamente |
| `backend/src/infrastructure/database/models/conversation_handoff_model.py` | **Novo** | `ConversationHandoffModel` — tabela rastreável de handoffs |
| `backend/src/infrastructure/database/models/__init__.py` | Modificado | Registra `ConversationHandoffModel` para Alembic autogenerate |
| `backend/alembic/versions/o1p2q3r4s5t6_create_conversation_handoffs.py` | **Novo** | Migration para criar `conversation_handoffs` |
| `backend/src/interface/api/schemas/conversation_schemas.py` | Modificado | Adiciona `handoff_required: bool = False` a `ConversationTurnResponse` |
| `backend/src/application/services/conversation_service.py` | Modificado | Import do modelo, `_TALK_TO_HR_MESSAGE`, handler `_handle_talk_to_hr`, `_intent_to_token` com `talk_to_hr`, `receive_message` com early exit, `_turn_response` com `handoff_required` |
| `backend/tests/unit/test_candidate_bot_safety_foundation.py` | **Novo** | 10 testes unitários |

---

## Como o RAG Público Foi Segregado

### Mecanismo

O `RetrievalQuery.filters` (dict opcional) já existia e era usado pelo `InMemoryRetriever` para filtrar por `source_type`. Adicionamos suporte a dois novos filtros:

```python
# in_memory_retriever.py — _passes_filters
visibility = filters.get("visibility")
if visibility and chunk.metadata.get("visibility") != visibility:
    return False
audience = filters.get("audience")
if audience and chunk.metadata.get("audience") != audience:
    return False
```

O `CandidateSafeRetriever` é um wrapper que **sempre** injeta esses filtros antes de delegar ao retriever interno:

```python
safe_filters = {
    **(query.filters or {}),
    "visibility": "public",
    "audience": "candidate",
}
```

### Compatibilidade

- `InMemoryRetriever` sem wrapper → comportamento idêntico ao anterior (staff RAG não é afetado)
- `CandidateSafeRetriever(InMemoryRetriever(...))` → uso em testes do bot candidato
- `CandidateSafeRetriever(PostgresVectorRetriever(...))` → uso em produção

**Nota**: O `PostgresVectorStore` (camada SQL real) também precisa respeitar os filtros `visibility` e `audience` quando recebê-los via `RetrievalQuery.filters`. O `InMemoryRetriever` já os respeita. Para produção, a implementação do `PostgresVectorStore.similarity_search` deve incluir um JOIN com `ai_knowledge_documents` e filtrar por `visibility = :vis AND 'candidate' = ANY(allowed_roles_json)` ou similar. Documentado em TASKS como F2 abaixo.

### Garantias
- Documento `visibility='internal'` **nunca** aparece no contexto público
- Documento `visibility='public'` sem `audience='candidate'` **não** aparece (duplo filtro)
- Documento sem visibility definida **não** aparece (filtro estrito)
- Warning `candidate_safe_filter_applied` adicionado para observabilidade

---

## Como o Handoff Humano Foi Implementado

### Fluxo completo

```
Candidato: "quero falar com alguém"
    ↓
_maybe_ai_canonicalize
    ↓
CandidateAssistantIntentService.interpret → intent="talk_to_hr"
    ↓
_intent_to_token(state, intent) → token="talk_to_hr"   ← NOVO
    ↓
receive_message early-exit: content == "talk_to_hr"    ← NOVO
    ↓
_handle_talk_to_hr:
  - Verifica handoff pendente (idempotente)
  - Cria ConversationHandoffModel(status="pending")
  - Seta context["handoff_requested"] = True
  - Seta candidate_message.interpreted_intent = "talk_to_hr"
  - Retorna ConversationPrompt com _TALK_TO_HR_MESSAGE
    ↓
ConversationTurnResponse(handoff_required=True)        ← NOVO
```

### Mensagem ao candidato

```
"Certo, vou encaminhar sua solicitação para o RH. 
 Assim que possível, alguém continuará o atendimento."
```

Sem prazo, sem promessa, sem confirmação de canal.

### Persistência

Nova tabela `conversation_handoffs`:
- `session_id` → FK para sessão (rastreabilidade)
- `candidate_id` → FK nullable para candidato
- `status` ∈ `('pending', 'assigned', 'resolved', 'cancelled')`
- `reason` = `'candidate_requested'`
- `metadata_json` → `state_at_request`, `message_id`
- `requested_at` → timestamp do pedido

### Idempotência

`_handle_talk_to_hr` verifica se já existe `ConversationHandoffModel` com `status='pending'` para a sessão antes de criar um novo. Múltiplos pedidos do mesmo candidato na mesma sessão não criam registros duplicados.

### Status da sessão

A sessão permanece `active` — o candidato pode continuar interagindo. O RH pode resolver o handoff via `resolved_at` + `status='resolved'` quando retornar o contato.

---

## Endpoint de Conversa (Part 3)

Os endpoints já existiam e estão funcionais:

```
POST /conversations               → cria sessão
POST /conversations/{id}/messages → envia mensagem (retorna ConversationTurnResponse)
GET  /conversations/{id}          → estado da sessão
POST /conversations/{id}/upload   → upload de currículo
```

A adição de `handoff_required: bool = False` ao `ConversationTurnResponse` é **backwards-compatible** — clientes existentes que não leem o campo não são afetados. O campo é `False` na resposta normal e `True` quando `context["handoff_requested"]` está setado.

---

## Guardrails de Dados Sensíveis (Part 4)

### Já implementados (não alterados)

- `CandidateAssistantIntentService` jamais recebe CPF, email ou contexto bruto
- `sanitise_assistant_text` mascara CPF/telefone antes de enviar à IA
- `_SYSTEM_PROMPT` instrui explicitamente: "Nunca inclua CPF, telefone ou e-mail em nenhum campo"
- O `ConversationService` tem respostas **predefinidas** (não geradas por LLM) — portanto não existe risco de o bot inventar perguntas sobre saúde, religião, etc.
- Estados determinísticos não coletam nenhum dado sensível proibido por LGPD

### Nota

Para quando o bot evoluir para LLM gerativo (Fase 3 LangGraph), será necessário adicionar um `CandidateBotSystemPrompt` explícito proibindo perguntas sensíveis. Isso é documentado como tarefa de Fase 3 em TASKS.

---

## Testes Executados

```bash
# Todos os testes da fundação de segurança
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test \
  .venv/bin/pytest backend/tests/unit/test_candidate_bot_safety_foundation.py -v --no-cov
# Resultado: 10 passed

# Regressão — knowledge tools (staff RAG)
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test \
  .venv/bin/pytest backend/tests/unit/test_ai_knowledge_tools.py -v --no-cov
# Resultado: 13 passed

# Regressão — Phase 1 unit propagation
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test \
  .venv/bin/pytest backend/tests/unit/test_multi_branch_unit_propagation.py -v --no-cov
# Resultado: 7 passed
```

**Total: 30 passed, 0 failed**

---

## Critérios de Aceite — Confirmação

| Critério | Status |
|---------|--------|
| RAG de candidato não recupera documento interno | PASS — `CandidateSafeRetriever` bloqueia `visibility != 'public'` |
| Handoff `talk_to_hr` cria ação rastreável para RH | PASS — `ConversationHandoffModel(status='pending')` criado |
| `ConversationService` continua persistindo sessão/mensagens | PASS — nenhum caminho alterado |
| Endpoint de conversa funciona com resposta segura | PASS — `handoff_required` no response, estados preservados |
| Fluxo staff existente não quebra | PASS — 13 testes de knowledge tools passam |
| Testes relevantes passam | PASS — 30 testes |

---

## Riscos Restantes

### RAG Produção: PostgresVectorStore precisa respeitar filtros
O `CandidateSafeRetriever` injeta os filtros mas o `PostgresVectorStore.similarity_search` (SQL real) ainda precisa aplicá-los. No MVP, o retriever em memória é usado para testes. Para produção com pgvector, a query SQL deve incluir:
```sql
JOIN ai_knowledge_documents d ON d.id = c.document_id
WHERE d.visibility = :visibility
  AND :audience = ANY(d.allowed_roles_json::text[])
```

### Base de conhecimento ainda não populada
`AIKnowledgeDocumentModel` existe mas a base ainda não tem documentos públicos categorizados (`visibility='public'`, `audience='candidate'`). O bot precisará de uma base de FAQ, benefícios e regras de vaga antes de ser exposto ao candidato.

### Endpoint `/conversations` não requer autenticação
Qualquer cliente pode criar uma sessão. Para WhatsApp e portal com volume, implementar rate-limiting ou token anônimo rastreável antes de escalar.

---

## O Que Ficou para LangGraph (Fase 3)

- `SupervisorAgent` stub em `supervisor_agent.py` — precisa ser implementado
- Checkpointing de estado LangGraph em PostgreSQL
- Roteamento entre `JobAgent`, `KnowledgeAgent`, `CandidateAgent`
- `CandidateBotSystemPrompt` com proibições explícitas de perguntas sensíveis
- Tool `create_application_tool` com LGPD + preferred_unit_id para agentes write-safe

## O Que Ficou para WhatsApp (Fase 6)

- Webhook `/integrations/whatsapp/webhook`
- Adaptador de canal (Evolution API / Twilio) → `ConversationService`
- Canal `channel='whatsapp'` já está no enum e é suportado pelo `ConversationService`

## O Que Ficou para Triagem Completa

- Endpoint minimal apply sem PDF obrigatório (`apply_minimal`)
- Endpoint status de candidatura por token anônimo
- `conversation_handoffs` expostos via painel staff (RH precisa de listagem + atribuição)
- Limpeza periódica de `context_json` com PII residual (lead_cpf, lead_whatsapp)
- Separação de pipeline de ingestão: FAQ público vs. políticas internas

---

## Confirmação da Cadeia Principal

```
candidate message
    → POST /conversations/{id}/messages
    → ConversationService.receive_message
    → _maybe_ai_canonicalize (Gemini intent parser opcional)
    → [talk_to_hr] → _handle_talk_to_hr → ConversationHandoffModel(pending) + _TALK_TO_HR_MESSAGE
    → [outros tokens] → state machine determinístico
    → safe RAG via CandidateSafeRetriever (apenas visibility='public', audience='candidate')
    → response: ConversationTurnResponse(handoff_required=bool, ...)
```
