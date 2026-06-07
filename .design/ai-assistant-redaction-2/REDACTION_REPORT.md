# AI Assistant Redaction 2

## Bug original

Na fase `AI-ASSISTANT-E2E-1`, a resposta composta admissional exibiu CPF em texto livre vindo da Base de Conhecimento durante a execução read-only do assistente.

## Pontos reforçados

- Sanitização central em `frontend/src/features/ai-assistant/utils/aiAssistantSanitizer.ts`.
- Redação recursiva para `string`, `array`, `object`, `null` e `undefined`.
- Remoção de chaves internas sensíveis antes de qualquer renderização.
- Sanitização mantida em presenters, respostas compostas, steps parciais, warnings, erros e snapshots de histórico.
- Histórico ajustado para persistir apenas queries seguras; queries manuais sensíveis agora entram como `null`.

## Padrões redigidos

- CPF formatado e sem pontuação.
- Telefone brasileiro.
- E-mail.
- API key, bearer token, token e secret.
- Stack trace e traceback.
- `payload_json`
- `vector_json`
- `content_hash`
- `embedding`
- `embeddings`
- `review_notes`
- `internal_notes`
- `raw_ocr_text`
- `raw_resume_text`

## Testes adicionados/atualizados

- `frontend/src/features/ai-assistant/utils/aiAssistantSanitizer.test.ts`
  - 23 testes cobrindo PII, segredos, stack trace, campos internos e recursão.
- `frontend/src/features/ai-assistant/__tests__/AiAssistantDrawer.test.tsx`
  - cobertura para `knowledge.search`, `knowledge.answer`, composite, warnings, erros técnicos e histórico sanitizado.
- `frontend/e2e/qa-assistant-admission.spec.ts`
  - mantida a checagem de termos sensíveis e do bloqueio read-only.

## Resultado das validações

- `npx tsc --noEmit`: ok
- `npm run test -- --run aiAssistantSanitizer`: ok
- `npm run test -- --run AiAssistantDrawer`: ok
- `npm run test -- --run AdminPage`: ok
- `npm run build`: ok
- `pytest tests/unit/test_ai_assistant_endpoint.py -v`: ok
- `pytest tests/unit/test_ai_knowledge_tools.py -v`: ok
- `pytest tests/unit/test_ai_rag_answer_service.py -v`: ok
- E2E admissional:
  - a spec foi descoberta com `./node_modules/.bin/playwright test ... --list`
  - a execução real ficou `skipped` porque o próprio teste detectou backend/auth indisponíveis no ambiente
  - o bloqueio do sandbox para subir `vite` em `0.0.0.0:5173` foi contornado executando o Playwright fora do sandbox

## Protheus

Protheus real continua desligado. Nenhuma ação de escrita foi adicionada, habilitada ou executada nesta fase.

## Riscos restantes

- A redação continua concentrada no frontend; se um novo renderer ignorar o sanitizador, o risco reaparece.
- O E2E admissional não validou o fluxo completo neste ambiente porque backend/auth estavam indisponíveis.
- Se payloads futuros vierem em formatos textuais muito diferentes dos padrões atuais, pode ser necessário ampliar regex e remoção de blocos internos.

## Próxima fase recomendada

Aplicar uma camada de redaction equivalente antes da resposta sair do backend de RAG/knowledge, desde que sem alterar contrato, para reduzir dependência exclusiva do frontend.
