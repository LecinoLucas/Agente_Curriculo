# Plano de Correção — Multi-Branch / Multi-Unit Support
**Baseado em:** FINDINGS.md (auditoria 2026-06-17)

---

## Fase 1 — MVP Mínimo (sem bot, sem Protheus real)

> Objetivo: Evitar que candidatos de unidades diferentes sejam misturados no pipeline e na pré-admissão, usando a estrutura já existente.

### 1.1 — [MIGRATION] Adicionar `operational_unit_id` em `candidate_pipeline`
- **Achado:** F-001
- Adicionar coluna `operational_unit_id UUID NULL REFERENCES operational_units(id) ON DELETE SET NULL`
- Adicionar índice `idx_candidate_pipeline_unit` em `(job_id, operational_unit_id)`
- Valores existentes: `NULL` (retroativo sem quebra)
- Adicionar junto: `operational_unit_id NULL` em `pipeline_stage_transitions` (F-012)

### 1.2 — [MIGRATION] Adicionar `operational_unit_id` em `pre_admission_cases`
- **Achado:** F-002
- Adicionar coluna `operational_unit_id UUID NULL REFERENCES operational_units(id) ON DELETE SET NULL`
- Índice `idx_pre_admission_cases_unit`
- Valores existentes: `NULL` (sem quebra)

### 1.3 — [SERVICE] Propagar `preferred_unit_id` ao avançar candidato ao pipeline
- **Achado:** F-001, F-003
- Quando candidato é movido para o pipeline via `pipeline_service`, buscar `CandidateApplicationModel.preferred_unit_id WHERE candidate_id=X AND job_id=Y`
- Se encontrado, gravar em `CandidatePipelineModel.operational_unit_id`
- Se não encontrado: manter `NULL` (sem quebra)

### 1.4 — [SERVICE] Propagar `operational_unit_id` do pipeline ao caso de pré-admissão
- **Achado:** F-002
- No serviço de criação de `PreAdmissionCase`, ler `CandidatePipelineModel.operational_unit_id` para o par `(candidate_id, job_id)`
- Gravar em `PreAdmissionCaseModel.operational_unit_id`

### 1.5 — [SERVICE] Usar `operational_unit_id` do caso em `_resolve_unit_code`
- **Achado:** F-003
- `ProtheusCasePayloadAdapter.build()` deve receber `operational_unit_id` do `PreAdmissionCaseModel` (já disponível após 1.4)
- `_resolve_unit_code` deve priorizar o `operational_unit_id` do caso antes de cair no fallback de `job_units`

### 1.6 — [FRONTEND] Exibir `unit_name` no workspace de pré-admissão
- **Achado:** F-010
- O workspace de pré-admissão deve mostrar "Unidade: [nome]" derivada de `PreAdmissionCaseModel.operational_unit_id`
- Backend: expor `unit_name` no `AdmissionCaseWorkspaceResponse`
- Frontend: exibir na tela `AdmissionProtheusExportQueuePanel` e cabeçalho do workspace

---

## Fase 2 — Suporte Robusto Multiunidade

> Objetivo: Estrutura completa para múltiplas unidades com visibilidade no portal do candidato e pipeline filtrado por unidade.

### 2.1 — [BACKEND] Expor `job_units` no endpoint público de vaga
- **Achado:** F-005
- Adicionar `job_units: list[PublicJobUnitResponse]` ao `PublicJobDetailResponse`
- `PublicJobUnitResponse`: `{ id, public_name, address, city, state, reference_point }`
- Endpoint: `GET /public/jobs/{job_id}` — não expor IDs internos de `operational_unit_id` se sensível
- Usar `job.job_units` (já carregado por `selectin` no `JobModel`)

### 2.2 — [PORTAL] Coletar `preferred_unit_id` no fluxo de candidatura
- **Achado:** F-010
- Schema público de aplicação: adicionar campo opcional `preferred_unit_id: UUID | None`
- `public_application_service.py`: salvar em `CandidateApplicationModel.preferred_unit_id`
- UX: quando vaga tem múltiplas unidades, mostrar seletor "Escolha o posto/unidade de sua preferência"
- Depende de 2.1

### 2.3 — [BACKEND] Filtro de pipeline por `operational_unit_id`
- **Achado:** F-009
- Adicionar `?operational_unit_id=` como query param opcional no endpoint de listagem de pipeline
- `pipeline_service.list()`: adicionar filtro `WHERE operational_unit_id = :unit_id` quando fornecido
- Depende de 1.1

### 2.4 — [FRONTEND] Filtro de unidade no pipeline/kanban do staff
- **Achado:** F-009
- Adicionar selector de unidade no painel de pipeline quando a vaga tem `job_units.length > 1`
- Usar `operational_unit_id` de `job.operational_unit_ids` para filtrar
- Depende de 2.3

### 2.5 — [DECISÃO] Definir modelo para "mesma vaga, múltiplos postos"
- **Achado:** F-006
- Opção A: Um `job_id` por unidade — mais simples, sem migration de uniqueness
- Opção B: Uniqueness `(candidate_id, job_id, preferred_unit_id)` — mais complexo, migration + revisão de todos os serviços
- Recomendação: Opção A para MVP. Registrar decisão em CLAUDE.md ou ADR.

### 2.6 — [FRONTEND] Padronizar labels de unidade/filial/posto
- **Achado:** F-011
- Definir glossário (CLAUDE.md ou design system)
- Padronizar labels em formulários, filtros e exibição

---

## Fase 3 — Preparação para Bot de Triagem

> Objetivo: O bot precisa saber para qual unidade está triando e ter contexto de filial ao interagir com o candidato.

### 3.1 — [SERVICE] Expor `operational_unit_id` nos tools da AI Orchestration
- `candidate_tools.py` e `job_tools.py`: incluir `unit_id`, `unit_name`, `unit_address` nas respostas de contexto
- O bot precisa saber: "Estou triando para Posto X, Bairro Y"
- Depende de Fase 1 completa

### 3.2 — [SERVICE] Bot ciente de unidade ao abrir candidatura
- Quando bot inicia triagem via whatsapp/portal, registrar `preferred_unit_id` na candidatura
- Permitir que o bot confirme com o candidato: "Você está se candidatando para o Posto X?"

### 3.3 — [BACKEND] Filtro de análise de candidatos por unidade
- `analysis_dispatch_service.py`: filtrar contexto de ranking/análise por `operational_unit_id` quando disponível
- Evitar que score de candidato para Posto A contamine ranking de Posto B (se mesma vaga)

### 3.4 — [TESTE] Testes de integração para fluxo multiunidade
- Criar caso de teste: Job com 2 unidades, 2 candidatos (cada um para uma unidade)
- Verificar: pipeline correto, caso pré-admissão correto, unit_code Protheus correto

---

## Fase 4 — Preparação para Protheus Real

> Objetivo: Quando a bridge sair do modo STUB, os códigos de grupo e filial Protheus devem ser dinâmicos e corretos.

### 4.1 — [MIGRATION] Adicionar `protheus_group_code` e `protheus_branch_code` em `OperationalUnit` (ou `OperationalGroup`)
- **Achado:** F-004
- `OperationalGroup`: adicionar `protheus_empresa_code: str | None` (ex.: "T01")
- `OperationalUnit`: adicionar `protheus_filial_code: str | None` (ex.: "01", "4001")
- Esses campos são os códigos reais do ERP Protheus — configuráveis pelo admin

### 4.2 — [SERVICE] Resolver `protheus_group_code` / `protheus_branch_code` dinamicamente
- **Achado:** F-004
- `ProtheusCasePayloadAdapter.build()`: ler `OperationalUnit.protheus_filial_code` e `OperationalGroup.protheus_empresa_code` para o `operational_unit_id` do caso
- Gravar nos parâmetros `protheus_group_code` e `protheus_branch_code` da chamada à bridge
- Fallback: manter defaults "T01"/"01" se os campos não estiverem preenchidos (compatibilidade)

### 4.3 — [FRONTEND] Admin UI para configurar códigos Protheus por unidade
- **Achado:** F-004
- Na `EstruturaOperacionalPage.tsx`, adicionar campos `protheus_empresa_code` (grupo) e `protheus_filial_code` (unidade)
- Exibir na tabela de unidades operacionais
- Validação: alertar quando unidade não tem código Protheus configurado mas tem candidatos em pré-admissão

### 4.4 — [DECISÃO] Definir mapeamento de centro de custo por unidade
- **Achado:** `_STUB_COST_CENTER = "990001"` hardcoded
- Adicionar `protheus_cost_center_code: str | None` em `OperationalUnit`
- Resolver no `ProtheusCasePayloadAdapter` ao invés do STUB

### 4.5 — [TESTE] Dry-run Protheus com unidade dinâmica
- Criar teste de integração: caso com `operational_unit_id` específico → verificar que o payload da bridge contém `protheus_group_code` e `protheus_branch_code` corretos (não "T01"/"01" hardcoded)

---

## Resumo de Dependências

```
Fase 1: 1.1 → 1.3 → 1.5
        1.2 → 1.4 → 1.5 → 1.6
Fase 2: 1.* → 2.1 → 2.2
        1.1 → 2.3 → 2.4
Fase 3: Fase 1 completa + Fase 2 completa
Fase 4: 4.1 → 4.2 → 4.3 → 4.5
```

## Migrations necessárias (sumário)

| Migration | Tabela | Coluna | Observação |
|-----------|--------|--------|------------|
| 1.1 | `candidate_pipeline` | `operational_unit_id UUID NULL` | + índice |
| 1.1 | `pipeline_stage_transitions` | `operational_unit_id UUID NULL` | junto com 1.1 |
| 1.2 | `pre_admission_cases` | `operational_unit_id UUID NULL` | + índice |
| 4.1 | `operational_groups` | `protheus_empresa_code VARCHAR(40) NULL` | |
| 4.1 | `operational_units` | `protheus_filial_code VARCHAR(40) NULL` | |
| 4.4 | `operational_units` | `protheus_cost_center_code VARCHAR(40) NULL` | opcional |
