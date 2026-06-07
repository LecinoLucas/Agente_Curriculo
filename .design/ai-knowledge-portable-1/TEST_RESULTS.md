# Test Results

## Frontend

Executado:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend
npx tsc --noEmit
npm run test -- --run AiAssistantDrawer
```

Resultado:

- `TypeScript: No errors found`
- `AiAssistantDrawer.test.tsx`: `72 passed`

Cobertura validada:

- perguntas administrativas simples não chamam `aiAssistantService.query`;
- resposta local para Base de Conhecimento;
- resposta local para usage/tokens;
- atalho local navega para Base de Conhecimento.

## Backend

Executado:

```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
source .venv/bin/activate
pytest tests/unit/test_ai_knowledge_portability_service.py tests/unit/test_seed_knowledge_base.py -v
```

Resultado:

- `12 passed`

Cobertura validada:

- export seguro sem campos internos;
- import portátil cria documentos com `indexing_status=pending`;
- update de conteúdo limpa chunks/embeddings antigos;
- chave estável por `source_uri` ou campos lógicos;
- bundle com conteúdo sensível é rejeitado;
- regressão do seed da base permanece passando.

## Resultado final

- Smart Router administrativo local implementado.
- Perguntas administrativas simples deixam de depender de Gemini.
- Portabilidade da Base de Conhecimento passa a ter bundle JSON versionado, seguro e reprodutível.
