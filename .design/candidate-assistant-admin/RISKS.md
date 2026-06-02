# OP-6E - Risks - Admin do Assistente do Candidato

Data: 2026-06-01
Status: Planejamento. Riscos e mitigações antes de implementar.

## R1 - Acoplamento com OP-6B ainda instável (ALTO)

A tela depende de `conversation_sessions`/`conversation_messages`/state machine
que OP-6B ainda está construindo. Esquema pode mudar.

- Mitigação: Fase 0 (reconciliação) é bloqueante; só implementar após esquema
  congelado. Contratos deste plano são "a confirmar". Consumir endpoints de OP-6B
  em vez de ler tabelas direto, reduzindo acoplamento de schema.

## R2 - Duplicação de responsabilidade de sessão (MÉDIO)

Abandonar/encaminhar altera estado de sessão, que é de OP-6B. Risco de duas fontes
escrevendo no mesmo dado.

- Mitigação: OP-6E **não** escreve direto em `conversation_sessions`; usa endpoint
  de OP-6B. Se não existir, OP-6B o expõe. Documentar dono único.

## R3 - IA ultrapassar seu papel (ALTO, segurança/produto)

Risco de a IA acabar decidindo elegibilidade ou criando pipeline.

- Mitigação: AI_GUARDS.md — IA só interpreta texto; state machine decide; nenhuma
  ação cria pipeline. Checklist de AI Guards obrigatório na revisão (OP-6E-6.2).

## R4 - Custo de token / chamadas de IA (MÉDIO)

Texto livre pode disparar muitas chamadas de IA.

- Mitigação: ordem de interpretação econômica (quick reply → intents → heurística
  → IA), limites por sessão configuráveis, fallback `quick_replies_only`.
  Aba Frases/Falhas existe para resolver por match direto.

## R5 - LGPD / exposição de dados sensíveis (ALTO)

Conversas contêm dados pessoais; lista admin pode vazar mais do que o necessário.

- Mitigação: mostrar apenas nome curto/ID; nunca CPF/hash; RBAC restrito; acesso
  logado. Sugestões de IA não viram verdade sem confirmação humana.

## R6 - Regressão no admin existente (MÉDIO)

Nova rota/menu e novo serviço podem afetar navegação e o `http.ts` compartilhado.

- Mitigação: página isolada (`CandidateAssistantAdminPage`), serviço dedicado,
  sem alterar serviços existentes. Smoke do admin após integração (OP-6E-6.4).
  Não tocar páginas/serviços de candidaturas, pipeline, pré-admissão.

## R7 - Escopo "vazar" para áreas proibidas (ALTO, processo)

Tentação de já mexer em candidate-portal, bot real, WhatsApp, matching ou
pré-admissão.

- Mitigação: escopo explícito no DESIGN_BRIEF; WhatsApp é placeholder
  desabilitado; nenhuma integração com matching/pré-admissão; revisão de PR checa
  fronteiras.

## R8 - Edição de fluxo conflitar com a lógica de OP-6B (MÉDIO)

Editar conteúdo de estado pode parecer que se pode editar a transição.

- Mitigação: UI e API só editam texto/quick replies/ativo; `next_states` é
  read-only; decisão F0.3 sobre quem é dono do conteúdo.

## R9 - "Falhas" sem fechamento de ciclo (BAIXO/MÉDIO)

Falhas acumulam sem virar melhoria.

- Mitigação: ação "mapear falha → intenção" já no slice F2, alimentando F3;
  métrica de ocorrências para priorizar.

## R10 - Auditoria incompleta (MÉDIO)

Ações admin sem rastro quebram o princípio de "tudo auditável".

- Mitigação: auditoria transversal (OP-6E-6.1) em toda mutação, com diff
  antes/depois; preferir reuso da infra de AuditLogs existente.

## Resumo

| Risco | Severidade | Principal mitigação |
| --- | --- | --- |
| R1 Schema OP-6B instável | Alto | Fase 0 bloqueante, consumir endpoints |
| R2 Dono da sessão | Médio | OP-6B único escritor |
| R3 IA fora do papel | Alto | AI_GUARDS + checklist |
| R4 Custo de token | Médio | Quick replies + limites |
| R5 LGPD | Alto | Mínimo necessário + RBAC + log |
| R6 Regressão admin | Médio | Página/serviço isolados + smoke |
| R7 Vazamento de escopo | Alto | Escopo explícito + revisão |
| R8 Edição de fluxo | Médio | Só conteúdo, transição read-only |
| R9 Falhas sem ciclo | Baixo/Médio | Mapear no F2 |
| R10 Auditoria | Médio | Auditoria transversal |

## Próxima fase implementável

**OP-6B** deve entregar o Conversation Engine (tabelas + endpoints de conversa).
Em seguida, **OP-6E-F0 (reconciliação)** e então **OP-6E-F1 (Conversas, leitura)**
tornam-se a primeira fatia implementável.
