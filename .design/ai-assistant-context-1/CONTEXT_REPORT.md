# AI-ASSISTANT-CONTEXT-1

## Rotas mapeadas

- `/vagas/:jobId`
- `/vagas/:jobId/editar`
- `/pipeline/:jobId`
- `/candidatos/:candidateId`
- `/admission/cases/:caseId`
- `/admissao/:caseId`
- `/admitidos/:caseId` quando houver rota direta com identificador
- `/admitidos` como contexto admissional sem ID
- `/admin`
- `/admin/ia`
- `/admin/health`
- `/admin/ai-provider-credentials`
- `/admin/conhecimento`

## Contextos suportados

- `job`
- `candidate`
- `admission`
- `admin`
- `knowledge`
- `generic`

O drawer agora deriva automaticamente:

- domínio da tela;
- ID principal da entidade, quando existir;
- label amigável de contexto;
- orientação curta para a tela atual;
- ações recomendadas compatíveis com o backend read-only.

## Ações por contexto

### Vaga

- `job.summary` com `job_id`
- `job.requirements` com `job_id`
- `pipeline.overview` com `job_id`
- `knowledge.search` com query padrão sobre qualidade de vaga

### Candidato

- `candidate.summary` com `candidate_id`
- `candidate.resume_analysis` exposto no drawer como ação contextual de currículo
- `knowledge.search` com query padrão sobre avaliação justa

### Admissão

- `admission.case_summary` com `admission_case_id`
- `admission.documents_status` com `admission_case_id`
- `admission.events_summary` com `admission_case_id`
- `knowledge.search` com query padrão sobre pré-admissão
- `protheus.export_status` só aparece quando a rota fornece `packageId` ou `package_id`

### Admin

Como não há intent própria de consumo/status administrativo no endpoint do assistente, o drawer não inventa chamadas novas.

Ele passa a exibir:

- atalhos seguros para `/admin/ia`
- atalhos seguros para `/admin/health`
- `knowledge.search` com query padrão sobre política de uso do assistente

### Genérico

- sem ações dependentes de entidade
- base de conhecimento continua disponível
- empty state contextual orientando abrir vaga, candidato ou caso admissional

## Decisões de segurança

- Nenhum endpoint novo foi criado.
- Nenhuma alteração foi feita em backend, `AssistantRouter` ou `ToolRuntime`.
- O drawer só expõe intents já existentes.
- Ação inválida não aparece quando o ID exigido não está disponível.
- `protheus.export_status` não é exibida sem `package_id`.
- O histórico continua sanitizado e agora guarda também `domain` e `entityId`.
- Não foi usado `dangerouslySetInnerHTML`.
- A sanitização de campos sensíveis da fase anterior foi preservada.

## Testes executados

Frontend:

- `npx tsc --noEmit`
- `npm run test -- --run AiAssistantDrawer`
- `npm run test -- --run AdminPage`
- `npm run build`

Backend:

- `.venv/bin/python -m pytest tests/unit/test_ai_assistant_endpoint.py -v tests/unit/test_ai_assistant_router.py -v tests/unit/test_ai_knowledge_tools.py -v`

Resultado:

- Drawer: `29 passed`
- AdminPage/Knowledge/Assistant admin: `48 passed`
- Backend regressão mínima: `90 passed`
- Build do frontend: concluído sem erro

## Riscos restantes

- O contexto ainda é derivado só da rota e query string; não há leitura automática do estado da tela ou dados já carregados no componente principal.
- Em candidato, não há `job_id` garantido na rota, então o drawer não tenta inferir posição em pipeline específica.
- Em admissão, o status do Protheus ainda depende de `package_id` disponível na URL; sem isso a ação fica oculta.
- Admin continua limitado a atalhos e consultas na base, já que o endpoint do assistente não expõe intents de governança/usage.

## Próxima fase recomendada

`AI-ASSISTANT-INTENT-1`

Foco sugerido:

- texto livre controlado, mas restrito a intents read-only existentes;
- classificação segura entre intents suportadas;
- redução da dependência do clique exato em ação rápida;
- preservando bloqueio de chat livre geral e ausência de write actions.
