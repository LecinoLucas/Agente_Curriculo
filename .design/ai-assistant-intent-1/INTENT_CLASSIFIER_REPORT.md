# AI-ASSISTANT-INTENT-1

## Como o texto é classificado

- O drawer recebe a pergunta livre.
- O texto é normalizado localmente:
  - lowercase;
  - remoção de acentos;
  - trim;
  - colapso de espaços.
- Antes de qualquer classificação:
  - bloqueia vazio;
  - bloqueia texto acima de 300 caracteres;
  - bloqueia verbos de escrita/perigo.
- O classificador determinístico mapeia a pergunta para uma intent allowlisted conforme o contexto atual da tela.
- Se a intent exigir ID contextual, o ID é validado antes da execução.
- A execução continua usando o endpoint read-only existente.
- O resultado continua passando pela sanitização já existente antes de renderizar e salvar histórico.

## Intents suportadas

### Knowledge

- `knowledge.search`

### Job

- `job.summary`
- `job.requirements`
- `pipeline.overview`

### Candidate

- `candidate.summary`
- `candidate.resume_analysis`

### Admission

- `admission.case_summary`
- `admission.documents_status`
- `admission.events_summary`

### Protheus

- `protheus.export_status`
  - Somente com `package_id` válido identificado no contexto.

## Exemplos por contexto

### Vaga

- `resumo da vaga` → `job.summary`
- `quais requisitos da vaga` → `job.requirements`
- `como está a pipeline` → `pipeline.overview`
- `essa vaga está bem estruturada?` → `knowledge.search`

### Candidato

- `resumo do candidato` → `candidate.summary`
- `onde esse candidato está no processo?` → `candidate.resume_analysis`

### Admissão

- `o que falta para exportar?` → `admission.case_summary`
- `quais documentos estão pendentes?` → `admission.documents_status`
- `ver eventos da admissão` → `admission.events_summary`
- `status Protheus` → `protheus.export_status` quando houver `package_id`

### Admin / Genérico

- `o Gemini está configurado?` → `knowledge.search`
- `o assistente pode executar ações automaticamente?` → `knowledge.search`
- `quais critérios não podem ser usados em uma vaga?` → `knowledge.search`

## Limitações

- O classificador é intencionalmente restrito e determinístico.
- Ele não tenta interpretar pedidos complexos, ambíguos ou multi-intent.
- Sem ID contextual válido, consultas contextuais não são executadas.
- Perguntas fora das regras conhecidas retornam erro amigável em vez de fallback livre.
- Esta fase não usa LLM para classificação.

## Testes executados

- `cd /Users/lecinolucas/Developer/Agente_Curriculo/frontend`
- `npx tsc --noEmit`
- `npm run test -- --run AiAssistantDrawer`
- `npm run test -- --run AdminPage`
- `npm run build`
- `cd /Users/lecinolucas/Developer/Agente_Curriculo/backend`
- `source .venv/bin/activate`
- `pytest tests/unit/test_ai_assistant_endpoint.py -v`
- `pytest tests/unit/test_ai_assistant_router.py -v`
- `pytest tests/unit/test_ai_knowledge_tools.py -v`
- `pytest tests/unit/test_ai_tool_runtime.py -v`
