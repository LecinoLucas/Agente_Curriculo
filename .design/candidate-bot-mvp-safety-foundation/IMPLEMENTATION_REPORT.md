# Implementation Report — Candidate Bot MVP Safety Foundation

**Data:** 2026-06-17
**Branch:** `save/behavioral-ai-and-wips`
**Classificação final:** `PASS_WITH_NOTES`

## Resumo Executivo

A fundação segura do bot ficou funcional e validada nos pontos centrais:

- o retriever de candidato bloqueia documentos internos no `retrieve()` e agora também no `get_document()`;
- `talk_to_hr` cria um handoff pendente rastreável e idempotente;
- `ConversationService` continua íntegro nos testes focados de conversa;
- `handoff_required=True` aparece na resposta do turno quando o handoff é acionado.

O fechamento fica em `PASS_WITH_NOTES`, não `PASS`, porque a validação Alembic end-to-end em SQLite continua bloqueada por uma incompatibilidade preexistente da migration baseline do projeto, anterior a esta fase.

## Arquivos Alterados

- `backend/src/ai_orchestration/rag/candidate_safe_retriever.py`
- `backend/src/infrastructure/database/models/conversation_handoff_model.py`
- `backend/alembic/versions/o1p2q3r4s5t6_create_conversation_handoffs.py`
- `backend/tests/unit/test_candidate_bot_safety_foundation.py`
- `.design/candidate-bot-mvp-safety-foundation/IMPLEMENTATION_REPORT.md`

## Validação do Worktree

- `git status --short`: somente os 4 arquivos backend acima e este relatório foram alterados nesta validação; nenhum arquivo inesperado apareceu.
- `git diff --check`: sem problemas de whitespace ou conflito de patch.

## Achados da Validação Final

### 1. CandidateSafeRetriever tinha bypass por `get_document()`

O wrapper já forçava `visibility='public'` e `audience='candidate'` no `retrieve()`, mas `get_document()` delegava direto ao retriever interno. Isso permitia lookup por ID de documento sem revalidar a política pública/candidato.

Correção aplicada:

- `backend/src/ai_orchestration/rag/candidate_safe_retriever.py`
- `get_document()` agora só retorna documento cujo `metadata.visibility == "public"` e `metadata.audience == "candidate"`.

### 2. `assigned_to_user_id` existia sem FK real

O modelo e a migration criavam `assigned_to_user_id`, mas sem `ForeignKey("users.id", ondelete="SET NULL")`. Isso enfraquecia integridade referencial do handoff.

Correção aplicada:

- `backend/src/infrastructure/database/models/conversation_handoff_model.py`
- `backend/alembic/versions/o1p2q3r4s5t6_create_conversation_handoffs.py`

### 3. Cobertura de teste era insuficiente para o fluxo real

Os testes originais não provavam:

- bloqueio no `get_document()`;
- criação real de handoff pelo `ConversationService`;
- persistência de `interpreted_intent="talk_to_hr"`;
- idempotência de handoff pendente na mesma sessão.

Correção aplicada:

- `backend/tests/unit/test_candidate_bot_safety_foundation.py`
- novos testes cobrem lookup direto seguro, criação de handoff, persistência do intent e idempotência.

## Migration Alembic

Validação estrutural da migration `backend/alembic/versions/o1p2q3r4s5t6_create_conversation_handoffs.py`:

- `revision`: `o1p2q3r4s5t6`
- `down_revision`: `n1o2p3q4r5s6`
- `alembic heads`: `o1p2q3r4s5t6 (head)`
- tabela: `conversation_handoffs`
- FKs presentes:
  - `session_id -> conversation_sessions.id`
  - `candidate_id -> candidates.id`
  - `assigned_to_user_id -> users.id`
- índices úteis presentes:
  - `session_id`
  - `status`
  - `candidate_id`
  - `requested_at`
- constraint de status presente:
  - `ck_conversation_handoffs_status`

### Nota importante sobre SQLite

O comando abaixo falha antes de chegar na nova migration:

```bash
cd backend && APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///candidate_bot_validation_alembic.db JWT_SECRET_KEY=test .venv/bin/alembic upgrade head
```

Causa observada:

- a baseline `dad2597b8478_baseline_schema.py` executa `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
- SQLite não suporta esse comando;
- portanto o pipeline Alembic em SQLite já estava quebrado antes desta fase.

Impacto:

- a cadeia Alembic completa `upgrade head` e `downgrade -1` não pôde ser validada em SQLite;
- isso é um risco residual do projeto, não uma quebra específica da migration de handoff.

## Confirmação da Cadeia Principal

Fluxo validado:

```text
candidate message
  -> ConversationService.receive_message
  -> canonicalização segura de intent
  -> talk_to_hr (quando aplicável)
  -> ConversationHandoffModel(status="pending")
  -> response com handoff_required=True
```

Fluxo de conhecimento validado:

```text
candidate retrieval
  -> CandidateSafeRetriever
  -> filtros obrigatórios visibility=public + audience=candidate
  -> retrieve()/get_document() só retornam conteúdo público de candidato
```

Confirmações:

- documento interno RH/admin não aparece no retriever de candidato;
- documento sem `visibility`/`audience` segura também não aparece;
- `talk_to_hr` cria handoff pendente rastreável;
- a mensagem ao candidato não promete prazo;
- o pedido repetido não gera handoff pendente duplicado.

## Testes Executados

```bash
git status --short
git diff --check

cd backend && .venv/bin/alembic heads
cd backend && APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///candidate_bot_validation_alembic.db JWT_SECRET_KEY=test .venv/bin/alembic upgrade head

APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_bot_safety_foundation.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_ai_knowledge_tools.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_ai_intent.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_endpoints.py -q
```

Resultados:

- `backend/tests/unit/test_candidate_bot_safety_foundation.py`: `13 passed`
- `backend/tests/unit/test_ai_knowledge_tools.py`: `13 passed`
- `backend/tests/integration/test_conversation_ai_intent.py`: `12 passed`
- `backend/tests/integration/test_conversation_endpoints.py`: `18 passed`
- `git diff --check`: limpo
- `alembic heads`: head correto
- `alembic upgrade head` em SQLite: falha na baseline preexistente, antes da migration nova

## Critérios Obrigatórios

| Critério | Resultado |
|---|---|
| migration correta | `PASS_WITH_NOTES` |
| testes novos passam | `PASS` |
| testes de RAG staff continuam passando | `PASS` |
| ConversationService não quebrou fluxos existentes | `PASS` |
| documento interno não aparece no retriever candidato | `PASS` |
| `talk_to_hr` cria handoff rastreável | `PASS` |
| mensagem ao candidato não promete prazo | `PASS` |

## Limitações Restantes

- LangGraph ainda não implementado.
- WhatsApp ainda não implementado.
- triagem completa ainda não implementada.
- painel RH de handoffs ainda pode ser mínimo ou pendente.
- validação Alembic SQLite continua dependente de corrigir a baseline do projeto.

## Conclusão

A fase é aprovada como `PASS_WITH_NOTES`.

O núcleo seguro ficou consistente: o RAG do candidato não vaza documento interno e o handoff humano agora é persistido de forma rastreável e idempotente. A única nota material remanescente desta validação é a impossibilidade de fechar a prova Alembic end-to-end em SQLite por causa de uma incompatibilidade preexistente da migration baseline do repositório.
