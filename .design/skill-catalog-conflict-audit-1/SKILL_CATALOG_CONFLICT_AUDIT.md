# SKILL-CATALOG-CONFLICT-AUDIT-1

## Objetivo

Auditar o catálogo atual de skills, aliases, normalização e conflitos de seed sem alterar código, seed ou dados do banco.

## Estado da árvore

- `git status --short` estava limpo no início da auditoria.
- Esta fase criou apenas este relatório.

## Arquivos auditados

- `backend/src/domain/catalogs/skill_equivalences.json`
- `backend/scripts/seed_skill_catalog_from_json.py`
- `backend/scripts/compare_skill_catalog_sources.py`
- `backend/src/application/services/skill_normalizer_service.py`
- `backend/src/application/services/skill_catalog_normalizer.py`
- `backend/src/application/services/job_ai_skill_catalog_matcher.py`
- `backend/src/application/services/job_ai_draft_service.py`
- `backend/src/application/services/job_ai_draft_rules.py`
- `backend/src/application/services/analysis_service.py`
- `backend/src/application/services/skill_equivalence_service.py`
- `backend/src/application/services/skill_catalog_runtime_service.py`
- `backend/src/application/services/skill_catalog_sync_service.py`
- `backend/src/application/services/candidate_ranking_service.py`
- `backend/src/infrastructure/database/models/skill_catalog_model.py`
- `backend/src/infrastructure/database/models/job_model.py`
- `backend/src/infrastructure/repositories/sqlalchemy_skill_catalog_repository.py`
- `backend/tests/integration/test_seed_skill_catalog.py`
- `backend/tests/integration/test_skill_catalog_runtime.py`
- `backend/tests/unit/test_job_ai_draft_service.py`

## Como o seed funciona hoje

- O seed legada principal está em `backend/scripts/seed_skill_catalog_from_json.py`.
- Fonte: `backend/src/domain/catalogs/skill_equivalences.json`.
- Regras observadas:
  - cria `skill_catalog` por `canonical` normalizado quando ainda não existe;
  - ignora alias igual ao canônico normalizado;
  - bloqueia grupo inteiro quando o `canonical` já existe como alias de outra skill;
  - bloqueia alias que já existe como `canonical` de outra skill;
  - bloqueia alias que já existe em outra skill;
  - registra conflito com `print("[CONFLICT] ...")`;
  - retorna sumário com `skills_created`, `skills_existed`, `aliases_created`, `aliases_existed`, `conflicts_ignored`.

## Como a normalização funciona hoje

- Implementação central: `backend/src/application/services/skill_normalizer_service.py`.
- Regras:
  - lower-case;
  - remoção de acentos com `NFKD`;
  - `-` e `_` viram espaço;
  - espaços múltiplos colapsam;
  - não há stemming, taxonomia semântica, nem desambiguação contextual.
- Efeito prático:
  - `C#`, `.NET`, `Node.js`, `SAP MM` e siglas curtas dependem fortemente do catálogo correto;
  - termos amplos e específicos colidem facilmente se um for alias do outro.

## Estrutura atual do banco

Consultas read-only via Docker/psql confirmaram:

- tabelas relevantes:
  - `skill_catalog`
  - `skill_aliases`
  - `skill_relations`
  - `skills`
  - `job_required_skills`
- constraints relevantes:
  - `skill_catalog.normalized_name` é `UNIQUE`;
  - `skill_aliases.normalized_alias` é `UNIQUE`;
  - `job_required_skills` usa `uq_job_skill (job_id, skill_id)`;
  - `skill_relations` usa `uq_skill_relations_source_target_type`.

Estado observado no banco local:

- `skill_catalog`: `80`
- `skill_aliases`: `205`
- `skill_relations`: `0`
- aliases duplicados persistidos: `0`
- canônicos duplicados persistidos por normalização: `0`
- aliases persistidos que batem com canônico de outra skill: `0`

Leitura operacional:

- o banco atual está consistente estruturalmente;
- os conflitos estão concentrados no catálogo fonte/seed e no processo de comparação, não em duplicidade já gravada.

## Tipos de conflitos encontrados

### A. Alias igual a canonical skill

Encontrado no JSON legado em grupos amplos e perigosos.

Exemplos:

- `Backend` usa alias `Python`, mas `Python` também é canônica.
- `Frontend` usa alias `JavaScript`, mas `JavaScript` também é canônica.
- `Data Science` usa alias `Machine Learning`, mas `Machine Learning` também é canônica.

### B. Alias apontando para outra skill

Encontrado no JSON legado quando um alias já foi tomado por outro grupo antes do grupo atual.

Exemplos observados:

- `Backend` tenta usar `Django` e `FastAPI`, já absorvidos pelo grupo `Python`;
- `Frontend` tenta usar `TypeScript`, já absorvido por `JavaScript`;
- `monitoring` tenta usar `monitoramento`, já absorvido por `Observability`.

### C. Canonical name já existe como alias

Este é o conflito mais destrutivo para o seed antigo, porque o grupo inteiro é ignorado.

Exemplos observados:

- `Java` já aparece como alias de `Backend`;
- `.NET` já aparece como alias de `Backend`;
- `Node.js`, `API`, `REST`, `GraphQL`, `React`, `Next.js`, `Vue`, `Angular`, `SAP MM` seguem o mesmo padrão;
- na simulação local do seed, `29` grupos seriam pulados por essa regra.

### D. Grupo ignorado

A simulação da lógica do seed sobre o JSON legado mostrou:

- `99` grupos no JSON;
- `70` skills criadas;
- `29` grupos inteiros ignorados porque o canônico já existia como alias.

Grupos mais afetados:

- trilha `Backend`
- trilha `Frontend`
- subskills técnicas de `Cloud`
- subskills/modulos de `ERP`

### E. Conflito idempotente aceitável

Conflitos aceitáveis de reexecução existem e são esperados:

- `skills_existed`
- `aliases_existed`
- alias igual ao próprio canônico

Esses não indicam dano real por si só.

### F. Conflito perigoso

Conflitos perigosos observados no catálogo legado:

- macro skill usando como alias skills específicas e consagradas;
- alias curto e genérico atravessando domínios diferentes;
- canônico específico sendo engolido por alias de grupo amplo;
- perda total de grupo no seed antigo;
- dependência de ordem dos grupos no JSON.

Exemplos críticos:

- `Backend` com `API`, `REST`, `GraphQL`, `Node.js`, `Java`, `Spring Boot`, `Python`, `Django`, `FastAPI`, `C#`, `.NET`, `PHP`, `Laravel`
- `Frontend` com `React`, `Next.js`, `Vue`, `Angular`, `HTML`, `CSS`, `Tailwind`, `JavaScript`, `TypeScript`
- `BI` com `Power BI`, `Tableau`, `dashboards`
- `Cloud` com `AWS`, `Azure`, `GCP`, `Oracle Cloud`
- `ERP` com `SAP`, `SAP MM`, `TOTVS`, `Protheus`, `Oracle ERP`
- `JavaScript` com `TypeScript`
- `Python` com `FastAPI`, `Django`

## Conflitos idempotentes

- alias repetido do próprio canônico: `67` ocorrências na simulação local;
- reexecução de seed para skills/aliases já persistidos é tratada sem dano estrutural;
- o banco atual não apresentou duplicidade persistida.

## Conflitos perigosos

Sinais fortes de risco:

- o JSON tem `99` grupos, mas a simulação do seed antigo criaria só `70` skills;
- `29` grupos seriam descartados por colisão `canonical_is_existing_alias`;
- `38` casos de alias que batem com canônico de outro grupo no JSON;
- `11` casos de alias já apropriado por outro grupo no JSON;
- `skill_relations` no banco está vazio, enquanto o JSON legado contém `135` relations;
- `.env.docker.local` aponta `SKILL_CATALOG_SOURCE=database`.

Isso significa que, no estado atual, o catálogo persistido pode estar estruturalmente limpo, mas semanticamente incompleto ou enviesado por grupos amplos.

## Impacto no Job AI Draft

### Como o matcher funciona

- `JobAiSkillCatalogMatcher` normaliza:
  - `suggested_skill.name`
  - todos os `suggested_skill.aliases`
  - `skill_catalog.normalized_name`
  - `skill_aliases.normalized_alias`
- Se houver:
  - `0` match: `catalog_status = "new"`
  - `1` match: `catalog_status = "existing"`
  - `>1` match: `catalog_status = "conflict"`

### O catálogo atual permite match confiável?

- Parcialmente.
- Para nomes específicos e não ambíguos, sim.
- Para termos que foram modelados como macro aliases ou cuja especialização foi absorvida por outra skill, não.

### Alias duplicado pode gerar `catalog_status = conflict`?

- Sim.
- O teste unitário de `job_ai_draft_service` confirma isso.
- Como o matcher trabalha por termo normalizado e agrega `matched_ids`, qualquer alias ou nome que aponte para múltiplas skills produz conflito.

### Os conflitos do seed explicam conflitos na revisão visual?

- Sim.
- O padrão de grupos amplos engolindo subskills específicas explica por que sugestões da IA podem cair em `conflict` ou em match enviesado.

### `catalog_conflicts[]` com nome apenas é suficiente?

- Não para resolução robusta.
- Hoje `catalog_conflicts[]` carrega apenas nomes.
- Para auditoria, rastreabilidade e escolha determinística no frontend/admin, o ideal é incluir também IDs e, se possível, metadados mínimos.

### Validações necessárias antes de aprovar nova skill

- bloquear `canonical` cujo normalizado já exista como `canonical` ou alias;
- bloquear alias cujo normalizado já exista em qualquer outro `canonical` ou alias;
- proibir alias amplos que representem família/categoria, não equivalência textual;
- exigir distinção entre:
  - equivalência textual;
  - relação semântica;
  - macro skill / área;
  - módulo de sistema;
- exigir revisão manual quando alias cruzar domínio amplo como `Backend`, `Frontend`, `Cloud`, `ERP`, `BI`.

## Impacto no matching/ranking

### Como a lógica usa skills hoje

- `job_required_skills` referencia `skills.id`.
- `candidate_ranking_service` opera sobre `JobRequiredSkillModel.skill_id` e `priority_level`.
- A comparação textual de skill em `analysis_service._skill_matches` usa `SkillEquivalenceService`.
- `SkillEquivalenceService.for_matching()` escolhe JSON ou banco conforme `settings.SKILL_CATALOG_SOURCE`.

### Risco atual

- se `SKILL_CATALOG_SOURCE=database`, o matching usa um catálogo persistido que hoje tem `0` relations;
- o JSON legado tem `135` relations;
- então a base relacional semântica do matching pode estar mais pobre no banco que no legado;
- aliases ambíguos ou macro aliases podem gerar:
  - falso positivo de match;
  - falso negativo quando o grupo correto foi ignorado no seed;
  - ranking enviesado por skill ampla demais.

### Termos especialmente perigosos

- `API`
- `REST`
- `Java`
- `React`
- `Python`
- `Power BI`
- `Cloud`
- `ERP`
- `BI`

Esses termos aparecem em grupos grandes ou em relações de especialização, e não deveriam ser tratados apenas como alias textual puro sem guardrails.

## Riscos antes de aprovar novas skills

- aprovar skill nova sem checar alias duplicado pode reintroduzir ambiguidade hoje não persistida;
- aprovar skill nova em cima de macro alias pode piorar o `catalog_status = conflict`;
- se a aprovação usar apenas nome e não ID/normalizado, haverá resolução manual pouco confiável;
- se o fluxo futuro persistir apenas aliases e não relations, o matching em modo `database` continuará inferior ao legado relacional;
- o seed antigo sozinho não é uma base segura para expandir o catálogo.

## Recomendações

- separar explicitamente `alias textual` de `related skill` / `macro skill`;
- remover do conceito de alias puro grupos amplos como `Backend`, `Frontend`, `BI`, `Cloud`, `ERP`;
- antes de aprovar skill nova:
  - validar `canonical` por normalização;
  - validar cada alias por normalização;
  - bloquear colisão com canônicos e aliases existentes;
  - exigir revisão manual para alias curto/genérico;
- enriquecer `catalog_conflicts[]` com IDs do catálogo;
- revisar a diferença entre `SKILL_CATALOG_SOURCE=database` e o fato de `skill_relations` estar vazio.

## Próximas fases sugeridas

1. `SKILL-CATALOG-SEED-CLEANUP-1`
   Reduzir conflitos perigosos no JSON/seed e separar macro grupos de equivalências textuais.

2. `SKILL-CATALOG-ALIAS-GUARDRAILS-1`
   Criar validações para impedir alias duplicado, canônico ambíguo e alias amplo demais na aprovação/admin.

3. `SKILL-CATALOG-SUGGESTION-APPROVAL-1`
   Criar fluxo admin para aprovar sugestões da IA com checagem de duplicidade, conflito e domínio.

## Testes executados

- `cd backend && .venv/bin/python -m pytest tests -k "skill_catalog or catalog or alias or job_ai_skill" -v`
  - falhou na coleta por erro externo ao escopo do catálogo:
    - `ImportError: cannot import name '_remove_sensitive_resume_data' from 'src.interface.workers.analysis_tasks'`
  - impacto:
    - não invalida a auditoria do catálogo;
    - impede usar esse comando como sinal verde global.
- `cd backend && .venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py tests/integration/test_job_ai_draft_generate.py -v`
  - `149 passed`

## Confirmações

- Backend alterado: não
- Frontend alterado: não
- Banco alterado: não
- Migration criada: não
- Seed alterado: não
- Matching alterado: não
- Candidate Portal alterado: não
- Protheus alterado: não
- Commit realizado: não

## Matriz obrigatória

| Conflito | Tipo | Origem | Risco | Impacto no matching | Ação sugerida |
|---|---|---|---|---|---|
| `Backend` usa `Python`, `Java`, `API`, `REST`, `.NET` etc. como alias | Perigoso | JSON legado | Muito alto | Falso positivo, grupo amplo absorve skill específica | Converter em relação/macro skill, não alias |
| `Frontend` usa `React`, `JavaScript`, `TypeScript` como alias | Perigoso | JSON legado | Muito alto | Ambiguidade entre área e stack | Separar área de skill técnica |
| `BI` usa `Power BI`, `Tableau`, `dashboards` | Perigoso | JSON legado | Alto | Pode colapsar ferramentas diferentes em uma categoria genérica | Tratar como área relacionada, não equivalência |
| `Cloud` usa `AWS`, `Azure`, `GCP` | Perigoso | JSON legado | Alto | Pode esconder skill específica do candidato | Modelar como relação, não alias |
| `ERP` usa `SAP MM`, `TOTVS`, `Protheus` | Perigoso | JSON legado | Alto | Pode degradar matching por módulo/sistema | Separar sistema, módulo e área |
| `JavaScript` usa `TypeScript` | Ambíguo | JSON legado | Alto | Match incorreto entre linguagens distintas | Remover como alias puro |
| `Python` usa `Django` e `FastAPI` | Ambíguo | JSON legado | Médio/alto | Framework pode virar linguagem | Modelar relação de especialização |
| `canonical` já existe como alias e grupo é pulado | Destrutivo | Seed antigo | Alto | Skill específica pode nem entrar no catálogo persistido | Bloquear no fluxo de aprovação e limpar catálogo fonte |
| Alias igual ao próprio canônico | Idempotente | Seed antigo | Baixo | Sem dano real | Pode permanecer como no-op ou ser limpo por higiene |
| Banco atual sem duplicatas persistidas | Idempotente aceitável | Estado atual DB | Baixo | Estrutura estável | Preservar constraints e validar antes de inserir |
