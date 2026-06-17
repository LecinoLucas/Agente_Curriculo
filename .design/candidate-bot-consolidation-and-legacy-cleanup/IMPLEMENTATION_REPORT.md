# IMPLEMENTATION_REPORT.md

## Classificação

`PASS_WITH_NOTES`

## Resumo

Esta fase consolidou a base do bot de candidato sem abrir a UI final do chat e sem introduzir LangGraph multiagente.

O foco ficou em:

- documentar prompts atuais;
- documentar política explícita de tools;
- definir eval cases de segurança e operação;
- auditar legado real versus artefatos futuros;
- fazer pequenos ajustes de clareza no código;
- revalidar handoff e RAG seguro.

## Arquivos Alterados

- `backend/src/ai_orchestration/tools/registry.py`
- `backend/src/ai_orchestration/agents/supervisor_agent.py`
- `backend/src/application/services/candidate_assistant_intent_service.py`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_PROMPTS.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_TOOLS_POLICY.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/BOT_EVAL_CASES.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/LEGACY_CLEANUP_REPORT.md`
- `.design/candidate-bot-consolidation-and-legacy-cleanup/IMPLEMENTATION_REPORT.md`

## Arquivos Removidos

- nenhum

## Melhorias Feitas

### Código

- corrigido o cabeçalho documental do `DEFAULT_REGISTRY` para refletir as 19 tools reais;
- deixado explícito que o `DEFAULT_REGISTRY` não é a política final do bot do candidato;
- documentado no `supervisor_agent.py` que o módulo é um stub mantido de propósito, não um runtime ativo;
- documentado no `CandidateIntent` que `should_handoff` e `safe_user_message` permanecem reservados e ainda não dirigem o fluxo do MVP.

### Documentação operacional

- prompts atuais do bot mapeados e organizados;
- política de tools separada em `READ_ONLY`, `WRITE_SAFE_WITH_CONFIRMATION` e `FORBIDDEN_FOR_MVP`;
- casos de eval normais e perigosos definidos;
- legado analisado com evidência explícita do que foi mantido e por quê.

## Principais Conclusões

### Prompts

- o parser do candidato já tem um `system prompt` claro e restritivo;
- a resposta ao candidato ainda é majoritariamente determinística, não LLM-gerada;
- o material de prompt ainda está distribuído entre parser, state machine, conversation service e provider de conteúdo.

### Tools

- a infraestrutura atual já suporta bem tools read-only e tools com aprovação;
- o `ToolRuntime` já bloqueia escrita automática;
- a lacuna principal é que ainda não existe um registry específico do bot do candidato.

### Evals

- os cenários críticos de vazamento, privilégio indevido, discriminação e pedido de ação interna já estão definidos;
- isso cria uma base concreta para validar o MVP do portal antes de expor UI final do chat.

### Legado

- o único candidato forte a “stub sem uso” foi `supervisor_agent.py`;
- ele foi mantido por servir como âncora da arquitetura futura;
- nenhum arquivo foi removido porque a fase priorizou segurança sobre agressividade de cleanup.

## Testes Executados

```bash
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_bot_safety_foundation.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_ai_knowledge_tools.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_ai_intent.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/integration/test_conversation_endpoints.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_candidate_assistant_intent_service.py -q
APP_SECRET_KEY=test DATABASE_URL=sqlite+aiosqlite:///test.db JWT_SECRET_KEY=test backend/.venv/bin/pytest backend/tests/unit/test_ai_tool_registry.py -q
git status --short
git diff --check
```

## Resultado dos Testes

- `test_candidate_bot_safety_foundation.py`: `13 passed`
- `test_ai_knowledge_tools.py`: `13 passed`
- `test_conversation_ai_intent.py`: `12 passed`
- `test_conversation_endpoints.py`: `18 passed`
- `test_candidate_assistant_intent_service.py`: `12 passed`
- `test_ai_tool_registry.py`: `33 passed`
- `git status --short`: somente os arquivos desta fase ficaram alterados
- `git diff --check`: limpo

## Riscos Restantes

- ainda não existe `CandidateBotRegistry` separado do registry interno do ATS/RH;
- `talk_to_hr_message` continua fora do read path operacional;
- `should_handoff` e `safe_user_message` seguem reservados, sem uso efetivo no fluxo do `ConversationService`;
- `SupervisorAgent` continua sendo apenas stub;
- ainda não existe a UI final do chat no portal;
- LangGraph multiagente continua fora do escopo.

## Próximos Passos

1. Criar um registry próprio do bot candidato com tools estritamente seguras.
2. Decidir se `talk_to_hr_message` deve ser ligado ao fluxo real ou removido em fase futura.
3. Decidir o destino final de `should_handoff` e `safe_user_message`.
4. Implementar a UI do chat no portal usando essa política documental como contrato.
