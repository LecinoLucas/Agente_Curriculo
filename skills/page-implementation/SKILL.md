---
name: page-implementation
description: Implementação de páginas — rotas, layout, formulários, tabelas, filtros, estados de loading/vazio/erro e feedback de ações.
---

## Objetivo

Criar páginas funcionais, consistentes e sem lógica de negócio pesada no frontend.

## Quando usar

- Ao criar uma nova página ou rota
- Ao implementar formulários, tabelas ou filtros
- Ao lidar com estados de loading, vazio ou erro
- Ao exibir feedback de ações do usuário

## Regras principais

- Reutilizar componentes existentes antes de criar novos.
- Formulários devem ter validação básica no frontend e confiar no backend para validação definitiva.
- Toda tabela deve tratar: loading, estado vazio e erro de carregamento.
- Feedback de ação (sucesso/erro) deve ser exibido após resposta do backend.
- Loading deve ser exibido durante chamadas assíncronas.
- Filtros devem refletir o estado atual via query params quando possível.
- Páginas não devem tomar decisões de negócio — apenas consumir e exibir o estado vindo do backend.
- Estado de vaga ativa, pipeline ativo e score devem vir da API, nunca calculados no frontend.

## Nunca fazer

- Não decidir vaga ativa, score ou análise atual no frontend.
- Não criar análise IA automática no frontend.
- Não exibir múltiplas vagas ativas para o mesmo candidato.
- Não usar dados de histórico para inferir estado atual.
- Não duplicar lógica de negócio que já existe no backend.
- Não esconder erros do usuário silenciosamente.

## Checklist antes de concluir

- [ ] Componentes existentes foram reutilizados quando possível?
- [ ] Há tratamento de loading, estado vazio e erro?
- [ ] Feedback de ação é exibido após resposta do backend?
- [ ] A página não toma nenhuma decisão de negócio?
- [ ] Formulário valida campos obrigatórios antes de submeter?
- [ ] Rota está registrada corretamente?
