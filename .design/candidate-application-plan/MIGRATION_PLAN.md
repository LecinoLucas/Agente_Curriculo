# OP-5 - Migration Plan

Data: 2026-06-01

## Estrategia

Implementacao aditiva e reversivel. Nenhum fluxo existente deve depender imediatamente das novas tabelas.

Fases recomendadas:

1. Criar tabelas e contratos internos.
2. Escrever service/repository com validacoes e idempotencia.
3. Criar endpoints internos.
4. Adicionar endpoint publico novo em paralelo ao fluxo atual.
5. Migrar portal web horizontal para o endpoint novo.
6. Somente depois planejar vinculo explicito com pipeline.

## Migration 1 - Tabelas de Aplicacao

Criar `candidate_applications`.

Campos:

- `id`
- `candidate_id`
- `job_id`
- `source`
- `status`
- `preferred_location_group_id`
- `preferred_unit_id`
- `accepts_any_unit_in_location`
- `desired_job_area`
- `desired_role`
- `desired_shift`
- `availability_notes`
- `resume_version_id`
- `lgpd_consent_at`
- `lgpd_consent_version`
- `idempotency_key`
- `submitted_at`
- `linked_to_pipeline_at`
- `pipeline_candidate_id`
- `pipeline_job_id`
- `metadata`
- `created_at`
- `updated_at`
- `deleted_at`

Criar `candidate_location_preferences`.

Campos:

- `id`
- `candidate_id`
- `location_group_id`
- `operational_unit_id`
- `desired_shift`
- `priority`
- `created_at`

## FKs e Delete Behavior

Recomendacao:

- `candidate_applications.candidate_id -> candidates.id ON DELETE CASCADE`
- `candidate_applications.job_id -> jobs.id ON DELETE SET NULL`
- `candidate_applications.preferred_location_group_id -> location_groups.id ON DELETE SET NULL`
- `candidate_applications.preferred_unit_id -> operational_units.id ON DELETE SET NULL`
- `candidate_applications.resume_version_id -> resume_versions.id ON DELETE SET NULL`
- preferencias de candidato com `candidate_id -> candidates.id ON DELETE CASCADE`

Nao usar cascade para deletar vaga e apagar aplicacao; historico de intake deve sobreviver com `job_id = null` se a vaga for removida.

## Checks e Indices

Checks:

- `source` em lista controlada.
- `status` em lista controlada.
- `accepts_any_unit_in_location = false OR preferred_location_group_id IS NOT NULL`.
- `NOT (accepts_any_unit_in_location = true AND preferred_unit_id IS NOT NULL)`.
- `priority > 0` em preferencias.

Indices:

- por candidato;
- por vaga;
- por status;
- por source;
- por localidade;
- por filial;
- por created_at;
- por idempotencia.

## Backfill

Nao fazer backfill automatico na primeira migration.

Motivo:

- fluxo publico atual ja cria candidatos, curriculos e pipeline;
- criar aplicacoes retroativas poderia duplicar estado sem valor operacional imediato;
- `jobs.location` e historico antigo nao mapeiam localidade operacional com confianca.

Backfill futuro, se necessario:

- gerar aplicacoes `legacy_public` para candidaturas publicas recentes;
- vincular `candidate_id`, `job_id`, `resume_version_id`;
- marcar `status = linked_to_pipeline`;
- deixar preferencias operacionais nulas, salvo dado confiavel.

## Compatibilidade com Fluxo Publico Atual

Na primeira implementacao, manter `/api/v1/public/candidates/apply` inalterado.

Opcao segura posterior:

- endpoint atual continua criando pipeline como hoje;
- endpoint novo `/api/v1/public/applications` cria apenas aplicacao;
- portal horizontal usa endpoint novo;
- rota antiga permanece para telas legadas ate deprecacao.

Nao trocar comportamento da rota antiga na mesma migration de dados.

## Rollback

Rollback tecnico:

- dropar tabelas novas;
- dropar indices e constraints novas.

Sem perda de dados existente porque nenhuma tabela antiga e alterada na primeira fase.

Se fase posterior adicionar `application_id` ao pipeline:

- coluna deve ser nullable;
- rollback deve dropar FK, indice e coluna;
- nao pode alterar PK composta existente sem fase dedicada.

## Sequencia de Deploy

1. Deploy migration com tabelas novas.
2. Deploy backend com models, schemas, repository e endpoints internos.
3. Rodar testes de regressao de candidatura publica atual e pipeline.
4. Habilitar endpoint publico novo atras de feature flag ou rota nao usada.
5. Integrar portal web.
6. Monitorar duplicidade, idempotencia e erros LGPD.

## Validacoes Obrigatorias na Implementacao

- Candidato sem `User` continua valido.
- CPF nao e retornado.
- Aplicacao sem `job_id` nao cria pipeline.
- Aplicacao com localidade e qualquer filial nao exige `preferred_unit_id`.
- Filial especifica deve ser coerente com localidade quando ambas forem informadas.
- Aplicacao duplicada ativa retorna conflito ou resposta idempotente.
- Pipeline atual continua respeitando uma entrada ativa por candidato.
