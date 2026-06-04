# UX Review — Workspace de Pré-admissão

**Data:** 2026-06-04  
**Referência:** AUDIT_REPORT.md → seção "Resultado da Auditoria Visual/UX"

---

## Avaliação por Pergunta

### 1. A tela deixa claro o que o RH precisa fazer agora?

**Parcialmente.** Existe um `AdmissionNextActionsCard` e um `AdmissionBlockersCard`, o que é uma boa base. Mas a quantidade de informação simultânea (6-7 cards visíveis) dilui o peso visual das ações urgentes. A próxima ação não tem destaque suficiente para ser a primeira coisa que o olho encontra.

### 2. Existe excesso de cards, badges ou blocos competindo?

**SIM — problema confirmado.** O grid exibe simultaneamente:
- Checklist admissional (coluna esquerda)
- Pendências principais (coluna esquerda)
- Resumo do caso (coluna direita)
- Documentos enviados (coluna direita)
- Próximas ações (coluna direita)
- Exportação ERP / Protheus (coluna direita)
- Histórico recente (coluna direita)

Isso são **7 blocos visíveis** ao mesmo tempo. A coluna direita tem 5 deles empilhados. Cada bloco compete pela atenção com título, badges e botões próprios.

### 3. O status principal aparece claramente?

**SIM.** O `AdmissionCaseHeader` exibe a barra de resumo no topo com status do caso e progresso do checklist. Isso é bem posicionado.

**MAS:** O status badge na summary bar (`"Pronto para exportação"` ou `"[etapa] em andamento"`) usa as cores corretas, porém não há um "estado de alerta" visual quando há documentos aguardando revisão do RH. O RH que acabou de abrir o workspace não sabe imediatamente "há X documentos aguardando minha revisão."

### 4. A próxima ação está clara?

**Parcialmente.** O `AdmissionNextActionsCard` está na **5ª posição na coluna direita**, depois do resumo, documentos e separado do checklist. Para acessar os itens pendentes, o RH clica em "Aprovar documento" e é redirecionado apenas para o scroll do checklist — não foca o documento específico.

### 5. O candidato está bem identificado?

**SIM.** O bloco do candidato na summary bar mostra nome, iniciais, avatar e vaga. Bem identificado.

**Porém:** O nome da vaga aparece **duas vezes** na mesma barra — uma como subtítulo do bloco do candidato e outra no bloco "Vaga ativa". Isso é ruído visual imediato.

### 6. O checklist é fácil de entender?

**SIM para a estrutura.** O `AdmissionChecklistCard` tem lista com título, badge de status e ações. A hierarquia é clara.

**MAS:** O status dot exibe **verde tanto para `approved` quanto para `received`**, confundindo visualmente itens aprovados com itens aguardando revisão. Um RH que examina o dot de forma rápida pode concluir que está tudo aprovado quando na verdade há documentos para revisar.

### 7. Os documentos pendentes estão priorizados?

**NÃO.** O checklist lista todos os itens independente do status. Não há um filtro ou destaque automático para "o que precisa de ação agora." O RH precisa percorrer a lista completa para identificar quais itens precisam de revisão.

### 8. Documentos aprovados/rejeitados/em análise são distinguíveis?

**Parcialmente.** Os badges de texto são distintos (`Aprovado`, `Correção solicitada`, `Recebido`, `Pendente`). Mas as cores dos dots no checklist têm o bug C-02 (verde para `approved` = verde para `received`).

### 9. O histórico ocupa espaço demais?

**NÃO isoladamente.** O `AdmissionRecentEventsCard` por si só é razoável — timeline compacta com até 20 eventos. O problema é que ele está no final de uma coluna direita já muito ocupada.

### 10. A área de Protheus/ERP confunde ou ajuda?

**Confunde** na maior parte das sessões de trabalho. O `AdmissionProtheusIntegrationPanel` com `variant="embedded"` é renderizado **sempre** na coluna direita, mesmo quando `ready_for_export = false`. Mostra informações técnicas de ERP para usuários que estão apenas revisando documentos. A integração ERP só é relevante na etapa final — deveria aparecer condicionalmente.

### 11. Existem botões demais?

**SIM.** Por card:
- ChecklistCard: menu de ações (MoreHorizontal) por item com 2 ações
- DocumentsCard: botões Aprovar + Rejeitar + Solicitar Correção + Download por documento
- SummaryCard: botão "Marcar pronto para exportação"
- NextActionsCard: 1-3 botões de ação
- BlockersCard: botão por bloqueador
- ProtheusPanel: Download JSON, Download CSV, Exportar ERP, Retry

Em um caso com 5 documentos e 2 bloqueadores: potencialmente 20+ elementos clicáveis visíveis.

### 12. Existem botões com texto confuso?

**Um caso.** `ChecklistItemActions` — o botão "Revisar documento" fica **desabilitado** quando `!documentId` (item sem documento enviado ainda). O texto "Revisar documento" implica que há algo para revisar, mas nada foi enviado. Deveria ser ocultado ou ter texto diferente ("Aguardando documento").

### 13. Existem ações perigosas sem confirmação?

**Um caso sem confirmação:** "Marcar pronto para exportação" (`handleMarkReady`) dispara imediatamente sem modal de confirmação. Esta ação muda o status do caso de forma relevante para o processo operacional.

As ações de rejeitar/corrigir abrem modal para inserir motivo — isso serve como confirmação implícita. Aprovar não exige confirmação, o que é aceitável.

### 14. O empty state é compreensível?

**SIM.** O componente `EmptyState` é bem usado com ícone, título, descrição e ação contextual. Exemplo: quando `!resolvedCaseId` no painel do candidato, exibe "Caso admissional ainda não aberto" com botão "Iniciar pré-admissão".

### 15. O erro de API é compreensível?

**SIM.** `SectionErrorState` com mensagem contextual e botão "Tentar novamente" em cada seção. `formatContextError` com dois textos (problema + sugestão) é uma boa prática.

### 16. O layout funciona em desktop, tablet e mobile?

**Desktop (>1280px):** Funcional. Grid 2-colunas com proporção 1.35:1.  
**Tablet (768-1280px):** Problemático. O grid colapsa para 1 coluna, criando uma lista muito longa.  
**Mobile (<768px):** Muito problemático. 7 cards empilhados verticalmente. O "Marcar pronto para exportação" fica muito abaixo da dobra.

### 17. Existe overflow horizontal?

**Provavelmente não** no layout geral (Tailwind com `min-w-0` nos elementos flex). Não é possível confirmar sem browser.

### 18. A tela parece "painel de gestão" ou "amontoado de cards"?

**Amontoado de cards.** A hierarquia visual não guia o olhar para a ação mais importante. Todos os cards têm peso visual similar. A tela parece um dashboard de monitoramento, não um painel orientado a tarefas.

---

## Arquitetura de Informação Atual (classificação)

| Bloco | Posição atual | Classificação |
|-------|--------------|---------------|
| `AdmissionCaseHeader` | Topo | Essencial ✓ |
| `AdmissionChecklistCard` | Col esquerda, 1° | Ação imediata ✓ |
| `AdmissionBlockersCard` | Col esquerda, 2° | Ação imediata ✓ |
| `AdmissionSummaryCard` | Col direita, 1° | Informação de apoio — posição ok |
| `AdmissionDocumentsCard` | Col direita, 2° | Ação imediata — deveria estar mais visível |
| `AdmissionNextActionsCard` | Col direita, 3° | Ação imediata — enterrado na coluna |
| `AdmissionProtheusIntegrationPanel` | Col direita, 4° | Integração ERP — sempre visível, deveria ser condicional |
| `AdmissionRecentEventsCard` | Col direita, 5° | Histórico/auditoria — posição ok mas deprimido |

**Problema central:** A coluna direita foi usada para tudo que não é checklist. O resultado é uma mistura de prioridades: informação de apoio + ações imediatas + integração ERP + histórico, todos com o mesmo peso.

---

## Hierarquia de Informação Proposta

_(Não implementar — apenas documentar a direção correta)_

```
┌─────────────────────────────────────────────────────────────────┐
│ CABEÇALHO FIXO                                                  │
│  Candidato · Vaga · Status · Progresso · [Próxima ação em CTA] │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────────────────┐  ┌──────────────────────────────┐
│ COLUNA PRINCIPAL (60%)        │  │ COLUNA LATERAL (40%)         │
│                               │  │                              │
│ ┌─────────────────────────┐   │  │ ┌──────────────────────────┐ │
│ │ PENDÊNCIAS AGORA        │   │  │ │ Resumo do caso           │ │
│ │ (itens received/rejected│   │  │ │ Responsável · Datas      │ │
│ │ que precisam de ação)   │   │  │ │ [Marcar pronto]          │ │
│ └─────────────────────────┘   │  │ └──────────────────────────┘ │
│                               │  │                              │
│ ┌─────────────────────────┐   │  │ ┌──────────────────────────┐ │
│ │ CHECKLIST COMPLETO      │   │  │ │ Bloqueios                │ │
│ │ (todos os itens)        │   │  │ └──────────────────────────┘ │
│ └─────────────────────────┘   │  │                              │
│                               │  │ ┌──────────────────────────┐ │
│ ┌─────────────────────────┐   │  │ │ Histórico recente        │ │
│ │ DOCUMENTOS ENVIADOS     │   │  │ │ (últimos 5-7 eventos)    │ │
│ │ (review inline)         │   │  │ └──────────────────────────┘ │
│ └─────────────────────────┘   │  │                              │
└───────────────────────────────┘  └──────────────────────────────┘

[SEÇÃO ERP/PROTHEUS — Colapsada por padrão, expandida quando ready_for_export]
```

**Regras da hierarquia proposta:**
1. **Cabeçalho fixo** — candidato identificado + status + progresso sempre visíveis
2. **Pendências primeiro** — itens `received`/`rejected` filtrados no topo da coluna principal
3. **Resumo do caso na lateral** com o botão "Marcar pronto" — removido da posição primária
4. **Protheus condicional** — visível apenas quando `ready_for_export = true`
5. **Histórico comprimido** — 5 eventos recentes, link "Ver histórico completo"
6. **Checklist completo abaixo das pendências** — para contexto, não para ação imediata

---

## Problemas no Portal do Candidato (`CandidatePreAdmissionPage`)

**O que funciona bem:**
- Distinção visual por status de item (pending/received/approved/rejected/waived) com cores e ícones claros
- Upload inline por item — UX simples e direto
- Motivo de rejeição visível para o candidato

**O que pode melhorar:**
- Nenhuma indicação de quanto tempo o documento está "em análise" (status `received`)
- Sem indicador de progresso global (X de Y itens aprovados)
- Ausência de mensagem motivacional quando todos os documentos estão aprovados
- Layout não testado em mobile (verificação estática)
