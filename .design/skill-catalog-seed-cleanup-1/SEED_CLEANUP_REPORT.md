# SKILL-CATALOG-SEED-CLEANUP-1

## Objetivo

Separar aliases textuais reais de relações semânticas no catálogo legado de skills, priorizando grupos macro que ainda misturavam skills específicas como se fossem sinônimos.

## Problema encontrado

O JSON legado já possuía `relations`, mas vários grupos macro e alguns grupos específicos ainda usavam `aliases` para representar skills diferentes, gerando ambiguidade semântica e conflitos desnecessários.

Resumo da auditoria inicial:

- grupos no JSON: 99
- aliases no JSON antes da limpeza: 334
- relations no JSON antes da limpeza: 135
- grupos macro identificados: 22
- aliases de grupos prioritários que coincidiam com canonical de outro grupo: 38

O script legado `backend/scripts/seed_skill_catalog_from_json.py` também ignorava `relations`, então a separação entre alias e relação já existente no JSON não chegava ao banco quando o seed legado era usado.

## Política adotada

1. Em `aliases`, manter apenas sinônimos textuais reais.
2. Remover de `aliases` termos que representam skills independentes ou categorias adjacentes.
3. Preservar ou adicionar `relations` para manter a ligação semântica entre macro skill e skill específica.
4. Não criar migration.
5. Não criar grupos canônicos novos para `Protheus` ou `TOTVS` nesta fase, porque isso alteraria o comportamento de bootstrap mais do que o necessário.
6. Atualizar o seed legado para reaproveitar o `SkillCatalogSyncService`, que já suporta aliases e relations separadamente.

## Arquivos alterados

- `backend/src/domain/catalogs/skill_equivalences.json`
- `backend/scripts/seed_skill_catalog_from_json.py`
- `backend/tests/integration/test_seed_skill_catalog.py`
- `backend/reports/skill_catalog_comparison_report.json`
- `.design/skill-catalog-seed-cleanup-1/SEED_CLEANUP_REPORT.md`

## Grupos macro revisados

- `Backend`
- `Frontend`
- `BI`
- `Cloud`
- `ERP`
- `JavaScript`
- `Python`
- `API`
- `REST`

Observação:

- `Protheus` e `TOTVS` foram auditados, mas continuam sem grupo canônico próprio no JSON. Nesta fase eles permaneceram representados por `relations` textuais para `ERP`, sem criação de skill canônica nova.

## Aliases removidos

Total removido dos grupos prioritários: 51 aliases.

- `Backend`: `API`, `REST`, `GraphQL`, `Node.js`, `Java`, `Spring Boot`, `Python`, `Django`, `FastAPI`, `C#`, `.NET`, `PHP`, `Laravel`
- `Frontend`: `React`, `Next.js`, `Vue`, `Angular`, `HTML`, `CSS`, `Tailwind`, `JavaScript`, `TypeScript`
- `BI`: `Power BI`, `Tableau`, `Looker`, `Qlik`, `dashboards`, `DAX`, `relatórios gerenciais`
- `Cloud`: `AWS`, `Azure`, `GCP`, `Google Cloud Platform`, `Oracle Cloud`
- `ERP`: `SAP`, `SAP MM`, `SAP SD`, `SAP FI`, `SAP CO`, `TOTVS`, `Protheus`, `Oracle ERP`, `Senior Sistemas`
- `JavaScript`: `TypeScript`, `TS`
- `Python`: `Pandas`, `NumPy`, `FastAPI`, `Django`, `Flask`, `Jupyter`

## Aliases mantidos

- `Backend`: `Backend`, `Back-end`
- `Frontend`: `Frontend`, `Front-end`
- `BI`: `BI`, `Business Intelligence`
- `Cloud`: `Cloud`, `cloud computing`
- `ERP`: `ERP`
- `JavaScript`: `JavaScript`, `JS`, `ECMAScript`
- `Python`: `Python`
- `API`: `API`, `REST API`
- `REST`: `REST`, `RESTful`

## Relations preservadas/adicionadas

Relations preservadas:

- relações já existentes entre macro skills e skills específicas como `Backend <- Python`, `Frontend <- React`, `Cloud <- AWS`, `ERP <- Protheus`

Relations adicionadas nesta fase:

- `Looker -> BI`
- `Qlik -> BI`
- `dashboards -> BI`
- `DAX -> BI`
- `relatórios gerenciais -> BI`
- `Pandas -> Python`
- `NumPy -> Python`
- `FastAPI -> Python`
- `Django -> Python`
- `Flask -> Python`
- `Jupyter -> Python`
- `SAP SD -> ERP`
- `SAP FI -> ERP`
- `SAP CO -> ERP`
- `Oracle ERP -> ERP`
- `Senior Sistemas -> ERP`

Contagem:

- relations antes: 135
- relations depois: 151

## Impacto no seed

Antes:

- o script legado criava skills e aliases
- `relations` existentes no JSON eram ignoradas

Depois:

- o script legado passa a usar `SkillCatalogSyncService`
- skills, aliases e relations são tratados separadamente
- conflitos continuam guardados e não viram alias automaticamente
- regras manuais já existentes no sync continuam ativas

Idempotência:

- preservada
- validada por `tests/integration/test_seed_skill_catalog.py`

## Impacto no banco atual

- nenhum dado do banco atual foi alterado nesta fase
- nenhuma migration foi criada
- a limpeza do JSON afeta bootstrap/seed futuro
- o banco atual só refletirá essa limpeza se o seed/sync for executado explicitamente

O comparativo com o banco atual mostra exatamente isso:

- o banco ainda possui aliases legados extras para `Backend`, `Frontend`, `BI`, `Cloud`, `ERP`, `JavaScript` e `Python`
- o JSON já está limpo, mas o estado persistido ainda não foi reconciliado automaticamente

## Impacto no Job AI Draft

- nenhum impacto funcional detectado
- testes unitários e de integração do Job AI Draft passaram
- o payload final da vaga continua fora do escopo e não foi alterado

## Impacto no matching/ranking

- nenhuma regra de matching/ranking foi alterada nesta fase
- o ganho esperado é indireto: reduzir ambiguidade futura no catálogo e evitar falso conflito/falso match quando o catálogo for sincronizado

## Testes executados

- `cd backend && .venv/bin/python -m pytest tests/integration/test_seed_skill_catalog.py -v`
  - resultado: 5 passed
- `cd backend && .venv/bin/python -m pytest tests/integration/test_skill_catalog_runtime.py -v`
  - resultado: 14 passed
- `cd backend && .venv/bin/python -m pytest tests/unit/test_skill_catalog_alias_guardrail_service.py -v`
  - resultado: 11 passed
- `cd backend && .venv/bin/python -m pytest tests/unit/test_job_ai_draft_service.py tests/integration/test_job_ai_draft_generate.py -v`
  - resultado: 149 passed
- `cd backend && .venv/bin/python scripts/compare_skill_catalog_sources.py`
  - resultado: executado com acesso ao banco local; relatório atualizado em `backend/reports/skill_catalog_comparison_report.json`

## Riscos

- o banco atual continua com aliases antigos até novo sync/seed explícito
- `Protheus` e `TOTVS` seguem sem grupo canônico próprio, apenas como relations textuais
- o `SkillCatalogSyncService` aplica relations manuais extras, então o seed agora pode criar relations adicionais legítimas além das declaradas no fixture mínimo

## Pendências futuras

- criar fase dedicada para reconciliar o banco atual com o JSON limpo
- decidir se `Protheus`, `TOTVS`, `SAP`, `Looker`, `Qlik`, `Pandas`, `NumPy`, `Flask` e `Jupyter` devem virar skills canônicas próprias
- revisar aliases sujos restantes fora do recorte prioritário, como `.NET -> JS`, `Java -> Spring Boot`, `PHP -> Laravel`
- avaliar estratégia segura para limpeza de aliases já persistidos no banco

## Confirmações

- frontend não foi alterado
- candidate portal não foi alterado
- Protheus não foi alterado como integração
- matching não foi alterado
- ranking não foi alterado
- nenhuma migration foi criada
- nenhum dado do banco atual foi modificado
- nenhuma skill foi criada automaticamente fora do contexto de testes
- a idempotência do seed foi preservada

## Matriz obrigatória

| Grupo | Antes | Depois | Motivo | Risco reduzido |
| --- | --- | --- | --- | --- |
| Backend | aliases: `API`, `REST`, `GraphQL`, `Node.js`, `Java`, `Spring Boot`, `Python`, `Django`, `FastAPI`, `C#`, `.NET`, `PHP`, `Laravel` | aliases: `Backend`, `Back-end`; relations semânticas preservadas | não são sinônimos textuais de Backend | reduz falso conflict e falso match por macro skill |
| Frontend | aliases: `React`, `Next.js`, `Vue`, `Angular`, `HTML`, `CSS`, `Tailwind`, `JavaScript`, `TypeScript` | aliases: `Frontend`, `Front-end`; relations preservadas | skill específica não é alias de área ampla | reduz ambiguidade de frontend genérico |
| BI | aliases: `Power BI`, `Tableau`, `Looker`, `Qlik`, `dashboards`, `DAX`, `relatórios gerenciais` | aliases: `BI`, `Business Intelligence`; relations adicionadas/preservadas | ferramentas e artefatos de BI não são sinônimos de BI | reduz conflito entre categoria e ferramenta |
| Cloud | aliases: `AWS`, `Azure`, `GCP`, `Google Cloud Platform`, `Oracle Cloud` | aliases: `Cloud`, `cloud computing`; relations preservadas | provedores cloud não são sinônimos da categoria | reduz match inflado para Cloud |
| ERP | aliases: `SAP`, `SAP MM`, `SAP SD`, `SAP FI`, `SAP CO`, `TOTVS`, `Protheus`, `Oracle ERP`, `Senior Sistemas` | aliases: `ERP`; relations preservadas/adicionadas | vendors e módulos ERP não são sinônimos de ERP | reduz colisão entre macro skill e sistema específico |
| JavaScript | aliases: `TypeScript`, `TS` | aliases: `JavaScript`, `JS`, `ECMAScript`; relation `TypeScript -> JavaScript` preservada | TypeScript é skill relacionada, não alias de JavaScript | reduz conflito entre linguagens distintas |
| Python | aliases: `Pandas`, `NumPy`, `FastAPI`, `Django`, `Flask`, `Jupyter` | aliases: `Python`; relations adicionadas para ecossistema | frameworks e bibliotecas não são alias da linguagem | reduz ranking ambíguo para Python |
| API | aliases: `API`, `REST API` | inalterado | aliases já eram textuais | sem risco novo |
| REST | aliases: `REST`, `RESTful` | inalterado | aliases já eram textuais | sem risco novo |

## Arquivos criados

- `.design/skill-catalog-seed-cleanup-1/SEED_CLEANUP_REPORT.md`

## Status final

CONCLUÍDO
