# JOB-SKILLS-AI-1 — Alias And Category Rules

## Objetivo

Quando uma skill sugerida não existe no catálogo, o modal de criação deve começar com defaults úteis.

## Categoria sugerida

O fluxo passa a sugerir categoria inicial apenas quando há mapeamento seguro para categorias já existentes no sistema:

- `Excel` -> `tool`
- `Planilhas` -> `tool`
- `Comunicação` -> `behavioral`
- `Organização` -> `behavioral`
- `Atendimento interno` -> `business_process`
- `Conferência de documentos` -> `business_process`
- `Lançamentos administrativos` -> `business_process`
- `Organização de arquivos` -> `business_process`
- `Rotinas administrativas` -> `business_process`
- `SQL` -> `technical`
- `Protheus` -> `tool`

Se não houver categoria segura, o campo continua vazio.

## Aliases sugeridos

Os aliases agora são determinísticos e não repetem o próprio nome.

### Exemplos

`Organização`

- Organização administrativa
- Organização de rotina
- Organização de processos
- Planejamento e organização

`Excel`

- Microsoft Excel
- Planilhas em Excel
- Controle em Excel

`Conferência de documentos`

- Análise documental
- Validação documental
- Controle de documentos

## Regras

- alias igual ao nome principal é removido;
- equivalência excessivamente ampla não é usada para colapsar skills distintas;
- `Planilhas` não é reduzida para `Excel`;
- `Organização` pode coexistir com `Organização de arquivos`.
