# Next Steps

1. Executar homologação manual do fluxo UI completo com ambiente local ou QA contendo:
   - usuário admin/recruiter válidos
   - vaga seedada
   - candidato seedado
   - checklist padrão ativo

2. Evoluir o spec Playwright para setup real de ponta a ponta quando houver fixture segura para:
   - criar vaga
   - criar candidato
   - registrar decisão `advance`
   - registrar decisão `hire`
   - garantir checklist padrão

3. Decidir o comportamento correto do workspace quando o pipeline está inativo:
   - manter `200`
   - ou restaurar `422`
   - e alinhar o teste legado

4. Se o ambiente local passar a expor seed previsível, promover o spec atual para cobertura obrigatória de CI.
