# Operational Structure Design Audit

## Resumo executivo

A tela de estrutura operacional tem uma base técnica razoável: o backend valida duplicidade, exige relações pai válidas, separa leitura/escrita por permissão e evita exclusão destrutiva por padrão. No entanto, a camada de UX ainda deixa lacunas relevantes para operação RH, principalmente na diferenciação entre campos internos e públicos, na proteção contra inativação perigosa e na ausência de contexto de impacto em vagas/candidaturas/casos.

Classificação geral: **ACEITÁVEL COM AJUSTES**

Se o objetivo for apenas manter cadastro mestre simples, a tela funciona. Se o objetivo for operar com segurança em contexto multiunidade, portal do candidato, pipeline, bot e futura integração Protheus, ela ainda não está pronta sem ajustes.

## Estado atual da tela

- A página principal é [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:518).
- A organização atual é em três abas paralelas:
  - `Filiais/Postos`
  - `Localidades`
  - `Grupos`
- O backend expõe CRUD parcial com `list/create/update` para grupos, localidades e unidades, sem rota de exclusão física:
  - [operational_master.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/routers/operational_master.py:35)
- O modelo de dados atual cobre:
  - grupo operacional
  - localidade
  - unidade operacional com `group_id`, `location_group_id`, `code`, `name`, `public_name`, endereço e status
  - [operational_master_model.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/database/models/operational_master_model.py:7)

## Classificação geral da tela

**ACEITÁVEL COM AJUSTES**

Motivos:

- há boa base de permissão e validação estrutural;
- há filtros úteis e estados vazios mínimos;
- não há exclusão destrutiva;
- mas existe risco real de cadastro incorreto por ambiguidade de linguagem e falta de contexto operacional;
- faltam guardrails antes de inativar registros em uso;
- faltam sinais claros do que vai para o portal e do que é apenas interno/ERP.

## Principais problemas de UX/design

1. A hierarquia não é explicitada como `Grupo -> Unidades do grupo`; a tela opera em abas separadas e planas.
2. A aba principal usa o rótulo “Filiais/Postos”, enquanto o domínio técnico é “unidade operacional”, e o formulário mistura `Grupo`, `Filial`, `Nome`, `Nome público` e `Localidade` sem uma legenda operacional suficiente.
3. A listagem principal não mostra `nome público` nem `ponto de referência`, embora o próprio contrato da tela diga que isso é o que o candidato vê.
4. Os botões de `Inativar/Reativar` executam a ação direto, sem confirmação nem contexto de impacto.
5. A tela não informa uso atual da unidade em vagas, candidaturas, pipeline ou casos admissionais.
6. Os erros de backend específicos são reduzidos a toasts genéricos no frontend.
7. A tela tem filtros, mas não tem paginação/agrupamento visual forte para crescimento operacional maior.

## Principais riscos operacionais

- cadastrar unidade no grupo errado;
- confundir `nome interno` com `nome público`;
- inativar unidade usada por vaga ativa ou fluxo em andamento sem perceber;
- cadastrar unidade ativa sem contexto mínimo de endereço/cidade consistente;
- perder rastreabilidade do que o candidato verá versus o que o RH/ERP usa;
- criar base preparada para portal/pipeline, mas não preparada para governança ERP/Protheus futura.

## Riscos para portal do candidato

- `public_name` existe, mas não aparece na listagem principal da tela; isso dificulta revisão operacional antes de publicar ou manter uma unidade ativa.
- O bloco “Contrato operacional” diz que o candidato verá `localidade`, `nome público` e `ponto de referência`, mas a tabela da aba principal não exibe esses mesmos campos de maneira auditável.
- Resultado: RH pode manter uma unidade ativa sem enxergar com clareza qual texto está indo para o candidato.

## Riscos para bot de triagem

- O bot e os fluxos derivados dependem da semântica correta de unidade/localidade/preferência.
- Se o cadastro usar `nome interno` inadequado ou `public_name` inconsistente, o contexto exibido ou inferido para candidato e operação pode divergir.
- A ausência de indicadores de uso também aumenta risco de manter unidades “ativas” porém operacionalmente inválidas, o que contamina contexto downstream.

## Riscos para Protheus

- O formulário atual não reserva claramente uma seção futura para metadados ERP como `empresa`, `filial Protheus`, `centro de custo`, `departamento` ou estado de configuração.
- O design atual ainda suporta evolução, mas tende a ficar confuso se esses campos forem apenas adicionados ao mesmo modal sem reorganização.
- A falta de contexto de impacto ao inativar unidades também pode afetar herança de unidade em pré-admissão e montagem de payloads futuros.

## O que funciona bem

- Backend com validação de duplicidade por código/nome/grupo:
  - [operational_master_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/operational_master_service.py:58)
  - [sqlalchemy_operational_master_repository.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/repositories/sqlalchemy_operational_master_repository.py:26)
- Permissão de escrita restrita a admin e leitura liberada a RH/recruiter:
  - [dependencies.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/dependencies.py:74)
  - [operational_master.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/routers/operational_master.py:35)
- Leitura e escrita cobertas por testes focados:
  - [EstruturaOperacionalPage.test.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/__tests__/EstruturaOperacionalPage.test.tsx:1)
  - [test_operational_master_api.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/tests/integration/test_operational_master_api.py:1)
- Ação destrutiva foi evitada; há `inativar/reativar` em vez de delete.
- Existem loading/error/empty states básicos via [DataTable.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/components/common/DataTable.tsx:1).

## Recomendações por prioridade

### Prioridade alta

- Padronizar linguagem operacional:
  - `Grupo operacional`
  - `Unidade operacional`
  - `Filial/código interno`
  - `Nome público exibido ao candidato`
- Exibir na listagem principal os campos que afetam o portal: `public_name`, `localidade`, `ponto de referência`.
- Bloquear ou ao menos confirmar inativação de unidade/grupo com contexto de uso.
- Mostrar impacto de uso da unidade: vagas, candidaturas, pipeline, pré-admissão.

### Prioridade média

- Reorganizar a tela para explicitar hierarquia `Grupo -> Unidades`.
- Exibir grupo por nome e código, não só o código.
- Melhorar mensagens de erro do frontend com reaproveitamento do detalhe do backend.
- Preparar uma área visual futura para metadados Protheus/ERP.

### Prioridade baixa

- Reforçar mobile/tablet com tratamento melhor de tabela densa.
- Melhorar feedback pós-salvamento além do toast.
- Expandir estados vazios com orientação operacional mais concreta.

## Comandos executados

```bash
cat /Users/lecinolucas/.codex/skills/design-review/SKILL.md
rg --files frontend/src backend/src backend/tests frontend/src | rg "EstruturaOperacionalPage|operational|OperationalGroup|OperationalUnit|operational_master|job_multiunit|Estrutura Operacional|Operational"
git status --short
sed -n '1,260p' frontend/src/pages/EstruturaOperacionalPage.tsx
sed -n '1,260p' frontend/src/pages/__tests__/EstruturaOperacionalPage.test.tsx
sed -n '1,260p' frontend/src/services/operationalMasterService.ts
sed -n '1,260p' frontend/src/services/__tests__/operationalMasterService.test.ts
sed -n '1,260p' backend/src/interface/api/routers/operational_master.py
sed -n '1,260p' backend/src/interface/api/schemas/operational_master_schemas.py
sed -n '1,320p' backend/src/application/services/operational_master_service.py
sed -n '1,320p' backend/src/infrastructure/database/models/operational_master_model.py
sed -n '1,320p' backend/tests/integration/test_operational_master_api.py
sed -n '260,620p' frontend/src/pages/EstruturaOperacionalPage.tsx
sed -n '620,980p' frontend/src/pages/EstruturaOperacionalPage.tsx
sed -n '320,640p' backend/src/application/services/operational_master_service.py
sed -n '1,360p' backend/src/infrastructure/repositories/sqlalchemy_operational_master_repository.py
sed -n '320,520p' backend/tests/integration/test_operational_master_api.py
cd frontend && npm test -- --run src/pages/__tests__/EstruturaOperacionalPage.test.tsx src/services/__tests__/operationalMasterService.test.ts
cd backend && .venv/bin/python -m pytest tests/integration/test_operational_master_api.py -vv
rg -n "function RowActions|Modal|Somente leitura|Contrato operacional|Nome público|inativ|reativ|Nenhum|permission|visualizar" frontend/src/pages/EstruturaOperacionalPage.tsx
nl -ba frontend/src/pages/EstruturaOperacionalPage.tsx | sed -n '520,920p'
sed -n '1,260p' frontend/src/components/common/DataTable.tsx
sed -n '1,240p' frontend/src/components/common/Modal.tsx
sed -n '1,220p' backend/src/interface/api/dependencies.py
nl -ba frontend/src/pages/EstruturaOperacionalPage.tsx | sed -n '980,1075p'
rg -n "operational_unit|group_id|location_group_id|preferred_unit_id|unit_name|public_name|location group|operational group" frontend/src backend/src | head -n 250
nl -ba frontend/src/pages/EstruturaOperacionalPage.tsx | sed -n '380,520p'
mkdir -p .design/operational-structure-design-audit
```

## Limitação da auditoria

Não havia ferramenta de browser/screenshot disponível neste ambiente para capturar a tela em execução. A avaliação visual foi feita por leitura de código, estrutura dos componentes, estados testados e comportamento inferido. Para um fechamento puramente visual de hierarquia, densidade e responsividade percebida, ainda faltam screenshots reais da tela em desktop/tablet/mobile.
