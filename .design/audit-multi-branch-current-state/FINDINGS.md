# Findings — Multi-Branch / Multi-Unit Support Audit
**Data:** 2026-06-17

---

## F-001 — `CandidatePipelineModel` sem `unit_id`

- **Severidade:** CRÍTICO
- **Área:** Backend Models / Pipeline
- **Arquivos:** `backend/src/infrastructure/database/models/candidate_pipeline_model.py`
- **Descrição:** O modelo de pipeline usa `(candidate_id, job_id)` como chave composta. Não existe campo `operational_unit_id` nem `preferred_unit_id`. Quando uma vaga possui múltiplas unidades via `job_units`, o pipeline não sabe para qual unidade o candidato está sendo avaliado.
- **Evidência:**
  ```python
  class CandidatePipelineModel(Base):
      __tablename__ = "candidate_pipeline"
      candidate_id: Mapped[UUID] = mapped_column(..., primary_key=True)
      job_id: Mapped[UUID] = mapped_column(..., primary_key=True)
      stage: Mapped[str] ...
      status: Mapped[str] ...
      # NÃO existe unit_id, operational_unit_id, preferred_unit_id
  ```
- **Impacto:** Um candidato para a vaga "Frentista" que serve postos A, B e C entra no pipeline sem identificação de qual posto. RH não pode filtrar "mostre só candidatos do Posto A". Bot de triagem não consegue diferenciar contexto de unidade.
- **Recomendação:** Adicionar `operational_unit_id UUID NULL REFERENCES operational_units(id) ON DELETE SET NULL` à tabela `candidate_pipeline`. Preenchido quando o candidato avança ao pipeline com base em `CandidateApplicationModel.preferred_unit_id`.
- **Requer migration?** Sim.

---

## F-002 — `PreAdmissionCaseModel` sem `unit_id`

- **Severidade:** CRÍTICO
- **Área:** Backend Models / Pré-admissão
- **Arquivos:** `backend/src/infrastructure/database/models/pre_admission_model.py`
- **Descrição:** `PreAdmissionCaseModel` armazena `candidate_id`, `job_id` e `hiring_decision_id`, mas **não** armazena a unidade específica para a qual o candidato foi contratado. A unidade é derivada em tempo de execução pelo `_resolve_unit_code`, que pega a primeira unidade ativa do job por prioridade — não a unidade do candidato.
- **Evidência:**
  ```python
  class PreAdmissionCaseModel(Base):
      __tablename__ = "pre_admission_cases"
      id: Mapped[UUID] ...
      candidate_id: Mapped[UUID] ...
      job_id: Mapped[UUID] ...
      hiring_decision_id: Mapped[UUID] ...
      # NÃO existe unit_id, operational_unit_id, branch_id
      salary_offer: Mapped[Decimal | None] ...
      start_date: Mapped[date | None] ...
  ```
- **Impacto:** Para um job com Unidade A (prioridade 1) e Unidade B (prioridade 2), um candidato contratado para a Unidade B será exportado ao Protheus com o código da Unidade A. Erro silencioso e difícil de rastrear.
- **Recomendação:** Adicionar `operational_unit_id UUID NULL REFERENCES operational_units(id) ON DELETE SET NULL` em `pre_admission_cases`. Preenchido no momento de criação do caso, derivado do `CandidatePipelineModel.operational_unit_id` (após F-001 ser corrigido).
- **Requer migration?** Sim.

---

## F-003 — `_resolve_unit_code` ignora `preferred_unit_id` do candidato

- **Severidade:** CRÍTICO
- **Área:** Backend Services / Protheus
- **Arquivos:** `backend/src/application/services/protheus_case_payload_adapter.py` (linha 183–201)
- **Descrição:** O método `_resolve_unit_code` resolve a unidade operacional para o payload Protheus buscando a primeira `job_unit` ativa por prioridade, ignorando completamente o `preferred_unit_id` registrado na `CandidateApplicationModel`.
- **Evidência:**
  ```python
  async def _resolve_unit_code(self, job_id: UUID, fallback_unit_code: str | None) -> str | None:
      stmt = (
          sa.select(OperationalUnitModel.code)
          .join(JobUnitModel, JobUnitModel.operational_unit_id == OperationalUnitModel.id)
          .where(
              JobUnitModel.job_id == job_id,  # filtra por JOB, não por candidato
              JobUnitModel.is_active.is_(True),
              OperationalUnitModel.is_active.is_(True),
          )
          .order_by(JobUnitModel.priority.asc().nullslast(), JobUnitModel.created_at.asc())
          .limit(1)  # pega APENAS a primeira
      )
  ```
  O parâmetro `candidate_id` nem existe no método — a candidatura do candidato não é consultada.
- **Impacto:** Mesmo que o candidato tenha `preferred_unit_id` registrado, o payload Protheus sempre usará a unidade de maior prioridade do job. Cria funcionários no posto errado no ERP.
- **Recomendação:** Receber `candidate_id` como parâmetro em `_resolve_unit_code`. Primeiro tentar `CandidateApplicationModel.preferred_unit_id WHERE candidate_id=X AND job_id=Y`. Fallback para `job_units` apenas se não encontrado. (Depende de F-002 para solução completa.)
- **Requer migration?** Não (lógica de service).

---

## F-004 — `protheus_group_code` / `protheus_branch_code` hardcoded sem mapeamento estrutural

- **Severidade:** ALTO
- **Área:** Backend Services / Frontend / Protheus
- **Arquivos:**
  - `backend/src/interface/api/schemas/pre_admission_schemas.py` (linhas 565–568)
  - `backend/src/interface/api/routers/pre_admission.py` (linhas 850–852, 893–895, 999–1001)
  - `frontend/src/services/admissionWorkspaceService.ts` (linhas 96–113)
- **Descrição:** O frontend envia `body: JSON.stringify({})` para todos os endpoints de export Protheus. O schema usa defaults `unit_code="STUB"`, `protheus_group_code="T01"`, `protheus_branch_code="01"`. Não existe nenhum mapeamento de `OperationalGroup.code` → `protheus_group_code` nem de `OperationalUnit.code` → `protheus_branch_code`.
- **Evidência:**
  ```python
  # pre_admission_schemas.py
  class ProtheusExportQueueCreateRequest(BaseModel):
      unit_code: str = Field(default="STUB", max_length=40)
      protheus_group_code: str = Field(default="T01", max_length=40)
      protheus_branch_code: str = Field(default="01", max_length=40)
  ```
  ```typescript
  // admissionWorkspaceService.ts
  async function createProtheusExportRequest(caseId: string) {
    return httpRequest(..., { method: "POST", body: JSON.stringify({}) });
  }
  ```
  ```python
  # pre_admission.py router
  protheus_group_code=body.protheus_group_code or "T01",  # sempre "T01"
  protheus_branch_code=body.protheus_branch_code or "01",  # sempre "01"
  ```
- **Impacto:** Quando a bridge Protheus for ativada em modo real, todos os funcionários serão cadastrados na empresa "T01" filial "01" independente da unidade real. Erro crítico em ambiente de produção.
- **Recomendação:** Adicionar campos `protheus_group_code` e `protheus_branch_code` (ou `protheus_branch_id`) em `OperationalUnit` (migration) e/ou `OperationalGroup`. Resolver dinamicamente no `ProtheusCasePayloadAdapter.build()` usando o `operational_unit_id` derivado. Frontend deve passar o `case_id` ao adapter que deriva esses campos estruturalmente.
- **Requer migration?** Sim (para armazenar os códigos Protheus por unidade).

---

## F-005 — Portal público não expõe unidades estruturadas (`job_units`)

- **Severidade:** ALTO
- **Área:** Backend Services / Portal do Candidato
- **Arquivos:**
  - `backend/src/interface/api/schemas/public_schemas.py` (linha 16–37)
  - `backend/src/interface/api/routers/public_candidate_portal.py` (linha 128–141)
- **Descrição:** `PublicJobDetailResponse` expõe apenas `location` (texto livre do `JobModel`). Os `job_units` (unidades estruturadas com endereço, referência e nome público) não são expostos ao candidato. Isso impede que o candidato saiba para qual posto específico está se candidatando.
- **Evidência:**
  ```python
  class PublicJobDetailResponse(BaseModel):
      id: UUID
      title: str
      description: str
      requirements: str | None = None
      location: str | None = None  # texto livre
      # NÃO existe job_units, operational_units, unit_list
  ```
  ```python
  return PublicJobDetailResponse(
      ...
      location=job.location,  # apenas o campo texto
  )
  ```
- **Impacto:** Um candidato não consegue diferenciar "Frentista - Posto Bairro A" de "Frentista - Posto Bairro B". Também impede que o portal exiba escolha de posto ao se candidatar.
- **Recomendação:** Adicionar `job_units: list[PublicJobUnitResponse]` ao `PublicJobDetailResponse`. Carregar via `job.job_units` (já carregado por `selectin`). `PublicJobUnitResponse` deve ter: `id`, `public_name`, `address`, `city`, `state`, `reference_point`.
- **Requer migration?** Não (os dados já existem em `job_units`/`operational_units`).

---

## F-006 — Uniqueness `(candidate_id, job_id)` impede candidatura à mesma vaga em postos distintos

- **Severidade:** ALTO
- **Área:** Backend Models / Candidatura
- **Arquivos:** `backend/src/infrastructure/database/models/candidate_application_model.py` (linhas 36–50)
- **Descrição:** O índice único parcial `uq_candidate_applications_active_candidate_job` garante apenas um registro ativo por `(candidate_id, job_id)`. Não considera `preferred_unit_id`. Um candidato que quer se candidatar ao mesmo cargo em dois postos diferentes não consegue — a segunda candidatura seria bloqueada.
- **Evidência:**
  ```python
  sa.Index(
      "uq_candidate_applications_active_candidate_job",
      "candidate_id",
      "job_id",
      unique=True,
      postgresql_where=sa.text(
          "deleted_at IS NULL AND job_id IS NOT NULL AND "
          "status IN ('started', 'qualified', 'submitted', 'linked_to_pipeline')"
      ),
  ),
  ```
- **Impacto:** Para uma empresa com 50 postos oferecendo a mesma vaga, um candidato só pode se candidatar a um posto — ao menos enquanto a candidatura estiver ativa. Modelo correto seria `(candidate_id, job_id, preferred_unit_id)` ou jobs separados por unidade.
- **Recomendação (curto prazo):** Criar jobs separados por unidade (um `job_id` por posto). Recomendação **(longo prazo):** Revisar modelo de candidatura para suportar `(candidate_id, job_id, preferred_unit_id)` com constraint composta. Requer migration e mudança de business logic.
- **Requer migration?** Sim (para solução estrutural longo prazo).

---

## F-007 — `PreAdmissionChecklistTemplateModel` sem `unit_id`

- **Severidade:** MÉDIO
- **Área:** Backend Models / Pré-admissão
- **Arquivos:** `backend/src/infrastructure/database/models/pre_admission_model.py` (linhas 27–79)
- **Descrição:** O template de checklist admissional não possui `unit_id` ou `operational_unit_id`. Um único template global (marcado com `is_default=True`) é aplicado a todos os candidatos. Não é possível ter um checklist diferente para tipos de unidade diferentes (ex.: posto de gasolina vs. escritório).
- **Evidência:**
  ```python
  class PreAdmissionChecklistTemplateModel(Base):
      __tablename__ = "pre_admission_checklist_templates"
      id: Mapped[UUID] ...
      name: Mapped[str] ...
      admission_type: Mapped[str | None] ...  # campo genérico de texto
      is_default: Mapped[bool] ...
      # NÃO existe unit_id, unit_type, operational_unit_id
  ```
- **Impacto:** Médio agora (único posto/tipo de unidade). Alto quando houver múltiplas unidades com regimes diferentes.
- **Recomendação:** Adicionar `operational_unit_type: str | None` (ex.: "gas_station", "office") ou `operational_group_id` ao template para filtrar por tipo de unidade. Alternativamente usar `admission_type` existente com convenção de nome.
- **Requer migration?** Não necessariamente (pode usar `admission_type` existente via convenção).

---

## F-008 — `JobModel.location` (texto) coexiste com `location_group_id` (FK)

- **Severidade:** MÉDIO
- **Área:** Backend Models / Vaga
- **Arquivos:** `backend/src/infrastructure/database/models/job_model.py` (linhas 38, 71–74)
- **Descrição:** `JobModel` possui tanto `location: String(255)` (texto livre) quanto `location_group_id: FK → location_groups`. Não existe constraint que garanta consistência entre os dois. A IA de draft de vagas escreve em `location` (texto), mas o sistema operacional usa `location_group_id` (FK). O frontend de draft de vagas mapeia `draft.unit → job.location`.
- **Evidência:**
  ```python
  location: Mapped[str | None] = mapped_column(sa.String(255))  # texto livre
  location_group_id: Mapped[UUID | None] = mapped_column(
      sa.UUID(as_uuid=True),
      sa.ForeignKey("location_groups.id", ondelete="SET NULL"),
  )
  ```
  ```typescript
  // jobAiDraftHelpers.ts linha 124-125
  // unit → location
  const location = trimOrUndefined(draft.unit);
  ```
- **Impacto:** RH pode ter `location = "Maringá - PR"` (texto) e `location_group_id = NULL` porque o grupo de localidade ainda não foi cadastrado. Ou o inverso: FK preenchida mas texto desatualizado. Relatórios e filtros podem divergir.
- **Recomendação:** Definir claramente qual campo é canônico. Se `location_group_id` é o dado estruturado correto, `location` deveria ser deprecado ou preenchido automaticamente a partir do `LocationGroup.city + LocationGroup.state`. Não requer migration mas requer decisão de produto.
- **Requer migration?** Não.

---

## F-009 — Pipeline (staff) sem filtro por `unit_id`

- **Severidade:** MÉDIO
- **Área:** Backend Services / Frontend / Pipeline
- **Arquivos:**
  - `backend/src/interface/api/routers/pipeline.py`
  - `backend/src/application/services/pipeline_service.py`
- **Descrição:** Os endpoints de pipeline (`/pipeline/jobs/{job_id}/candidates`) não aceitam parâmetros de filtro por `unit_id` ou `operational_unit_id`. O RH não consegue visualizar apenas os candidatos de um posto específico ao abrir o pipeline de uma vaga multiunidade.
- **Evidência:**
  ```bash
  grep -n "preferred_unit|unit_id|location_group" backend/src/interface/api/routers/pipeline.py
  # Resultado: 0 matches
  ```
- **Impacto:** Ao abrir o pipeline de uma vaga com 10 postos e 200 candidatos, o RH vê todos misturados sem distinguir qual candidato é de qual posto.
- **Recomendação:** Após F-001 (adicionar `unit_id` ao pipeline), adicionar `?operational_unit_id=` como query param opcional no endpoint de listagem de pipeline. Depende da correção de F-001.
- **Requer migration?** Depende de F-001.

---

## F-010 — `public_application_service` não coleta `preferred_unit_id`

- **Severidade:** MÉDIO
- **Área:** Backend Services / Portal
- **Arquivos:** `backend/src/application/services/public_application_service.py`
- **Descrição:** O serviço de candidatura pública (usado pelo portal do candidato ao se candidatar a uma vaga) não coleta nem salva `preferred_unit_id`. O campo existe em `CandidateApplicationModel` mas nunca é preenchido via portal público.
- **Evidência:**
  ```bash
  grep -n "preferred_unit|unit_id|location_group" backend/src/application/services/public_application_service.py
  # Resultado: 0 matches
  ```
- **Impacto:** Mesmo que F-005 seja corrigido (portal exibe unidades), sem coletar `preferred_unit_id` a candidatura continuaria sem contexto de unidade.
- **Recomendação:** Adicionar campo opcional `preferred_unit_id: UUID | None` ao schema de aplicação pública. O portal envia o ID da unidade escolhida. O service salva em `CandidateApplicationModel.preferred_unit_id`. Depende de F-005.
- **Requer migration?** Não (campo já existe no model).

---

## F-011 — Labels inconsistentes em frontend e backend

- **Severidade:** BAIXO
- **Área:** Frontend / UX
- **Arquivos:** Múltiplos
- **Descrição:** O domínio de "unidade/filial" aparece com terminologias diferentes em partes distintas do sistema:
  - `"posto"` — mock de vagas, labels de busca no backend de candidatos AI
  - `"unidade"` — painel Protheus (`Unidade: {item.unit_name}`)
  - `"localização/unidade"` — campo de localização no form de vagas (`JobAiDraftPanel.tsx:1979`)
  - `"filial"` — contexto de pré-admissão e Protheus
  - `"Grupos, localidades e filiais/postos"` — label na AdminPage
- **Evidência:**
  ```
  // AdminPage.tsx linha 103
  description="Grupos, localidades e filiais/postos usados pelo RH e pelo Protheus."
  // JobAiDraftPanel.tsx linha 1979
  label="Localização/unidade"
  // AdmissionProtheusExportQueuePanel.tsx linha 282
  <p>Unidade: {item.unit_name}</p>
  ```
- **Impacto:** Baixo no curto prazo. Confusão para usuário RH e para o bot de triagem ao interpretar contexto de localização.
- **Recomendação:** Definir glossário único: "Unidade Operacional" (referência interna) / "Posto" (linguagem de negócio para postos de combustível) / "Filial" (contexto Protheus). Padronizar labels do frontend após F-001/F-002 serem corrigidos.
- **Requer migration?** Não.

---

## F-012 — `PipelineStageTransitionModel` sem `operational_unit_id`

- **Severidade:** BAIXO
- **Área:** Backend Models / Pipeline / Auditoria
- **Arquivos:** `backend/src/infrastructure/database/models/candidate_pipeline_model.py` (linhas 73–141)
- **Descrição:** O log imutável de transições de stage (`pipeline_stage_transitions`) não possui `operational_unit_id`. Quando F-001 for corrigido e o pipeline passar a ter unidade, o histórico de transições anteriores perderá o contexto de unidade.
- **Evidência:**
  ```python
  class PipelineStageTransitionModel(Base):
      __tablename__ = "pipeline_stage_transitions"
      candidate_id: Mapped[UUID] ...
      job_id: Mapped[UUID] ...
      from_stage: Mapped[str | None] ...
      to_stage: Mapped[str] ...
      moved_by: Mapped[UUID | None] ...
      # NÃO existe operational_unit_id
  ```
- **Impacto:** Auditoria incompleta. Baixo impacto operacional imediato.
- **Recomendação:** Ao implementar F-001, adicionar `operational_unit_id UUID NULL` também em `pipeline_stage_transitions` para manter rastreabilidade histórica.
- **Requer migration?** Sim (junto com F-001).
