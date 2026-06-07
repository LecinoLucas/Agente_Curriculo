# AI-ASSISTANT-MULTITOOL-1

## Planos compostos implementados

- `composite.admission.export-readiness`
  - `admission.case_summary`
  - `admission.documents_status`
  - `admission.events_summary`
  - `knowledge.search`
  - `protheus.export_status` apenas com `package_id`
- `composite.job.readiness`
  - `job.summary`
  - `job.requirements`
  - `pipeline.overview`
  - `knowledge.search`
- `composite.candidate.next-step`
  - `candidate.summary`
  - `candidate.resume_analysis`
  - `knowledge.search`
- `composite.admin.ai-status`
  - `knowledge.search`
  - atalhos visuais seguros para navegação administrativa

## Steps por plano

### Admissão

- Resume o caso admissional.
- Lista pendências documentais.
- Consulta eventos recentes.
- Busca regras de pré-admissão e Protheus na base de conhecimento.
- Consulta status Protheus só quando o contexto já expõe `package_id`.

### Vaga

- Resume a vaga.
- Lista requisitos.
- Mostra visão da pipeline.
- Busca critérios de qualidade e objetividade na base.

### Candidato

- Resume o candidato.
- Mostra análise/pipeline ativa disponível hoje no catálogo.
- Busca cuidados de avaliação sem viés.

### Admin

- Busca regras de uso seguro do assistente.
- Exibe atalhos úteis sem chamar endpoint novo.

## Contextos suportados

- `admission`
- `job`
- `candidate`
- `admin`

## Comportamento em falha parcial

- Os steps são executados em sequência.
- Falhas em um step não interrompem os demais.
- O resultado composto mostra:
  - consultas realizadas;
  - evidências disponíveis;
  - limitações para os steps com erro;
  - próximo passo seguro.
- O histórico registra a execução como `composite_intent`.

## Testes executados

- `npx tsc --noEmit`
- `npm run test -- --run AiAssistantDrawer`
- `npm run test -- --run AdminPage`
- `npm run build`
- `pytest tests/unit/test_ai_assistant_endpoint.py -v`
- `pytest tests/unit/test_ai_assistant_router.py -v`
- `pytest tests/unit/test_ai_knowledge_tools.py -v`
- `pytest tests/unit/test_ai_tool_runtime.py -v`
