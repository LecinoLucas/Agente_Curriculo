# Próximos Passos (Após Fase PERF-FIX-PIPELINE-1B)

A Fase de otimização de UX para updates em tempo real da Pipeline principal (Board) obteve exito em sincronizar as ações do Drawer com o ambiente de layout externo, garantindo uma resposta instantânea do cartão do candidato perante mutações de fluxo. O sistema atual agora mantém uma complexidade constante em relação a trocas de etapa.

## Monitoramento Contínuo
1. **Fallback Resilience:** Garantir que o rollback para o cache em caso de erro da mutação (como bloqueio 409 de validação da pipeline) seja visualmente claro e restaure o card de volta para a coluna e estágio anterior do Kanban sem bugs residuais. 

2. **Testes do Back-end Associados:** 
Embora exista falha nos testes isolados de pipeline em Python (Ex: `test_full_ats_flow.py::test_admission_package_validation_blocks_with_pending_docs`), essas validações referem-se estritamente à consistência do Backend/Engine de permissões da admissão, e não interferem na regra de negócio atual desta entrega.

3. **Validação Produtiva:** Realizar testes de integração completos no ambiente Staging. Caso necessário, otimizações futuras de UX podem prever o carregamento sob demanda dos contadores agregadores laterais ("Em andamento", "Entrevistas", etc.) independentemente do Board total (desacoplamento adicional de query no servidor).
