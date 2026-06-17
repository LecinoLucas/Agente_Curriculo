# PROTHEUS-EXPORT-QUEUE-DASHBOARD-2

## Checklist

- [x] Mapear dashboard/fila Protheus atual no frontend.
- [x] Melhorar resumo operacional com totais mais úteis para RH.
- [x] Exibir última atualização visível da fila.
- [x] Tornar a lista mais operacional com contexto do caso, status humanizado, tentativas, retry e erro traduzido.
- [x] Exibir indicação clara de modo seguro/STUB/dry-run.
- [x] Adicionar filtros simples seguros no frontend.
- [x] Preservar ausência de botões de envio real.
- [x] Preservar masking e ausência de payload técnico sensível.
- [x] Permitir apenas ação segura já suportada pelo backend no painel do workspace (`can_request_new`).
- [x] Cobrir dashboard e painel com testes frontend.
- [x] Validar build frontend.

## Decisões de escopo

- Não foi criado botão de retry manual no dashboard porque o contrato atual não expõe endpoint frontend/backend dedicado para essa ação.
- Não foi criada busca/backend novo por candidato.
- O dashboard global enriquece candidato e vaga usando `getOverview(caseId)` para os itens visíveis, sem alterar contrato do snapshot da fila.
- Unidade operacional continua indisponível no snapshot atual do dashboard; a UI faz fallback sem inventar dado.

## Resultado

Conclusão: PASS_WITH_NOTES.

Notas:
- A visão operacional ficou mais útil para RH sem alterar regra de admissão, sem ligar envio real e sem expor payload sensível.
- O próximo passo natural, se o produto quiser mais contexto na listagem global, é ampliar o contrato backend do dashboard com `candidate_name`, `job_title` e `unit_name` já redigidos.
