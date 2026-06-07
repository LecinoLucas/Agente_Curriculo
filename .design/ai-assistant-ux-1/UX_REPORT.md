# AI-ASSISTANT-UX-1

## O que foi melhorado

- O drawer do Assistente IA passou a renderizar resultados por domínio/intenção em vez de exibir payloads quase crus.
- Warnings e erros técnicos passaram a ser traduzidos para mensagens amigáveis em PT-BR.
- `knowledge.search` ganhou apresentação focada em fontes encontradas, trechos relevantes e ausência de evidência.
- `knowledge.answer` passou a separar resposta, fontes usadas, limitações e próximo passo sugerido.
- Empty states ficaram contextuais por rota, com instrução útil quando a página atual não oferece contexto suficiente.
- O histórico visual passou a guardar snapshots sanitizados e amigáveis, sem warnings crus.
- Ações rápidas receberam microcopy mais operacional.
- O drawer passou a sanitizar dados sensíveis e metadados técnicos antes de renderizar ou persistir o resultado.

## Antes e depois

### Warnings

Antes:

```text
embedding_provider_error: RuntimeError
PROVIDER_UNAVAILABLE
PROVIDER_RATE_LIMITED
```

Depois:

```text
Não foi possível consultar os embeddings agora. Verifique a configuração do Gemini ou tente novamente em instantes.
O provedor de IA está temporariamente indisponível. Tente novamente em alguns instantes.
O limite de uso do provedor foi atingido temporariamente. Aguarde um pouco antes de tentar novamente.
```

### Busca na base

Antes:

```text
{ query, total, chunks, warnings }
```

Depois:

```text
Fontes encontradas
- título do documento
- trecho relevante
- relevância
- avisos e limitações quando necessário
```

### Resposta com fontes

Antes:

```text
mensagem técnica ou objeto de síntese sem estrutura clara
```

Depois:

```text
Resposta
Fontes usadas
Próximo passo sugerido
Limitações
```

## Warnings traduzidos

- `embedding_provider_error:*`
- `vector_store_error:*`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_TIMEOUT`
- `rag_synthesis_disabled_by_flag`
- `no_chunks_available`
- `no_chunks_found`
- `empty_query`
- `low_score`
- `fallback_mode`

## Presenters criados

- `job.*`
- `candidate.*`
- `pipeline.*`
- `admission.*`
- `protheus.*`
- `knowledge.search`
- `knowledge.answer`
- fallback genérico para respostas sem presenter específico

Cada presenter tenta organizar:

- `Resumo`
- `Evidências`
- `Pendências`
- `Próximo passo sugerido`
- `Limitações`

## Decisões de segurança

- Não foi usado `dangerouslySetInnerHTML`.
- O drawer sanitiza antes de renderizar e antes de salvar no histórico.
- Foram bloqueados campos e metadados como:
  - `content_hash`
  - `vector_json`
  - `embedding`
  - `embeddings`
  - `payload_json`
  - `review_notes`
  - `internal_notes`
  - `stack`
  - `stack_trace`
  - `api_key`
  - `GEMINI_API_KEY`
- Strings com traços de stack trace, e-mails, telefones e CPF passam por redução/redação antes da exibição.
- Warnings técnicos seguem acessíveis para inspeção de desenvolvimento via atributo de dados, sem exposição visual para usuário comum.

## Ajustes de UX

- Empty state genérico orienta abrir vaga, candidato ou caso admissional, além de sugerir consulta à base de conhecimento.
- Empty states específicos foram adicionados para rotas de vaga, candidato e admissão sem contexto válido.
- Quick actions mantiveram o posicionamento por rota, mas ganharam descrição curta com foco operacional.
- O carregamento ficou menos técnico e mais coerente com o fluxo read-only.
- O bloco `Próximo passo sugerido` foi limitado a recomendações seguras e não decisórias.

## Testes executados

Frontend:

- `npx tsc --noEmit`
- `npm run test -- --run AiAssistantDrawer`
- `npm run test -- --run AdminPage`
- `npm run build`

Backend:

- `.venv/bin/python -m pytest tests/unit/test_ai_assistant_endpoint.py tests/unit/test_ai_knowledge_tools.py tests/unit/test_ai_rag_answer_service.py tests/unit/test_ai_assistant_router.py -v`

Resultado:

- Drawer: `21 passed`
- AdminPage/Knowledge/Assistant admin: `48 passed`
- Backend regressão mínima: `99 passed`
- Build do frontend: concluído sem erro

## Riscos restantes

- O conteúdo ainda depende fortemente do payload retornado por tools read-only existentes; onde o backend não entrega diagnóstico operacional, o presenter só consegue reorganizar a leitura.
- Algumas recomendações de próximo passo ainda são genéricas porque esta fase não adiciona contexto automático multi-tool.
- Persistem warnings em testes antigos de páginas admin que não fazem parte desta fase (`act(...)` e atributo `loading`), mas sem falha funcional.
- O histórico continua curto e local ao drawer; não houve expansão de memória, sessão longa ou replay entre páginas.

## Próxima fase recomendada

`AI-ASSISTANT-CONTEXT-1`

Foco:

- contexto automático da página atual;
- enriquecimento seguro de argumentos por rota;
- respostas mais específicas para vaga, candidato, pipeline e admissão;
- base para futuros próximos passos menos genéricos, sem abrir chat livre.
