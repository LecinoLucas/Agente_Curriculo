# JOB-AI-DRAFT-SKILLS-AUDIT-1

## Objetivo

Mapear o fluxo atual de skills no Job AI Draft, cobrindo:

- contrato backend de `suggested_skills[]`;
- tipagem e renderização no frontend;
- aplicação do draft ao formulário;
- papel de `mandatory_skills` e `nice_to_have_skills`;
- separação entre skills estruturadas, texto livre e payload final;
- riscos antes de implementar aplicação real das seleções.

## Estado da árvore

- `git status --short` estava vazio no início da auditoria.
- Nesta fase, nenhum arquivo de código foi alterado.

## Backend

### Onde o schema backend define `suggested_skills`

- `backend/src/interface/api/schemas/job_schemas.py`
  - `AiDraftFieldsResponse.suggested_skills`
  - `AiDraftSuggestedSkillResponse`
  - campos:
    - `name`
    - `category`
    - `aliases`
    - `description`
    - `importance`
    - `source`
    - `catalog_status`
    - `catalog_skill_id`
    - `catalog_skill_name`
    - `catalog_matched_by`
    - `catalog_conflicts`

### Onde o prompt/rules exigem `suggested_skills`

- `backend/src/application/services/job_ai_draft_rules.py`
  - `AiDraftFields.suggested_skills`
  - `_SYSTEM_PROMPT` exige explicitamente `suggested_skills`
  - prompt orienta a IA a gerar aliases úteis e específicos
  - `_parse_suggested_skills()` faz parse da lista
  - `_fallback_suggested_skills()` monta sugestões mínimas a partir de `mandatory_skills` e `nice_to_have_skills` se a IA não devolver a estrutura

### Onde aliases são gerados/normalizados

- A IA gera aliases via prompt.
- O backend:
  - limpa aliases com `_safe_skill_aliases(...)`
  - remove duplicidade e o próprio nome normalizado
  - usa `normalize_skill_name(...)` da Fase 1 para nome e aliases

### Onde o matcher classifica `existing/new/conflict`

- `backend/src/application/services/job_ai_skill_catalog_matcher.py`
  - constrói um índice por `normalized_name` e `normalized_alias`
  - para cada skill sugerida, compara:
    - nome sugerido
    - todos os aliases sugeridos
  - regras:
    - `0 match` => mantém `new`
    - `1 match` => `existing`
    - `>1 match` => `conflict`

### Onde a resposta da API é montada

- `backend/src/application/services/job_ai_draft_service.py`
  - `generate(...)`
  - `_annotate_catalog_status(...)` aplica o matcher antes do retorno
- `backend/src/interface/api/routers/jobs.py`
  - `_build_ai_draft_response(...)` serializa `draft.suggested_skills` no payload HTTP

### Testes backend existentes

- `backend/tests/unit/test_job_ai_draft_service.py`
  - preservação de aliases
  - `existing` por nome
  - `existing` por alias
  - `new`
  - `conflict`
- `backend/tests/integration/test_job_ai_draft_generate.py`
  - contrato HTTP
  - presença de `suggested_skills`
  - estrutura geral do draft

## Frontend

### Onde `suggested_skills` é tipado

- `frontend/src/features/jobs/services/jobAiDraftService.ts`
  - `JobAiDraftFields.suggested_skills`
  - `JobAiDraftSuggestedSkill`

### Onde `suggested_skills` é normalizado

- Não existe normalização estrutural separada de `suggested_skills`.
- O que existe hoje:
  - tipagem do serviço
  - agrupamento por status dentro do componente
  - defaults de seleção visual no painel

### Onde a revisão visual renderiza

- `frontend/src/features/jobs/components/JobAiDraftPanel.tsx`
  - bloco `draft-suggested-skills`
  - agrupamento por:
    - `existing`
    - `new`
    - `conflict`
  - badges, aliases, descrição, conflitos e mensagem contextual

### Como os checkboxes são armazenados

- `selectedSuggestedSkillKeys` em `JobAiDraftPanel.tsx`
- chave calculada por `getSuggestedSkillKey(item)`
- defaults:
  - `existing` marcado
  - `new` desmarcado
  - `conflict` desmarcado

### Se a seleção é usada ou só visual

- Hoje é apenas visual.
- Evidência:
  - `handleApply()` chama apenas:
    - `applyApiDraftToForm(draft)`
    - `extractSkillSuggestions(draft)`
  - `selectedSuggestedSkillKeys` não entra no `onApply(...)`

### Onde fica o botão “Aplicar ao formulário”

- `frontend/src/features/jobs/components/JobAiDraftPanel.tsx`
  - botão `data-testid="ai-draft-apply-btn"`

### Como o draft é convertido para form state

- `frontend/src/features/jobs/utils/jobAiDraftHelpers.ts`
  - `applyApiDraftToForm(draft)`
  - mapeia:
    - `title`
    - `description`
    - `area -> job_area`
    - `seniority -> seniority_level`
    - `work_model`
    - `unit -> location`
    - `working_hours`
    - `experience_context`
    - `minimum_education_level`
    - `minimum_years_experience`
    - `responsibilities[] -> textarea`
    - `requirements[] -> textarea`
    - `mandatory_skills[]`
    - `nice_to_have_skills[]`
    - `screening_questions[]`
    - `benefits[]`
    - booleans operacionais

### Como `mandatory_skills` e `nice_to_have_skills` entram no formulário

- Entram diretamente como arrays de strings em `JobFormValues`
- Arquivos:
  - `frontend/src/features/jobs/jobFormConfig.ts`
  - `frontend/src/pages/JobFormPage.tsx`

### Se `JobFormPage` recebe alguma informação de `suggested_skills`

- Não diretamente.
- O `JobFormPage` recebe o resultado final de `onApply(...)`, que hoje não inclui `suggested_skills`.

## Form state

### A. Skills estruturadas do catálogo

- Representadas separadamente de `mandatory_skills`/`nice_to_have_skills`
- Tipo:
  - `PendingJobSkill`
- Arquivo:
  - `frontend/src/features/jobs/jobFormConfig.ts`
- campos:
  - `skill_id`
  - `skill_name`
  - `priority_level`
  - `minimum_level`
  - `minimum_years`
  - `weight`

Essas skills estruturadas aparecem nas sub-abas internas da etapa Skills:

- Essenciais
- Diferenciais

Elas usam componentes separados como:

- `JobFormMandatorySkillsStep`
- `JobFormDifferentialsStep`

### B. Texto livre

- `mandatory_skills: string[]`
- `nice_to_have_skills: string[]`
- `behavioral_requirements: string[]`

Na UI atual do formulário:

- `mandatory_skills` e `nice_to_have_skills` aparecem na sub-aba `Competências livres`
- são texto livre para descrição da vaga
- não são a camada estruturada do catálogo

### C. Payload final

- Arquivo:
  - `frontend/src/features/jobs/jobFormConfig.ts`
  - `buildCreateJobPayload(form)`
  - `buildUpdateJobPayload(form)`

O payload final envia:

- `mandatory_skills`
- `nice_to_have_skills`
- `screening_questions`
- `benefits`
- demais campos textuais/operacionais

Não envia:

- `suggested_skills`
- seleção visual dos checkboxes

## Aplicar ao formulário hoje

Quando o usuário clica em `Aplicar ao formulário` no `JobAiDraftPanel`:

1. `handleApply()` chama `confirmApply()`
2. `confirmApply()` executa:
   - `const updates = applyApiDraftToForm(draft)`
   - `const skills = extractSkillSuggestions(draft)`
   - `onApply(updates, skills)`

### Quais campos são preenchidos

- campos textuais e estruturais do draft
- `mandatory_skills`
- `nice_to_have_skills`
- `screening_questions`
- `benefits`
- booleans de fluxo

### `mandatory_skills` vira o quê

- vira `form.mandatory_skills`
- ou seja, lista livre de competências obrigatórias, não skills estruturadas do catálogo

### `nice_to_have_skills` vira o quê

- vira `form.nice_to_have_skills`
- também lista livre

### `suggested_skills` é ignorado?

- Sim, para efeito de aplicação no formulário e payload final.
- Ele só afeta a UI de revisão.

### Checkboxes da revisão influenciam algo?

- Não.
- São apenas informativos nesta fase.

### `new` e `conflict` podem entrar indevidamente?

- Não como skills estruturadas do catálogo.
- Mas nomes equivalentes ou relacionados ainda podem aparecer indiretamente em:
  - `mandatory_skills`
  - `nice_to_have_skills`
  - resultado de `extractSkillSuggestions(draft)`

Isso acontece porque a aplicação usa o draft textual, não a revisão de `suggested_skills`.

### Existe deduplicação?

- Sim, mas limitada a listas livres:
  - `normalizeAiDraftStringList(...)`
  - `normalizeDraftList(...)`
  - `extractSkillSuggestionsFromDraft(...)`

Não existe deduplicação integrada entre:

- texto livre
- skills estruturadas do catálogo
- `suggested_skills`

### Existe risco de duplicar skill?

- Sim.
- Cenários prováveis:
  - skill já estruturada no catálogo + mesmo termo em `mandatory_skills`
  - skill sugerida `existing` visualmente revisada, mas não aplicada como skill estruturada
  - listas livres contendo termos equivalentes ao catálogo

### Existe risco de perder dados já digitados?

- Sim, no comportamento normal de aplicar draft sobre formulário preenchido.
- Há mitigação parcial:
  - se `formHasData` é `true`, o painel abre confirmação antes de substituir
- Mesmo assim, a aplicação continua sobrescrevendo os campos-alvo do draft após confirmação.

## Payload final

- `suggested_skills` não participa do payload final
- `mandatory_skills` e `nice_to_have_skills` participam
- skills estruturadas do catálogo usam outro fluxo/estado, separado do draft textual

## Testes existentes

### Backend

- `tests/unit/test_job_ai_draft_service.py`
  - aliases preservados
  - `existing/new/conflict`
- `tests/integration/test_job_ai_draft_generate.py`
  - contrato da API
  - `suggested_skills` presente no draft

### Frontend

- `frontend/src/features/jobs/__tests__/JobAiDraftPanel.test.tsx`
  - render do painel
  - revisão visual por status
  - aliases
  - checkboxes visuais
  - `Aplicar ao formulário`
  - `new` não cria skill automaticamente
  - `conflict` não resolve automaticamente

- `frontend/src/pages/__tests__/JobFormPage.test.tsx`
  - `Aplicar ao formulário` continua preenchendo os campos reais
  - fluxo do formulário permanece compatível

## Riscos encontrados

1. `suggested_skills` ainda não influencia aplicação real no formulário.
2. `mandatory_skills` e `nice_to_have_skills` do draft entram como texto livre, não como skills estruturadas do catálogo.
3. Existe risco de duplicidade semântica entre:
   - texto livre
   - sugestões de IA
   - skills já estruturadas
4. `new` e `conflict` não são aplicadas como catálogo, o que evita erro automático, mas também significa que a revisão atual não produz efeito operacional.
5. A seleção por checkbox pode criar expectativa de efeito real que hoje não existe.
6. Não há resolução manual embutida para `conflict`.

## Matriz de estado atual

| Item | Estado atual | Arquivo/função | Risco | Próxima ação sugerida |
|---|---|---|---|---|
| Backend suggested_skills | Contrato completo já disponível | `job_schemas.py`, `job_ai_draft_rules.py` | Baixo | Reusar sem mudar API |
| Matcher catálogo | Classifica `existing/new/conflict` por nome e alias normalizados | `job_ai_skill_catalog_matcher.py` | Baixo | Reusar no frontend apenas como metadado |
| Frontend typing | Tipagem completa no serviço | `jobAiDraftService.ts` | Baixo | Manter |
| Revisão visual | Existe e agrupa por status | `JobAiDraftPanel.tsx` | Baixo | Evoluir sem quebrar UX |
| Checkboxes | Apenas visuais | `JobAiDraftPanel.tsx` | Médio | Integrar com aplicação real |
| Aplicar ao formulário | Usa `applyApiDraftToForm` + `extractSkillSuggestions` | `JobAiDraftPanel.tsx` | Médio | Definir regra clara para `existing` |
| mandatory_skills | Vai para texto livre do form | `jobAiDraftHelpers.ts`, `jobFormConfig.ts` | Médio | Decidir se continua livre ou vira catálogo em parte |
| nice_to_have_skills | Vai para texto livre do form | `jobAiDraftHelpers.ts`, `jobFormConfig.ts` | Médio | Mesmo risco de duplicidade |
| new | Só visual, não cria catálogo | `JobAiDraftPanel.tsx` | Baixo | Manter sem automação |
| conflict | Só visual, não resolve automaticamente | `JobAiDraftPanel.tsx` | Médio | Criar fluxo de escolha manual |
| Deduplicação | Existe só para listas livres | `normalizeAiDraftStringList`, `normalizeDraftList` | Médio | Deduplicar entre catálogo e texto |
| Payload final | Não inclui `suggested_skills` | `jobFormConfig.ts` | Baixo | Manter até fase própria |
| Testes | Cobertura boa do estado atual | unit/integration + frontend tests | Baixo | Expandir quando houver aplicação real |

## Próximas fases sugeridas

1. `JOB-AI-DRAFT-SKILL-APPLY-1`
   Integrar `existing` selecionadas ao formulário com segurança, preferindo skills estruturadas do catálogo sem quebrar o draft atual.

2. `JOB-AI-DRAFT-SKILL-CONFLICT-RESOLVE-1`
   Permitir que o RH escolha manualmente a skill correta do catálogo para casos `conflict`.

3. `SKILL-CATALOG-SUGGESTION-APPROVAL-1`
   Criar fluxo controlado para aprovar `new` como candidatas a catálogo, sem criação automática no banco.

## Confirmações

- backend não foi alterado
- frontend não foi alterado
- testes não foram alterados
- API não foi alterada
- payload não foi alterado
- nenhuma migration foi criada
- nenhum commit foi realizado
