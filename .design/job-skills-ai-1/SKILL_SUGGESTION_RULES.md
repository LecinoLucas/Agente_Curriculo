# JOB-SKILLS-AI-1 — Skill Suggestion Rules

## Objetivo

Enriquecer as sugestões de skills no fluxo de vaga com IA sem depender só de `mandatory_skills` e `nice_to_have_skills`.

## Fontes usadas

- `mandatory_skills`
- `nice_to_have_skills`
- `requirements`
- `responsibilities`
- `experience_context`

## Regras de extração

### Prioritárias

- skills que já vieram em `mandatory_skills`
- itens objetivos em `requirements`
- itens operacionais fortes:
  - `Atendimento interno`
  - `Conferência de documentos`
  - `Planilhas`

### Complementares

- `nice_to_have_skills`
- itens operacionais derivados de `responsibilities`
- contexto consolidado de rotina, como:
  - `Lançamentos administrativos`
  - `Organização de arquivos`
  - `Rotinas administrativas`

## Mapeamentos determinísticos

- `boa comunicação` -> `Comunicação`
- `excel` -> `Excel`
- `planilha` / `planilhas` -> `Planilhas`
- `organização` -> `Organização`
- `conferência de documentos` -> `Conferência de documentos`
- `atendimento interno` -> `Atendimento interno`
- `lançamentos` -> `Lançamentos administrativos`
- `organização de arquivos` -> `Organização de arquivos`

## Itens bloqueados

Não entram como skill:

- `jovem`
- `boa aparência`
- `morar perto`
- `perto da empresa`
- `6x1`
- `44 horas`
- `3 vagas`
- `salário`
- `benefícios`

## Normalização

- remove acento;
- ignora caixa;
- aproxima plural/singular simples;
- relaciona variantes conhecidas como `Excel` e `Microsoft Excel`.

## Resultado esperado no caso administrativo

### Obrigatórias

- Excel
- Comunicação
- Organização
- Atendimento interno
- Conferência de documentos
- Planilhas

### Complementares

- Lançamentos administrativos
- Organização de arquivos
- Rotinas administrativas
