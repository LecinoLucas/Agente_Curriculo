# Audit Report — Multi-Branch / Multi-Unit Support
**Data:** 2026-06-17
**Auditor:** Claude Code (read-only, nenhuma alteração realizada)
**Branch auditada:** `save/behavioral-ai-and-wips`

---

## Resumo Executivo

O sistema possui uma **infraestrutura estrutural sólida** para multiunidade: `OperationalGroup`, `LocationGroup`, `OperationalUnit`, relação N:N entre vaga e unidade via `JobUnitModel`, e preferência de unidade na candidatura via `CandidateApplicationModel.preferred_unit_id`. Esses modelos existem, têm FKs corretas e estão expostos nos endpoints de vagas do staff.

No entanto, essa estrutura **não se propaga corretamente** ao longo do funil. O pipeline (`CandidatePipelineModel`) e o caso de pré-admissão (`PreAdmissionCaseModel`) **não carregam `unit_id`**. Isso significa que o sistema sabe "o candidato prefere a Unidade X", mas no momento em que o candidato avança pelo pipeline e chega à pré-admissão, essa informação é perdida. O payload Protheus deriva a unidade da primeira unidade ativa do job (por prioridade), ignorando a preferência registrada do candidato.

Os códigos `protheus_group_code` e `protheus_branch_code` enviados à bridge são **sempre defaults hardcoded** ("T01" e "01") — não há mapeamento desses valores a partir da estrutura operacional cadastrada.

O portal público do candidato expõe apenas o campo texto `location` da vaga — as unidades estruturadas (`job_units`) não são visíveis ao candidato.

---

## Classificação Final

### **B — PARCIALMENTE PRONTO**

A estrutura base existe (Job → JobUnit → OperationalUnit, CandidateApplication.preferred_unit_id), mas:
- Pipeline e pré-admissão não carregam `unit_id`
- Protheus recebe grupo e filial hardcoded, não mapeados
- Portal do candidato não expõe unidades estruturadas
- Uma candidatura por job por candidato (sem separação por unidade)

---

## Estado Atual do Suporte Multiunidade

### Dimensão: Vaga (Job)

| Aspecto | Estado |
|---------|--------|
| `JobModel.location` | Texto livre (String 255) — não estruturado |
| `JobModel.location_group_id` | FK estruturada → `location_groups` ✓ |
| `JobModel.operational_group_id` | FK estruturada → `operational_groups` ✓ |
| `JobModel.job_units` | Relação N:N via `JobUnitModel` → `operational_units` ✓ |
| Filtro de vagas por unidade (staff) | Existe: `?operational_unit_id=`, `?location_group_id=` ✓ |
| Exposição de unidades no portal público | **AUSENTE** — apenas `job.location` (texto) ✗ |

### Dimensão: Candidatura / Pipeline

| Aspecto | Estado |
|---------|--------|
| `CandidateApplicationModel.preferred_unit_id` | FK → `operational_units` ✓ (struct.) |
| `CandidateApplicationModel.preferred_location_group_id` | FK → `location_groups` ✓ (struct.) |
| `CandidateApplicationModel.accepts_any_unit_in_location` | Bool controlado ✓ |
| `CandidateLocationPreferenceModel` | Histórico estruturado de preferências ✓ |
| Candidatura via portal público (`public_application_service`) | **NÃO seta `preferred_unit_id`** ✗ |
| `CandidatePipelineModel` com `unit_id` | **AUSENTE** ✗ |
| Filtro de pipeline por unidade | **AUSENTE** ✗ |
| Uniqueness: candidato + job + unidade | **AUSENTE** — apenas `(candidate_id, job_id)` ✗ |

### Dimensão: Pré-admissão

| Aspecto | Estado |
|---------|--------|
| `PreAdmissionCaseModel.unit_id` | **AUSENTE** ✗ |
| Derivação de unidade (`_resolve_unit_code`) | Pega 1ª `job_unit` ativa por prioridade — ignora preferência do candidato ✗ |
| `PreAdmissionChecklistTemplateModel.unit_id` | **AUSENTE** — checklist global, não varia por unidade ✗ |
| Workspace mostra unidade de origem | **AUSENTE** ✗ |

### Dimensão: Protheus / ERP

| Aspecto | Estado |
|---------|--------|
| `unit_code` no payload | Dinâmico via `_resolve_unit_code` → `OperationalUnit.code` ✓ (parcial) |
| `protheus_group_code` | **Hardcoded "T01"** no schema (frontend envia `{}`) ✗ |
| `protheus_branch_code` | **Hardcoded "01"** no schema (frontend envia `{}`) ✗ |
| Mapeamento `OperationalGroup.code` → `protheus_group_code` | **NÃO EXISTE** ✗ |
| Fila de exportação com contexto de filial | Não armazenado localmente (delegado à bridge) ✗ |
| `_STUB_COST_CENTER` | Hardcoded `"990001"` ✗ |

---

## Tabela de Achados

| ID | Severidade | Área | Descrição Curta | Arquivo(s) Principal |
|----|-----------|------|-----------------|----------------------|
| F-001 | CRÍTICO | Pipeline | `CandidatePipelineModel` sem `unit_id` | `candidate_pipeline_model.py` |
| F-002 | CRÍTICO | Pré-admissão | `PreAdmissionCaseModel` sem `unit_id` | `pre_admission_model.py` |
| F-003 | CRÍTICO | Protheus | `_resolve_unit_code` ignora `preferred_unit_id` do candidato | `protheus_case_payload_adapter.py` |
| F-004 | ALTO | Protheus | `protheus_group_code`/`protheus_branch_code` hardcoded, sem mapeamento | `pre_admission_schemas.py`, `admissionWorkspaceService.ts` |
| F-005 | ALTO | Portal | Portal público não expõe `job_units` (unidades estruturadas) | `public_schemas.py`, `public_candidate_portal.py` |
| F-006 | ALTO | Candidatura | Uniqueness `(candidate_id, job_id)` impede candidatura à mesma vaga em postos distintos | `candidate_application_model.py` |
| F-007 | MÉDIO | Pré-admissão | Checklist template sem `unit_id` — não varia por unidade | `pre_admission_model.py` |
| F-008 | MÉDIO | Vaga | `JobModel.location` (texto) coexiste com `location_group_id` (FK) — risco de inconsistência | `job_model.py` |
| F-009 | MÉDIO | Pipeline | Pipeline (staff) sem filtro por `unit_id` | `pipeline.py` (router) |
| F-010 | MÉDIO | Portal | `public_application_service` não coleta `preferred_unit_id` | `public_application_service.py` |
| F-011 | BAIXO | Frontend | Labels inconsistentes: "localização", "unidade", "filial", "posto" sem padrão | Múltiplos |
| F-012 | BAIXO | Pipeline | `PipelineStageTransitionModel` sem `operational_unit_id` — histórico de transições perde contexto | `candidate_pipeline_model.py` |

---

## Riscos para Bot de Triagem

1. **Sem unidade no pipeline**: O bot não consegue saber para qual unidade está triando um candidato. Se a mesma vaga existe para 5 postos, o bot não consegue associar candidato → posto correto.
2. **Sem separação de candidatura por unidade**: A constraint `(candidate_id, job_id)` impede que o mesmo candidato se candidate ao mesmo cargo em postos diferentes — fluxo essencial para recrutamento multiunidade.
3. **Portal não mostra postos**: O candidato não consegue escolher "quero o Posto X" ao se candidatar via portal — mesmo que haja infraestrutura para isso no banco.
4. **`preferred_unit_id` do candidato ignorado**: Mesmo quando registrado, não chega ao pipeline nem ao bot.

---

## Riscos para Pré-admissão

1. **Unidade derivada errada**: Com múltiplas unidades por job, o caso de pré-admissão pode apontar para a unidade errada. Exemplo: candidato foi selecionado para Posto A, mas o caso deriva Posto B (primeiro por prioridade).
2. **Checklist único**: Não é possível ter um checklist diferente para unidades com regimes distintos (ex.: posto de combustível vs. escritório corporativo).
3. **Workspace sem contexto**: O RH não consegue ver de qual unidade veio o candidato na tela de pré-admissão.

---

## Riscos para Protheus

1. **`protheus_group_code` "T01" hardcoded**: Quando a bridge for real, todos os funcionários serão criados no grupo empresarial "T01", independente da empresa real.
2. **`protheus_branch_code` "01" hardcoded**: Todos irão para a filial "01", independente do posto.
3. **`_STUB_COST_CENTER` "990001" hardcoded**: Centro de custo incorreto para qualquer unidade real.
4. **`_resolve_unit_code` pode retornar unidade errada**: Sem `unit_id` no `PreAdmissionCaseModel`, pega a primeira unidade ativa do job, não necessariamente a do candidato.
5. **Sem mapeamento `OperationalUnit.code` → `protheus_branch_code`**: O `unit_code` vai para o campo `admission_case.unit_code`, mas `protheus_branch_code` (campo separado para a filial Protheus) não é derivado da estrutura operacional.

---

## Comandos Executados Durante a Auditoria

```bash
# Mapeamento de estrutura
find backend/src -type f -name "*.py" | sort
find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) | sort

# Busca por termos de unidade/filial
grep -rn "branch|filial|unit_id|company_id|location|work_location|protheus_branch" backend/src -l
grep -rn "unit_name|unit_code|unidade|posto|branch_code|group_code" frontend/src

# Achados Protheus hardcode
grep -rn "990|4001|0101|T01|STUB|protheus_group_code|protheus_branch_code" backend/src

# Verificação de schemas
grep -n "preferred_unit|preferred_location|accepts_any" backend/src/interface/api/schemas/candidate_application_schemas.py
grep -n "job_units|operational_unit" backend/src/interface/api/schemas/job_schemas.py
```

---

## Conclusão

O projeto está **PARCIALMENTE PRONTO**. A fundação estrutural (OperationalUnit, LocationGroup, JobUnit) é sólida, mas a propagação dessa informação pelo funil está incompleta. As lacunas críticas (pipeline sem unit_id, caso de pré-admissão sem unit_id, Protheus com grupo/filial hardcoded) impedem:

- Um bot de triagem ciente de unidade
- Pré-admissão e exportação Protheus com contexto correto de filial
- Portal do candidato com escolha de posto

As correções necessárias envolvem migrations de banco (adicionar `unit_id` em `candidate_pipeline` e `pre_admission_cases`), ajustes de service (propagar a unidade preferida ao avançar no pipeline) e mudanças de frontend (expor unidades no portal, mapear grupo/filial Protheus dinamicamente).
