# Safety Rules

## Verbos bloqueados

- contratar
- rejeitar
- aprovar
- reprovar
- mover
- enviar
- disparar
- deletar
- excluir
- alterar
- editar
- salvar
- criar vaga
- mandar e-mail
- mandar mensagem
- exportar agora / exporte agora

## Ações proibidas

- Contratar candidato
- Rejeitar candidato
- Aprovar documento
- Reprovar documento
- Mover candidato no pipeline
- Exportar para Protheus
- Enviar e-mail ou mensagem
- Alterar vaga
- Alterar candidato
- Criar ou salvar registros

## Regra read-only

- Toda pergunta livre passa por classificação determinística local.
- A classificação só pode produzir intents explicitamente allowlisted e já existentes.
- A execução continua sendo feita pelo endpoint read-only já existente.
- Perguntas que exijam IDs contextuais só executam se o contexto atual fornecer IDs válidos.
- Nenhuma pergunta livre pode gerar navegação operacional sensível, tool nova ou ação de escrita.

## O que fica para fases futuras

- Melhorar cobertura semântica do classificador.
- Telemetria de acerto/fracasso de classificação.
- Possível classificador backend read-only, se houver necessidade comprovada.
- Estratégias mais finas de fallback e explicação para perguntas ambíguas.

## Por que ainda não é chat livre geral

- Não existe execução aberta baseada em LLM.
- Não existe decisão livre sobre qual ação chamar.
- Não existe escrita, mutação ou automação operacional.
- O sistema só aceita perguntas curtas que consigam ser reduzidas a consultas read-only seguras e allowlisted.
