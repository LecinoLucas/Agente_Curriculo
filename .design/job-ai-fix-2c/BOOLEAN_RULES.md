# JOB-AI-FIX-2C — Boolean Rules

## Booleans no contrato do AI Draft

### `requires_manager_review`

- Aceito como `true` somente com evidencia explicita.
- Sem evidencia:
  - o backend retorna `null`
  - warning: `requires_manager_review_removed_no_source_evidence`
- Com evidencia:
  - o backend preserva `true`
  - warning informativo: `requires_manager_review_preserved_from_source`

Exemplos aceitos:

- "entrevista com gestor"
- "aprovacao gerencial"
- "gestor participa da selecao"

Exemplos rejeitados:

- "vaga senior"
- "cargo de lideranca"
- "processo seletivo completo"
- ausencia do campo

### `requires_behavioral_assessment`

- Aceito como `true` somente com evidencia explicita.
- Sem evidencia:
  - o backend retorna `null`
  - warning: `requires_behavioral_assessment_removed_no_source_evidence`
- Com evidencia:
  - o backend preserva `true`
  - warning informativo: `requires_behavioral_assessment_preserved_from_source`

Exemplos aceitos:

- "avaliacao comportamental"
- "DISC"
- "fit cultural"

Exemplos rejeitados:

- "boa comunicacao"
- "proativo"
- "perfil dinamico"
- "trabalho em equipe"
- ausencia do campo

## Campo de fluxo auditado

### `selection_flow_type`

- Nunca e aplicado automaticamente nesta fase.
- Com evidencia explicita de fluxo:
  - o backend limpa o valor
  - warning: `selection_flow_type_requires_manual_review`
- Sem evidencia explicita:
  - o backend limpa o valor
  - nenhuma configuracao de fluxo e aplicada

Exemplos que disparam revisao manual:

- "processo com triagem e entrevista"
- "entrevista tecnica"
- "entrevista com RH e gestor"
- "prova tecnica"
- "teste pratico"

Exemplo rejeitado como evidencia insuficiente:

- "processo seletivo completo"

## Warnings desta fase

- `requires_manager_review_removed_no_source_evidence`
- `requires_manager_review_preserved_from_source`
- `requires_behavioral_assessment_removed_no_source_evidence`
- `requires_behavioral_assessment_preserved_from_source`
- `selection_flow_type_requires_manual_review`
