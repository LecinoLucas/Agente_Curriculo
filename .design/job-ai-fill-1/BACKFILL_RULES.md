# JOB-AI-FILL-1 — Backfill Rules

## Objetivo

Preencher apenas o que já está objetivamente no texto quando a IA omitir campos básicos do draft.

## Campos cobertos

- `requirements`
- `experience_context`
- `work_model`
- `unit` apenas para bloquear pseudo-localização baseada em restrição pessoal

## Regras de `requirements`

O backend agora faz backfill quando `requirements` vier vazio.

### Sinais aceitos

- cláusulas explícitas:
  - `precisa ter`
  - `necessário`
  - `requisito`
  - `conhecimento em`
  - `experiência com`
  - `vivência com`
- termos operacionais objetivos já citados no texto:
  - `Excel`
  - `boa comunicação`
  - `organização`
  - `atendimento interno`
  - `conferência de documentos`
  - `lançamentos`
  - `planilhas`
  - `organização de arquivos`

### Comportamento

- deduplica case-insensitive;
- limita a 8 itens;
- não inventa requisito novo;
- mantém a lista da IA quando ela já veio preenchida.

## Regras de `experience_context`

Quando a IA retorna `null`, o backend tenta preencher o campo com a melhor evidência segura:

1. primeiro, rotina objetiva extraída do texto;
2. se não houver rotina objetiva, usa contexto explícito de `experiência`, `vivência` ou `conhecimento`.

### Exemplo

Texto:

`Vai ajudar com lançamentos, conferência de documentos, atendimento interno, planilhas e organização de arquivos.`

Saída:

`Rotinas com Atendimento interno, Conferência de documentos, Lançamentos, Planilhas, Organização de arquivos.`

## Regras de `work_model`

`work_model` agora exige evidência textual explícita.

### Evidências aceitas

- `presencial` -> `onsite`
- `híbrido` -> `hybrid`
- `remoto`, `home office`, `100% remoto` -> `remote`

### Comportamento

- IA retornou valor sem evidência -> limpa e adiciona `work_model_removed_no_source_evidence`
- IA omitiu e o texto trouxe evidência -> backfill e adiciona `work_model_backfilled_from_source`
- texto ambíguo -> mantém `null`

## Regras de `unit`

O backend continua removendo unidade inventada. Nesta fase ele também bloqueia pseudo-localização derivada de restrição pessoal, como:

- `perto da empresa`
- `morador de`
- `morar perto`

Nesses casos, o valor não é aplicado como localização e entra no fluxo de safety.
