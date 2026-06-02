# OP-6E - Information Architecture - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Planejamento

## Onde a tela vive

Área administrativa existente (mesma navegação de `AdminPage`,
`EstruturaOperacionalPage`, `AdminAiProviderCredentialsPage`).

- Rota proposta: `/admin/assistente-candidato`
- Nome no menu: **Assistente do Candidato**
- Permissão: papéis administrativos/RH já existentes (confirmar no RBAC).
- A tela é **uma página com 5 abas**, não 5 itens de menu, para manter o menu
  enxuto e o contexto unificado.

## Estrutura de abas

```
Assistente do Candidato
├── 1. Conversas            (leitura + ações operacionais)
├── 2. Fluxo de perguntas   (estados da state machine)
├── 3. Frases e intenções   (mapa frase → intenção)
├── 4. Falhas do assistente (texto não entendido + correção)
└── 5. Configurações        (canais, limites de IA, mensagens padrão)
```

Ordem reflete frequência de uso e maturidade: Conversas e Falhas são read-mostly
(entrega 1); Fluxo, Frases e Configurações são edição (entrega 2+).

## Aba 1 - Conversas

Objetivo: ver e operar conversas reais sem entrar no chat do candidato.

Lista (tabela) por linha:

- Candidato (nome/identificador)
- Estado atual (estado da state machine)
- Última mensagem (trecho + timestamp)
- Candidatura vinculada (link, quando houver)
- Status da sessão (`active`, `waiting`, `abandoned`, `handed_off`, `closed`)

Filtros: status da sessão, estado atual, canal, período, "tem candidatura".

Ações por conversa:

- **Ver histórico**: drawer/painel com a thread completa (somente leitura).
- **Marcar como abandonada**: muda status da sessão para `abandoned` (auditado).
- **Encaminhar para RH**: muda status para `handed_off` e registra responsável.

Detalhe (drawer): timeline de `conversation_messages`, estado a cada passo,
intenção interpretada por mensagem (quando houver), e candidatura vinculada.

## Aba 2 - Fluxo de perguntas

Objetivo: inspecionar/configurar os estados da state machine do OP-6B.

Por estado:

- Identificador do estado (ex.: `ask_role`, `ask_location`, `confirm`)
- Pergunta exibida ao candidato
- Opções rápidas (quick replies) oferecidas
- Próxima etapa (transições possíveis)
- Ativo/Inativo

Visão: lista de estados; opcionalmente diagrama de transições (somente leitura na
primeira versão).

Edição (entrega 2): textos da pergunta, quick replies e flag ativo/inativo.
**A topologia/lógica de transição é de OP-6B**; esta tela edita apenas conteúdo e
ativação, nunca regras de decisão.

## Aba 3 - Frases e intenções

Objetivo: manter o dicionário de frases comuns → intenção esperada, base para a
interpretação econômica (preferir match direto a chamar IA).

Por linha:

- Frase comum do candidato (ex.: "quero vaga de frentista")
- Intenção esperada (ex.: `desired_role=frentista`)
- Exemplos adicionais / variações
- Ativo/Inativo

Exemplos âncora:

- "quero vaga de frentista" → função desejada = frentista
- "quero trabalhar perto da BR" → localidade ~ proximidade rodovia/BR
- "qualquer posto em Peritoró" → localidade = Peritoró, qualquer unidade

## Aba 4 - Falhas do assistente

Objetivo: fila de revisão do que o assistente **não** entendeu.

Por linha:

- Mensagem não entendida (texto do candidato)
- Estado em que ocorreu
- Frequência (quantas vezes apareceu algo equivalente)
- Sugestão de correção
- Ação: **mapear frase → intenção** (localidade/função/turno) — alimenta a Aba 3

Fluxo: revisor lê a falha, escolhe a intenção correta e o mapeamento vira/atualiza
uma entrada de "Frases e intenções". Isso fecha o ciclo de melhoria contínua.

## Aba 5 - Configurações

Objetivo: parâmetros do assistente.

- **Canal web**: ativo/inativo, mensagem de boas-vindas, horário de atendimento.
- **Futuro WhatsApp**: somente placeholder/flag desabilitada (não implementar).
- **Limites de IA**: teto de tokens/chamadas por sessão, fallback quando exceder
  (reaproveita conceito do `aiLimitsService`).
- **Mensagens padrão**: saudação, não-entendi, encaminhamento, encerramento.

## Fluxos de usuário principais

1. **Acompanhar**: RH abre Conversas → filtra `waiting` → vê histórico →
   encaminha para RH.
2. **Melhorar**: Admin abre Falhas → escolhe falha frequente → mapeia para
   intenção → entrada aparece em Frases e intenções.
3. **Ajustar fluxo**: Admin abre Fluxo de perguntas → edita texto/quick replies de
   um estado → salva (auditado).
4. **Configurar**: Admin abre Configurações → ajusta limites de IA e mensagens
   padrão.

## URLs

- `/admin/assistente-candidato` (default → aba Conversas)
- `/admin/assistente-candidato?tab=fluxo`
- `/admin/assistente-candidato?tab=frases`
- `/admin/assistente-candidato?tab=falhas`
- `/admin/assistente-candidato?tab=config`

Estado de aba via query param para deep-link e voltar do navegador, padrão já
usado em páginas admin atuais.
