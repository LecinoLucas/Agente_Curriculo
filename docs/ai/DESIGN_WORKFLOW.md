# Fluxo de Design com Skills — Admissão RH

## Quando usar

Use este fluxo para qualquer tarefa de:
- UI
- layout
- redesign
- fluxo de usuário
- produto
- navegação
- tema visual
- experiência do candidato/recrutador

Para correções pequenas e óbvias, pule etapas desnecessárias, mas mantenha as restrições do projeto.

---

## Ordem recomendada

### 1. Triagem

Classifique o pedido:

- **Novo fluxo/tela** → usar fluxo completo.
- **Redesign visual** → começar por `design-review` ou `design-brief`.
- **Ajuste local pequeno** → ir direto para implementação, com escopo fechado.
- **Pedido ambíguo** → começar com `grill-me`.

---

### 2. `grill-me`

Use quando houver:
- requisito vago;
- risco de retrabalho;
- decisão de produto aberta;
- dúvida sobre público, prioridade ou trade-off.

Saída esperada:
- objetivo fechado;
- restrições explícitas;
- decisões tomadas;
- o que não será feito.

---

### 3. `design-brief`

Use para registrar:
- o problema;
- por que a mudança existe;
- público afetado;
- princípios de experiência;
- direção visual;
- restrições funcionais.

O brief vira a fonte de verdade da tarefa.

---

### 4. `information-architecture`

Use quando houver:
- páginas novas;
- navegação;
- menus;
- fluxos multi-etapa;
- hierarquia de conteúdo;
- crescimento futuro.

Pode ser pulado para componente isolado simples.

---

### 5. `design-tokens`

Use quando mexer em:
- tema;
- cores;
- dark mode;
- tipografia;
- espaçamento;
- bordas;
- sombras;
- identidade visual.

Regra:
- manter compatibilidade com `frontend/src/index.css`;
- não criar tema paralelo bagunçado;
- não sobrescrever tokens globais sem necessidade.

---

### 6. `brief-to-tasks`

Transforma o brief em tarefas pequenas.

Cada tarefa precisa ser:
- vertical;
- verificável;
- com escopo claro;
- sem misturar visual, domínio e backend à toa.

---

### 7. `frontend-design`

Implementa a UI seguindo o `TASKS.md`.

Regras:
- seguir o brief;
- seguir tokens;
- não inventar regra de produto;
- não alterar domínio sem autorização;
- não criar fallback legacy.

---

### 8. `design-review`

Use depois que algo estiver visível no app.

A revisão deve comparar:
- screenshot real;
- brief;
- tokens;
- hierarquia;
- acessibilidade;
- consistência visual;
- estados vazios;
- responsividade.

---

## Regra de ouro

Se houver incerteza relevante, comece com `grill-me`.

Se for visual, revise contra o brief.

Se for tema, use tokens.

Se for fluxo, valide arquitetura da informação.

Se for implementação, siga tarefas pequenas.

Não deixe a IA “aproveitar” para refatorar lógica, domínio, endpoints, score, ranking, pipeline ou autenticação.

## Restrições fixas do Admissão RH

Nunca alterar sem autorização explícita:

- 1 candidato = 1 vaga ativa via pipeline.
- Pipeline ativo é a fonte da vaga atual.
- `current_analysis_id` define a análise canônica.
- Frontend não deve criar análise automaticamente.
- Não usar fallback legacy por `updated_at`, `latest_analysis` ou análise mais recente.
- Não alterar score, ranking, matching ou eventos de pipeline em tarefas visuais.
- Não alterar endpoints em redesign visual.
- Não alterar rotas sem plano específico.
- Não quebrar portal do candidato.
- Não vazar dados sensíveis/LGPD.