# JOB-AI-FIX-2C — Selection Flow Guardrails

## Campos auditados

- `requires_manager_review`
- `requires_behavioral_assessment`
- `selection_flow_type`
- Campos de fluxo existentes no formulário, mas fora do contrato atual do AI Draft:
  - `requires_behavioral_ai_evaluation`
  - `requires_interview`
  - `requires_scorecard`

## Regras aplicadas

- Ausência de campo no JSON da IA nao vira `true`.
- `requires_manager_review` so permanece `true` com evidencia explicita no texto de origem.
- `requires_behavioral_assessment` so permanece `true` com evidencia explicita no texto de origem.
- Quando a IA retorna `true` sem evidencia, o backend limpa para `null` e retorna warning.
- O frontend so aplica booleans quando o backend retorna valor explicito nao nulo.

## Evidencias aceitas

### `requires_manager_review`

- entrevista com gestor
- aprovacao do gestor
- validacao do gestor
- entrevista com gerente
- aprovacao gerencial
- entrevista com lideranca
- validacao da lideranca
- gestor participa da selecao
- gerente participa da entrevista

### `requires_behavioral_assessment`

- avaliacao comportamental
- teste comportamental
- perfil comportamental
- DISC
- fit cultural
- teste de perfil
- avaliacao de perfil

## Decisao sobre `selection_flow_type`

- Nesta fase, `selection_flow_type` nunca e aplicado automaticamente pelo AI Draft.
- Se houver evidencia explicita de fluxo seletivo, o backend limpa o campo e retorna:
  - `selection_flow_type_requires_manual_review`
- Se a IA retornar `selection_flow_type` sem evidencia explicita, o backend limpa sem promover configuracao automatica.
- O frontend continua sem aplicar `selection_flow_type` a partir do AI Draft.

## Campos fora do contrato atual do AI Draft

- `requires_behavioral_ai_evaluation`
- `requires_interview`
- `requires_scorecard`

Esses gates existem no formulario e no dominio da vaga, mas nao sao aceitos nem aplicados pelo contrato atual do AI Draft. Com isso, o draft nao consegue ativar esses campos automaticamente nesta fase.

## Limitacoes restantes

- O backend identifica evidencia por frases explicitas conhecidas; sinonimos fora dessa lista ainda exigem revisao humana.
- `selection_flow_type` fica bloqueado para aplicacao automatica mesmo quando o texto indica um fluxo plausivel.
- Warnings `*_preserved_from_source` sao informativos e nao substituem revisao manual do recrutador.
