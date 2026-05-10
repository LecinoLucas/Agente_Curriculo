---
name: background-workers
description: Processamento assíncrono — Celery, dispatchers, tarefas de análise, matching e extração de documentos.
---

## Objetivo

Garantir que tarefas pesadas sejam executadas de forma assíncrona, resiliente e sem bloquear o fluxo principal da API.

## Quando usar

- Ao implementar novos fluxos assíncronos (tasks).
- Ao modificar dispatchers (`analysis_dispatcher`, `document_ai_dispatcher`).
- Ao ajustar configurações do Celery (`celery_app`).
- Ao lidar com processamento em lote (bulk import/update).

## Regras principais

- Operações pesadas (IA, PDF, matching) devem ser disparadas via dispatchers.
- As tasks devem ser idempotentes — executá-las duas vezes não deve corromper dados.
- Todo processamento de IA deve passar pela fila de background.
- Use logs estruturados dentro das tasks para rastrear o progresso (correlation IDs).
- Trate timeouts e falhas de conexão com provedores externos (IA/Cloud) usando políticas de retry.
- O estado final da task deve sempre ser refletido no banco de dados (ex: status da análise).

## Nunca fazer

- Nunca chamar tarefas pesadas de IA de forma síncrona dentro de um endpoint da API.
- Nunca passar objetos complexos/grandes como argumento de task (passe IDs e recupere do banco).
- Nunca disparar tasks em loop infinito ou sem limite de concorrência.
- Nunca ignorar o tratamento de erro dentro de uma worker task.
- Nunca duplicar a lógica de disparo — use os dispatchers oficiais.

## Checklist antes de concluir

- [ ] A tarefa foi movida para um worker assíncrono?
- [ ] O dispatcher correto está sendo usado?
- [ ] A task recebe IDs em vez de objetos completos?
- [ ] Existe política de retry para falhas externas?
- [ ] O status da operação é atualizado no banco ao final da task?
