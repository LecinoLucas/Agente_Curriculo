# Skills de Agente Superpowers

Uma coleção de **14 skills** de agente IA para **fluxos de trabalho de desenvolvimento assistido por IA**. Essas skills orientam o agente em processos estruturados de planejamento, execução, depuração, revisão de código, testes e criação de novas skills — maximizando qualidade e autonomia em cada etapa.

---

## Sumário

- [Skills por Categoria](#skills-por-categoria)
  - [Meta-Skills e Orquestração](#meta-skills-e-orquestração)
  - [Planejamento e Design](#planejamento-e-design)
  - [Execução e Desenvolvimento](#execução-e-desenvolvimento)
  - [Qualidade e Verificação](#qualidade-e-verificação)
  - [Depuração e Testes](#depuração-e-testes)
  - [Git e Finalização](#git-e-finalização)
  - [Criação de Skills](#criação-de-skills)
- [Referências](#referências)
  - [Referências por Skill](#referências-por-skill)
- [Referência Rápida: Qual Skill Usar?](#referência-rápida-qual-skill-usar)

---

## Skills por Categoria

### Meta-Skills e Orquestração

Skills que definem como usar e coordenar as demais skills.

| Skill | Descrição |
|-------|-----------|
| [using-superpowers](using-superpowers/SKILL.md) | Meta-skill para descoberta e uso de skills. Deve ser invocada ao iniciar qualquer conversa. Define o fluxo de invocação (verificar → invocar Skill tool → anunciar → seguir exatamente), armadilhas de racionalização a evitar e a ordem de prioridade entre skills de processo e de implementação. |
| [dispatching-parallel-agents](dispatching-parallel-agents/SKILL.md) | Usado quando há 2 ou mais tarefas independentes que podem ser executadas sem estado compartilhado ou dependências sequenciais. Agrupa falhas em domínios independentes, cria tarefas focadas por domínio e despacha subagentes concorrentes — eliminando investigação sequencial desnecessária. |

### Planejamento e Design

Skills para explorar requisitos e escrever planos de implementação antes de tocar em código.

| Skill | Descrição |
|-------|-----------|
| [brainstorming](brainstorming/SKILL.md) | Obrigatória antes de qualquer trabalho criativo. Transforma ideias em designs completos e specs por meio de diálogo colaborativo: uma pergunta por vez → propõe 2–3 abordagens com trade-offs → apresenta o design em seções → salva em `docs/plans/YYYY-MM-DD-<topic>-design.md` → invoca `writing-plans` e `using-git-worktrees` ao mover para implementação. |
| [writing-plans](writing-plans/SKILL.md) | Usada quando há uma spec ou requisitos para uma tarefa de múltiplos passos, antes de tocar em código. Produz planos salvos em `docs/plans/YYYY-MM-DD-<feature>.md` com passos atômicos (2–5 min cada), caminhos de arquivo exatos, código completo e comandos esperados. Ao finalizar, oferece duas opções de execução: `subagent-driven-development` (sessão atual) ou `executing-plans` (sessão paralela). |

### Execução e Desenvolvimento

Skills para executar planos de implementação com qualidade e controle.

| Skill | Descrição |
|-------|-----------|
| [executing-plans](executing-plans/SKILL.md) | Usada quando há um plano de implementação escrito para executar em uma sessão separada com checkpoints de revisão. Lê e critica o plano → executa em lotes de 3 tarefas → reporta e aguarda feedback entre lotes → nunca adivinha quando bloqueado → chama `finishing-a-development-branch` ao concluir. |
| [subagent-driven-development](subagent-driven-development/SKILL.md) | Usada ao executar planos com tarefas independentes na sessão atual. Despacha um subagente implementador fresco por tarefa → validação em dois estágios (revisor de conformidade com a spec + revisor de qualidade de código) → revisão final completa → chama `finishing-a-development-branch`. Um subagente por tarefa + duas revisões = alta qualidade com iteração rápida. |

### Qualidade e Verificação

Skills para garantir que o trabalho está correto antes de declarar conclusão.

| Skill | Descrição |
|-------|-----------|
| [verification-before-completion](verification-before-completion/SKILL.md) | Obrigatória antes de declarar que qualquer trabalho está completo, corrigido ou passando. Lei de ferro: nenhuma declaração de conclusão sem evidência de verificação recente. Define o que cada afirmação requer (testes, linter, build, correção de bug, teste de regressão, requisitos) e lista frases de alerta a detectar ("should", "probably", "seems to", "Done!"). |
| [requesting-code-review](requesting-code-review/SKILL.md) | Usada ao concluir tarefas, implementar features maiores ou antes de merges. Despacha o subagente `code-reviewer` com base nos SHAs do diff para capturar problemas antes que se propaguem. Obrigatória após cada tarefa em `subagent-driven-development`. |
| [receiving-code-review](receiving-code-review/SKILL.md) | Usada ao receber feedback de revisão de código, especialmente quando o feedback parece impreciso ou tecnicamente questionável. Proíbe concordância performativa — exige verificação antes de implementar, esclarecimento antes de implementar parcialmente, ceticismo sobre revisores externos e verificação YAGNI para cada sugestão. |

### Depuração e Testes

Skills para encontrar a causa raiz de bugs e implementar correções seguras.

| Skill | Descrição |
|-------|-----------|
| [systematic-debugging](systematic-debugging/SKILL.md) | Obrigatória ao encontrar qualquer bug, falha de teste ou comportamento inesperado, antes de propor correções. Quatro fases mandatórias: (1) Investigação da causa raiz, (2) Análise de padrões, (3) Hipótese e teste, (4) Implementação. Correções de sintoma são falha — sempre encontre a causa raiz. Invoca `test-driven-development` na fase de correção. |
| [test-driven-development](test-driven-development/SKILL.md) | Usada ao implementar qualquer feature ou correção de bug, antes de escrever código de produção. Lei de ferro: nenhum código de produção sem um teste falhando primeiro (apague qualquer código pré-escrito; sem exceções). Ciclo Red-Green-Refactor: escreva o teste → veja falhar com a mensagem correta → implemente o mínimo → refatore somente quando verde. |

### Git e Finalização

Skills para isolar trabalho em branches e finalizar com segurança.

| Skill | Descrição |
|-------|-----------|
| [using-git-worktrees](using-git-worktrees/SKILL.md) | Usada ao iniciar trabalho em features que precisam de isolamento ou antes de executar planos de implementação. Cria worktrees git isolados compartilhando o mesmo repositório: seleção de diretório por ordem de prioridade (`.worktrees` → `worktrees` → preferência do CLAUDE.md → perguntar) → verifica se o diretório está no `.gitignore` (corrige se não estiver) → cria o worktree com novo branch. |
| [finishing-a-development-branch](finishing-a-development-branch/SKILL.md) | Usada quando a implementação está completa, todos os testes passam e é hora de integrar o trabalho. Executa suite completa de testes → determina branch base → apresenta exatamente 4 opções (merge local, push + PR, manter como está, descartar) → executa a opção escolhida → limpa o worktree. |

### Criação de Skills

Skills para criar, editar ou verificar novas skills.

| Skill | Descrição |
|-------|-----------|
| [writing-skills](writing-skills/SKILL.md) | Usada ao criar novas skills, editar skills existentes ou verificar que skills funcionam antes do deploy. Aplica TDD à criação de skills: cenário de pressão = teste, SKILL.md = código de produção. Define três tipos de skill (Técnica, Padrão, Referência), estrutura do SKILL.md, regras de frontmatter e Claude Search Optimization (CSO) — como escrever campos `description` que ativam corretamente sem que o agente pule o corpo da skill. |

---

## Referências

### Referências por Skill

| Skill | Referência | Descrição |
|-------|------------|-----------|
| `requesting-code-review` | [code-reviewer.md](requesting-code-review/code-reviewer.md) | Template de prompt para o subagente revisor de código. |
| `subagent-driven-development` | [implementer-prompt.md](subagent-driven-development/implementer-prompt.md) | Template de prompt para o subagente implementador. |
| `subagent-driven-development` | [spec-reviewer-prompt.md](subagent-driven-development/spec-reviewer-prompt.md) | Template de prompt para o revisor de conformidade com a spec. |
| `subagent-driven-development` | [code-quality-reviewer-prompt.md](subagent-driven-development/code-quality-reviewer-prompt.md) | Template de prompt para o revisor de qualidade de código. |
| `systematic-debugging` | [root-cause-tracing.md](systematic-debugging/root-cause-tracing.md) | Técnica de rastreamento retroativo para call stacks profundos. |
| `systematic-debugging` | [condition-based-waiting.md](systematic-debugging/condition-based-waiting.md) | Padrão de espera baseada em condição para depuração assíncrona. |
| `systematic-debugging` | [defense-in-depth.md](systematic-debugging/defense-in-depth.md) | Estratégias de defesa em profundidade para sistemas complexos. |
| `test-driven-development` | [testing-anti-patterns.md](test-driven-development/testing-anti-patterns.md) | Anti-padrões de testes a evitar no ciclo TDD. |
| `writing-skills` | [anthropic-best-practices.md](writing-skills/anthropic-best-practices.md) | Boas práticas da Anthropic para escrita de instruções de agente. |
| `writing-skills` | [persuasion-principles.md](writing-skills/persuasion-principles.md) | Princípios de persuasão aplicados à escrita de skills eficazes. |
| `writing-skills` | [testing-skills-with-subagents.md](writing-skills/testing-skills-with-subagents.md) | Guia para testar skills usando subagentes como cenários de pressão. |
| `writing-skills` | [graphviz-conventions.dot](writing-skills/graphviz-conventions.dot) | Convenções para renderização de grafos com Graphviz em skills. |

---

## Referência Rápida: Qual Skill Usar?

| Eu quero... | Use esta skill |
|-------------|----------------|
| Descobrir qual skill usar em uma situação | `using-superpowers` |
| Explorar uma ideia antes de implementar | `brainstorming` |
| Escrever um plano de implementação | `writing-plans` |
| Executar um plano em sessão separada com checkpoints | `executing-plans` |
| Executar um plano na sessão atual com subagentes | `subagent-driven-development` |
| Trabalhar em tasks independentes em paralelo | `dispatching-parallel-agents` |
| Isolar trabalho em um branch separado | `using-git-worktrees` |
| Finalizar e integrar um branch de desenvolvimento | `finishing-a-development-branch` |
| Investigar e corrigir um bug ou falha de teste | `systematic-debugging` |
| Implementar uma feature ou bugfix com TDD | `test-driven-development` |
| Verificar que o trabalho está completo antes de declarar | `verification-before-completion` |
| Solicitar revisão de código do trabalho feito | `requesting-code-review` |
| Receber e avaliar feedback de revisão de código | `receiving-code-review` |
| Criar ou melhorar uma skill de agente | `writing-skills` |
