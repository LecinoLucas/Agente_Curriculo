# AI-ASSISTANT-SUGGESTIONS-1

## Contextos suportados

- `job`
- `candidate`
- `admission`
- `admin`
- `knowledge`
- `generic`

## Sugestões por contexto

### Vaga

- Essa vaga está bem estruturada?
- Ver requisitos da vaga
- Ver visão da pipeline
- Quais cuidados antidiscriminatórios devo observar?

### Candidato

- Resumo seguro do candidato
- Ver pipeline ativa
- Como avaliar sem viés?

### Admissão

- O que falta para exportar?
- Ver status dos documentos
- Quais regras de pré-admissão se aplicam?
- Status Protheus
  - Exibida somente quando `packageId` ou `package_id` válido está disponível na rota.

### Admin

- Ver política de uso do assistente
- Quais cuidados de IA devo observar?
- Abrir Laboratório IA
- Abrir Credenciais IA

### Genérico

- Consultar regras de pré-admissão
- Consultar regras de Protheus
- Consultar política antidiscriminatória

### Base de conhecimento

- Consultar regras de pré-admissão
- Consultar regras de Protheus

## Intents usadas

- `job.requirements`
- `pipeline.overview`
- `candidate.summary`
- `candidate.resume_analysis`
- `admission.case_summary`
- `admission.documents_status`
- `protheus.export_status`
- `knowledge.search`
- Navegação segura para `/admin/ia` e `/admin/ai-provider-credentials`

## Decisões de segurança

- Somente intents read-only existentes foram reutilizadas.
- Queries RAG usam textos pré-definidos e não habilitam chat livre.
- Sugestões que dependem de ID só são renderizadas com `job_id`, `candidate_id`, `admission_case_id` ou `package_id` válidos.
- `Status Protheus` consulta somente leitura; nenhuma exportação foi adicionada.
- O histórico reaproveita a sanitização central já existente.
- Nenhum backend, router, tool runtime ou endpoint foi alterado.

## Sugestões proibidas

- Contratar candidato
- Rejeitar candidato
- Aprovar documento
- Exportar para Protheus
- Enviar e-mail
- Alterar vaga
- Mover no pipeline

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

## Riscos restantes

- Algumas sugestões dependem de nomenclatura de intents já existente no catálogo atual; se o backend renomear intents read-only, o frontend precisará alinhar os mapeamentos.
- As sugestões administrativas de navegação pressupõem que as rotas seguras continuem disponíveis com os mesmos caminhos.

## Próxima fase recomendada

- Adicionar telemetria de clique por sugestão e contexto para medir utilidade real, sem coletar conteúdo sensível nem habilitar texto livre.
