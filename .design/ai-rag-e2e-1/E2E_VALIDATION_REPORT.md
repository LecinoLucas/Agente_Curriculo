# Relatório de Validação E2E do Assistente IA com Base de Conhecimento

## Escopo
Validação ponta a ponta do fluxo `knowledge.search` e `knowledge.answer` do Assistente IA com base de conhecimento seed segura, sem criação de novas features, novos endpoints ou ações de escrita.

## Ambiente testado
- Data: 2026-06-07
- Branch: `save/behavioral-ai-and-wips`
- Backend: FastAPI local em `http://127.0.0.1:8000`
- Frontend: Vite local em `http://127.0.0.1:5173`
- Banco: PostgreSQL local
- Revisão Alembic: `23dbb452c78a (head)`
- Flag de síntese observada: `RAG_SYNTHESIS_ENABLED=false` no ambiente validado

## Pré-condições verificadas
- Working tree estava limpa no início da fase.
- `alembic current` retornou `23dbb452c78a (head)`.
- Seed da base de conhecimento executado com sucesso.
- Backend respondeu em `/health` com banco conectado.
- Frontend respondeu localmente.

## Seed executado
Comando validado:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
python scripts/seed_knowledge_base.py
```

Resultado observado:
- `Criados: 0`
- `Duplicados: 6`
- `Re-ingeridos: 0`
- `Falhas: 0`
- Embeddings gerados para os 6 documentos seed existentes

## Perguntas testadas
- `Quando posso exportar uma admissão para o Protheus?`
- `Quais documentos precisam estar aprovados na pré-admissão?`
- `Quais critérios não podem ser usados em uma vaga?`
- `Como funciona o pipeline de recrutamento?`
- `O assistente pode executar ações automaticamente?`

## Resultado de "Buscar fontes"
Validação confirmada via API autenticada com o payload equivalente ao uso da UI:

```json
{
  "intent": "knowledge.search",
  "arguments": {
    "query": "Quando posso exportar uma admissão para o Protheus?",
    "limit": 5
  }
}
```

Resultado observado:
- `ok: true`
- `intent: "knowledge.search"`
- `data.total: 5`
- Fonte relevante retornada: `Regras de Exportação Protheus (Fictício)`
- Resultado com título, trecho e score/relevância
- Warning controlado indicando fallback JSON quando `pgvector` não está disponível
- Nenhum erro cru ou stack trace exposto

## Resultado de "Responder"
Validação confirmada via API autenticada com o payload equivalente ao uso da UI:

```json
{
  "intent": "knowledge.answer",
  "arguments": {
    "query": "Quando posso exportar uma admissão para o Protheus?",
    "limit": 5
  }
}
```

Resultado observado no ambiente atual:
- `ok: true`
- `intent: "knowledge.answer"`
- `answer: "Síntese de conhecimento desativada globalmente."`
- `retrieval_summary.total_found: 5`
- Warnings controlados incluindo `rag_synthesis_disabled_by_flag`
- Nenhuma quebra de contrato
- Nenhum erro técnico cru exposto ao usuário

Conclusão:
- O fluxo de resposta não quebra quando a síntese está desabilitada.
- A mensagem retornada é controlada e compatível com o comportamento esperado da UI.

## Evidências de proteção de dados
Foi verificada ausência dos seguintes campos sensíveis nas respostas usadas pela UI:
- `content_hash`
- `vector_json`
- `embedding`
- `embeddings`
- `payload_json`
- `review_notes`
- `internal_notes`
- API key
- stack trace
- CPF
- e-mail real
- telefone real

Também foi confirmado que a UI já possui filtro defensivo para esses campos no drawer do assistente.

## Testes executados
Backend:

```bash
backend/.venv/bin/alembic current
backend/.venv/bin/python scripts/seed_knowledge_base.py
backend/.venv/bin/python -m pytest tests/unit/test_ai_assistant_endpoint.py -v
backend/.venv/bin/python -m pytest tests/unit/test_ai_knowledge_tools.py -v
backend/.venv/bin/python -m pytest tests/unit/test_ai_rag_answer_service.py -v
backend/.venv/bin/python -m pytest tests/unit/test_seed_knowledge_base.py -v
```

Status:
- `test_ai_assistant_endpoint.py`: passou
- `test_ai_knowledge_tools.py`: lógica passou; houve instabilidade externa de teardown do `pytest-cov` em uma execução
- `test_ai_rag_answer_service.py`: passou
- `test_seed_knowledge_base.py`: lógica passou; houve instabilidade externa de teardown do `pytest-cov` em uma execução
- `test_ai_rag_embedding_service.py`: adicionado e validado para cobrir correção de hash no pipeline de embeddings
- `test_ai_rag_postgres_vector_store.py`: ajustado e validado para refletir o fallback JSON real

Frontend:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npx tsc --noEmit
npm run test -- --run AiAssistantDrawer
npm run test -- --run JobAiDraftPanel
```

Status:
- `npx tsc --noEmit`: passou
- `AiAssistantDrawer`: passou
- `JobAiDraftPanel`: passou

## E2E adicional
Foi criado o teste opcional:

```text
frontend/e2e/qa-assistant-rag.spec.ts
```

Cobertura prevista:
- abrir drawer
- buscar fontes
- validar ausência de campos sensíveis
- acionar responder
- validar resposta normal ou aviso controlado de síntese desabilitada

Status no ambiente atual:
- não foi possível concluir execução confiável do Playwright neste ambiente
- houve coleta vazia em uma tentativa de execução por shell
- a automação por browser local também ficou bloqueada por restrição de permissão do ambiente

## Bugs encontrados
1. O repositório vetorial retornava vazio quando `pgvector` não estava disponível, mesmo havendo fallback JSON implementável.
2. O seed preservava documentos e chunks, mas não garantia backfill de embeddings para documentos já existentes.
3. O pipeline de embeddings podia persistir `content_hash` nulo em determinados chunks, quebrando a gravação em `ai_knowledge_embeddings`.
4. O ambiente de testes backend apresentou instabilidade externa de `pytest-cov` no teardown, independente do resultado lógico dos testes.

## Correções feitas
1. Ajustado o `PostgresVectorStore` para executar busca por fallback JSON mesmo sem `pgvector`, preservando warning controlado.
2. Ajustado o seed para gerar embeddings para documentos seed já existentes sem duplicar conteúdo.
3. Corrigido fallback de `content_hash` no `EmbeddingService`.
4. Atualizados testes unitários para refletir o comportamento correto do fallback e do seed com embeddings.
5. Adicionado teste E2E opcional para o fluxo da UI.

## Evidências operacionais
- Backend saudável em `/health` com banco conectado.
- Alembic em `23dbb452c78a`.
- Base seed segura presente e consultável.
- Busca RAG retornando documentos seed pela API.
- Resposta RAG retornando mensagem amigável quando a síntese está desligada.

## Riscos restantes
- A execução manual completa via navegador não pôde ser finalizada neste ambiente por restrição operacional de browser automation.
- Existe instabilidade externa de `pytest-cov` no backend, que pode marcar a execução como falha mesmo quando os testes da área passaram logicamente.
- A validação com Gemini real não foi executada, em conformidade com a restrição de não usar chave real sem configuração explícita.

## Conclusão
Critérios funcionais centrais desta fase foram atendidos no ambiente validado:
- banco em `head`
- seed executado
- busca de conhecimento funcionando com documentos seed
- resposta de conhecimento degradando de forma controlada com síntese desabilitada
- ausência de campos sensíveis nas respostas consumidas pela UI
- nenhum endpoint novo criado
- nenhuma ação de escrita adicionada
- nenhum chat livre adicionado

## Próxima fase recomendada
- Executar a mesma validação com browser local liberado para fechar evidência visual do drawer em execução real.
- Estabilizar ou isolar o plugin `pytest-cov` nas suítes backend para evitar falso negativo de CI local.
- Se necessário em fase futura, repetir a validação com `RAG_SYNTHESIS_ENABLED=true` e chave Gemini configurada apenas em `.env` local.
