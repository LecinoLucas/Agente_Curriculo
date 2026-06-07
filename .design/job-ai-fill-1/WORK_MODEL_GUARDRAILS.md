# JOB-AI-FILL-1 — Work Model Guardrails

## Problema

`work_model=Presencial` podia aparecer mesmo sem qualquer evidência no texto de origem.

## Decisão

`work_model` passa a seguir a mesma lógica de preservação usada em outros campos sensíveis:

- ausente não vira valor;
- valor da IA sem evidência explícita é removido;
- texto explícito pode preencher o campo mesmo se a IA omitir.

## Evidência suportada

### `onsite`

- `presencial`
- `trabalho presencial`
- `modelo presencial`
- `regime presencial`

### `hybrid`

- `híbrido`
- `modelo híbrido`
- `regime híbrido`

### `remote`

- `remoto`
- `home office`
- `trabalho remoto`
- `100% remoto`

## Casos rejeitados

- `escala 6x1`
- `44 horas semanais`
- `morar perto da empresa`
- `vaga em loja`
- qualquer inferência por cargo ou rotina

## Warnings

- `work_model_removed_no_source_evidence`
- `work_model_backfilled_from_source`

## Impacto esperado

- o formulário deixa de receber `Presencial` por criatividade da IA;
- o campo ainda é preenchido quando o texto realmente informa o modelo.
